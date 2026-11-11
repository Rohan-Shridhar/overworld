/**
 * Deterministic country decision rules.
 *
 * Pure functions only: no model, no network, no randomness beyond a stable hash
 * of (country code, day). The same world snapshot always yields the same choice,
 * which is what makes autonomous play reproducible.
 */

export type AutonomyLevel = 'low' | 'medium' | 'high';

export type StrategicObjective =
  | 'regional_influence'
  | 'economic_growth'
  | 'resource_security'
  | 'territorial_security'
  | 'military_strength'
  | 'diplomatic_influence'
  | 'alliance_expansion'
  | 'national_stability';

export type ActionDomain = 'diplomatic' | 'economic' | 'military';

export type ActionKind =
  | 'improve_relations'
  | 'reduce_relations'
  | 'propose_alliance'
  | 'propose_treaty'
  | 'negotiate_trade'
  | 'withdraw_agreement'
  | 'impose_trade_restriction'
  | 'increase_production'
  | 'reduce_dependency'
  | 'raise_readiness'
  | 'reinforce_borders'
  | 'support_ally'
  | 'mobilise';

export interface CountryProfile {
  code: string;
  objectives: StrategicObjective[];
  riskTolerance: number;
  diplomacyWeight: number;
  economyWeight: number;
  militaryWeight: number;
  doctrine: 'defensive' | 'balanced' | 'assertive';
}

export interface WorldSnapshot {
  stability: number;
  gdpGrowth: number;
  inflation: number;
  debt: number;
  militaryReadiness: number;
  threat: number;
  allies: number;
  rivals: number;
  approval: number;
  activeTreaties: number;
}

export interface Constraints {
  allies: string[];
  rivals: string[];
  nonAggressionWith: string[];
  severedWith: string[];
  autonomy?: AutonomyLevel;
  autonomyPaused?: boolean;
  militaryDecisionsEnabled?: boolean;
  diplomaticDecisionsEnabled?: boolean;
}

export interface ActionDefinition {
  kind: ActionKind;
  domain: ActionDomain;
  base: number;
  objectives: Partial<Record<StrategicObjective, number>>;
  blockedWhen?: (snapshot: WorldSnapshot, constraints: Constraints) => string | null;
}

/** Days between decisions. Higher autonomy deliberates more often. */
export const AUTONOMY_CADENCE_DAYS: Record<AutonomyLevel, number> = {
  low: 12,
  medium: 6,
  high: 3,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

/** Stable 0..1 hash so choices vary by country and day without real randomness. */
export function stableJitter(code: string, day: number, salt = 0): number {
  let hash = 2166136261 ^ day ^ (salt * 2654435761);

  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

export const ACTION_CATALOGUE: ActionDefinition[] = [
  {
    kind: 'improve_relations',
    domain: 'diplomatic',
    base: 40,
    objectives: { diplomatic_influence: 26, regional_influence: 14, national_stability: 8 },
  },
  {
    kind: 'reduce_relations',
    domain: 'diplomatic',
    base: 12,
    objectives: { territorial_security: 16, military_strength: 8 },
    blockedWhen: (_snapshot, constraints) =>
      constraints.nonAggressionWith.length > 0 ? 'Non-aggression pact forbids hostile action' : null,
  },
  {
    kind: 'propose_alliance',
    domain: 'diplomatic',
    base: 20,
    objectives: { alliance_expansion: 30, territorial_security: 16, diplomatic_influence: 10 },
    blockedWhen: (snapshot) => (snapshot.allies >= 4 ? 'Already leads enough alliances' : null),
  },
  {
    kind: 'propose_treaty',
    domain: 'diplomatic',
    base: 22,
    objectives: { diplomatic_influence: 18, resource_security: 14, economic_growth: 12 },
    blockedWhen: (_snapshot, constraints) =>
      constraints.severedWith.length > 0 ? 'Relations severed with a counterparty' : null,
  },
  {
    kind: 'negotiate_trade',
    domain: 'diplomatic',
    base: 26,
    objectives: { economic_growth: 26, resource_security: 18 },
  },
  {
    kind: 'withdraw_agreement',
    domain: 'diplomatic',
    base: 8,
    objectives: { national_stability: 10, territorial_security: 8 },
    blockedWhen: (snapshot) => (snapshot.activeTreaties === 0 ? 'No agreement to withdraw from' : null),
  },
  {
    kind: 'impose_trade_restriction',
    domain: 'economic',
    base: 10,
    objectives: { resource_security: 18, national_stability: 6 },
    blockedWhen: (snapshot) => (snapshot.threat < 35 ? 'No threat justifying restrictions' : null),
  },
  {
    kind: 'increase_production',
    domain: 'economic',
    base: 24,
    objectives: { economic_growth: 22, resource_security: 20 },
  },
  {
    kind: 'reduce_dependency',
    domain: 'economic',
    base: 18,
    objectives: { resource_security: 22, national_stability: 8 },
  },
  {
    kind: 'raise_readiness',
    domain: 'military',
    base: 20,
    objectives: { military_strength: 24, territorial_security: 20 },
    blockedWhen: (snapshot) => (snapshot.militaryReadiness > 82 ? 'Readiness already high' : null),
  },
  {
    kind: 'reinforce_borders',
    domain: 'military',
    base: 18,
    objectives: { territorial_security: 26 },
    blockedWhen: (snapshot) => (snapshot.threat < 30 ? 'No border pressure' : null),
  },
  {
    kind: 'support_ally',
    domain: 'military',
    base: 16,
    objectives: { alliance_expansion: 18, diplomatic_influence: 12 },
    blockedWhen: (_snapshot, constraints) => (constraints.allies.length === 0 ? 'No ally to support' : null),
  },
  {
    kind: 'mobilise',
    domain: 'military',
    base: 6,
    objectives: { military_strength: 22, territorial_security: 18 },
    blockedWhen: (snapshot, constraints) => {
      if (constraints.nonAggressionWith.length > 0) return 'Non-aggression pact forbids mobilisation';
      if (snapshot.threat < 55) return 'Threat below mobilisation threshold';
      if (constraints.rivals.length === 0) return 'No rival to mobilise against';

      return null;
    },
  },
];

export interface ScoredAction {
  kind: ActionKind;
  domain: ActionDomain;
  score: number;
  eligible: boolean;
  reason: string;
}

function domainWeight(profile: CountryProfile, domain: ActionDomain): number {
  if (domain === 'diplomatic') return profile.diplomacyWeight / 50;
  if (domain === 'economic') return profile.economyWeight / 50;

  return profile.militaryWeight / 50;
}

/** Scores every action, keeping ineligible ones visible for the inspector. */
export function scoreActions(
  profile: CountryProfile,
  snapshot: WorldSnapshot,
  constraints: Constraints,
): ScoredAction[] {
  return ACTION_CATALOGUE.map((action) => {
    const blocked = action.blockedWhen?.(snapshot, constraints) ?? null;
    const domainOff =
      (action.domain === 'military' && constraints.militaryDecisionsEnabled === false) ||
      (action.domain === 'diplomatic' && constraints.diplomaticDecisionsEnabled === false);

    const objectiveFit = profile.objectives.reduce(
      (sum, objective) => sum + (action.objectives[objective] ?? 0),
      0,
    );
    const riskAppetite = profile.riskTolerance / 50;
    const risky = action.domain === 'military' || action.kind === 'reduce_relations';
    const riskTerm = risky ? action.base * 0.4 * riskAppetite : action.base * 0.2 * (1 - riskAppetite / 2);

    const score = round(
      clamp(
        action.base * domainWeight(profile, action.domain) +
          objectiveFit * 0.8 +
          riskTerm -
          (blocked ? 1000 : 0),
        0,
        200,
      ),
    );

    const reason = blocked
      ? blocked
      : domainOff
        ? 'Domain disabled for this state'
        : `fits ${profile.objectives.slice(0, 2).join(' and ') || 'no stated objective'}`;

    return {
      kind: action.kind,
      domain: action.domain,
      score,
      eligible: !blocked && !domainOff,
      reason,
    };
  });
}

export interface Decision {
  action: ActionKind | null;
  domain: ActionDomain | null;
  score: number;
  reason: string;
  considered: number;
  rejected: Array<{ kind: ActionKind; reason: string }>;
}

/** Highest-scoring eligible action; ties break on catalogue order, never randomly. */
export function decide(
  profile: CountryProfile,
  snapshot: WorldSnapshot,
  constraints: Constraints,
): Decision {
  const scored = scoreActions(profile, snapshot, constraints);
  const eligible = scored.filter((entry) => entry.eligible);

  if (eligible.length === 0) {
    return {
      action: null,
      domain: null,
      score: 0,
      reason: 'No eligible action under current treaties and constraints',
      considered: scored.length,
      rejected: scored.filter((entry) => !entry.eligible).map((entry) => ({ kind: entry.kind, reason: entry.reason })),
    };
  }

  const best = eligible.reduce((winner, entry) => (entry.score > winner.score ? entry : winner));

  return {
    action: best.kind,
    domain: best.domain,
    score: best.score,
    reason: `${best.reason}: scored ${best.score}/200 against ${eligible.length} eligible actions`,
    considered: scored.length,
    rejected: scored.filter((entry) => !entry.eligible).map((entry) => ({ kind: entry.kind, reason: entry.reason })),
  };
}

/** Whether a state is due to deliberate on this simulated day. */
export function isDecisionDue(
  level: AutonomyLevel,
  day: number,
  lastDecisionDay: number | null,
  paused = false,
): boolean {
  if (paused) return false;

  const cadence = AUTONOMY_CADENCE_DAYS[level];

  return lastDecisionDay === null || day - lastDecisionDay >= cadence;
}

export interface ElectionInput {
  approval: number;
  gdpGrowth: number;
  stability: number;
  incumbentPerformance: number;
  seed: string;
  day: number;
}

export interface ElectionResult {
  incumbentVoteShare: number;
  leaderChanged: boolean;
  reason: string;
}

/** Simplified deterministic election: approval, economy and stability decide. */
export function runElection(input: ElectionInput): ElectionResult {
  const jitter = (stableJitter(input.seed, input.day) - 0.5) * 6;
  const voteShare = round(
    clamp(
      input.approval * 0.5 +
        input.stability * 0.2 +
        input.gdpGrowth * 2 +
        input.incumbentPerformance * 0.15 +
        jitter,
      0,
      100,
    ),
  );
  const leaderChanged = voteShare < 45;

  return {
    incumbentVoteShare: voteShare,
    leaderChanged,
    reason: leaderChanged
      ? `Incumbent lost at ${voteShare}% with growth at ${input.gdpGrowth}% and approval at ${input.approval}`
      : `Incumbent retained office with ${voteShare}% of the vote`,
  };
}
