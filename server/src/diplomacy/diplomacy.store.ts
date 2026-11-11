import type { Types } from 'mongoose';
import { CountryModel } from '../models/country.model.js';
import { DiplomaticRelationModel } from '../models/diplomatic-relation.model.js';
import { WorldModel } from '../models/world.model.js';
import { createRandom } from '../world/generator/seeded-random.js';
import { toDayIndex } from '../simulation/simulation.clock.js';
import { MAX_RELATION_HISTORY, RELATION_SCORE_MAX, RELATION_SCORE_MIN } from './diplomacy.constants.js';

export interface CountryIndexEntry {
  code: string;
  name: string;
  colour: string;
  continent: string;
  gdp: number;
  population: number;
  stability: number;
}

export interface RelationView {
  key: string;
  status: string;
  score: number;
  trust: number;
  influence: number;
  strategicImportance: number;
  tradeDependency: number;
  militaryThreat: number;
  lastInteractionAt: string | null;
  lastInteractionDay: number | null;
  primary: { code: string; name: string };
  counterpart: { code: string; name: string; colour: string };
  history: Array<{ day: number; at: string; kind: string; delta: number; note: string }>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Worlds seeded in this process; the database remains the source of truth. */
const seededWorlds = new Set<string>();

export async function getCurrentDay(worldId: Types.ObjectId): Promise<number> {
  const world = await WorldModel.findById(worldId).select('currentSimulationDate').lean();

  return world ? toDayIndex(new Date(world.currentSimulationDate)) : 0;
}

export async function loadCountryIndex(
  worldId: Types.ObjectId,
): Promise<Map<string, CountryIndexEntry>> {
  const countries = await CountryModel.find({ worldId })
    .select('shortCode name colour continent gdp population stability')
    .lean();

  return new Map(
    countries.map((country) => [
      country.shortCode,
      {
        code: country.shortCode,
        name: country.name,
        colour: country.colour,
        continent: country.continent,
        gdp: country.gdp,
        population: country.population,
        stability: country.stability,
      },
    ]),
  );
}

function seedPair(
  seed: string,
  a: CountryIndexEntry,
  b: CountryIndexEntry,
): Record<string, unknown> {
  const random = createRandom(`${seed}:relation:${pairKey(a.code, b.code)}`);
  const sharedContinent = a.continent === b.continent;
  const gdpGap = Math.abs(a.gdp - b.gdp) / Math.max(1, Math.max(a.gdp, b.gdp));
  const sizeGap = Math.abs(a.population - b.population) / Math.max(1, Math.max(a.population, b.population));

  const score = clamp(
    random.range(-18, 32) + (sharedContinent ? 9 : 0) - gdpGap * 12,
    RELATION_SCORE_MIN,
    RELATION_SCORE_MAX,
  );

  return {
    status: 'recognised',
    score: round(score),
    trust: round(clamp(42 + random.range(-6, 24) + score * 0.25, 5, 95)),
    influence: round(clamp(24 + Math.min(60, a.gdp / 40) + random.range(0, 16), 5, 95)),
    strategicImportance: round(sharedContinent ? random.range(48, 78) : random.range(18, 46)),
    tradeDependency: round(clamp(random.range(8, 40) + (sharedContinent ? 10 : 0), 2, 90)),
    militaryThreat: round(clamp(10 + sizeGap * 45 + random.range(0, 18), 2, 92)),
    history: [],
  };
}

/**
 * Creates the bilateral relationship for every country pair exactly once.
 * Seeding is deterministic, so two API instances compute identical values and
 * the unique key index keeps a single document either way.
 */
export async function ensureRelations(worldId: Types.ObjectId): Promise<void> {
  const worldKey = String(worldId);

  if (seededWorlds.has(worldKey)) return;

  const countries = [...(await loadCountryIndex(worldId)).values()];

  if (countries.length < 2) {
    seededWorlds.add(worldKey);
    return;
  }

  const world = await WorldModel.findById(worldId).select('seed').lean();
  const seed = world?.seed ?? 'overworld';
  const existing = await DiplomaticRelationModel.find({ worldId }).select('key').lean();
  const known = new Set(existing.map((relation) => relation.key));

  const writes: Array<Record<string, unknown>> = [];

  for (let i = 0; i < countries.length; i += 1) {
    for (let j = i + 1; j < countries.length; j += 1) {
      const a = countries[i];
      const b = countries[j];

      if (!a || !b) continue;

      const key = pairKey(a.code, b.code);

      if (known.has(key)) continue;

      writes.push({
        updateOne: {
          filter: { worldId, key },
          update: {
            $setOnInsert: {
              worldId,
              key,
              aCode: a.code,
              aName: a.name,
              bCode: b.code,
              bName: b.name,
              ...seedPair(seed, a, b),
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (writes.length > 0) {
    await DiplomaticRelationModel.bulkWrite(writes, { ordered: false });
  }

  seededWorlds.add(worldKey);
}

/** Test helper: forgets which worlds were seeded in this process. */
export function resetRelationSeedCache(): void {
  seededWorlds.clear();
}

export async function getRelationDoc(worldId: Types.ObjectId, aCode: string, bCode: string) {
  await ensureRelations(worldId);

  return DiplomaticRelationModel.findOne({ worldId, key: pairKey(aCode, bCode) }).lean();
}

export function toRelationView(
  relation: {
    key: string;
    aCode: string;
    aName: string;
    bCode: string;
    bName: string;
    status: string;
    score: number;
    trust: number;
    influence: number;
    strategicImportance: number;
    tradeDependency: number;
    militaryThreat: number;
    lastInteractionAt?: Date | null;
    lastInteractionDay?: number | null;
    history?: Array<{ day: number; at: Date; kind: string; delta: number; note: string }>;
  },
  perspectiveCode: string,
  colours: Map<string, string>,
): RelationView {
  const isA = relation.aCode === perspectiveCode;
  const counterpartCode = isA ? relation.bCode : relation.aCode;
  const counterpartName = isA ? relation.bName : relation.aName;

  return {
    key: relation.key,
    status: relation.status,
    score: relation.score,
    trust: relation.trust,
    influence: relation.influence,
    strategicImportance: relation.strategicImportance,
    tradeDependency: relation.tradeDependency,
    militaryThreat: relation.militaryThreat,
    lastInteractionAt: relation.lastInteractionAt?.toISOString() ?? null,
    lastInteractionDay: relation.lastInteractionDay ?? null,
    primary: { code: perspectiveCode, name: isA ? relation.aName : relation.bName },
    counterpart: {
      code: counterpartCode,
      name: counterpartName,
      colour: colours.get(counterpartCode) ?? '#4f6f8f',
    },
    history: (relation.history ?? []).map((entry) => ({
      day: entry.day,
      at: new Date(entry.at).toISOString(),
      kind: entry.kind,
      delta: entry.delta,
      note: entry.note,
    })),
  };
}

export interface RelationDeltas {
  score?: number;
  trust?: number;
  influence?: number;
  strategicImportance?: number;
  tradeDependency?: number;
  militaryThreat?: number;
  status?: string;
}

/** Applies clamped deltas and appends a capped history entry. */
export async function adjustRelation(
  worldId: Types.ObjectId,
  aCode: string,
  bCode: string,
  deltas: RelationDeltas,
  note: string,
  day: number,
  kind: string,
) {
  const relation = await getRelationDoc(worldId, aCode, bCode);

  if (!relation) return null;

  const nextScore = clamp(relation.score + (deltas.score ?? 0), RELATION_SCORE_MIN, RELATION_SCORE_MAX);
  const nextTrust = clamp(relation.trust + (deltas.trust ?? 0), 0, 100);

  return DiplomaticRelationModel.findOneAndUpdate(
    { worldId, key: pairKey(aCode, bCode) },
    {
      $set: {
        score: round(nextScore),
        trust: round(nextTrust),
        influence: round(clamp(relation.influence + (deltas.influence ?? 0), 0, 100)),
        strategicImportance: round(
          clamp(relation.strategicImportance + (deltas.strategicImportance ?? 0), 0, 100),
        ),
        tradeDependency: round(
          clamp(relation.tradeDependency + (deltas.tradeDependency ?? 0), 0, 100),
        ),
        militaryThreat: round(clamp(relation.militaryThreat + (deltas.militaryThreat ?? 0), 0, 100)),
        status: deltas.status ?? relation.status,
        lastInteractionDay: day,
        lastInteractionAt: new Date(),
        history: [
          ...(relation.history ?? []),
          { day, at: new Date(), kind, delta: deltas.score ?? 0, note },
        ].slice(-MAX_RELATION_HISTORY),
      },
    },
    { new: true, lean: true },
  );
}
