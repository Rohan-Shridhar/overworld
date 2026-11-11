import type { Types } from 'mongoose';
import { AllianceInvitationModel } from '../models/alliance-invitation.model.js';
import { expireTreaties } from './treaty.service.js';

export interface DiplomacyMaintenanceResult {
  expired: number;
  renewed: number;
  invitationsExpired: number;
}

/**
 * The diplomacy half of a simulation day: terms end, invitations lapse.
 *
 * Deliberately small and deterministic — anything that changes relations does so
 * through an explicit diplomatic action or a treaty event, never a coin flip.
 */
export async function runDiplomacyMaintenance(
  worldId: Types.ObjectId,
  day: number,
): Promise<DiplomacyMaintenanceResult> {
  const treaties = await expireTreaties(worldId, day);
  const invitations = await AllianceInvitationModel.updateMany(
    { worldId, status: 'pending', expiresDay: { $lte: day } },
    { $set: { status: 'expired', resolvedDay: day } },
  );

  return {
    ...treaties,
    invitationsExpired: invitations.modifiedCount ?? 0,
  };
}
