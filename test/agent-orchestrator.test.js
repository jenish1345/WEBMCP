import test from 'node:test';
import assert from 'node:assert/strict';
import ModelContext from '../src/webmcp/model-context.js';
import AgentOrchestrator from '../src/agent/orchestrator.js';
import ActivityTrace from '../src/agent/activity-trace.js';
import { FindingState } from '../src/engine/confidence-model.js';

// Mock minimal DOM for testing
function createMockDocument() {
  const domElements = new Map();

  const button = {
    id: 'emergency-btn',
    tagName: 'BUTTON',
    className: 'btn-emergency',
    innerText: '',
    textContent: '',
    attributes: { 'data-action': 'emergency-override' },
    getAttribute(attr) {
      return this.attributes[attr] || null;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    },
    style: {},
    outerHTML: '<button id="emergency-btn" class="btn-emergency"></button>'
  };

  const badge = {
    id: 'vitals-badge',
    tagName: 'SPAN',
    className: 'badge-alert',
    innerText: 'Critical 72 BPM',
    attributes: { 'data-contrast': 'low' },
    getAttribute(attr) {
      return this.attributes[attr] || null;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    },
    style: {},
    outerHTML: '<span id="vitals-badge" class="badge-alert">Critical 72 BPM</span>'
  };

  domElements.set('#emergency-btn', button);
  domElements.set('#vitals-badge', badge);

  return {
    querySelectorAll(selector) {
      if (selector.includes('button')) return [button];
      if (selector.includes('badge-alert')) return [badge];
      return [];
    },
    querySelector(selector) {
      return domElements.get(selector) || null;
    },
    modelContext: null
  };
}

test('Agent Orchestrator: Complete human + agent WebMCP loop', async () => {
  const mockDoc = createMockDocument();
  const mc = new ModelContext(mockDoc);
  mockDoc.modelContext = mc;

  // Register WebMCP tools on the document
  await mc.registerTool({
    name: 'search_patient_records',
    title: 'Search Patients',
    description: 'Searches patient EHR records by query',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ query }) => ({ results: [`Record for ${query}`] })
  });

  await mc.registerTool({
    name: 'apply_remediation_patch',
    title: 'Apply A11y Patch',
    description: 'Applies live DOM accessibility patches to target elements',
    inputSchema: {
      type: 'object',
      properties: {
        targetSelector: { type: 'string' },
        attributes: { type: 'object' },
        styles: { type: 'object' }
      },
      required: ['targetSelector']
    },
    annotations: { requiresConfirmation: true },
    execute: async ({ targetSelector, attributes = {}, styles = {} }) => {
      const el = mockDoc.querySelector(targetSelector);
      if (el) {
        for (const [k, v] of Object.entries(attributes)) {
          el.setAttribute(k, v);
        }
        Object.assign(el.style, styles);
      }
      return { success: true, patchedSelector: targetSelector };
    }
  });

  const trace = new ActivityTrace();
  const agent = new AgentOrchestrator({
    document: mockDoc,
    modelContext: mc,
    trace
  });

  // Step 1: Start autonomous loop -> should discover tools and run dual audit
  const checkpoint = await agent.step();

  assert.equal(checkpoint.status, 'AWAITING_HUMAN_DECISION');
  assert.ok(checkpoint.finding);
  assert.equal(checkpoint.finding.state, FindingState.NEEDS_HUMAN_REVIEW);
  assert.equal(agent.state.tools.length, 2);

  const initialDualScore = agent.state.scores.dualScore;
  assert.ok(initialDualScore < 100, 'Initial score should reflect detected issues');

  // Step 2: Human reviews evidence and approves remediation
  const finalResult = await agent.handleHumanDecision(checkpoint.finding.id, {
    approved: true,
    reason: 'Verified clinical intent: emergency button requires explicit label and AAA contrast.'
  });

  assert.equal(finalResult.status, 'WORKFLOW_COMPLETED');
  assert.ok(agent.state.scores.dualScore >= initialDualScore, 'Score must increase after verification');

  // Verify the target DOM element was updated by WebMCP tool
  const patchedBtn = mockDoc.querySelector('#emergency-btn');
  assert.ok(patchedBtn.getAttribute('aria-label'), 'aria-label should be set on patched button');

  // Verify activity trace recorded real events
  const events = trace.getEvents();
  assert.ok(events.length >= 6);

  const stages = events.map((e) => e.stage);
  assert.ok(stages.includes('DISCOVER'), 'Must include DISCOVER');
  assert.ok(stages.includes('AUDIT'), 'Must include AUDIT');
  assert.ok(stages.includes('CHECKPOINT'), 'Must include CHECKPOINT');
  assert.ok(stages.includes('ACTUATE'), 'Must include ACTUATE');
  assert.ok(stages.includes('VERIFY'), 'Must include VERIFY');
  assert.ok(stages.includes('COMPLETE'), 'Must include COMPLETE');
});

test('Agent Orchestrator: Human rejection correctly marks finding as REJECTED', async () => {
  const mockDoc = createMockDocument();
  const mc = new ModelContext(mockDoc);
  mockDoc.modelContext = mc;

  await mc.registerTool({
    name: 'search_patient_records',
    description: 'Searches patient EHR records',
    annotations: { readOnlyHint: true },
    execute: async () => ({})
  });

  const agent = new AgentOrchestrator({ document: mockDoc, modelContext: mc });

  const checkpoint = await agent.step();
  assert.equal(checkpoint.status, 'AWAITING_HUMAN_DECISION');

  // Human rejects the finding
  await agent.handleHumanDecision(checkpoint.finding.id, {
    approved: false,
    reason: 'Intentional visual-only icon design'
  });

  const rejectedFinding = agent.state.findings.find((f) => f.id === checkpoint.finding.id);
  assert.equal(rejectedFinding.state, FindingState.REJECTED);
});
