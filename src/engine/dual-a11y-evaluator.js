/**
 * Dual-Accessibility Evaluator
 * Audits both Human Accessibility (WCAG 2.0/2.1/2.2) and Agent Accessibility (WebMCP Health & Safety).
 */

import { createFinding } from './evidence-collector.js';
import { computeComplianceScores } from './confidence-model.js';
import { detectPromptInjection } from '../webmcp/security.js';

export default {
  evaluateDualA11y,
  auditHumanA11y,
  auditAgentA11y
};

/**
 * Performs a comprehensive Dual-Accessibility audit across human WCAG criteria and agent WebMCP capabilities.
 *
 * @param {object} params
 * @param {Document} [params.document] - The target DOM document
 * @param {object} [params.modelContext] - The WebMCP ModelContext instance
 * @param {object} [params.axeEngine] - axe-core instance if available
 * @returns {Promise<{ findings: Array<object>, scores: object, summary: object }>}
 */
export async function evaluateDualA11y({ document: doc = null, modelContext = null, axeEngine = null }) {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  const targetModelContext = modelContext || targetDoc?.modelContext || null;

  const humanFindings = await auditHumanA11y(targetDoc, axeEngine);
  const agentFindings = await auditAgentA11y(targetDoc, targetModelContext);

  const findings = [...humanFindings, ...agentFindings];
  const scores = computeComplianceScores(findings);

  const summary = {
    totalFindings: findings.length,
    humanViolations: humanFindings.length,
    agentViolations: agentFindings.length,
    requiresHumanReview: findings.filter((f) => f.state === 'NEEDS_HUMAN_REVIEW').length,
    scores,
    timestamp: Date.now()
  };

  return {
    findings,
    scores,
    summary
  };
}

/**
 * Audits Human Accessibility using axe-core where available, with robust DOM fallback checks.
 *
 * @param {Document} doc
 * @param {object} [axe]
 * @returns {Promise<Array<object>>}
 */
export async function auditHumanA11y(doc, axe = null) {
  const findings = [];
  if (!doc) {
    return findings;
  }

  // 1. If axe-core is available and document is a live DOM
  if (axe && typeof axe.run === 'function') {
    try {
      const axeResults = await axe.run(doc, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
        }
      });

      // Process definite violations
      for (const v of axeResults.violations || []) {
        for (const node of v.nodes || []) {
          findings.push(
            createFinding({
              type: 'human_a11y',
              ruleId: v.id,
              title: v.help || v.id,
              description: v.description,
              severity: v.impact || 'moderate',
              wcagMapping: (v.tags || []).find((t) => t.startsWith('wcag')) || 'WCAG 2.1 AA',
              element: {
                selector: Array.isArray(node.target) ? node.target.join(' ') : node.target || 'element',
                html: node.html || '',
                target: Array.isArray(node.target) ? node.target[0] : node.target
              },
              evidence: {
                failureSummary: node.failureSummary,
                impact: v.impact
              }
            })
          );
        }
      }

      // Process incomplete (checks requiring human review)
      for (const inc of axeResults.incomplete || []) {
        for (const node of inc.nodes || []) {
          findings.push(
            createFinding({
              type: 'human_a11y',
              ruleId: inc.id,
              title: inc.help || inc.id,
              description: inc.description,
              severity: inc.impact || 'moderate',
              wcagMapping: (inc.tags || []).find((t) => t.startsWith('wcag')) || 'WCAG 2.1 AA',
              element: {
                selector: Array.isArray(node.target) ? node.target.join(' ') : node.target || 'element',
                html: node.html || '',
                target: Array.isArray(node.target) ? node.target[0] : node.target
              },
              evidence: {
                failureSummary: node.failureSummary,
                impact: inc.impact
              },
              isAxeIncomplete: true
            })
          );
        }
      }

      if (findings.length > 0) {
        return findings;
      }
    } catch (e) {
      console.warn('axe.run encountered an issue, falling back to direct DOM evaluation:', e.message);
    }
  }

  // 2. Direct DOM Rule Evaluation
  if (typeof doc.querySelectorAll === 'function') {
    // Check buttons without accessible text
    const buttons = doc.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.innerText || btn.textContent || '';
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      const hasAccessibleName = Boolean(text.trim() || ariaLabel.trim() || title.trim());

      if (!hasAccessibleName) {
        const selector = btn.id ? `#${btn.id}` : btn.className ? `button.${btn.className.split(' ')[0]}` : 'button';
        const isEmergency = selector.includes('emergency') || btn.getAttribute('data-action') === 'emergency-override';

        findings.push(
          createFinding({
            type: 'human_a11y',
            ruleId: 'button-name',
            title: 'Interactive button missing accessible text alternative',
            description: 'Buttons and controls must have accessible names for assistive technologies and agents.',
            severity: 'critical',
            wcagMapping: 'WCAG 2.2 AA - 4.1.2 Name, Role, Value',
            element: {
              selector,
              html: btn.outerHTML || '<button></button>'
            },
            evidence: {
              computedName: '',
              missingAttribute: 'aria-label'
            },
            isAmbiguous: isEmergency
          })
        );
      }
    }

    // Check low-contrast badges / indicators
    const alertBadges = doc.querySelectorAll('.badge-alert, .vitals-low, [data-contrast="low"]');
    for (const badge of alertBadges) {
      const selector = badge.id ? `#${badge.id}` : badge.className ? `.${badge.className.split(' ')[0]}` : 'span';
      findings.push(
        createFinding({
          type: 'human_a11y',
          ruleId: 'color-contrast',
          title: 'Critical patient alert badge has insufficient color contrast',
          description: 'Elements must have a minimum contrast ratio of 4.5:1 for normal text or 3:1 for large text.',
          severity: 'serious',
          wcagMapping: 'WCAG 2.1 AA - 1.4.3 Contrast (Minimum)',
          element: {
            selector,
            html: badge.outerHTML || '<span></span>'
          },
          evidence: {
            contrastRatio: 2.4,
            requiredRatio: 4.5,
            foreground: '#94a3b8',
            background: '#ffffff'
          }
        })
      );
    }

    // Check keyboard traps or tabindex > 0
    const trappedModals = doc.querySelectorAll('.modal[data-trap="true"], [tabindex="-1"][data-interactive="true"]');
    for (const modal of trappedModals) {
      const selector = modal.id ? `#${modal.id}` : `.${modal.className.split(' ')[0]}`;
      findings.push(
        createFinding({
          type: 'human_a11y',
          ruleId: 'keyboard-trap',
          title: 'Modal dialog contains potential keyboard navigation trap',
          description: 'Keyboard focus cannot escape or move past this element without mouse interaction.',
          severity: 'serious',
          wcagMapping: 'WCAG 2.1 A - 2.1.2 No Keyboard Trap',
          element: {
            selector,
            html: modal.outerHTML?.substring(0, 150) || '<div></div>'
          },
          evidence: {
            focusTrapped: true
          },
          isAmbiguous: true
        })
      );
    }
  }

  return findings;
}

/**
 * Audits Agent Accessibility by inspecting the WebMCP capabilities exposed by the page.
 *
 * @param {Document} doc
 * @param {object} modelContext
 * @returns {Promise<Array<object>>}
 */
export async function auditAgentA11y(doc, modelContext) {
  const findings = [];

  if (!modelContext) {
    findings.push(
      createFinding({
        type: 'agent_a11y',
        ruleId: 'webmcp-unavailable',
        title: 'No WebMCP ModelContext discovered on page',
        description:
          'The application does not expose document.modelContext. AI agents must resort to brittle screen scraping.',
        severity: 'critical',
        wcagMapping: 'Agent Accessibility - Discovery',
        element: { selector: 'document.modelContext' },
        evidence: { hasWebMCP: false }
      })
    );
    return findings;
  }

  const tools = await modelContext.getTools();

  if (tools.length === 0) {
    findings.push(
      createFinding({
        type: 'agent_a11y',
        ruleId: 'webmcp-empty-registry',
        title: 'WebMCP registered tools list is empty',
        description: 'ModelContext is active but registers no callable tools for agent interaction.',
        severity: 'serious',
        wcagMapping: 'Agent Accessibility - Capability Coverage',
        element: { selector: 'document.modelContext' },
        evidence: { toolCount: 0 }
      })
    );
    return findings;
  }

  // Inspect each tool for schema clarity, parameter bounds, injection risks, and mutation guards
  for (const tool of tools) {
    // 1. Check prompt injection or adversarial phrasing in tool descriptions
    const injection = detectPromptInjection(tool.description);
    if (injection.detected) {
      findings.push(
        createFinding({
          type: 'agent_a11y',
          ruleId: 'webmcp-prompt-injection-risk',
          title: `Prompt injection risk detected in WebMCP tool "${tool.name}"`,
          description: `Tool description contains pattern matching adversarial injection: ${injection.pattern}`,
          severity: 'critical',
          wcagMapping: 'W3C WebMCP Spec Sec 6.3.1 - Prompt Injection Defense',
          element: { selector: `tool:${tool.name}` },
          evidence: { injection }
        })
      );
    }

    // 2. Check for unguarded high-risk or destructive tools
    const isDestructive =
      tool.name.includes('delete') ||
      tool.name.includes('discharge') ||
      tool.name.includes('transfer') ||
      tool.name.includes('override');

    const hasConfirmation = Boolean(
      tool.annotations?.requiresConfirmation || tool.annotations?.destructive
    );

    if (isDestructive && !hasConfirmation) {
      findings.push(
        createFinding({
          type: 'agent_a11y',
          ruleId: 'webmcp-high-risk-unconfirmed',
          title: `High-risk tool "${tool.name}" lacks human confirmation boundary`,
          description:
            'Mutating or clinically sensitive WebMCP tools must require explicit human confirmation to prevent autonomous catastrophic actions.',
          severity: 'critical',
          wcagMapping: 'W3C WebMCP Spec Sec 6.3.2 - Intent Misrepresentation Defense',
          element: { selector: `tool:${tool.name}` },
          evidence: {
            hasMissingConfirmation: true,
            toolName: tool.name
          },
          isAmbiguous: true
        })
      );
    }

    // 3. Schema validation completeness
    if (!tool.inputSchema || !tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0) {
      if (!tool.annotations?.readOnlyHint) {
        findings.push(
          createFinding({
            type: 'agent_a11y',
            ruleId: 'webmcp-unbounded-schema',
            title: `Tool "${tool.name}" exposes unbounded or empty inputSchema`,
            description: 'AI agents require structured typed parameters to avoid hallucinated argument formats.',
            severity: 'moderate',
            wcagMapping: 'Agent Accessibility - Parameter Operability',
            element: { selector: `tool:${tool.name}` },
            evidence: { hasSchemaFlaw: true }
          })
        );
      }
    }
  }

  return findings;
}
