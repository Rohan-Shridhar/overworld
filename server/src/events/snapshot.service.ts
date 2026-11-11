import type { Types } from 'mongoose';
import { CountryModel } from '../models/country.model.js';
import { WorldEventModel } from '../models/world-event.model.js';
import { WorldModel } from '../models/world.model.js';
import { WorldSnapshotModel } from '../models/world-snapshot.model.js';
import { toDayIndex } from '../simulation/simulation.clock.js';
import { AppError } from '../utils/app-error.js';

export interface SnapshotView {
  id: string;
  label: string;
  day: number;
  simulationDate: string;
  createdAt: string;
  eventCount: number;
  countries: number;
}

/** Checkpoints are manual and cheap: current clock plus every country's headline stats. */
export async function createSnapshot(worldId: Types.ObjectId, label: string) {
  const world = await WorldModel.findById(worldId).lean();

  if (!world) throw AppError.notFound('The world has not been generated yet');

  const [countries, eventCount] = await Promise.all([
    CountryModel.find({ worldId }).select('shortCode gdp stability economy').lean(),
    WorldEventModel.countDocuments({ worldId }),
  ]);

  return WorldSnapshotModel.create({
    worldId,
    label: label.trim().slice(0, 120) || `Checkpoint day ${toDayIndex(new Date(world.currentSimulationDate))}`,
    day: toDayIndex(new Date(world.currentSimulationDate)),
    simulationDate: new Date(world.currentSimulationDate),
    eventCount,
    countries: countries.map((country) => ({
      code: country.shortCode,
      gdp: country.gdp,
      stability: country.stability,
      gdpGrowth: country.economy?.gdpGrowth ?? 0,
      inflation: country.economy?.inflation ?? 0,
      debt: country.economy?.debt ?? 0,
    })),
    settings: {
      speed: typeof world.simulationSettings?.speed === 'number' ? world.simulationSettings.speed : 1,
      paused: true,
    },
  });
}

export async function listSnapshots(worldId: Types.ObjectId): Promise<SnapshotView[]> {
  const snapshots = await WorldSnapshotModel.find({ worldId }).sort({ day: -1, createdAt: -1 }).limit(50).lean();

  return snapshots.map((snapshot) => ({
    id: String(snapshot._id),
    label: snapshot.label,
    day: snapshot.day,
    simulationDate: new Date(snapshot.simulationDate).toISOString(),
    createdAt: new Date(snapshot.createdAt as Date).toISOString(),
    eventCount: snapshot.eventCount,
    countries: snapshot.countries.length,
  }));
}

/**
 * Restores clock, settings and country statistics from a checkpoint.
 *
 * Events are deliberately untouched: history is append-only, so a restore rolls
 * the world forward to a previous state while leaving the record of what happened
 * intact. The world is paused after a restore so nothing advances underneath the
 * operator while they inspect the result.
 */
export async function restoreSnapshot(worldId: Types.ObjectId, snapshotId: string) {
  const snapshot = await WorldSnapshotModel.findOne({ _id: snapshotId, worldId }).lean();

  if (!snapshot) throw AppError.notFound('No snapshot with that identifier');

  await WorldModel.updateOne(
    { _id: worldId },
    {
      $set: {
        currentSimulationDate: new Date(snapshot.simulationDate),
        'simulationSettings.paused': true,
        'simulationSettings.speed': snapshot.settings?.speed ?? 1,
        'simulationState.lastDay': snapshot.day,
      },
    },
  );

  if (snapshot.countries.length > 0) {
    await CountryModel.bulkWrite(
      snapshot.countries.map((country) => ({
        updateOne: {
          filter: { worldId, shortCode: country.code },
          update: {
            $set: {
              gdp: country.gdp,
              stability: country.stability,
              'economy.gdpGrowth': country.gdpGrowth,
              'economy.inflation': country.inflation,
              'economy.debt': country.debt,
            },
          },
        },
      })),
      { ordered: false },
    );
  }

  const eventsKept = await WorldEventModel.countDocuments({ worldId });

  return {
    day: snapshot.day,
    simulationDate: new Date(snapshot.simulationDate).toISOString(),
    countriesRestored: snapshot.countries.length,
    eventsKept,
    paused: true,
  };
}
