import type { Types } from 'mongoose';
import { AllianceInvitationModel } from '../models/alliance-invitation.model.js';
import { AllianceModel } from '../models/alliance.model.js';
import { CountryModel } from '../models/country.model.js';
import { DiplomaticRelationModel } from '../models/diplomatic-relation.model.js';
import { TreatyModel } from '../models/treaty.model.js';
import { WorldEventModel } from '../models/world-event.model.js';
import { clockOf } from '../simulation/simulation.clock.js';
import { AppError } from '../utils/app-error.js';

export type Importance = 'low' | 'medium' | 'high' | 'critical';

export interface EventFilter {
  country?: string;
  region?: string;
  category?: string;
  importance?: Importance;
  fromDay?: number;
  toDay?: number;
  search?: string;
  limit?: number;
}

export interface EventView {
  id: string;
  day: number;
  occurredAt: string;
  dateLabel: string;
  category: string;
  eventType: string;
  title: string;
  description: string;
  countryCode: string | null;
  countryName: string | null;
  countries: string[];
  provinces: string[];
  region: string | null;
  importance: Importance;
  consequences: string[];
  entities: Array<{ kind: string; id: string; label: string }>;
  effects: { stability: number; growth: number };
}

interface EventLike {
  _id?: unknown;
  day: number;
  occurredAt: Date | string;
  category: string;
  eventType?: string;
  headline: string;
  detail: string;
  countryCode?: string | null;
  countryName?: string | null;
  countries?: string[];
  provinces?: string[];
  region?: string | null;
  importance?: string;
  consequences?: string[];
  entities?: Array<{ kind: string; id?: string; label?: string }>;
  stabilityEffect?: number;
  growthEffect?: number;
}

export function toEventView(event: EventLike): EventView {
  const parts = clockOf(event.day);

  return {
    id: String(event._id ?? `${event.day}-${event.headline}`),
    day: event.day,
    occurredAt: new Date(event.occurredAt).toISOString(),
    dateLabel: parts.label,
    category: event.category,
    eventType: event.eventType ?? 'simulation',
    title: event.headline,
    description: event.detail,
    countryCode: event.countryCode ?? null,
    countryName: event.countryName ?? null,
    countries: event.countries ?? [],
    provinces: event.provinces ?? [],
    region: event.region ?? null,
    importance: (event.importance ?? 'low') as Importance,
    consequences: event.consequences ?? [],
    entities: (event.entities ?? []).map((entity) => ({
      kind: entity.kind,
      id: entity.id ?? '',
      label: entity.label ?? '',
    })),
    effects: { stability: event.stabilityEffect ?? 0, growth: event.growthEffect ?? 0 },
  };
}

/** Pure filter so the news rules can be tested without a database. */
export function matchesEventFilter(event: EventView, filter: EventFilter): boolean {
  if (filter.country) {
    const code = filter.country.toUpperCase();
    const named = event.countries.map((entry) => entry.toUpperCase());

    if (event.countryCode?.toUpperCase() !== code && !named.includes(code)) return false;
  }
  if (filter.region && event.region?.toLowerCase() !== filter.region.toLowerCase()) return false;
  if (filter.category && event.category !== filter.category) return false;
  if (filter.importance && event.importance !== filter.importance) return false;
  if (filter.fromDay !== undefined && event.day < filter.fromDay) return false;
  if (filter.toDay !== undefined && event.day > filter.toDay) return false;

  if (filter.search) {
    const needle = filter.search.toLowerCase();

    return (
      event.title.toLowerCase().includes(needle) ||
      event.description.toLowerCase().includes(needle) ||
      (event.countryName?.toLowerCase().includes(needle) ?? false)
    );
  }

  return true;
}

/** Newest first by default; ascending for the historical timeline. */
export function sortEventViews(events: EventView[], order: 'asc' | 'desc' = 'desc'): EventView[] {
  return [...events].sort((a, b) => {
    if (a.day !== b.day) return order === 'asc' ? a.day - b.day : b.day - a.day;

    return order === 'asc'
      ? Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
      : Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  });
}

export async function recordEvent(
  worldId: Types.ObjectId,
  input: {
    day: number;
    occurredAt: Date;
    category: string;
    eventType: string;
    title: string;
    description: string;
    countries?: string[];
    provinces?: string[];
    region?: string;
    importance?: Importance;
    consequences?: string[];
    entities?: Array<{ kind: string; id: string; label: string }>;
  },
) {
  return WorldEventModel.create({
    worldId,
    day: input.day,
    occurredAt: input.occurredAt,
    category: input.category as never,
    eventType: input.eventType,
    headline: input.title,
    detail: input.description,
    countries: input.countries ?? [],
    provinces: input.provinces ?? [],
    region: input.region ?? null,
    importance: input.importance ?? 'low',
    consequences: input.consequences ?? [],
    entities: input.entities ?? [],
    source: 'simulation',
  });
}

export async function listEvents(
  worldId: Types.ObjectId,
  filter: EventFilter,
  order: 'asc' | 'desc' = 'desc',
): Promise<EventView[]> {
  const query: Record<string, unknown> = { worldId };

  if (filter.category) query.category = filter.category;
  if (filter.importance) query.importance = filter.importance;
  if (filter.region) query.region = filter.region;
  if (filter.country) {
    const code = filter.country.toUpperCase();
    query.$or = [{ countryCode: code }, { countries: code }];
  }
  if (filter.fromDay !== undefined || filter.toDay !== undefined) {
    query.day = {
      ...(filter.fromDay !== undefined ? { $gte: filter.fromDay } : {}),
      ...(filter.toDay !== undefined ? { $lte: filter.toDay } : {}),
    };
  }

  const limit = Math.min(filter.limit ?? 80, 300);
  const documents = await WorldEventModel.find(query as never)
    .sort({ day: order === 'asc' ? 1 : -1, occurredAt: order === 'asc' ? 1 : -1 })
    .limit(limit)
    .lean();

  return sortEventViews(
    documents.map((document) => toEventView(document as unknown as EventLike)).filter((event) => matchesEventFilter(event, filter)),
    order,
  );
}

export async function getEvent(worldId: Types.ObjectId, id: string): Promise<EventView> {
  const event = await WorldEventModel.findOne({ _id: id, worldId }).lean();

  if (!event) throw AppError.notFound('No event with that identifier');

  return toEventView(event as unknown as EventLike);
}

/**
 * Intelligence is a read-only summary of stored state: no espionage, no
 * prediction. Every line is derived from events, relations or treaties.
 */
export async function intelligenceOverview(worldId: Types.ObjectId, fromDay: number, toDay: number) {
  const [events, tensions, treaties, alliances, invitations, countries] = await Promise.all([
    listEvents(worldId, { fromDay, toDay, limit: 300 }),
    DiplomaticRelationModel.find({ worldId }).sort({ score: 1 }).limit(6).lean(),
    TreatyModel.find({ worldId, status: { $in: ['active', 'proposed', 'negotiating'] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    AllianceModel.find({ worldId, status: 'active' }).lean(),
    AllianceInvitationModel.countDocuments({ worldId, status: 'pending' }),
    CountryModel.find({ worldId }).select('shortCode name stability gdp').lean(),
  ]);

  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.category, (counts.get(event.category) ?? 0) + 1));

  const highStrain = countries.filter((country) => country.stability < 40);

  const risks = [
    ...tensions
      .filter((relation) => relation.score < -20)
      .map(
        (relation) =>
          `Low standing between ${relation.aName} and ${relation.bName} (${relation.score})`,
      ),
    ...highStrain.map((country) => `Stability at ${Math.round(country.stability)} in ${country.name}`),
  ].slice(0, 6);

  return {
    window: { fromDay, toDay },
    totals: {
      events: events.length,
      byCategory: [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      criticalEvents: events.filter((event) => event.importance === 'critical').length,
    },
    tensions: tensions.map((relation) => ({
      a: relation.aName,
      b: relation.bName,
      score: relation.score,
      status: relation.status,
      threat: relation.militaryThreat,
    })),
    agreements: {
      activeTreaties: treaties.filter((treaty) => treaty.status === 'active').length,
      pendingTreaties: treaties.filter((treaty) => treaty.status !== 'active').length,
      alliances: alliances.length,
      pendingInvitations: invitations,
      latest: treaties.slice(0, 5).map((treaty) => ({
        name: treaty.name,
        type: treaty.type,
        status: treaty.status,
        parties: treaty.parties,
      })),
    },
    risks,
    recent: events.slice(0, 12),
  };
}
