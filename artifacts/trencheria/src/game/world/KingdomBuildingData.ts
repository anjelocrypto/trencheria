/**
 * KingdomBuildingData — Single source of truth for all seeded house positions
 * in the 5 new kingdoms. Both renderers and collision read from this.
 */
import { seededRng } from './SettlementPieces';

export interface KingdomHouseDef {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  h: number;
  matIndex: number; // 0 or 1 — renderer picks material based on this
  roofMatIndex: number;
}

// ========== FORTIFIED CITY (seed 11111) ==========
function generateFortifiedCityHouses(): KingdomHouseDef[] {
  const rng = seededRng(11111);
  const houses: KingdomHouseDef[] = [];

  // Barracks row at z=15
  for (const xOff of [-20, -10, 10, 20]) {
    houses.push({
      x: xOff, z: 15, rot: 0,
      w: 5, d: 4, h: 3,
      matIndex: 0, roofMatIndex: 0,
    });
  }

  // Houses ring — 12 houses
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const r = 22 + rng() * 10;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    const rot = angle + Math.PI + rng() * 0.4;
    const w = 4 + rng() * 2;
    const d = 4.5 + rng() * 2;
    const h = 3 + rng();
    const matIndex = rng() > 0.5 ? 0 : 1;
    houses.push({ x: hx, z: hz, rot, w, d, h, matIndex, roofMatIndex: 0 });
  }

  return houses;
}

// ========== RIVER TOWN (seed 22222) ==========
function generateRiverTownHouses(): KingdomHouseDef[] {
  const rng = seededRng(22222);
  const houses: KingdomHouseDef[] = [];

  // Waterfront houses
  for (const xOff of [-20, -12, 12, 20]) {
    const w = 4 + rng();
    const d = 4.5 + rng();
    const h = 3 + rng() * 0.5;
    const matIndex = 0;
    const roofMatIndex = 0;
    houses.push({ x: xOff, z: -20, rot: Math.PI, w, d, h, matIndex, roofMatIndex });
  }

  // Market houses — 10
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const r = 15 + rng() * 10;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r + 5;
    const rot = angle + Math.PI + rng() * 0.3;
    const w = 3.5 + rng() * 2;
    const d = 4 + rng() * 2;
    const h = 2.5 + rng() * 1.5;
    const matIndex = rng() > 0.4 ? 0 : 1;
    const roofMatIndex = rng() > 0.5 ? 0 : 1;
    houses.push({ x, z, rot, w, d, h, matIndex, roofMatIndex });
  }

  return houses;
}

// ========== MOUNTAIN HOLD (seed 33333) ==========
function generateMountainHoldHouses(): KingdomHouseDef[] {
  const rng = seededRng(33333);
  const houses: KingdomHouseDef[] = [];

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 14 + rng() * 6;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const rot = angle + Math.PI + rng() * 0.3;
    const w = 3.5 + rng();
    const d = 4 + rng();
    const h = 2.5 + rng() * 0.5;
    houses.push({ x, z, rot, w, d, h, matIndex: 0, roofMatIndex: 0 });
  }

  return houses;
}

// ========== FRONTIER CAMP (seed 44444) ==========
function generateFrontierCampHouses(): KingdomHouseDef[] {
  const rng = seededRng(44444);
  const houses: KingdomHouseDef[] = [];

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rng() * 0.4;
    const r = 10 + rng() * 12;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const rot = angle + Math.PI + rng() * 0.5;
    const w = 3 + rng() * 2;
    const d = 3.5 + rng() * 2;
    const h = 2 + rng();
    const matIndex = rng() > 0.4 ? 0 : 1;
    const roofMatIndex = rng() > 0.5 ? 0 : 1;
    houses.push({ x, z, rot, w, d, h, matIndex, roofMatIndex });
  }

  return houses;
}

// ========== TRADE CITY (seed 55555) ==========
function generateTradeCityHouses(): KingdomHouseDef[] {
  const rng = seededRng(55555);
  const houses: KingdomHouseDef[] = [];

  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const r = 18 + rng() * 12;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const rot = angle + Math.PI + rng() * 0.4;
    const w = 4 + rng() * 2;
    const d = 4.5 + rng() * 2;
    const h = 3 + rng() * 1.5;
    const matIndex = rng() > 0.5 ? 0 : 1;
    houses.push({ x, z, rot, w, d, h, matIndex, roofMatIndex: 0 });
  }

  return houses;
}

// Pre-generate all — deterministic, computed once at module load
export const FORTIFIED_CITY_HOUSES = generateFortifiedCityHouses();
export const RIVER_TOWN_HOUSES = generateRiverTownHouses();
export const MOUNTAIN_HOLD_HOUSES = generateMountainHoldHouses();
export const FRONTIER_CAMP_HOUSES = generateFrontierCampHouses();
export const TRADE_CITY_HOUSES = generateTradeCityHouses();
