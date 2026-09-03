/**
 * WebMCP ModelContext Implementation
 * Standards-compliant implementation of the W3C Web Machine Learning CG WebMCP Specification.
 */

import {
  sanitizeToolDefinition,
  validateInputBounds,
  detectPromptInjection,
  enforcePermissionBoundaries
} from './security.js';

export default class ModelContext {
  /**
   * Initializes a new ModelContext instance.
   * @param {Document | object} [targetDocument]
   */
  constructor(targetDocument = null) {
    this.targetDocument = targetDocument;
    this._toolMap = new Map();
    this._pendingExecutions = new Map();
    this._listeners = new Map();
    this.ontoolchange = null;
    this.ontoolactivated = null;
  }

  /**
   * Registers a tool to the model context.
   *
   * @param {object} toolDefinition
   * @param {string} toolDefinition.name
   * @param {string} [toolDefinition.title]
   * @param {string} toolDefinition.description
   * @param {object | string} [toolDefinition.inputSchema]
   * @param {Function} toolDefinition.execute
   * @param {object} [toolDefinition.annotations]
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<object>} The registered tool
   */
  async registerTool(toolDefinition, options = {}) {
    const sanitized = sanitizeToolDefinition(toolDefinition);
    if (!sanitized.isValid) {
      throw new Error(`WebMCP registerTool error: ${sanitized.error}`);
    }

    const name = toolDefinition.name;
    const normalizedTool = {
      name,
      title: toolDefinition.title || name,
      description: toolDefinition.description,
      inputSchema: toolDefinition.inputSchema || { type: 'object', properties: {} },
      execute: toolDefinition.execute,
      annotations: {
        readOnlyHint: Boolean(toolDefinition.annotations?.readOnlyHint),
        untrustedContentHint: Boolean(toolDefinition.annotations?.untrustedContentHint),
        requiresConfirmation: Boolean(toolDefinition.annotations?.requiresConfirmation),
        destructive: Boolean(toolDefinition.annotations?.destructive),
        ...toolDefinition.annotations
      },
      registeredAt: Date.now()
    };

    // If already exists, overwrite cleanly
    this._toolMap.set(name, normalizedTool);

    // Support AbortSignal lifecycle cleanup (W3C Sec 4.2.3)
    if (options.signal) {
      if (options.signal.aborted) {
        this.unregisterTool(name);
        return normalizedTool;
      }
      options.signal.addEventListener(
        'abort',
        () => {
          this.unregisterTool(name);
        },
        { once: true }
      );
    }

    this._dispatchToolChange('register', normalizedTool);
    return normalizedTool;
  }

  /**
   * Unregisters a previously registered tool by name.
   *
   * @param {string} name
   * @returns {boolean} True if removed
   */
  unregisterTool(name) {
    if (!this._toolMap.has(name)) {
      return false;
    }

    const removedTool = this._toolMap.get(name);
    this._toolMap.delete(name);

    // Cancel any active executions of this tool
    for (const [uuid, exec] of this._pendingExecutions.entries()) {
      if (exec.toolName === name) {
        exec.abortController.abort(new Error(`Tool "${name}" was unregistered during execution`));
        this._pendingExecutions.delete(uuid);
      }
    }

    this._dispatchToolChange('unregister', removedTool);
    return true;
  }

  /**
   * Discovers and retrieves all registered tools.
   *
   * @returns {Promise<Array<object>>}
   */
  async getTools() {
    const list = [];
    for (const tool of this._toolMap.values()) {
      list.push({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations
      });
    }
    return list;
  }

  /**
   * Executes a tool with the provided arguments and options.
   *
   * @param {string | object} toolOrName
   * @param {Record<string, unknown> | string} [inputArguments={}]
   * @param {object} [options={}]
   * @param {AbortSignal} [options.signal]
   * @param {boolean} [options.userConfirmed=false]
   * @returns {Promise<unknown>}
   */
  async executeTool(toolOrName, inputArguments = {}, options = {}) {
    const toolName = typeof toolOrName === 'string' ? toolOrName : toolOrName?.name;
    if (!toolName || !this._toolMap.has(toolName)) {
      throw new Error(`WebMCP NotFoundError: Tool "${toolName}" is not registered on this ModelContext`);
    }

    const tool = this._toolMap.get(toolName);

    // Input bounds validation
    const boundsCheck = validateInputBounds(inputArguments);
    if (!boundsCheck.isValid) {
      throw new Error(`WebMCP DataError: ${boundsCheck.error}`);
    }

    // Permission boundary check
    const permCheck = enforcePermissionBoundaries(tool, Boolean(options.userConfirmed));
    if (!permCheck.allowed) {
      const err = new Error(permCheck.reason);
      err.name = 'WebMCPPermissionError';
      err.requiresConfirmation = true;
      err.toolName = toolName;
      throw err;
    }

    // Normalize arguments
    let parsedArgs = inputArguments;
    if (typeof inputArguments === 'string') {
      try {
        parsedArgs = JSON.parse(inputArguments);
      } catch (e) {
        throw new Error(`WebMCP SyntaxError: Invalid JSON string for tool arguments: ${e.message}`);
      }
    }

    const uuid = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const abortController = new AbortController();

    // Link caller signal if provided
    if (options.signal) {
      if (options.signal.aborted) {
        abortController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener('abort', () => abortController.abort(options.signal.reason), {
          once: true
        });
      }
    }

    this._pendingExecutions.set(uuid, {
      toolName,
      abortController,
      startedAt: Date.now()
    });

    this._dispatchToolActivated(toolName, parsedArgs);

    try {
      const result = await tool.execute(parsedArgs, {
        signal: abortController.signal,
        document: this.targetDocument
      });

      // Output injection check for untrusted strings
      if (typeof result === 'string') {
        const injection = detectPromptInjection(result);
        if (injection.detected) {
          console.warn(`[WebMCP Security Warning] Suspicious pattern detected in tool output: ${injection.reason}`);
        }
      }

      return result;
    } finally {
      this._pendingExecutions.delete(uuid);
    }
  }

  /**
   * Adds an event listener.
   * @param {string} type
   * @param {Function} callback
   */
  addEventListener(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
  }

  /**
   * Removes an event listener.
   * @param {string} type
   * @param {Function} callback
   */
  removeEventListener(type, callback) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).delete(callback);
    }
  }

  /**
   * Internal event dispatcher for tool changes.
   * @private
   */
  _dispatchToolChange(action, tool) {
    const event = {
      type: 'toolchange',
      action,
      tool: {
        name: tool.name,
        title: tool.title,
        description: tool.description
      },
      timestamp: Date.now()
    };

    if (typeof this.ontoolchange === 'function') {
      try {
        this.ontoolchange(event);
      } catch (err) {
        console.error('Error in ontoolchange handler:', err);
      }
    }

    const handlers = this._listeners.get('toolchange');
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('Error in toolchange listener:', err);
        }
      }
    }
  }

  /**
   * Internal event dispatcher for tool activation.
   * @private
   */
  _dispatchToolActivated(toolName, args) {
    const event = {
      type: 'toolactivated',
      toolName,
      arguments: args,
      timestamp: Date.now()
    };

    if (typeof this.ontoolactivated === 'function') {
      try {
        this.ontoolactivated(event);
      } catch (err) {
        console.error('Error in ontoolactivated handler:', err);
      }
    }

    const handlers = this._listeners.get('toolactivated');
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('Error in toolactivated listener:', err);
        }
      }
    }
  }
}
