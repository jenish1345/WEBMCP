/**
 * Agent Reasoning Engine
 * Computes state-driven autonomous next steps, parameter synthesis, and human checkpoint proposals.
 */

import { FindingState } from '../engine/confidence-model.js';

export const AgentPhase = {
  DISCOVER: 'DISCOVER',
  AUDIT: 'AUDIT',
  EVALUATE: 'EVALUATE',
  AWAIT_HUMAN: 'AWAIT_HUMAN',
  ACTUATE: 'ACTUATE',
  RETEST: 'RETEST',
  COMPLETE: 'COMPLETE'
};

export default {
  AgentPhase,
  planNextAction,
  synthesizeRemediationCall
};

/**
 * Plans the next autonomous step based on current workflow state.
 *
 * @param {object} state
 * @param {Array<object>} state.tools - Discovered WebMCP tools
 * @param {Array<object>} state.findings - Current accessibility & agent findings
 * @param {Map<string, object> | object} state.humanDecisions - Human checkpoint outcomes
 * @param {string} state.currentPhase - Current execution phase
 * @param {object} [state.activeFinding] - Finding currently being addressed
 * @returns {object} The planned action
 */
export function planNextAction({
  tools = [],
  findings = [],
  humanDecisions = {},
  currentPhase = AgentPhase.DISCOVER,
  activeFinding = null
}) {
  const decisionsMap = humanDecisions instanceof Map ? humanDecisions : new Map(Object.entries(humanDecisions));

  // 1. If tools are not yet discovered, discovery is required
  if (tools.length === 0 && currentPhase === AgentPhase.DISCOVER) {
    return {
      phase: AgentPhase.DISCOVER,
      action: 'discover_tools',
      rationale: 'Query target document.modelContext to discover exposed client-side tools.'
    };
  }

  // 2. If tools discovered but no audit run, run dual audit
  if (findings.length === 0 && currentPhase !== AgentPhase.COMPLETE) {
    return {
      phase: AgentPhase.AUDIT,
      action: 'run_dual_audit',
      rationale: 'Perform automated WCAG audit and WebMCP capability security evaluation.'
    };
  }

  // 3. Inspect findings for pending human checkpoints
  const pendingCheckpoints = findings.filter(
    (f) => f.state === FindingState.NEEDS_HUMAN_REVIEW && !decisionsMap.has(f.id)
  );

  if (pendingCheckpoints.length > 0) {
    const target = pendingCheckpoints[0];
    return {
      phase: AgentPhase.AWAIT_HUMAN,
      action: 'request_human_checkpoint',
      finding: target,
      rationale: `Finding "${target.title}" exhibits ambiguity or high clinical/transactional risk and requires human validation.`
    };
  }

  // 4. Handle approved finding ready for actuation
  const toolNames = new Set(tools.map((t) => t.name));
  const hasRemediationTool =
    toolNames.has('apply_remediation_patch') ||
    toolNames.has('configure_webmcp_boundary') ||
    toolNames.has('inspect_component_state');

  const actionableFindings = findings.filter((f) => {
    if (f.state === FindingState.VERIFIED || f.state === FindingState.REJECTED) {
      return false;
    }
    const decision = decisionsMap.get(f.id);
    if (f.state === FindingState.NEEDS_HUMAN_REVIEW) {
      return Boolean(decision && decision.approved);
    }
    // Automated findings require a remediation tool to actuate
    return hasRemediationTool;
  });

  if (actionableFindings.length > 0 && hasRemediationTool) {
    const target = activeFinding || actionableFindings[0];
    const remediationCall = synthesizeRemediationCall(target, tools);

    if (currentPhase === AgentPhase.ACTUATE) {
      return {
        phase: AgentPhase.RETEST,
        action: 'retest_finding',
        finding: target,
        rationale: `Actuation complete. Re-testing "${target.title}" via WebMCP to verify resolution and rule out regressions.`
      };
    }

    return {
      phase: AgentPhase.ACTUATE,
      action: 'execute_remediation_tool',
      finding: target,
      toolCall: remediationCall,
      rationale: `Remediating "${target.title}" by calling WebMCP tool "${remediationCall.toolName}".`
    };
  }

  // 5. Everything resolved
  return {
    phase: AgentPhase.COMPLETE,
    action: 'summarize_workflow',
    rationale: 'All findings verified or resolved. Dual-accessibility audit loop completed.'
  };
}

/**
 * Synthesizes typed WebMCP tool arguments for remediation.
 *
 * @param {object} finding
 * @param {Array<object>} tools
 * @returns {{ toolName: string, arguments: object }}
 */
export function synthesizeRemediationCall(finding, tools) {
  const toolNames = new Set(tools.map((t) => t.name));

  // If the website exposed a dedicated patch tool
  if (toolNames.has('apply_remediation_patch')) {
    const patch = finding.remediation || {};
    return {
      toolName: 'apply_remediation_patch',
      arguments: {
        patchType: patch.action || 'attribute_and_style',
        targetSelector: finding.element.selector,
        attributes: patch.attributes || {
          'aria-label': 'Emergency override: Discharge patient records with clinical confirmation',
          title: 'Emergency Patient Discharge'
        },
        styles: patch.styles || {
          color: '#0f172a',
          backgroundColor: '#f8fafc',
          fontWeight: '600'
        }
      }
    };
  }

  // If WebMCP security boundary tool is exposed
  if (toolNames.has('configure_webmcp_boundary') && finding.ruleId === 'webmcp-high-risk-unconfirmed') {
    return {
      toolName: 'configure_webmcp_boundary',
      arguments: {
        toolName: 'authorize_high_risk_mutation',
        requiresConfirmation: true,
        destructive: true
      }
    };
  }

  // Fallback generic inspection / update tool
  return {
    toolName: 'inspect_component_state',
    arguments: {
      componentId: finding.element.selector
    }
  };
}
