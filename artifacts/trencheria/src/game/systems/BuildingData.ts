import { ResourceInventory } from '../types';

export type BuildableType = 'campfire' | 'wall' | 'shelter' | 'fence' | 'workbench' | 'watchtower' | 'gate' | 'bedroll' | 'storage';

export interface BuildableConfig {
  type: BuildableType;
  label: string;
  cost: Partial<ResourceInventory>;
  size: [number, number, number];
  color: string;
  description: string;
  tier: number; // 1 = always available, 2 = unlocked
  effect?: string; // gameplay effect description
}

export const BUILDABLES: BuildableConfig[] = [
  // Tier 1 — Survival basics
  {
    type: 'campfire',
    label: '🔥 Campfire',
    cost: { wood: 3, stone: 2 },
    size: [1.2, 0.6, 1.2],
    color: '#8b6914',
    description: 'W:3 S:2',
    tier: 1,
    effect: 'Restores warmth & slow HP regen nearby',
  },
  {
    type: 'bedroll',
    label: '🛏 Bedroll',
    cost: { wood: 2 },
    size: [1, 0.3, 2],
    color: '#5a4a30',
    description: 'W:2',
    tier: 1,
    effect: 'Rest point — fast stamina recovery',
  },
  {
    type: 'fence',
    label: '🪵 Fence',
    cost: { wood: 3 },
    size: [4, 1.2, 0.2],
    color: '#6b4f10',
    description: 'W:3',
    tier: 1,
  },
  {
    type: 'wall',
    label: '🧱 Wooden Wall',
    cost: { wood: 5 },
    size: [3, 2.5, 0.3],
    color: '#7a5a14',
    description: 'W:5',
    tier: 1,
  },
  {
    type: 'shelter',
    label: '🏠 Shelter',
    cost: { wood: 8, stone: 3 },
    size: [4, 3, 4],
    color: '#5a3a1a',
    description: 'W:8 S:3',
    tier: 1,
    effect: 'Reduces hunger drain & boosts stamina regen',
  },

  // Tier 2 — Unlocked through progression
  {
    type: 'workbench',
    label: '🔨 Workbench',
    cost: { wood: 6, stone: 4 },
    size: [2, 1.2, 1.5],
    color: '#6b5020',
    description: 'W:6 S:4',
    tier: 2,
    effect: 'Converts 5 wood → 2 food (press E nearby)',
  },
  {
    type: 'watchtower',
    label: '🗼 Watchtower',
    cost: { wood: 10, stone: 5 },
    size: [3, 6, 3],
    color: '#5a4a20',
    description: 'W:10 S:5',
    tier: 2,
    effect: 'Vantage point — enemies detect you later nearby',
  },
  {
    type: 'gate',
    label: '🚪 Gate',
    cost: { wood: 8, stone: 2 },
    size: [4, 3, 0.5],
    color: '#5a3a10',
    description: 'W:8 S:2',
    tier: 2,
  },
  {
    type: 'storage',
    label: '📦 Storage Crate',
    cost: { wood: 4, stone: 1 },
    size: [1.5, 1, 1.5],
    color: '#6b4f10',
    description: 'W:4 S:1',
    tier: 2,
    effect: 'Resource stash marker — visual stockpile',
  },
];

export interface PlacedStructure {
  id: string;
  type: BuildableType;
  position: [number, number, number];
  rotation: number;
}

export const MIN_PLACE_DISTANCE = 2;
export const MAX_PLACE_DISTANCE = 8;
export const MIN_STRUCTURE_SPACING = 2;