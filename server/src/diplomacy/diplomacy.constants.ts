/** Diplomacy domain constants: enums, tunables and the action table. */

export const RELATION_SCORE_MIN = -100;
export const RELATION_SCORE_MAX = 100;
export const MAX_RELATION_HISTORY = 24;

export const RELATION_STATUSES = ['recognised', 'unrecognised', 'suspended', 'severed'] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

export const DIPLOMATIC_ACTIONS = [
  'improve',
  'reduce',
  'recognise',
  'sever',
  'message',
  'warning',
  'request_negotiation',
] as const;
export type DiplomaticAction = (typeof DIPLOMATIC_ACTIONS)[number];

/** Immediate effects of each action. Negotiation outcomes are scored separately. */
export const ACTION_EFFECTS: Record<
  DiplomaticAction,
  { score: number; trust: number; threat: number; influence: number }
> = {
  improve: { score: 6, trust: 4, threat: -2, influence: 1 },
  reduce: { score: -7, trust: -5, threat: 3, influence: -1 },
  recognise: { score: 12, trust: 8, threat: -3, influence: 2 },
  sever: { score: -32, trust: -22, threat: 8, influence: -3 },
  message: { score: 2, trust: 1, threat: 0, influence: 1 },
  warning: { score: -11, trust: -7, threat: 9, influence: 1 },
  request_negotiation: { score: 1, trust: 0, threat: 0, influence: 1 },
};

/** Extra penalty when a non-aggression pact is broken by hostile action. */
export const PACT_VIOLATION_PENALTY = { score: -15, trust: -12 };

export const ALLIANCE_TYPES = [
  'military',
  'economic',
  'political',
  'non_aggression',
  'strategic',
  'intelligence',
  'regional',
] as const;
export type AllianceType = (typeof ALLIANCE_TYPES)[number];

export const VOTING_RULES = ['unanimous', 'majority', 'leader'] as const;
export type VotingRule = (typeof VOTING_RULES)[number];

export const ALLIANCE_STATUSES = ['active', 'dissolved'] as const;
export type AllianceStatus = (typeof ALLIANCE_STATUSES)[number];

export const TREATY_TYPES = [
  'mutual_defence',
  'trade',
  'non_aggression',
  'military_cooperation',
  'territorial_settlement',
  'resource_sharing',
  'peace',
] as const;
export type TreatyType = (typeof TREATY_TYPES)[number];

export const TREATY_STATUSES = [
  'draft',
  'proposed',
  'negotiating',
  'accepted',
  'active',
  'expired',
  'terminated',
  'violated',
] as const;
export type TreatyStatus = (typeof TREATY_STATUSES)[number];

export const RENEWAL_RULES = ['none', 'auto', 'renegotiate'] as const;
export type RenewalRule = (typeof RENEWAL_RULES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const MESSAGE_KINDS = [
  'message',
  'warning',
  'negotiation_request',
  'proposal',
  'outcome',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Membership limits applied before an invitation is accepted. */
export const ALLIANCE_LIMITS = {
  maxMembers: 12,
  minRelationWithLeader: 15,
  defaultInvitationDays: 10,
  expulsionMajority: 0.5,
} as const;

/** Deterministic negotiation thresholds. */
export const NEGOTIATION = {
  acceptThreshold: 58,
  counterThreshold: 34,
  weights: {
    score: 0.55,
    trust: 0.3,
    trade: 0.18,
    strategic: 0.12,
    threat: 0.32,
    obligation: -0.22,
    concession: 0.16,
  },
  counterDurationFactor: 0.6,
  minCounterDurationDays: 30,
} as const;

export const TREATY_DEFAULTS = {
  durationDays: 360,
  minDurationDays: 30,
  maxDurationDays: 1800,
} as const;

/** Required behaviour per alliance type, used to seed charter defaults. */
export const ALLIANCE_OBLIGATIONS: Record<AllianceType, { military: string; economic: string }> = {
  military: {
    military: 'Members answer a call to arms with the forces agreed at activation.',
    economic: 'Members keep arms procurement inside the alliance where possible.',
  },
  economic: {
    military: 'No standing military obligation.',
    economic: 'Members apply the common tariff schedule and free movement of goods.',
  },
  political: {
    military: 'No standing military obligation.',
    economic: 'Members align votes in international forums.',
  },
  non_aggression: {
    military: 'Members do not use force against one another.',
    economic: 'No economic obligation.',
  },
  strategic: {
    military: 'Members consult before any deployment near a member border.',
    economic: 'Members prefer member suppliers for strategic goods.',
  },
  intelligence: {
    military: 'Shared early warning, no automatic troop commitment.',
    economic: 'No economic obligation.',
  },
  regional: {
    military: 'Members coordinate border patrols.',
    economic: 'Members share infrastructure funding in the region.',
  },
};

export interface TreatyClauseSeed {
  title: string;
  obligation: string;
  condition: string;
  penalty: string;
}

export interface TreatyTemplate {
  type: TreatyType;
  name: string;
  summary: string;
  defaultDurationDays: number;
  clauses: TreatyClauseSeed[];
}

/** Templates the builder offers. Server-side defaults mirror them. */
export const TREATY_TEMPLATES: Record<string, TreatyTemplate> = {
  mutual_defence: {
    type: 'mutual_defence',
    name: 'Mutual defence pact',
    summary: 'An armed attack on one party is treated as an attack on all.',
    defaultDurationDays: 720,
    clauses: [
      {
        title: 'Call to arms',
        obligation: 'Each party commits forces if another party is attacked.',
        condition: 'Triggered by an attack on a member territory.',
        penalty: 'Treaty void; relations drop sharply.',
      },
      {
        title: 'Joint planning',
        obligation: 'Parties exchange defence plans twice a simulated year.',
        condition: 'Continuous.',
        penalty: 'Formal censure recorded against the defaulting party.',
      },
    ],
  },
  trade: {
    type: 'trade',
    name: 'Trade agreement',
    summary: 'Tariff relief and predictable access between the parties.',
    defaultDurationDays: 360,
    clauses: [
      {
        title: 'Tariff schedule',
        obligation: 'Parties cut tariffs on listed goods by an agreed schedule.',
        condition: 'Continuous while the treaty is active.',
        penalty: 'Tariff relief suspended.',
      },
      {
        title: 'Dispute panel',
        obligation: 'Parties submit trade disputes to a joint panel.',
        condition: 'On request by any party.',
        penalty: 'Compensation owed to the complaining party.',
      },
    ],
  },
  non_aggression: {
    type: 'non_aggression',
    name: 'Non-aggression pact',
    summary: 'Parties renounce hostile action against one another.',
    defaultDurationDays: 540,
    clauses: [
      {
        title: 'No hostile action',
        obligation: 'No warnings, sanctions or force against a party.',
        condition: 'Continuous.',
        penalty: 'Pact is void and relations are penalised.',
      },
    ],
  },
  military_cooperation: {
    type: 'military_cooperation',
    name: 'Military cooperation agreement',
    summary: 'Exercises, basing and equipment access without a full alliance.',
    defaultDurationDays: 360,
    clauses: [
      {
        title: 'Joint exercises',
        obligation: 'Parties run at least one exercise per simulated year.',
        condition: 'Continuous.',
        penalty: 'Cooperation funding withdrawn.',
      },
    ],
  },
  territorial_settlement: {
    type: 'territorial_settlement',
    name: 'Territorial settlement',
    summary: 'Recognises the current border and settles outstanding claims.',
    defaultDurationDays: 1800,
    clauses: [
      {
        title: 'Border recognition',
        obligation: 'Parties recognise the border as recorded at signing.',
        condition: 'Continuous.',
        penalty: 'Claim reopened; relations drop.',
      },
    ],
  },
  resource_sharing: {
    type: 'resource_sharing',
    name: 'Resource-sharing agreement',
    summary: 'Allocates extraction and transit rights between the parties.',
    defaultDurationDays: 540,
    clauses: [
      {
        title: 'Allocation',
        obligation: 'Parties honour the agreed share of resource output.',
        condition: 'Continuous.',
        penalty: 'Share forfeited for the next period.',
      },
    ],
  },
  peace: {
    type: 'peace',
    name: 'Peace treaty',
    summary: 'Ends hostilities and sets the post-conflict terms.',
    defaultDurationDays: 1080,
    clauses: [
      {
        title: 'Cessation of hostilities',
        obligation: 'Parties cease hostile action on activation.',
        condition: 'Immediate.',
        penalty: 'Treaty marked violated; relations collapse.',
      },
    ],
  },
};

export const TREATY_TYPE_LABELS: Record<TreatyType, string> = {
  mutual_defence: 'Mutual defence',
  trade: 'Trade agreement',
  non_aggression: 'Non-aggression',
  military_cooperation: 'Military cooperation',
  territorial_settlement: 'Territorial settlement',
  resource_sharing: 'Resource sharing',
  peace: 'Peace',
};
