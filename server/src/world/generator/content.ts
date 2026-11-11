/** Name banks for the fictional world. No real countries, capitals or leaders appear here. */

export const CONTINENTS = [
  {
    name: 'Aurelia',
    description: 'Temperate coastal powers bound by a long contested strait.',
    center: [-104, 32] as [number, number],
    radius: [36, 27] as [number, number],
    countries: 6,
  },
  {
    name: 'Kethara',
    description: 'Inland federation of river states and upland clans.',
    center: [-16, 48] as [number, number],
    radius: [31, 23] as [number, number],
    countries: 5,
  },
  {
    name: 'Norvane',
    description: 'Dense industrial belt along a cold northern shelf.',
    center: [56, 42] as [number, number],
    radius: [38, 26] as [number, number],
    countries: 6,
  },
  {
    name: 'Sableon',
    description: 'Island arc of maritime traders and strait chokepoints.',
    center: [148, 18] as [number, number],
    radius: [27, 24] as [number, number],
    countries: 4,
  },
  {
    name: 'Tarnys',
    description: 'Southern savannah and ore belt with fragile borders.',
    center: [-62, -40] as [number, number],
    radius: [32, 22] as [number, number],
    countries: 5,
  },
  {
    name: 'Veyra',
    description: 'High plateau states guarding rare-earth corridors.',
    center: [84, -46] as [number, number],
    radius: [30, 20] as [number, number],
    countries: 4,
  },
] as const;

const NAME_PREFIXES = [
  'Aur', 'Bel', 'Cor', 'Dra', 'Eld', 'Fen', 'Gal', 'Hal', 'Ith', 'Jor',
  'Kav', 'Lor', 'Mar', 'Ner', 'Oph', 'Pyr', 'Quel', 'Rav', 'Sarn', 'Tal',
  'Umb', 'Vas', 'Wyn', 'Xan', 'Yr', 'Zeph', 'Bran', 'Cal', 'Dun', 'Eth',
];

const NAME_SUFFIXES = [
  'avia', 'oria', 'enia', 'anth', 'mere', 'gard', 'helm', 'ovar', 'ith', 'ash',
  'alis', 'andra', 'ova', 'rim', 'mark', 'fell', 'reach', 'holm', 'wyn', 'grad',
];

const CAPITAL_SUFFIXES = ['burg', 'ton', 'holm', 'grad', 'ford', 'gate', 'crest', 'haven', 'spire', 'march'];

const LEADER_FIRST_NAMES = [
  'Adrien', 'Mirela', 'Tomas', 'Yara', 'Kelso', 'Ines', 'Radek', 'Anouk', 'Dorian', 'Sefa',
  'Lior', 'Nadia', 'Bastian', 'Oriel', 'Hedda', 'Casimir', 'Runa', 'Emre', 'Nico', 'Zora',
];

const LEADER_SURNAMES = [
  'Vasko', 'Renn', 'Aldar', 'Mosel', 'Kara', 'Delvin', 'Sorrel', 'Fennick', 'Ilves', 'Ostry',
  'Marn', 'Beran', 'Toska', 'Halden', 'Reyes', 'Novak', 'Sarn', 'Vey', 'Orlov', 'Dane',
];

export const GOVERNMENT_TYPES = [
  'Constitutional Republic',
  'Federal Republic',
  'Parliamentary Monarchy',
  'Absolute Monarchy',
  'Military Junta',
  'Technocratic Directorate',
  'Council Republic',
  'One-Party State',
  'Confederation',
  'Clerical Republic',
] as const;

export const TERRAINS = [
  'coastal plain',
  'highlands',
  'arid steppe',
  'temperate forest',
  'river delta',
  'mountain range',
  'archipelago',
  'desert basin',
  'plateau',
  'marshland',
] as const;

export const RESOURCES = [
  'iron ore',
  'oil',
  'natural gas',
  'copper',
  'grain',
  'timber',
  'rare earths',
  'uranium',
  'fisheries',
  'coal',
  'lithium',
  'gold',
] as const;

export const FLAGS = ['🏳️', '🏴', '🚩', '🏁'] as const;

export function buildCountryName(random: {
  pick: <T>(items: readonly T[]) => T;
}): string {
  const name = `${random.pick(NAME_PREFIXES)}${random.pick(NAME_SUFFIXES)}`;

  return name.charAt(0).toUpperCase() + name.slice(1);
}


export function buildLeaderName(random: {
  pick: <T>(items: readonly T[]) => T;
}): string {
  return `${random.pick(LEADER_FIRST_NAMES)} ${random.pick(LEADER_SURNAMES)}`;
}

export function buildShortCode(country: string): string {
  const letters = country.replace(/[^A-Za-z]/g, '').toUpperCase();

  return letters.slice(0, 3).padEnd(3, letters.charAt(letters.length - 1) || 'X');
}

/**
 * Map palette: thirty muted, hand-picked hex colours that stay distinguishable on a
 * dark ocean and avoid the neon bands a generated hue wheel drifts into.
 */
const COUNTRY_PALETTE = [
  '#4a6fa5', '#5d8a76', '#8a6d3b', '#a05a44', '#6b6a9a',
  '#3f7d8c', '#7a8b4a', '#946b52', '#55707f', '#7b5b8a',
  '#3d6b5a', '#8c6239', '#5b7aa0', '#a17a4f', '#4f6b7d',
  '#6f8f6a', '#8a5560', '#6a7f9a', '#9a7b4f', '#4e7f7a',
  '#7d6a9a', '#5f8a5a', '#a06a5a', '#4d6480', '#7a8a6a',
  '#8f6f8a', '#5a7f8f', '#9a8a5a', '#6a5f7f', '#527a6a',
] as const;

export function colourForIndex(index: number): string {
  return COUNTRY_PALETTE[index % COUNTRY_PALETTE.length] as string;
}

const CAPITAL_ROOTS = [
  'Val', 'Mor', 'Kes', 'Tor', 'Bel', 'Ash', 'Dun', 'Hal', 'Zar', 'Ner',
  'Sol', 'Pyr', 'Rav', 'Kel', 'Ost', 'Fen', 'Gor', 'Lin', 'Mar', 'Vey',
  'Sar', 'Lor', 'Cad', 'Bren', 'Wyn', 'Ith', 'Orm', 'Tal', 'Ush', 'Ven',
] as const;

export function buildCapitalName(random: {
  pick: <T>(items: readonly T[]) => T;
}): string {
  return `${random.pick(CAPITAL_ROOTS)}${random.pick(CAPITAL_SUFFIXES)}`;
}


