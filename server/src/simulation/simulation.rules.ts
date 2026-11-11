import type { SeededRandom } from '../world/generator/seeded-random.js';
import type { CountryDayState, CountryDayUpdate, GeneratedEvent } from './simulation.types.js';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

interface EventTemplate {
  category: GeneratedEvent['category'];
  headline: (country: string) => string;
  detail: (country: string) => string;
  severity: GeneratedEvent['severity'];
  stability: [number, number];
  growth: [number, number];
}

/**
 * Fixed template bank. Every headline is produced by these rules, never by a
 * model, so a given seed and day always generate the same event.
 */
const EVENT_TEMPLATES: EventTemplate[] = [
  {
    category: 'economy',
    headline: (country) => `${country} reports a wider trade surplus`,
    detail: (country) =>
      `Customs data from ${country} shows exports outpacing imports for the third consecutive quarter.`,
    severity: 'low',
    stability: [0.2, 0.8],
    growth: [0.05, 0.25],
  },
  {
    category: 'economy',
    headline: (country) => `Currency pressure builds in ${country}`,
    detail: (country) =>
      `Traders in ${country} moved out of the local currency after the central bank held rates unchanged.`,
    severity: 'medium',
    stability: [-1.4, -0.5],
    growth: [-0.3, -0.1],
  },
  {
    category: 'society',
    headline: (country) => `Labour walkout halts transport in ${country}`,
    detail: (country) =>
      `Rail and port unions in ${country} began a 48-hour stoppage over wage indexation.`,
    severity: 'medium',
    stability: [-1.8, -0.7],
    growth: [-0.25, -0.05],
  },
  {
    category: 'society',
    headline: (country) => `${country} expands rural health coverage`,
    detail: (country) =>
      `The government of ${country} extended clinic funding to the interior provinces.`,
    severity: 'low',
    stability: [0.3, 1.1],
    growth: [0, 0.1],
  },
  {
    category: 'climate',
    headline: (country) => `Drought cuts harvest yields in ${country}`,
    detail: (country) =>
      `Rainfall across ${country} fell below the ten-year median, hitting grain output.`,
    severity: 'high',
    stability: [-2.2, -1.0],
    growth: [-0.6, -0.2],
  },
  {
    category: 'climate',
    headline: (country) => `Flood defences hold in ${country}`,
    detail: (country) =>
      `Seasonal flooding in ${country} damaged few assets after last year's levee programme.`,
    severity: 'low',
    stability: [0.2, 0.9],
    growth: [0, 0.12],
  },
  {
    category: 'infrastructure',
    headline: (country) => `${country} opens a new freight corridor`,
    detail: (country) =>
      `A 400 km rail link entered service in ${country}, cutting inland transit times.`,
    severity: 'low',
    stability: [0.4, 1.2],
    growth: [0.15, 0.45],
  },
  {
    category: 'infrastructure',
    headline: (country) => `Grid failure disrupts industry in ${country}`,
    detail: (country) =>
      `A substation fault in ${country} forced rolling blackouts across two provinces.`,
    severity: 'medium',
    stability: [-1.5, -0.6],
    growth: [-0.35, -0.1],
  },
  {
    category: 'administration',
    headline: (country) => `${country} reshuffles its finance ministry`,
    detail: (country) =>
      `The cabinet of ${country} replaced two senior finance officials after a budget dispute.`,
    severity: 'low',
    stability: [-0.5, 0.4],
    growth: [-0.1, 0.15],
  },
  {
    category: 'administration',
    headline: (country) => `Audit finds waste in ${country} procurement`,
    detail: (country) =>
      `An oversight report in ${country} flagged uncompetitive tenders across three ministries.`,
    severity: 'medium',
    stability: [-1.2, -0.3],
    growth: [-0.2, 0],
  },
];

/**
 * One simulated day of economic and social movement for a country.
 *
 * Pure and deterministic: the same state plus the same seeded random stream
 * always produces the same next state, which is what makes replay safe.
 */
export interface DiplomacyModifiers {
  growth: number;
  stability: number;
  trade: number;
}

const NO_MODIFIERS: DiplomacyModifiers = { growth: 0, stability: 0, trade: 0 };

export function simulateCountryDay(
  country: CountryDayState,
  random: SeededRandom,
  modifiers: DiplomacyModifiers = NO_MODIFIERS,
): CountryDayUpdate {
  const { gdpGrowth, inflation, debt, tradeBalance } = country;

  const growthTarget =
    2.1 -
    (debt - 45) * 0.012 +
    (country.stability - 50) * 0.021 +
    (tradeBalance > 0 ? 0.25 : -0.2) +
    modifiers.growth * 10;
  const nextGrowth = clamp(
    gdpGrowth * 0.92 + growthTarget * 0.08 + random.range(-0.22, 0.22),
    -8,
    11,
  );

  const inflationTarget = 2.3 + Math.max(0, nextGrowth) * 0.35 - Math.max(0, 50 - country.stability) * 0.03;
  const nextInflation = clamp(
    inflation * 0.9 + inflationTarget * 0.1 + random.range(-0.12, 0.12),
    0.1,
    45,
  );

  const nextDebt = clamp(
    debt + (nextInflation > nextGrowth ? 0.14 : -0.09) + random.range(-0.05, 0.05),
    2,
    260,
  );

  const nextTradeBalance = round(
    clamp(
      tradeBalance * 0.97 +
        (nextGrowth > 0 ? 0.12 : -0.1) +
        modifiers.trade +
        random.range(-0.4, 0.4),
      -country.gdp * 0.4,
      country.gdp * 0.4,
    ),
  );

  // Pressure combines inflation, debt service and stagnation; a stable state
  // drifts back towards its structural level rather than towards zero.
  const pressure =
    Math.max(0, nextInflation - 4.5) * 0.11 +
    Math.max(0, nextDebt - 65) * 0.005 -
    nextGrowth * 0.16 +
    (country.stability - 55) * 0.014;

  const nextStability = clamp(
    country.stability - pressure * 0.55 + modifiers.stability + random.range(-0.3, 0.3),
    4,
    99,
  );

  return {
    code: country.code,
    gdp: round(Math.max(0, country.gdp * (1 + nextGrowth / 100 / 360))),
    stability: round(nextStability),
    economy: {
      gdpGrowth: round(nextGrowth),
      inflation: round(nextInflation),
      debt: round(nextDebt),
      tradeBalance: nextTradeBalance,
    },
  };
}

export function shouldGenerateEvent(random: SeededRandom, chance: number): boolean {
  return random.next() < chance;
}

export function generateWorldEvent(
  country: CountryDayState,
  random: SeededRandom,
): GeneratedEvent {
  const template = random.pick(EVENT_TEMPLATES);
  const stabilityEffect = round(random.range(template.stability[0], template.stability[1]));
  const growthEffect = round(random.range(template.growth[0], template.growth[1]));

  return {
    category: template.category,
    headline: template.headline(country.name),
    detail: template.detail(country.name),
    countryCode: country.code,
    countryName: country.name,
    severity: template.severity,
    stabilityEffect,
    growthEffect,
  };
}

/** Deterministic selection of the country an event lands on. */
export function pickEventCountry<T>(countries: readonly T[], random: SeededRandom): T | null {
  if (countries.length === 0) return null;

  return random.pick(countries);
}

export interface AggregateStats {
  countries: number;
  totalGdp: number;
  averageStability: number;
  averageGrowth: number;
}

export function aggregateStats(
  countries: ReadonlyArray<Pick<CountryDayState, 'gdp' | 'stability' | 'gdpGrowth'>>,
): AggregateStats {
  if (countries.length === 0) {
    return { countries: 0, totalGdp: 0, averageStability: 0, averageGrowth: 0 };
  }

  const totalGdp = countries.reduce((sum, country) => sum + country.gdp, 0);

  return {
    countries: countries.length,
    totalGdp: round(totalGdp),
    averageStability: round(
      countries.reduce((sum, country) => sum + country.stability, 0) / countries.length,
    ),
    averageGrowth: round(
      countries.reduce((sum, country) => sum + country.gdpGrowth, 0) / countries.length,
    ),
  };
}
