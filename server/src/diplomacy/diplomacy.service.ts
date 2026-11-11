import type { Types } from 'mongoose';
import { AllianceInvitationModel } from '../models/alliance-invitation.model.js';
import { AllianceModel } from '../models/alliance.model.js';
import { DiplomaticMessageModel } from '../models/diplomatic-message.model.js';
import { DiplomaticRelationModel } from '../models/diplomatic-relation.model.js';
import { TreatyModel } from '../models/treaty.model.js';
import { AppError } from '../utils/app-error.js';
import {
  ACTION_EFFECTS,
  PACT_VIOLATION_PENALTY,
  type DiplomaticAction,
  type TreatyType,
} from './diplomacy.constants.js';
import {
  adjustRelation,
  ensureRelations,
  getCurrentDay,
  getRelationDoc,
  loadCountryIndex,
  toRelationView,
} from './diplomacy.store.js';
import { evaluateNegotiation } from './negotiation.rules.js';
import { createAcceptedTreaty, recordTreatyViolation } from './treaty.service.js';

export interface NegotiationRequestInput {
  counterpartCode: string;
  kind: 'treaty' | 'alliance' | 'recognition' | 'trade' | 'peace';
  durationDays?: number;
  obligations?: string[];
  asksMilitarySupport?: boolean;
  offersConcession?: boolean;
  treaty?: {
    name: string;
    type: TreatyType;
    template?: string;
    renewal?: 'none' | 'auto' | 'renegotiate';
    clauses?: Array<{ title: string; obligation: string; condition?: string; penalty?: string }>;
  };
}

export interface DiplomaticActionInput {
  action: DiplomaticAction;
  subject?: string;
  body?: string;
}

/** Overview for one country: relations, summary counts, alliances, treaties, messages. */
export async function getDiplomacyOverview(worldId: Types.ObjectId, code: string) {
  await ensureRelations(worldId);

  const countries = await loadCountryIndex(worldId);
  const country = countries.get(code);

  if (!country) throw AppError.notFound(`No country with the code "${code}"`);

  const colours = new Map([...countries.values()].map((entry) => [entry.code, entry.colour]));
  const relations = await DiplomaticRelationModel.find({
    worldId,
    $or: [{ aCode: code }, { bCode: code }],
  })
    .sort({ score: -1 })
    .lean();

  const views = relations.map((relation) => toRelationView(relation, code, colours));
  const allies = views.filter((entry) => entry.score >= 40);
  const rivals = views.filter((entry) => entry.score <= -25);
  const threats = views.filter((entry) => entry.militaryThreat >= 60);
  const averageScore =
    views.length === 0 ? 0 : Math.round((views.reduce((sum, entry) => sum + entry.score, 0) / views.length) * 10) / 10;

  const [alliances, treaties, invitations, messages] = await Promise.all([
    AllianceModel.find({ worldId, status: 'active', members: code }).lean(),
    TreatyModel.find({ worldId, parties: code }).sort({ createdDay: -1 }).limit(40).lean(),
    AllianceInvitationModel.find({ worldId, targetCode: code, status: 'pending' }).lean(),
    DiplomaticMessageModel.find({ worldId, $or: [{ fromCode: code }, { toCode: code }] })
      .sort({ day: -1, createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  return {
    country,
    summary: {
      relations: views.length,
      allies: allies.length,
      rivals: rivals.length,
      threats: threats.length,
      averageScore,
      recognised: views.filter((entry) => entry.status === 'recognised').length,
      severed: views.filter((entry) => entry.status === 'severed').length,
    },
    relations: views,
    alliances: alliances.map((alliance) => ({ id: String(alliance._id), name: alliance.name, emblem: alliance.emblem, type: alliance.type, leaderCode: alliance.leaderCode, members: alliance.members })),
    treaties: treaties.map((treaty) => ({ id: String(treaty._id), name: treaty.name, type: treaty.type, status: treaty.status, parties: treaty.parties, expirationDay: treaty.expirationDay })),
    invitations,
    messages,
  };
}

/** Nodes and scored edges for the relationship graph. */
export async function getDiplomacyNetwork(worldId: Types.ObjectId) {
  await ensureRelations(worldId);

  const countries = [...(await loadCountryIndex(worldId)).values()];
  const relations = await DiplomaticRelationModel.find({ worldId })
    .select('aCode bCode score status trust militaryThreat')
    .lean();

  return {
    nodes: countries.map((country) => ({
      code: country.code,
      name: country.name,
      colour: country.colour,
      continent: country.continent,
      gdp: country.gdp,
      stability: country.stability,
    })),
    edges: relations.map((relation) => ({
      a: relation.aCode,
      b: relation.bCode,
      score: relation.score,
      trust: relation.trust,
      status: relation.status,
      threat: relation.militaryThreat,
    })),
  };
}

/**
 * Applies a bilateral diplomatic action. Every action writes to the shared
 * relation document and, where relevant, to the message log or a treaty record.
 */
export async function performDiplomaticAction(
  worldId: Types.ObjectId,
  fromCode: string,
  toCode: string,
  input: DiplomaticActionInput,
) {
  if (fromCode === toCode) throw AppError.badRequest('A state cannot conduct diplomacy with itself');

  const countries = await loadCountryIndex(worldId);

  if (!countries.has(fromCode) || !countries.has(toCode)) {
    throw AppError.notFound('One of the states does not exist');
  }

  const relation = await getRelationDoc(worldId, fromCode, toCode);

  if (!relation) throw AppError.notFound('No diplomatic relation exists for this pair');

  if (input.action === 'improve' && relation.status === 'severed') {
    throw AppError.badRequest('Relations are severed: restore recognition before improving them');
  }

  const effects = ACTION_EFFECTS[input.action];
  let extraScore = 0;
  let extraTrust = 0;
  let violatedTreatyId: string | null = null;

  // A warning against a non-aggression partner breaks the pact and costs more.
  if (input.action === 'warning') {
    const pact = await TreatyModel.findOne({
      worldId,
      type: 'non_aggression',
      status: 'active',
      parties: { $all: [fromCode, toCode] },
    }).lean();

    if (pact) {
      violatedTreatyId = String(pact._id);
      extraScore = PACT_VIOLATION_PENALTY.score;
      extraTrust = PACT_VIOLATION_PENALTY.trust;
      await recordTreatyViolation(worldId, String(pact._id), fromCode, '', 'Hostile warning issued against a pact partner');
    }
  }

  const day = await getCurrentDay(worldId);
  const updated = await adjustRelation(
    worldId,
    fromCode,
    toCode,
    {
      score: effects.score + extraScore,
      trust: effects.trust + extraTrust,
      militaryThreat: effects.threat,
      influence: effects.influence,
      status:
        input.action === 'sever'
          ? 'severed'
          : input.action === 'recognise'
            ? 'recognised'
            : undefined,
    },
    input.body ?? input.action,
    day,
    input.action,
  );

  if (!updated) throw AppError.notFound('No diplomatic relation exists for this pair');

  let messageId: string | null = null;

  if (input.action === 'message' || input.action === 'warning' || input.action === 'request_negotiation') {
    const message = await DiplomaticMessageModel.create({
      worldId,
      fromCode,
      toCode,
      kind: input.action === 'message' ? 'message' : input.action === 'warning' ? 'warning' : 'negotiation_request',
      subject: input.subject ?? '',
      body: input.body ?? '',
      day,
    });

    messageId = String(message._id);
  }

  const colours = new Map([...countries.values()].map((entry) => [entry.code, entry.colour]));

  return {
    relation: toRelationView(updated as unknown as Parameters<typeof toRelationView>[0], fromCode, colours),
    messageId,
    violatedTreatyId,
  };
}

/**
 * Deterministic negotiation: score the proposal, persist the explanation and,
 * when accepted with a treaty attached, sign it immediately.
 */
export async function requestNegotiation(
  worldId: Types.ObjectId,
  fromCode: string,
  input: NegotiationRequestInput,
) {
  const toCode = input.counterpartCode;

  if (fromCode === toCode) throw AppError.badRequest('A state cannot negotiate with itself');

  const countries = await loadCountryIndex(worldId);

  if (!countries.has(fromCode) || !countries.has(toCode)) {
    throw AppError.notFound('One of the states does not exist');
  }

  const relation = await getRelationDoc(worldId, fromCode, toCode);

  if (!relation) throw AppError.notFound('No diplomatic relation exists for this pair');

  const [sharedAlliance, activeTreaties] = await Promise.all([
    AllianceModel.findOne({ worldId, status: 'active', members: { $all: [fromCode, toCode] } }).lean(),
    TreatyModel.find({ worldId, status: 'active', parties: { $all: [fromCode, toCode] } })
      .select('type')
      .lean(),
  ]);

  const evaluation = evaluateNegotiation(
    {
      status: relation.status,
      score: relation.score,
      trust: relation.trust,
      tradeDependency: relation.tradeDependency,
      militaryThreat: relation.militaryThreat,
      strategicImportance: relation.strategicImportance,
    },
    {
      kind: input.kind,
      durationDays: input.durationDays ?? 360,
      obligations: input.obligations ?? [],
      asksMilitarySupport: input.asksMilitarySupport ?? false,
      offersConcession: input.offersConcession ?? false,
    },
    {
      recognised: relation.status === 'recognised',
      sharedAlliance: Boolean(sharedAlliance),
      activeTreaties: activeTreaties.map((treaty) => treaty.type),
    },
  );

  const day = await getCurrentDay(worldId);
  const scoreDelta = evaluation.outcome === 'accepted' ? 4 : evaluation.outcome === 'counter' ? 1 : -2;
  const trustDelta = evaluation.outcome === 'accepted' ? 3 : evaluation.outcome === 'counter' ? 1 : -1;

  const updated = await adjustRelation(
    worldId,
    fromCode,
    toCode,
    { score: scoreDelta, trust: trustDelta },
    `${input.kind} negotiation: ${evaluation.outcome}`,
    day,
    'negotiation',
  );

  const message = await DiplomaticMessageModel.create({
    worldId,
    fromCode,
    toCode,
    kind: 'negotiation_request',
    subject: `${input.kind} proposal`,
    body: evaluation.explanation,
    day,
    outcome: evaluation.outcome,
    meta: { score: evaluation.score, factors: evaluation.factors, counter: evaluation.counterProposal, kind: input.kind },
  });

  let treaty = null;

  if (evaluation.outcome === 'accepted' && input.treaty) {
    treaty = await createAcceptedTreaty(worldId, fromCode, [toCode], {
      ...input.treaty,
      durationDays: input.durationDays ?? (input.treaty.clauses ? undefined : 360),
    }, day);
  }

  const colours = new Map([...countries.values()].map((entry) => [entry.code, entry.colour]));

  return {
    evaluation,
    message: { id: String(message._id) },
    relation: updated
      ? toRelationView(updated as unknown as Parameters<typeof toRelationView>[0], fromCode, colours)
      : null,
    treaty,
  };
}

export async function listDiplomaticMessages(
  worldId: Types.ObjectId,
  code: string,
  limit = 25,
) {
  return DiplomaticMessageModel.find({ worldId, $or: [{ fromCode: code }, { toCode: code }] })
    .sort({ day: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

