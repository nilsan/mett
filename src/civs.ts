// Static civilization data and game setup recommendations
// Based on official Mega Empires: The West & The East rulebook and Scenarios document

export interface CivDef {
  number: number;
  name: string;
  slug: string;
  color: string;
  textColor: 'black' | 'white';
  defRegion: 'west' | 'east';
}

export const CIVS: CivDef[] = [
  { number: 1,  name: 'Minoa',    slug: 'minoa',    color: '#BDCF01', textColor: 'black', defRegion: 'west' },
  { number: 2,  name: 'Saba',     slug: 'saba',     color: '#FF6A14', textColor: 'white', defRegion: 'east' },
  { number: 3,  name: 'Assyria',  slug: 'assyria',  color: '#A3D8E2', textColor: 'black', defRegion: 'west' },
  { number: 4,  name: 'Maurya',   slug: 'maurya',   color: '#DD4343', textColor: 'white', defRegion: 'east' },
  { number: 5,  name: 'Celt',     slug: 'celt',     color: '#16C345', textColor: 'black', defRegion: 'west' },
  { number: 6,  name: 'Babylon',  slug: 'babylon',  color: '#A7A9AB', textColor: 'white', defRegion: 'east' },
  { number: 7,  name: 'Carthage', slug: 'carthage', color: '#FE9016', textColor: 'black', defRegion: 'west' },
  { number: 8,  name: 'Dravidia', slug: 'dravidia', color: '#0A2A8A', textColor: 'white', defRegion: 'east' },
  { number: 9,  name: 'Hatti',    slug: 'hatti',    color: '#E8AFCE', textColor: 'black', defRegion: 'west' },
  { number: 10, name: 'Kushan',   slug: 'kushan',   color: '#9C422C', textColor: 'white', defRegion: 'east' },
  { number: 11, name: 'Rome',     slug: 'rome',     color: '#EC008D', textColor: 'black', defRegion: 'west' },
  { number: 12, name: 'Persia',   slug: 'persia',   color: '#5F43B7', textColor: 'white', defRegion: 'east' },
  { number: 13, name: 'Iberia',   slug: 'iberia',   color: '#FFFFFF', textColor: 'black', defRegion: 'west' },
  { number: 14, name: 'Nubia',    slug: 'nubia',    color: '#00B1B7', textColor: 'white', defRegion: 'east' },
  { number: 15, name: 'Hellas',   slug: 'hellas',   color: '#F5EE2A', textColor: 'black', defRegion: 'west' },
  { number: 16, name: 'Indus',    slug: 'indus',    color: '#3F8D43', textColor: 'white', defRegion: 'east' },
  { number: 17, name: 'Egypt',    slug: 'egypt',    color: '#F7E6DE', textColor: 'black', defRegion: 'west' },
  { number: 18, name: 'Parthia',  slug: 'parthia',  color: '#847C49', textColor: 'white', defRegion: 'east' },
];

// Recommended civ selection per player count for the combined (West+East) game.
// Based on official Mega Empires Scenarios rulebook (mega-empires.com).
// Each entry: [civ numbers in play, { number: region override }]
// region override = 'east' means that civ plays in East block even though it originates from West
export interface SetupRecommendation {
  civNumbers: number[];
  // civs that play in the opposite block from their default region
  regionOverrides: Record<number, 'west' | 'east'>;
  note?: string;
}

export const SETUP_RECOMMENDATIONS: Record<number, SetupRecommendation> = {
  // West-only game
  3:  { civNumbers: [15, 9, 1], regionOverrides: {} },
  4:  { civNumbers: [15, 9, 1, 3], regionOverrides: {} },
  5:  { civNumbers: [15, 9, 1, 3, 11], regionOverrides: {} },
  6:  { civNumbers: [15, 9, 7, 1, 3, 11], regionOverrides: {} },
  7:  { civNumbers: [15, 13, 9, 7, 1, 3, 11], regionOverrides: {} },
  8:  { civNumbers: [17, 15, 13, 9, 7, 1, 3, 11], regionOverrides: {} },
  9:  { civNumbers: [17, 15, 13, 9, 7, 5, 1, 3, 11], regionOverrides: {} },
  // Combined game (West + East)
  10: { civNumbers: [15, 9, 1, 17, 3, 6, 12, 2, 14, 18], regionOverrides: {} },
  11: { civNumbers: [15, 9, 1, 17, 3, 10, 6, 12, 2, 14, 18], regionOverrides: {} },
  12: {
    civNumbers: [15, 11, 9, 7, 1, 17, 3, 6, 12, 2, 14, 18],
    regionOverrides: { 3: 'east' },
    note: 'Assyria → East',
  },
  13: {
    civNumbers: [15, 13, 11, 9, 7, 1, 3, 17, 6, 12, 2, 14, 18],
    regionOverrides: { 3: 'east', 17: 'east' },
    note: 'Assyria + Egypt → East',
  },
  14: {
    civNumbers: [15, 13, 11, 9, 7, 5, 1, 3, 17, 6, 12, 2, 14, 18],
    regionOverrides: { 3: 'east', 17: 'east' },
    note: 'Assyria + Egypt → East',
  },
  15: {
    civNumbers: [17, 15, 13, 11, 9, 7, 1, 3, 10, 16, 6, 12, 2, 14, 18],
    regionOverrides: { 3: 'east' },
    note: 'Assyria → East',
  },
  16: {
    civNumbers: [17, 15, 13, 11, 9, 7, 5, 1, 3, 10, 16, 6, 12, 2, 14, 18],
    regionOverrides: { 3: 'east' },
    note: 'Assyria → East',
  },
  17: {
    civNumbers: [17, 15, 13, 11, 9, 7, 1, 3, 4, 8, 10, 16, 6, 12, 2, 14, 18],
    regionOverrides: {},
  },
  18: {
    civNumbers: [17, 15, 13, 11, 9, 7, 5, 1, 3, 4, 8, 10, 16, 6, 12, 2, 14, 18],
    regionOverrides: {},
  },
};

// Empires that require no cities to advance from Stone Age to Early Bronze Age (level 20).
// These empires have 5 stone age steps instead of 4.
// Basic mode: Minoa (1), Saba (2)
// Expert mode: Minoa (1), Saba (2), Kushan (10), Iberia (13)
export const LATE_BRONZE_BASIC = new Set([1, 2]);
export const LATE_BRONZE_EXPERT = new Set([1, 2, 10, 13]);

export function getCivBySlug(slug: string): CivDef | undefined {
  return CIVS.find(c => c.slug === slug);
}

export function getCivByNumber(number: number): CivDef | undefined {
  return CIVS.find(c => c.number === number);
}
