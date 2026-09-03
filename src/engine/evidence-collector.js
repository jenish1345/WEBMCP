/**
 * Evidence Collector for Dual-Accessibility Engine
 * Packages findings with verifiable evidence, DOM context, WCAG mappings, and remediation patches.
 */

import { evaluateConfidence, FindingState } from './confidence-model.js';

export default {
  createFinding,
  createRemediationPatch
};

let counter = 1000;

/**
 * Creates a structured, evidence-backed finding object.
 *
 * @param {object} params
 * @param {'human_a11y' | 'agent_a11y'} params.type
 * @param {string} params.ruleId
 * @param {string} params.title
 * @param {string} params.description
 * @param {'critical' | 'serious' | 'moderate' | 'minor'} params.severity
 * @param {string} [params.wcagMapping]
 * @param {object} params.element
 * @param {string} params.element.selector
 * @param {string} [params.element.html]
 * @param {string} [params.element.target]
 * @param {object} [params.evidence]
 * @param {object} [params.remediation]
 * @param {boolean} [params.isAmbiguous=false]
 * @param {boolean} [params.isAxeIncomplete=false]
 * @returns {object} The finding object
 */
export function createFinding({
  type,
  ruleId,
  title,
  description,
  severity,
  wcagMapping = 'WCAG 2.2 AA',
  element,
  evidence = {},
  remediation = null,
  isAmbiguous = false,
  isAxeIncomplete = false
}) {
  counter += 1;
  const id = `finding_${type === 'human_a11y' ? 'human' : 'agent'}_${Date.now().toString(36)}_${counter}`;

  const { state, confidence, rationale } = evaluateConfidence({
    type,
    ruleId,
    impact: severity,
    isAmbiguous,
    isAxeIncomplete,
    evidence
  });

  return {
    id,
    type,
    ruleId,
    title,
    description,
    severity,
    wcagMapping,
    element: {
      selector: element.selector || 'body',
      html: element.html || '',
      target: element.target || element.selector || ''
    },
    evidence,
    confidence,
    state,
    rationale,
    isAmbiguous,
    remediation: remediation || createRemediationPatch(ruleId, element),
    history: [
      {
        action: 'detected',
        state,
        timestamp: Date.now(),
        actor: 'Dual-A11y Engine',
        detail: rationale
      }
    ],
    timestamp: Date.now()
  };
}

/**
 * Generates an automated remediation patch proposal for common violations.
 *
 * @param {string} ruleId
 * @param {object} element
 * @returns {object} Proposed remediation patch
 */
export function createRemediationPatch(ruleId, element) {
  if (ruleId === 'color-contrast') {
    return {
      action: 'apply_style_patch',
      targetSelector: element.selector,
      styles: {
        color: '#0f172a',
        backgroundColor: '#f8fafc',
        fontWeight: '600'
      },
      explanation: 'Adjust foreground and background colors to achieve a verified contrast ratio above 7:1 (AAA standard).'
    };
  }

  if (ruleId === 'button-name' || ruleId === 'interactive-label') {
    return {
      action: 'apply_attribute_patch',
      targetSelector: element.selector,
      attributes: {
        'aria-label': 'Emergency override: Discharge patient records with clinical confirmation',
        title: 'Emergency Patient Discharge'
      },
      explanation: 'Provide explicit accessible text alternative via aria-label for screen reader users and AI agents.'
    };
  }

  if (ruleId === 'keyboard-trap') {
    return {
      action: 'apply_keyboard_patch',
      targetSelector: element.selector,
      attributes: {
        tabindex: '0'
      },
      explanation: 'Ensure focus can cycle cleanly without trapping assistive tech or agent keyboard navigation.'
    };
  }

  if (ruleId === 'webmcp-high-risk-unconfirmed') {
    return {
      action: 'configure_webmcp_boundary',
      targetTool: 'authorize_high_risk_mutation',
      annotations: {
        requiresConfirmation: true,
        destructive: true
      },
      explanation: 'Annotate mutating WebMCP tool with required confirmation gate to prevent unauthorized agent actuation.'
    };
  }

  return {
    action: 'manual_verification',
    targetSelector: element.selector,
    explanation: 'Element requires human inspection and customized remediation.'
  };
}
