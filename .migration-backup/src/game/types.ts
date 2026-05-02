export interface PlayerState {
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: number;
  isRunning: boolean;
  isJumping: boolean;
  isGrounded: boolean;
  isMounted: boolean;
}

export interface SurvivalState {
  health: number;
  stamina: number;
  hunger: number;
  temperature: number;
}

export interface ResourceInventory {
  wood: number;
  stone: number;
  food: number;
}

export interface WorldObject {
  id: string;
  type: 'tree' | 'rock' | 'bush' | 'crate';
  position: [number, number, number];
  health: number;
  maxHealth: number;
  depleted: boolean;
}

export interface Enemy {
  id: string;
  type: 'bandit' | 'wolf' | 'guard';
  position: [number, number, number];
  health: number;
  maxHealth: number;
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'dead';
  targetPosition: [number, number, number];
}

export interface PlacedBuilding {
  id: string;
  type: string;
  position: [number, number, number];
  rotation: number;
}

export type GameMode = 'explore' | 'combat' | 'build';

// Loot pickup in world
export interface LootPickup {
  id: string;
  type: 'wood' | 'stone' | 'food' | 'loot_crate';
  position: [number, number, number];
  amount: number;
  collected: boolean;
}

// Progression tracking
export interface ProgressionState {
  enemiesKilled: number;
  structuresBuilt: number;
  areasSecured: string[]; // POI ids that are "cleared"
  tier: number; // 1 = basic, 2 = advanced
  totalWoodGathered: number;
  totalStoneGathered: number;
}

// Zone effect on player
export interface ZoneEffect {
  name: string;
  tempModifier: number; // per second change to temperature
  dangerLevel: number; // 0-3
  resourceBonus: number; // multiplier
}