/**
 * WebMCP Security & Safety Enforcement Layer
 * Conforming to W3C Web Machine Learning CG WebMCP Specification (Section 6: Security and Privacy Considerations)
 */

export default {
  validateInputBounds,
  sanitizeToolDefinition,
  detectPromptInjection,
  enforcePermissionBoundaries,
  MAX_ARGUMENT_STRING_LENGTH: 65536,
  MAX_PROPERTY_COUNT: 50
};

const MAX_ARGUMENT_STRING_LENGTH = 65536;
const MAX_PROPERTY_COUNT = 50;

// High-risk prompt injection patterns per W3C WebMCP Sec 6.3.1
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*:\s*you\s+are\s+now/i,
  /<\s*script\b[^>]*>.*?<\s*\/\s*script\s*>/is,
  /javascript\s*:\s*/i,
  /elevate\s+privilege/i,
  /bypass\s+(security|auth|confirmation)/i
];

/**
 * Validates input arguments against length and property count limits to mitigate DoS and over-parameterization.
 *
 * @param {Record<string, unknown> | string} input
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateInputBounds(input) {
  if (input === null || input === undefined) {
    return { isValid: true };
  }

  const stringified = typeof input === 'string' ? input : JSON.stringify(input);
  if (stringified.length > MAX_ARGUMENT_STRING_LENGTH) {
    return {
      isValid: false,
      error: `Input payload length (${stringified.length}) exceeds maximum limit (${MAX_ARGUMENT_STRING_LENGTH})`
    };
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    const keys = Object.keys(input);
    if (keys.length > MAX_PROPERTY_COUNT) {
      return {
        isValid: false,
        error: `Property count (${keys.length}) exceeds maximum allowable properties (${MAX_PROPERTY_COUNT})`
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates and sanitizes a WebMCP tool definition according to W3C requirements.
 *
 * @param {object} tool
 * @returns {{ isValid: boolean, error?: string }}
 */
export function sanitizeToolDefinition(tool) {
  if (!tool || typeof tool !== 'object') {
    return { isValid: false, error: 'Tool definition must be an object' };
  }

  const { name, description, execute } = tool;

  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Tool name is required and must be a string' };
  }

  // W3C spec rule: name length 1-128, ASCII alphanumeric, _, -, .
  const nameRegex = /^[a-zA-Z0-9_\-.]{1,128}$/;
  if (!nameRegex.test(name)) {
    return {
      isValid: false,
      error: `Invalid tool name "${name}". Must be 1-128 characters consisting of ASCII alphanumeric, '_', '-', or '.'`
    };
  }

  if (!description || typeof description !== 'string') {
    return { isValid: false, error: `Tool "${name}" must provide a string description` };
  }

  if (typeof execute !== 'function') {
    return { isValid: false, error: `Tool "${name}" must provide an execute function` };
  }

  // Detect malicious metadata poisoning in tool descriptions
  const injection = detectPromptInjection(description);
  if (injection.detected) {
    return {
      isValid: false,
      error: `Security violation in tool "${name}" description: ${injection.reason}`
    };
  }

  return { isValid: true };
}

/**
 * Analyzes arbitrary text for prompt injection risks (Sec 6.3.1.1 & 6.3.1.2).
 *
 * @param {string} text
 * @returns {{ detected: boolean, pattern?: string, reason?: string }}
 */
export function detectPromptInjection(text) {
  if (typeof text !== 'string') {
    return { detected: false };
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: pattern.toString(),
        reason: 'Potential prompt injection payload detected in content'
      };
    }
  }

  return { detected: false };
}

/**
 * Checks whether a tool execution requires human authorization.
 *
 * @param {object} tool
 * @param {boolean} [isUserConfirmed=false]
 * @returns {{ allowed: boolean, requiresConfirmation: boolean, reason?: string }}
 */
export function enforcePermissionBoundaries(tool, isUserConfirmed = false) {
  const isReadOnly = Boolean(tool?.annotations?.readOnlyHint);
  const isHighRisk = Boolean(tool?.annotations?.requiresConfirmation || tool?.annotations?.destructive);

  if (isReadOnly) {
    return { allowed: true, requiresConfirmation: false };
  }

  if (isHighRisk && !isUserConfirmed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: `Tool "${tool.name}" performs a mutating or high-risk action and requires explicit human confirmation`
    };
  }

  return { allowed: true, requiresConfirmation: false };
}
