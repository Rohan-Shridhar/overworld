import { NEGOTIATION } from './diplomacy.constants.js';

export interface RelationSnapshot {
  status: string;
  score: number;
  trust: number;
  tradeDependency: number;
  militaryThreat: number;
  strategicImportance: number;
}

export interface NegotiationProposal {
  kind: string;
  durationDays: number;
  obligations: string[];
  asksMilitarySupport: boolean;
  offersConcession: boolean;
}

export interface NegotiationContext {
  recognised: boolean;
  sharedAlliance: boolean;
  activeTreaties: string[];
}

export interface NegotiationFactor {
  label: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface NegotiationResult {
  outcome: 'accepted' | 'counter' | 'rejected';
  score: number;
  threshold: number;
  factors: NegotiationFactor[];
  explanation: string;
  counterProposal: { durationDays: number; obligations: string[]; note: string } | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

function factor(label: string, raw: number, weight: number): NegotiationFactor {
  return {
    label,
    value: round(raw, 2),
    weight,
    contribution: round(raw * weight, 2),
  };
}

/**
 * Deterministic acceptance scoring.
 *
 * Every term is computed from stored country and relation statistics, never from
 * a model, so the same proposal between the same states always resolves the same
 * way. The returned factors are the full explanation shown in the UI.
 */
export function evaluateNegotiation(
  relation: RelationSnapshot,
  proposal: NegotiationProposal,
  context: NegotiationContext,
): NegotiationResult {
  const weights = NEGOTIATION.weights;
  const factors: NegotiationFactor[] = [
    factor('Bilateral standing', relation.score / 100, weights.score),
    factor('Trust', (relation.trust - 50) / 50, weights.trust),
    factor('Trade dependency', (relation.tradeDependency - 40) / 60, weights.trade),
    factor('Strategic importance', (relation.strategicImportance - 40) / 60, weights.strategic),
    factor('Military threat perception', -(relation.militaryThreat - 30) / 70, weights.threat),
  ];

  const obligationLoad =
    proposal.obligations.length * 0.25 + (proposal.asksMilitarySupport ? 1 : 0);

  if (obligationLoad > 0) {
    factors.push(factor('Obligations demanded', -obligationLoad, weights.obligation));
  }

  if (proposal.offersConcession) {
    factors.push(factor('Concession offered', 1, weights.concession));
  }

  if (context.sharedAlliance) {
    factors.push(factor('Shared alliance membership', 1, 0.12));
  }

  const nonAggression = context.activeTreaties.includes('non_aggression');
  if (nonAggression && proposal.kind !== 'non_aggression') {
    factors.push(factor('Existing non-aggression pact', 0.6, 0.08));
  }

  if (!context.recognised) {
    factors.push(factor('No diplomatic recognition', -1, 0.4));
  }

  const total = factors.reduce((sum, entry) => sum + entry.contribution, 0);
  const score = round(clamp(50 + total * 50, 0, 100));

  if (relation.status === 'severed' && proposal.kind !== 'recognition') {
    return {
      outcome: 'rejected',
      score: Math.min(score, 15),
      threshold: NEGOTIATION.acceptThreshold,
      factors,
      explanation:
        'Diplomatic relations are severed. Recognition must be restored before any agreement can be discussed.',
      counterProposal: null,
    };
  }

  const positives = factors.filter((entry) => entry.contribution > 0).slice(0, 2);
  const negatives = factors.filter((entry) => entry.contribution < 0).slice(0, 2);

  const reasons = [
    ...positives.map((entry) => `${entry.label.toLowerCase()} adds ${entry.contribution}`),
    ...negatives.map((entry) => `${entry.label.toLowerCase()} subtracts ${Math.abs(entry.contribution)}`),
  ].join('; ');

  if (score >= NEGOTIATION.acceptThreshold) {
    return {
      outcome: 'accepted',
      score,
      threshold: NEGOTIATION.acceptThreshold,
      factors,
      explanation: `Accepted at ${score}/100 against a ${NEGOTIATION.acceptThreshold} threshold. ${reasons}.`,
      counterProposal: null,
    };
  }

  if (score >= NEGOTIATION.counterThreshold) {
    const counterDuration = Math.max(
      NEGOTIATION.minCounterDurationDays,
      Math.round(proposal.durationDays * NEGOTIATION.counterDurationFactor),
    );

    return {
      outcome: 'counter',
      score,
      threshold: NEGOTIATION.acceptThreshold,
      factors,
      explanation: `Counter-proposed at ${score}/100: close to the ${NEGOTIATION.acceptThreshold} threshold but not enough to sign as drafted. ${reasons}.`,
      counterProposal: {
        durationDays: counterDuration,
        obligations: proposal.obligations.slice(0, Math.max(1, proposal.obligations.length - 1)),
        note: `Shorter term (${counterDuration} days) with fewer binding obligations.`,
      },
    };
  }

  return {
    outcome: 'rejected',
    score,
    threshold: NEGOTIATION.acceptThreshold,
    factors,
    explanation: `Rejected at ${score}/100 against a ${NEGOTIATION.acceptThreshold} threshold. ${reasons}.`,
    counterProposal: null,
  };
}
