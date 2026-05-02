import * as THREE from 'three';
import { buildPOISCompat } from './world/RegionData';

// World — massively expanded (3x)
export const WORLD_SIZE = 1800;
export const HALF_WORLD = WORLD_SIZE / 2;

// Player
export const PLAYER_SPEED = 5.6;
export const PLAYER_RUN_SPEED = 9.8;
export const PLAYER_JUMP_FORCE = 12;
export const PLAYER_HEIGHT = 1.8;
export const GRAVITY = 30;

// Camera
export const CAMERA_OFFSET = new THREE.Vector3(0, 6, 10);
export const CAMERA_LERP_SPEED = 5;

// Survival
export const MAX_HEALTH = 100;
export const MAX_STAMINA = 100;
export const MAX_HUNGER = 100;
export const MAX_TEMPERATURE = 100;
// ~90 min from full to zero: 100 / 5400s ≈ 0.0185
export const HUNGER_DRAIN = 0.0185;
export const STAMINA_DRAIN = 12;
export const STAMINA_REGEN = 10;
export const TEMPERATURE_DRAIN = 0.12;
export const CAMPFIRE_WARMTH_RANGE = 14;
export const CAMPFIRE_WARMTH_RATE = 10;
export const SHELTER_EFFECT_RANGE = 10;
export const SHELTER_HUNGER_REDUCTION = 0.5;
export const SHELTER_STAMINA_BONUS = 6;
export const LOW_HUNGER_THRESHOLD = 15;
export const LOW_TEMP_THRESHOLD = 25;
export const COLD_DAMAGE_RATE = 0.5;
export const FOOD_HUNGER_RESTORE = 25;
// Graduated hunger thresholds
export const MEDIUM_HUNGER_THRESHOLD = 40;

// Colors (medieval palette)
export const COLORS = {
  grass: '#4a7c3f',
  grassDark: '#3d6634',
  dirt: '#8b7355',
  road: '#6b5b47',
  water: '#2e5c7a',
  waterDeep: '#1a3d5c',
  stone: '#7a7a7a',
  stoneDark: '#5a5a5a',
  wood: '#8b6914',
  woodDark: '#6b4f10',
  leaves: '#2d5a1e',
  leavesDark: '#1e4010',
  castle: '#a0a0a0',
  roof: '#8b3a3a',
  sand: '#c2b280',
  fog: '#8a9a7a',
  sky: '#6b8fa3',
};

// POI positions — generated from world data
export const POIS = buildPOISCompat();

// Zone influence radius
export const POI_ZONE_RADIUS = 45;

// Progression thresholds
export const TIER2_KILLS_REQUIRED = 5;
export const TIER2_STRUCTURES_REQUIRED = 3;
