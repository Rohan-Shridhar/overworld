import type { Types } from 'mongoose';
import { AllianceInvitationModel } from '../models/alliance-invitation.model.js';
import { AllianceModel } from '../models/alliance.model.js';
import { AppError } from '../utils/app-error.js';
import {
  ALLIANCE_LIMITS,
  ALLIANCE_OBLIGATIONS,
  ALLIANCE_TYPES,
  type AllianceType,
  type VotingRule,
} from './diplomacy.constants.js';
import { getRelationDoc } from './diplomacy.store.js';

export interface AllianceInput {
  name: string;
  description?: string;
  emblem?: string;
  type: AllianceType;
  charter?: string;
  votingRules?: VotingRule;
  durationDays?: number;
  withdrawalRules?: string;
  requirements?: { minRelationScore?: number; requiresRecognition?: boolean; maxMembers?: number };
}

/** Pure membership gate, exported so the rules can be tested without a database. */
export function canAcceptInvitation(input: {
  memberCount: number;
  maxMembers: number;
  relationScore: number;
  recognised: boolean;
  requiresRecognition: boolean;
  minRelationScore: number;
}): { allowed: boolean; reason: string } {
  if (input.memberCount >= input.maxMembers) {
    return { allowed: false, reason: `Alliance is full (${input.maxMembers} members)` };
  }
  if (input.requiresRecognition && !input.recognised) {
    return { allowed: false, reason: 'Alliance requires diplomatic recognition' };
  }
  if (input.relationScore < input.minRelationScore) {
    return {
      allowed: false,
      reason: `Relation with the leader is ${input.relationScore}, below the required ${input.minRelationScore}`,
    };
  }

  return { allowed: true, reason: 'Membership requirements met' };
}

/** Leadership passes to the longest-serving remaining member. */
export function nextLeader(members: string[], leaving: string): string {
  return members.find((member) => member !== leaving) ?? leaving;
}

export async function listAlliances(worldId: Types.ObjectId) {
  return AllianceModel.find({ worldId }).sort({ status: 1, foundedDay: -1 }).lean();
}

export async function createAlliance(
  worldId: Types.ObjectId,
  founderCode: string,
  input: AllianceInput,
  day: number,
) {
  if (!ALLIANCE_TYPES.includes(input.type)) throw AppError.badRequest('type is not a supported alliance type');
  if (!input.name?.trim() || input.name.trim().length < 3) {
    throw AppError.badRequest('name needs at least 3 characters');
  }

  const existing = await AllianceModel.findOne({ worldId, status: 'active', name: input.name.trim() }).lean();

  if (existing) throw AppError.badRequest('An active alliance already uses that name');

  const obligations = ALLIANCE_OBLIGATIONS[input.type];

  return AllianceModel.create({
    worldId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    emblem: input.emblem ?? '◈',
    type: input.type,
    status: 'active',
    foundedDay: day,
    foundedBy: [founderCode],
    members: [founderCode],
    leaderCode: founderCode,
    charter: input.charter?.trim() ?? '',
    requirements: {
      minRelationScore: input.requirements?.minRelationScore ?? ALLIANCE_LIMITS.minRelationWithLeader,
      requiresRecognition: input.requirements?.requiresRecognition ?? true,
      maxMembers: Math.min(input.requirements?.maxMembers ?? ALLIANCE_LIMITS.maxMembers, ALLIANCE_LIMITS.maxMembers),
    },
    votingRules: input.votingRules ?? 'majority',
    militaryObligations: obligations.military,
    economicObligations: obligations.economic,
    durationDays: input.durationDays ?? null,
    withdrawalRules: input.withdrawalRules ?? 'Members may leave after notifying the leader.',
  });
}

export async function inviteToAlliance(
  worldId: Types.ObjectId,
  allianceId: string,
  actorCode: string,
  targetCode: string,
  day: number,
) {
  const alliance = await AllianceModel.findOne({ _id: allianceId, worldId }).lean();

  if (!alliance) throw AppError.notFound('No alliance with that identifier');
  if (alliance.status !== 'active') throw AppError.badRequest('The alliance is dissolved');
  if (alliance.leaderCode !== actorCode) throw AppError.badRequest('Only the alliance leader may invite members');
  if (alliance.members.includes(targetCode)) throw AppError.badRequest('That state is already a member');
  if (alliance.members.length >= (alliance.requirements?.maxMembers ?? ALLIANCE_LIMITS.maxMembers)) throw AppError.badRequest('Alliance is full');


  return AllianceInvitationModel.create({
    worldId,
    allianceId: alliance._id,
    allianceName: alliance.name,
    targetCode,
    invitedBy: actorCode,
    status: 'pending',
    createdDay: day,
    expiresDay: day + ALLIANCE_LIMITS.defaultInvitationDays,
  });
}

export async function respondToInvitation(
  worldId: Types.ObjectId,
  invitationId: string,
  accept: boolean,
  day: number,
) {
  const invitation = await AllianceInvitationModel.findOne({ _id: invitationId, worldId }).lean();

  if (!invitation) throw AppError.notFound('No invitation with that identifier');
  if (invitation.status !== 'pending') throw AppError.badRequest('This invitation has already been resolved');

  if (!accept) {
    return AllianceInvitationModel.findOneAndUpdate(
      { _id: invitation._id },
      { $set: { status: 'rejected', resolvedDay: day } },
      { new: true, lean: true },
    );
  }

  const alliance = await AllianceModel.findOne({ _id: invitation.allianceId, worldId }).lean();

  if (!alliance || alliance.status !== 'active') throw AppError.badRequest('The alliance is no longer active');

  const relation = await getRelationDoc(worldId, alliance.leaderCode, invitation.targetCode);
  const gate = canAcceptInvitation({
    memberCount: alliance.members.length,
    maxMembers: (alliance.requirements?.maxMembers ?? ALLIANCE_LIMITS.maxMembers),
    relationScore: relation?.score ?? 0,
    recognised: (relation?.status ?? 'unrecognised') === 'recognised',
    requiresRecognition: (alliance.requirements?.requiresRecognition ?? true),
    minRelationScore: (alliance.requirements?.minRelationScore ?? ALLIANCE_LIMITS.minRelationWithLeader),
  });

  if (!gate.allowed) throw AppError.badRequest(gate.reason);

  await AllianceModel.updateOne(
    { _id: alliance._id },
    { $addToSet: { members: invitation.targetCode } },
  );

  return AllianceInvitationModel.findOneAndUpdate(
    { _id: invitation._id },
    { $set: { status: 'accepted', resolvedDay: day } },
    { new: true, lean: true },
  );
}

export type AllianceAction = 'leave' | 'expel' | 'dissolve' | 'edit';

export async function actOnAlliance(
  worldId: Types.ObjectId,
  allianceId: string,
  actorCode: string,
  action: AllianceAction,
  day: number,
  payload: { targetCode?: string; charter?: string; description?: string; votingRules?: VotingRule } = {},
) {
  const alliance = await AllianceModel.findOne({ _id: allianceId, worldId }).lean();

  if (!alliance) throw AppError.notFound('No alliance with that identifier');
  if (alliance.status !== 'active') throw AppError.badRequest('The alliance is already dissolved');

  const isLeader = alliance.leaderCode === actorCode;
  const isMember = alliance.members.includes(actorCode);

  if (!isMember) throw AppError.badRequest('Only a member may act on this alliance');

  if (action === 'dissolve') {
    if (!isLeader) throw AppError.badRequest('Only the alliance leader may dissolve it');

    return AllianceModel.findOneAndUpdate(
      { _id: alliance._id },
      { $set: { status: 'dissolved', dissolvedDay: day } },
      { new: true, lean: true },
    );
  }

  if (action === 'edit') {
    if (!isLeader) throw AppError.badRequest('Only the alliance leader may edit the charter');

    return AllianceModel.findOneAndUpdate(
      { _id: alliance._id },
      {
        $set: {
          ...(payload.charter !== undefined ? { charter: payload.charter } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.votingRules !== undefined ? { votingRules: payload.votingRules } : {}),
        },
      },
      { new: true, lean: true },
    );
  }

  if (action === 'expel') {
    if (!isLeader) throw AppError.badRequest('Only the alliance leader may expel a member');

    const target = payload.targetCode;

    if (!target || !alliance.members.includes(target)) throw AppError.badRequest('That state is not a member');
    if (target === actorCode) throw AppError.badRequest('The leader cannot expel itself; dissolve instead');

    return AllianceModel.findOneAndUpdate(
      { _id: alliance._id },
      { $pull: { members: target } },
      { new: true, lean: true },
    );
  }

  // leave
  const members = alliance.members.filter((member) => member !== actorCode);

  if (members.length === 0) {
    return AllianceModel.findOneAndUpdate(
      { _id: alliance._id },
      { $set: { members: [], status: 'dissolved', dissolvedDay: day } },
      { new: true, lean: true },
    );
  }

  return AllianceModel.findOneAndUpdate(
    { _id: alliance._id },
    {
      $set: {
        members,
        ...(isLeader ? { leaderCode: nextLeader(alliance.members, actorCode) } : {}),
      },
    },
    { new: true, lean: true },
  );
}
