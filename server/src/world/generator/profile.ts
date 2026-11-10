import type { SeededRandom } from './seeded-random.js';

export interface ResourceOutput {
  resource: string;
  output: number;
  unit: string;
}

export interface CountryEconomy {
  gdpGrowth: number;
  inflation: number;
  debt: number;
  currency: string;
  tradeBalance: number;
  resourceProduction: ResourceOutput[];
}

export interface MilitaryBase {
  name: string;
  province: string;
  branch: 'army' | 'navy' | 'air';
  personnel: number;
}

export interface MilitaryDeployment {
  name: string;
  province: string;
  strength: number;
  status: 'garrison' | 'deployed' | 'exercising';
}

export interface CountryMilitary {
  personnel: number;
  army: number;
  navy: number;
  airForce: number;
  equipment: { tanks: number; aircraft: number; ships: number; artillery: number };
  bases: MilitaryBase[];
  deployments: MilitaryDeployment[];
}

export interface Treaty {
  name: string;
  partner: string;
  signedAt: Date;
}

export interface CountryDiplomacy {
  status: string;
  alliances: string[];
  treaties: Treaty[];
  rivals: string[];
  sanctions: string[];
  tradePartners: string[];
}

export interface CountryGovernance {
  environment: string;
  ideology: string;
  rulingParty: string;
  nextElection: Date | null;
}

const CURRENCIES = [
  'Aurel',
  'Kethi mark',
  'Norvane crown',
  'Sableon credit',
  'Tarnys dollar',
  'Veyran lira',
  'Eldmark',
  'Solari',
];

const IDEOLOGIES = [
  'Liberal democracy',
  'Social conservatism',
  'Technocratic pragmatism',
  'Nationalist populism',
  'Democratic socialism',
  'Civic republicanism',
  'Agrarian traditionalism',
  'Market liberalism',
];

const PARTIES = [
  'Civic Union',
  'Reform Bloc',
  'National Accord',
  'Labour Front',
  'Unity Party',
  'Green Coalition',
  'Merchants League',
  'Popular Congress',
];

const ENVIRONMENTS = [
  'Stable',
  'Contested',
  'Transitional',
  'Consolidated',
  'Fragile',
];

const DIPLOMATIC_STATUSES = ['Neutral', 'Friendly', 'Cordial', 'Strained', 'Rivalry'];

const BASE_PREFIXES = ['Fort', 'Camp', 'Station', 'Depot'];
const TREATY_NAMES = ['Non-aggression pact', 'Trade accord', 'Border commission', 'Maritime convention'];

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function buildEconomy(
  random: SeededRandom,
  resources: readonly string[],
): CountryEconomy {
  const resourceProduction = resources.slice(0, 4).map((resource) => ({
    resource,
    output: Math.round(random.range(12, 940)),
    unit: random.pick(['kt', 'M bbl', 'TWh', 'kha']),
  }));

  return {
    gdpGrowth: round2(random.range(-2.4, 6.8)),
    inflation: round2(random.range(0.4, 14.6)),
    debt: round2(random.range(8, 138)),
    currency: random.pick(CURRENCIES),
    tradeBalance: round2(random.range(-64, 88)),
    resourceProduction,
  };
}

export function buildMilitary(
  random: SeededRandom,
  population: number,
  provinceNames: readonly string[],
): CountryMilitary {
  const personnel = Math.round(population * random.range(0.002, 0.017));
  const army = Math.round(personnel * random.range(0.42, 0.6));
  const navy = Math.round(personnel * random.range(0.08, 0.24));
  const airForce = Math.max(0, personnel - army - navy);

  const bases: MilitaryBase[] = Array.from({ length: random.int(2, 4) }, (_, index) => ({
    name: `${random.pick(BASE_PREFIXES)} ${provinceNames[index % Math.max(1, provinceNames.length)] ?? 'Frontier'}`,
    province: provinceNames[index % Math.max(1, provinceNames.length)] ?? '',
    branch: random.pick(['army', 'navy', 'air'] as const),
    personnel: Math.round(personnel * random.range(0.02, 0.08)),
  }));

  const deployments: MilitaryDeployment[] = Array.from(
    { length: random.int(0, 2) },
    (): MilitaryDeployment => ({
      name: `${random.pick(['1st', '2nd', '3rd', '4th'])} ${random.pick(['Rifle', 'Armoured', 'Airborne', 'Coastal'])} Group`,
      province: random.pick(provinceNames.length > 0 ? provinceNames : ['Frontier']),
      strength: Math.round(personnel * random.range(0.03, 0.12)),
      status: random.pick(['garrison', 'deployed', 'exercising'] as const),
    }),
  );

  return {
    personnel,
    army,
    navy,
    airForce,
    equipment: {
      tanks: Math.round(army / random.range(40, 120)),
      aircraft: Math.round(airForce / random.range(18, 60)),
      ships: Math.round(navy / random.range(60, 220)),
      artillery: Math.round(army / random.range(90, 240)),
    },
    bases,
    deployments,
  };
}

/** Diplomacy only references other countries in this same generated world. */
export function buildDiplomacy(random: SeededRandom, otherNames: readonly string[]): CountryDiplomacy {
  const shuffled = random.shuffle(otherNames);
  const partnerCount = Math.min(Math.max(2, Math.floor(otherNames.length * 0.2)), shuffled.length);

  const treaties: Treaty[] = shuffled.slice(0, Math.min(2, shuffled.length)).map((partner) => ({
    name: random.pick(TREATY_NAMES),
    partner,
    signedAt: new Date(Date.UTC(2026, random.int(0, 11), random.int(1, 27))),
  }));

  return {
    status: random.pick(DIPLOMATIC_STATUSES),
    alliances: shuffled.slice(0, Math.min(2, shuffled.length)),
    treaties,
    rivals: shuffled.slice(partnerCount, partnerCount + Math.min(1, shuffled.length)),
    sanctions: random.next() > 0.75 ? shuffled.slice(0, 1) : [],
    tradePartners: shuffled.slice(0, partnerCount),
  };
}

export function buildGovernance(
  random: SeededRandom,
  governmentType: string,
  startYear: number,
): CountryGovernance {
  return {
    environment: random.pick(ENVIRONMENTS),
    ideology: random.pick(IDEOLOGIES),
    rulingParty: random.pick(PARTIES),
    nextElection:
      governmentType.toLowerCase().includes('republic') ||
      governmentType.toLowerCase().includes('council')
        ? new Date(Date.UTC(startYear + random.int(1, 4), random.int(0, 11), random.int(1, 27)))
        : null,
  };
}
