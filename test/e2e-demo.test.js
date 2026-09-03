import test from 'node:test';
import assert from 'node:assert/strict';
import ModelContext from '../src/webmcp/model-context.js';
import AgentOrchestrator from '../src/agent/orchestrator.js';
import ActivityTrace from '../src/agent/activity-trace.js';
import { FindingState } from '../src/engine/confidence-model.js';

// Simulated Apex Portal DOM for full end-to-end demo testing
function createApexPortalDOM() {
  const elements = new Map();

  const emergencyBtn = {
    id: 'btnEmergencyOverride',
    tagName: 'BUTTON',
    className: 'btn btn-emergency',
    innerText: '',
    attributes: { 'data-action': 'emergency-override' },
    style: { color: '#f87171', background: 'rgba(239, 68, 68, 0.15)' },
    getAttribute(attr) {
      return this.attributes[attr] || null;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    },
    classList: {
      classes: new Set(['btn', 'btn-emergency']),
      add(cls) {
        this.classes.add(cls);
      },
      contains(cls) {
        return this.classes.has(cls);
      }
    },
    outerHTML:
      '<button id="btnEmergencyOverride" class="btn btn-emergency" data-action="emergency-override"><svg></svg></button>'
  };

  const alertBadge = {
    id: 'patientAlertBadge',
    tagName: 'DIV',
    className: 'badge-alert',
    innerText: '⚠️ HIGH RISK CLINICAL ALERT',
    attributes: { 'data-contrast': 'low' },
    style: { color: '#94a3b8', background: '#ffffff' },
    getAttribute(attr) {
      return this.attributes[attr] || null;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    },
    classList: {
      classes: new Set(['badge-alert']),
      add(cls) {
        this.classes.add(cls);
      },
      contains(cls) {
        return this.classes.has(cls);
      }
    },
    outerHTML:
      '<div id="patientAlertBadge" class="badge-alert" data-contrast="low">⚠️ HIGH RISK CLINICAL ALERT</div>'
  };

  elements.set('#btnEmergencyOverride', emergencyBtn);
  elements.set('#patientAlertBadge', alertBadge);

  return {
    querySelectorAll(selector) {
      if (selector.includes('button')) return [emergencyBtn];
      if (selector.includes('badge-alert')) return [alertBadge];
      return [];
    },
    querySelector(selector) {
      return elements.get(selector) || null;
    },
    modelContext: null
  };
}

test('E2E Demo: 9-Step Full Hackathon Workflow Verification', async () => {
  // 1. Target Website Initializes WebMCP
  const targetDoc = createApexPortalDOM();
  const modelContext = new ModelContext(targetDoc);
  targetDoc.modelContext = modelContext;

  // Register real WebMCP tools as in apex-portal/app.js
  await modelContext.registerTool({
    name: 'search_patient_records',
    title: 'Search Patient Records',
    description: 'Searches patient EHR records by query',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    annotations: { readOnlyHint: true },
    execute: async ({ query }) => ({ patient: 'Eleanor Vance', query })
  });

  await modelContext.registerTool({
    name: 'inspect_component_state',
    title: 'Inspect Component State',
    description: 'Inspects DOM component attributes and calculated styles',
    inputSchema: { type: 'object', properties: { componentId: { type: 'string' } } },
    annotations: { readOnlyHint: true },
    execute: async ({ componentId }) => ({ selector: componentId, visible: true })
  });

  await modelContext.registerTool({
    name: 'apply_remediation_patch',
    title: 'Apply Remediation Patch',
    description: 'Remediates accessibility barriers by modifying live DOM attributes and CSS properties',
    inputSchema: {
      type: 'object',
      properties: {
        targetSelector: { type: 'string' },
        attributes: { type: 'object' },
        styles: { type: 'object' }
      },
      required: ['targetSelector']
    },
    annotations: { requiresConfirmation: false, destructive: false },
    execute: async ({ targetSelector, attributes = {}, styles = {} }) => {
      const el = targetDoc.querySelector(targetSelector);
      if (!el) throw new Error(`Not found: ${targetSelector}`);
      for (const [k, v] of Object.entries(attributes)) {
        el.setAttribute(k, v);
      }
      Object.assign(el.style, styles);
      el.classList.add('remediated');
      return { success: true, patchedSelector: targetSelector };
    }
  });

  await modelContext.registerTool({
    name: 'authorize_high_risk_mutation',
    title: 'Authorize High Risk Mutation',
    description: 'Executes clinical emergency patient discharge protocol',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string' }, physicianConfirmation: { type: 'string' } },
      required: ['action', 'physicianConfirmation']
    },
    annotations: { requiresConfirmation: true, destructive: true },
    execute: async ({ action, physicianConfirmation }) => ({ authorized: true, action, physicianConfirmation })
  });

  // 2. Launch Agent Orchestrator & Activity Trace
  const trace = new ActivityTrace();
  const agent = new AgentOrchestrator({
    document: targetDoc,
    modelContext,
    trace
  });

  // Step 3 & 4: Discovery and Dual-A11y Audit
  const stepResult = await agent.step();

  // Step 5: Verify "Holy Shit" moment -> Pauses at Human Checkpoint
  assert.equal(stepResult.status, 'AWAITING_HUMAN_DECISION');
  assert.ok(stepResult.finding, 'Must present ambiguous finding to human');
  assert.equal(stepResult.finding.state, FindingState.NEEDS_HUMAN_REVIEW);
  assert.equal(stepResult.finding.element.selector, '#btnEmergencyOverride');

  // Verify initial scores
  const initialScore = agent.state.scores.dualScore;
  assert.ok(initialScore < 100, 'Dual score should reflect violations');

  // Step 6: Meaningful Human Collaboration -> Operator Approves Remediation
  const completedResult = await agent.handleHumanDecision(stepResult.finding.id, {
    approved: true,
    reason: 'Clinical supervisor verified intent: Apply explicit aria-label and AAA contrast.'
  });

  // Step 7 & 8: WebMCP Actuation & Continuous Retest Verification
  assert.equal(completedResult.status, 'WORKFLOW_COMPLETED');

  // Step 9: Final Outcome Verification
  const patchedBtn = targetDoc.querySelector('#btnEmergencyOverride');
  assert.equal(
    patchedBtn.getAttribute('aria-label'),
    'Emergency override: Discharge patient records with clinical confirmation'
  );
  assert.ok(patchedBtn.classList.contains('remediated'));

  // Verified finding check
  const verifiedFinding = agent.state.findings.find((f) => f.id === stepResult.finding.id);
  assert.equal(verifiedFinding.state, FindingState.VERIFIED);

  // Score uplift
  assert.ok(agent.state.scores.dualScore > initialScore, 'Verified dual score must be higher than initial');

  // Trace verification
  const events = trace.getEvents();
  assert.ok(events.length >= 6);
  assert.ok(events.some((e) => e.message.includes('apply_remediation_patch')));
  assert.ok(events.some((e) => e.message.includes('verified resolved')));
});
