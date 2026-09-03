/**
 * Dual-Accessibility Confidence & State Model
 * Classifies findings into 5 distinct lifecycle states with evidence-based scoring.
 */

export const FindingState = {
  CONFIRMED: 'CONFIRMED',
  LIKELY: 'LIKELY',
  NEEDS_HUMAN_REVIEW: 'NEEDS_HUMAN_REVIEW',
  REJECTED: 'REJECTED',
  VERIFIED: 'VERIFIED'
};

export default {
  FindingState,
  evaluateConfidence,
  computeComplianceScores
};

/**
 * Evaluates the confidence score and initial state of a finding based on rule and evidence type.
 *
 * @param {object} params
 * @param {string} params.type - 'human_a11y' | 'agent_a11y'
 * @param {string} params.ruleId
 * @param {string} params.impact - 'minor' | 'moderate' | 'serious' | 'critical'
 * @param {boolean} [params.isAmbiguous=false]
 * @param {boolean} [params.isAxeIncomplete=false]
 * @param {object} [params.evidence]
 * @returns {{ state: string, confidence: number, rationale: string }}
 */
export function evaluateConfidence({
  type,
  ruleId,
  impact,
  isAmbiguous = false,
  isAxeIncomplete = false,
  evidence = {}
}) {
  // If the engine flagged this as incomplete or ambiguous, it requires human verification
  if (isAxeIncomplete || isAmbiguous) {
    return {
      state: FindingState.NEEDS_HUMAN_REVIEW,
      confidence: 0.72,
      rationale:
        'Automated analysis cannot definitively ascertain usability or safety without human judgment.'
    };
  }

  // Deterministic checks (e.g. missing alt, missing form label, measured contrast)
  if (ruleId === 'color-contrast') {
    const ratio = evidence.contrastRatio || 0;
    const required = evidence.requiredRatio || 4.5;
    return {
      state: FindingState.CONFIRMED,
      confidence: 0.98,
      rationale: `Color contrast ratio measured at ${ratio}:1, failing WCAG minimum requirement of ${required}:1.`
    };
  }

  if (ruleId === 'button-name' || ruleId === 'aria-roles') {
    return {
      state: FindingState.CONFIRMED,
      confidence: 0.95,
      rationale: 'Interactive control lacks accessible text alternative or exposes invalid ARIA role.'
    };
  }

  // Agent accessibility checks
  if (type === 'agent_a11y') {
    if (evidence.hasMissingConfirmation) {
      return {
        state: FindingState.NEEDS_HUMAN_REVIEW,
        confidence: 0.75,
        rationale: 'Mutating tool lacks explicit confirmation boundaries, risking inadvertent side-effects.'
      };
    }
    if (evidence.hasSchemaFlaw) {
      return {
        state: FindingState.CONFIRMED,
        confidence: 0.92,
        rationale: 'WebMCP tool input schema violates JSON Schema structure or missing required parameters.'
      };
    }
  }

  // Default calculation based on impact
  const confidenceMap = {
    critical: 0.96,
    serious: 0.9,
    moderate: 0.82,
    minor: 0.75
  };

  const confidence = confidenceMap[impact] || 0.8;
  const state = confidence >= 0.88 ? FindingState.CONFIRMED : FindingState.LIKELY;

  return {
    state,
    confidence,
    rationale: `Automated rule "${ruleId}" triggered with ${impact} severity.`
  };
}

/**
 * Computes human, agent, and combined dual-accessibility compliance scores (0-100).
 *
 * @param {Array<object>} findings
 * @param {Array<object>} [verifiedItems=[]]
 * @returns {{ humanScore: number, agentScore: number, dualScore: number, counts: object }}
 */
export function computeComplianceScores(findings = [], verifiedItems = []) {
  let humanDeductions = 0;
  let agentDeductions = 0;

  const counts = {
    confirmed: 0,
    likely: 0,
    needsHumanReview: 0,
    rejected: 0,
    verified: verifiedItems.length
  };

  const severityWeights = {
    critical: 15,
    serious: 10,
    moderate: 6,
    minor: 3
  };

  for (const f of findings) {
    if (f.state === FindingState.REJECTED || f.state === FindingState.VERIFIED) {
      if (f.state === FindingState.REJECTED) counts.rejected++;
      continue;
    }

    if (f.state === FindingState.CONFIRMED) counts.confirmed++;
    else if (f.state === FindingState.LIKELY) counts.likely++;
    else if (f.state === FindingState.NEEDS_HUMAN_REVIEW) counts.needsHumanReview++;

    const weight = severityWeights[f.severity] || 5;

    if (f.type === 'human_a11y') {
      humanDeductions += weight;
    } else {
      agentDeductions += weight;
    }
  }

  const humanScore = Math.max(0, Math.min(100, Math.round(100 - humanDeductions)));
  const agentScore = Math.max(0, Math.min(100, Math.round(100 - agentDeductions)));
  const dualScore = Math.round(humanScore * 0.6 + agentScore * 0.4);

  return {
    humanScore,
    agentScore,
    dualScore,
    counts
  };
}
