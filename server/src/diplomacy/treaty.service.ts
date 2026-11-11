import type { Types } from 'mongoose';
import { TreatyModel } from '../models/treaty.model.js';
import { AppError } from '../utils/app-error.js';
import {
  TREATY_DEFAULTS,
  TREATY_TEMPLATES,
  TREATY_TYPES,
  type RenewalRule,
  type TreatyType,
} from './diplomacy.constants.js';
import { adjustRelation } from './diplomacy.store.js';

export interface TreatyClauseInput {
  title: string;
  obligation: string;
  condition?: string;
  penalty?: string;
}

export interface TreatyDraftInput {
  name: string;
  type: TreatyType;
  template?: string;
  parties: string[];
  durationDays?: number;
  renewal?: RenewalRule;
  clauses?: TreatyClauseInput[];
}

const CODE = /^[A-Z]{2,4}$/;

/** Pure validation so the builder and the API reject the same drafts. */
export function validateTreatyDraft(input: TreatyDraftInput): string[] {
  const errors: string[] = [];
  const parties = [...new Set(input.parties ?? [])];
  const duration = input.durationDays ?? TREATY_DEFAULTS.durationDays;
  const clauses = input.clauses ?? defaultClausesFor(input);

  if (!input.name?.trim() || input.name.trim().length < 3) errors.push('name needs at least 3 characters');
  if (!TREATY_TYPES.includes(input.type)) errors.push('type is not a supported treaty type');
  if (parties.length < 2) errors.push('a treaty needs at least two parties');
  if (parties.some((party) => !CODE.test(party))) errors.push('parties must be 2 to 4 letter country codes');
  if (duration < TREATY_DEFAULTS.minDurationDays || duration > TREATY_DEFAULTS.maxDurationDays) {
    errors.push(
      `duration must be between ${TREATY_DEFAULTS.minDurationDays} and ${TREATY_DEFAULTS.maxDurationDays} days`,
    );
  }
  if (clauses.length === 0) errors.push('a treaty needs at least one clause');
  if (clauses.some((clause) => !clause.title?.trim() || !clause.obligation?.trim())) {
    errors.push('every clause needs a title and an obligation');
  }

  return errors;
}

export function defaultClausesFor(input: Pick<TreatyDraftInput, 'type' | 'template'>): TreatyClauseInput[] {
  const template = TREATY_TEMPLATES[input.template ?? input.type] ?? TREATY_TEMPLATES[input.type];

  return template ? template.clauses.map((clause) => ({ ...clause })) : [];
}

function toSchemaClauses(input: TreatyDraftInput) {
  const clauses = input.clauses && input.clauses.length > 0 ? input.clauses : defaultClausesFor(input);

  return clauses.map((clause, index) => ({
    clauseId: `c${index + 1}`,
    title: clause.title.trim(),
    obligation: clause.obligation.trim(),
    condition: clause.condition?.trim() ?? '',
    penalty: clause.penalty?.trim() ?? '',
  }));
}

export async function createTreaty(
  worldId: Types.ObjectId,
  proposedBy: string,
  input: TreatyDraftInput,
  day: number,
) {
  const errors = validateTreatyDraft(input);

  if (errors.length > 0) throw AppError.badRequest(errors.join('; '));

  return TreatyModel.create({
    worldId,
    name: input.name.trim(),
    type: input.type,
    template: input.template ?? input.type,
    status: 'draft',
    parties: [...new Set(input.parties)],
    proposedBy,
    clauses: toSchemaClauses(input),
    durationDays: input.durationDays ?? TREATY_DEFAULTS.durationDays,
    renewal: input.renewal ?? 'none',
    createdDay: day,
    history: [{ day, kind: 'draft', note: `Drafted by ${proposedBy}` }],
  });
}

/** Signs a treaty directly: used when a negotiation accepts the proposal. */
export async function createAcceptedTreaty(
  worldId: Types.ObjectId,
  proposedBy: string,
  parties: string[],
  input: Omit<TreatyDraftInput, 'parties'>,
  day: number,
) {
  const draftInput: TreatyDraftInput = { ...input, parties: [proposedBy, ...parties] };
  const errors = validateTreatyDraft(draftInput);

  if (errors.length > 0) throw AppError.badRequest(errors.join('; '));

  const duration = input.durationDays ?? TREATY_DEFAULTS.durationDays;

  return TreatyModel.create({
    worldId,
    name: input.name.trim(),
    type: input.type,
    template: input.template ?? input.type,
    status: 'active',
    parties: [...new Set(draftInput.parties)],
    proposedBy,
    clauses: toSchemaClauses(draftInput),
    durationDays: duration,
    renewal: input.renewal ?? 'none',
    createdDay: day,
    effectiveDay: day,
    expirationDay: day + duration,
    acceptedBy: draftInput.parties,
    history: [
      { day, kind: 'draft', note: `Drafted by ${proposedBy}` },
      { day, kind: 'active', note: 'Accepted through negotiation' },
    ],
  });
}

export async function listTreaties(worldId: Types.ObjectId) {
  return TreatyModel.find({ worldId }).sort({ createdDay: -1, updatedAt: -1 }).limit(100).lean();
}

export async function recordTreatyViolation(
  worldId: Types.ObjectId,
  treatyId: string,
  partyCode: string,
  clauseId: string,
  note: string,
): Promise<void> {
  const treaty = await TreatyModel.findOne({ _id: treatyId, worldId }).lean();

  if (!treaty) return;

  const day = treaty.expirationDay ?? treaty.createdDay;

  await TreatyModel.updateOne(
    { _id: treaty._id },
    {
      $set: { status: 'violated' },
      $push: {
        violations: { day, partyCode, clauseId, note },
        history: { day, kind: 'violated', note: `${partyCode}: ${note}` },
      },
    },
  );

  const others = treaty.parties.filter((party) => party !== partyCode);

  for (const other of others) {
    await adjustRelation(worldId, partyCode, other, { score: -18, trust: -15 }, `Treaty violation: ${treaty.name}`, day, 'violation');
  }
}

export type TreatyAction = 'propose' | 'accept' | 'negotiate' | 'terminate' | 'renew' | 'violate';

export async function actOnTreaty(
  worldId: Types.ObjectId,
  treatyId: string,
  actorCode: string,
  action: TreatyAction,
  day: number,
  note = '',
) {
  const treaty = await TreatyModel.findOne({ _id: treatyId, worldId }).lean();

  if (!treaty) throw AppError.notFound('No treaty with that identifier');
  if (!treaty.parties.includes(actorCode)) throw AppError.badRequest('Only a party to the treaty may act on it');

  if (action === 'violate') {
    await recordTreatyViolation(worldId, treatyId, actorCode, '', note || 'Terms broken');
    return TreatyModel.findById(treatyId).lean();
  }

  const transitions: Record<string, string[]> = {
    propose: ['draft'],
    accept: ['proposed', 'negotiating'],
    negotiate: ['proposed'],
    terminate: ['active'],
    renew: ['active'],
  };

  if (!(transitions[action] ?? []).includes(treaty.status)) {
    throw AppError.badRequest(`A ${treaty.status} treaty cannot be ${action}d`);
  }

  if (action === 'accept') {
    const acceptedBy = [...new Set([...treaty.acceptedBy, actorCode])];
    const allAccepted = treaty.parties.every((party) => acceptedBy.includes(party));

    return TreatyModel.findOneAndUpdate(
      { _id: treaty._id },
      {
        $set: {
          acceptedBy,
          status: allAccepted ? 'active' : 'proposed',
          ...(allAccepted
            ? { effectiveDay: day, expirationDay: day + treaty.durationDays }
            : {}),
        },
        $push: { history: { day, kind: allAccepted ? 'active' : 'accepted', note: `${actorCode} accepted` } },
      },
      { new: true, lean: true },
    );
  }

  if (action === 'terminate') {
    const brokenPact = ['mutual_defence', 'non_aggression', 'peace'].includes(treaty.type);
    const status = brokenPact ? 'violated' : 'terminated';

    await TreatyModel.updateOne(
      { _id: treaty._id },
      {
        $set: { status, terminatedDay: day },
        $push: { history: { day, kind: status, note: `${actorCode} terminated the treaty` } },
      },
    );

    for (const other of treaty.parties.filter((party) => party !== actorCode)) {
      await adjustRelation(
        worldId,
        actorCode,
        other,
        brokenPact ? { score: -14, trust: -12 } : { score: -5, trust: -3 },
        `Treaty ${status}: ${treaty.name}`,
        day,
        'termination',
      );
    }

    return TreatyModel.findById(treatyId).lean();
  }

  const status = action === 'propose' ? 'proposed' : action === 'negotiate' ? 'negotiating' : treaty.status;

  return TreatyModel.findOneAndUpdate(
    { _id: treaty._id },
    {
      $set:
        action === 'renew'
          ? { expirationDay: (treaty.expirationDay ?? day) + treaty.durationDays }
          : { status },
      $push: {
        history: {
          day,
          kind: action === 'renew' ? 'renewed' : status,
          note: action === 'renew' ? `Extended by ${treaty.durationDays} days` : `${actorCode} ${action}d the treaty`,
        },
      },
    },
    { new: true, lean: true },
  );
}

/** Expires or auto-renews every treaty whose term has ended. */
export async function expireTreaties(worldId: Types.ObjectId, day: number) {
  const due = await TreatyModel.find({ worldId, status: 'active', expirationDay: { $lte: day } }).lean();
  let expired = 0;
  let renewed = 0;

  for (const treaty of due) {
    if (treaty.renewal === 'auto') {
      await TreatyModel.updateOne(
        { _id: treaty._id },
        {
          $set: { expirationDay: (treaty.expirationDay ?? day) + treaty.durationDays },
          $push: { history: { day, kind: 'renewed', note: 'Automatic renewal' } },
        },
      );
      renewed += 1;
      continue;
    }

    await TreatyModel.updateOne(
      { _id: treaty._id },
      {
        $set: { status: 'expired' },
        $push: { history: { day, kind: 'expired', note: 'Term ended' } },
      },
    );
    expired += 1;
  }

  return { expired, renewed };
}

export interface EconomyModifier {
  growth: number;
  stability: number;
  trade: number;
}

/** Per-country bonuses that the simulation tick applies to its economy rules. */
export async function getDiplomacyModifiers(
  worldId: Types.ObjectId,
): Promise<Map<string, EconomyModifier>> {
  const [treaties, alliances] = await Promise.all([
    TreatyModel.find({ worldId, status: 'active' }).lean(),
    import('../models/alliance.model.js').then(({ AllianceModel }) =>
      AllianceModel.find({ worldId, status: 'active' }).lean(),
    ),
  ]);

  const modifiers = new Map<string, EconomyModifier>();

  const add = (code: string, patch: Partial<EconomyModifier>) => {
    const current = modifiers.get(code) ?? { growth: 0, stability: 0, trade: 0 };
    modifiers.set(code, {
      growth: current.growth + (patch.growth ?? 0),
      stability: current.stability + (patch.stability ?? 0),
      trade: current.trade + (patch.trade ?? 0),
    });
  };

  const perType: Record<string, Partial<EconomyModifier>> = {
    trade: { growth: 0.05, trade: 0.8 },
    resource_sharing: { growth: 0.03, trade: 0.4 },
    mutual_defence: { stability: 0.25 },
    non_aggression: { stability: 0.12 },
    military_cooperation: { stability: 0.1 },
    peace: { stability: 0.2 },
    territorial_settlement: { stability: 0.15 },
  };

  treaties.forEach((treaty) => {
    const effect = perType[treaty.type];

    if (!effect) return;

    treaty.parties.forEach((party) => add(party, effect));
  });

  alliances.forEach((alliance) => {
    const effect =
      alliance.type === 'economic'
        ? { growth: 0.04, trade: 0.5 }
        : alliance.type === 'military'
          ? { stability: 0.2 }
          : { stability: 0.08 };

    alliance.members.forEach((member) => add(member, effect));
  });

  return modifiers;
}

