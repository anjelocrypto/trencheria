/**
 * Fixed 7-Faction System — Core Data
 * Maps factions to characters, kingdoms, colors, and spawn points.
 */

import type { CharacterType } from '../context/CharacterContext';

export interface FactionDef {
  id: string;           // UUID from database
  slug: string;         // url-safe key
  name: string;         // display name
  characterType: CharacterType;
  color: string;        // clan_color enum value
  colorHex: string;     // hex for rendering
  territoryId: string;  // territory row id
  kingdomName: string;  // player-facing kingdom name
  spawnX: number;       // home spawn X
  spawnZ: number;       // home spawn Z
  available: boolean;   // false = placeholder (Yetis, Dogs)
  icon: string;         // emoji for UI
}

export const FACTIONS: FactionDef[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'octopus',
    name: 'Octopus',
    characterType: 'octopus',
    color: 'teal',
    colorHex: '#16a085',
    territoryId: 'rivermoor',
    kingdomName: 'Octopus Kingdom',
    spawnX: 450,
    spawnZ: 350,
    available: true,
    icon: '🐙',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'nemoclaw',
    name: 'NemoClaw',
    characterType: 'nemoclaw',
    color: 'crimson',
    colorHex: '#c0392b',
    territoryId: 'darkhollow',
    kingdomName: 'NemoClaw Kingdom',
    spawnX: 550,
    spawnZ: -400,
    available: true,
    icon: '🦀',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'goblins',
    name: 'Goblins',
    characterType: 'goblin',
    color: 'emerald',
    colorHex: '#27ae60',
    territoryId: 'thornwall',
    kingdomName: 'Goblins Kingdom',
    spawnX: -500,
    spawnZ: -450,
    available: true,
    icon: '👺',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    slug: 'soldiers',
    name: 'Soldiers',
    characterType: 'soldier',
    color: 'azure',
    colorHex: '#2980b9',
    territoryId: 'stonepeak',
    kingdomName: 'Soldiers Kingdom',
    spawnX: -400,
    spawnZ: 500,
    available: true,
    icon: '⚔️',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    slug: 'chillguys',
    name: 'ChillGuys',
    characterType: 'chillhouse',
    color: 'amber',
    colorHex: '#e67e22',
    territoryId: 'goldenvale',
    kingdomName: 'ChillGuys Kingdom',
    spawnX: -550,
    spawnZ: 100,
    available: true,
    icon: '😎',
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    slug: 'yetis',
    name: 'Yetis',
    characterType: 'yeti',
    color: 'silver',
    colorHex: '#95a5a6',
    territoryId: 'frostmere',
    kingdomName: 'Yetis Kingdom',
    spawnX: 160,
    spawnZ: 200,
    available: false, // placeholder until real assets
    icon: '🏔️',
  },
  {
    id: '00000000-0000-0000-0000-000000000007',
    slug: 'dogs',
    name: 'Dogs',
    characterType: 'dog',
    color: 'gold',
    colorHex: '#f39c12',
    territoryId: 'blackthorn',
    kingdomName: 'Dogs Kingdom',
    spawnX: 190,
    spawnZ: -160,
    available: false, // placeholder until real assets
    icon: '🐕',
  },
];

/** Look up faction by its UUID */
export function getFactionById(id: string): FactionDef | undefined {
  return FACTIONS.find(f => f.id === id);
}

/** Look up faction by character type */
export function getFactionByCharacter(charType: string): FactionDef | undefined {
  return FACTIONS.find(f => f.characterType === charType);
}

/** Look up faction by slug */
export function getFactionBySlug(slug: string): FactionDef | undefined {
  return FACTIONS.find(f => f.slug === slug);
}

/** Get the home spawn point for a faction */
export function getFactionSpawn(factionId: string): { x: number; z: number } {
  const f = getFactionById(factionId);
  if (!f) return { x: 0, z: 82 }; // fallback to Ironhold
  return { x: f.spawnX, z: f.spawnZ };
}

/** Check if two players are in the same faction */
export function isSameFaction(factionIdA: string | null, factionIdB: string | null): boolean {
  if (!factionIdA || !factionIdB) return false;
  return factionIdA === factionIdB;
}
