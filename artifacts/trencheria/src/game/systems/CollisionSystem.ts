/**
 * CollisionSystem — Obstacle registry with push-out resolution.
 * Static obstacles (settlements, POIs, town district, wilderness) are built once.
 * Dynamic obstacles (resources, structures, horses) are rebuilt periodically.
 * Kingdom houses read from KingdomBuildingData (shared source of truth with renderers).
 */

import { WorldResource } from './WorldResources';
import { PlacedStructure, BUILDABLES } from './BuildingData';
import { HorseData } from './HorseData';
import { SETTLEMENTS, SettlementDef, SMALL_POIS } from '../world/RegionData';
import { seededRng } from '../world/SettlementPieces';
import { TOWN_BUILDINGS, TOWN_PROPS } from '../components/TownDistrict';
import { WILDERNESS_BUILDINGS } from '../components/WildernessStructures';
import {
  FORTIFIED_CITY_HOUSES,
  RIVER_TOWN_HOUSES,
  MOUNTAIN_HOLD_HOUSES,
  FRONTIER_CAMP_HOUSES,
  TRADE_CITY_HOUSES,
} from '../world/KingdomBuildingData';

export interface CircleObstacle {
  x: number;
  z: number;
  radius: number;
  id: string;
}

export interface BoxObstacle {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  rotation: number;
  id: string;
}

// Static obstacles — computed once
let staticCircles: CircleObstacle[] = [];
let staticBoxes: BoxObstacle[] = [];
let staticBuilt = false;

// Combined (static + dynamic) — used for resolution
let circleObstacles: CircleObstacle[] = [];
let boxObstacles: BoxObstacle[] = [];

export function getCircleObstacles() { return circleObstacles; }
export function getBoxObstacles() { return boxObstacles; }

const _cos = Math.cos;
const _sin = Math.sin;

/** Build static obstacles once (settlements, POIs, town, wilderness). */
function buildStaticObstacles() {
  if (staticBuilt) return;
  staticCircles = [];
  staticBoxes = [];

  addSettlementObstacles(staticCircles, staticBoxes);
  addPOIObstacles(staticCircles, staticBoxes);
  addTownDistrictObstacles(staticCircles, staticBoxes);
  addWildernessObstacles(staticCircles, staticBoxes);

  staticBuilt = true;
}

/** Rebuild only dynamic obstacles (resources, player structures, horses). */
export function rebuildObstacles(
  resources: WorldResource[],
  structures: PlacedStructure[],
  horses: HorseData[],
  excludeHorseId: string | null,
) {
  buildStaticObstacles();

  // Start from static
  circleObstacles = [...staticCircles];
  boxObstacles = [...staticBoxes];

  // Add dynamic: resources
  for (const r of resources) {
    if (r.depleted) continue;
    if (r.type === 'tree') {
      circleObstacles.push({ x: r.position[0], z: r.position[2], radius: 0.25 * r.scale + 0.2, id: r.id });
    } else if (r.type === 'rock') {
      circleObstacles.push({ x: r.position[0], z: r.position[2], radius: r.scale * 0.5 + 0.15, id: r.id });
    }
  }

  // Add dynamic: player structures
  for (const s of structures) {
    const config = BUILDABLES.find(b => b.type === s.type);
    if (!config) continue;
    const [w, , d] = config.size;
    if (s.type === 'wall' || s.type === 'fence' || s.type === 'gate') {
      boxObstacles.push({ cx: s.position[0], cz: s.position[2], halfW: w / 2 + 0.1, halfD: Math.max(d / 2, 0.3), rotation: s.rotation, id: s.id });
    } else if (s.type === 'campfire') {
      circleObstacles.push({ x: s.position[0], z: s.position[2], radius: 0.5, id: s.id });
    } else {
      circleObstacles.push({ x: s.position[0], z: s.position[2], radius: Math.max(w, d) / 2, id: s.id });
    }
  }

  // Add dynamic: horses
  for (const h of horses) {
    if (h.id === excludeHorseId || h.state === 'mounted') continue;
    circleObstacles.push({ x: h.position[0], z: h.position[2], radius: 0.8, id: h.id });
  }
}

// ========== SETTLEMENT OBSTACLES ==========
function addSettlementObstacles(circles: CircleObstacle[], boxes: BoxObstacle[]) {
  for (const s of SETTLEMENTS) {
    const [sx, sz] = s.position;
    switch (s.type) {
      case 'capital': addCapitalCollision(s, sx, sz, circles, boxes); break;
      case 'village':
        if (s.size === 'small') addSmallVillageCollision(s, sx, sz, circles, boxes);
        else addFarmingVillageCollision(s, sx, sz, circles, boxes);
        break;
      case 'fort': addFortCollision(s, sx, sz, circles, boxes); break;
      case 'ruins': addRuinsCollision(s, sx, sz, circles, boxes); break;
      case 'bandit_camp': addBanditCampCollision(s, sx, sz, circles, boxes); break;
      case 'outpost': addOutpostCollision(s, sx, sz, circles, boxes); break;
      case 'monastery': addMonasteryCollision(s, sx, sz, circles, boxes); break;
      case 'fortified_city': addFortifiedCityCollision(s, sx, sz, circles, boxes); break;
      case 'river_town': addRiverTownCollision(s, sx, sz, circles, boxes); break;
      case 'mountain_hold': addMountainHoldCollision(s, sx, sz, circles, boxes); break;
      case 'frontier_camp': addFrontierCampCollision(s, sx, sz, circles, boxes); break;
      case 'trade_city': addTradeCityCollision(s, sx, sz, circles, boxes); break;
    }
  }
}

// === CAPITAL ===
function addCapitalCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 8, halfD: 8, rotation: 0, id: `${s.id}-keep` });
  boxes.push({ cx: sx - 15, cz: sz - 8, halfW: 2.5, halfD: 4, rotation: 0, id: `${s.id}-chapel` });
  boxes.push({ cx: sx, cz: sz - 38, halfW: 38, halfD: 1.25, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx + 38, cz: sz, halfW: 1.25, halfD: 38, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx - 21.75, cz: sz + 38, halfW: 16.25, halfD: 1.25, rotation: 0, id: `${s.id}-wall-s-l` });
  boxes.push({ cx: sx + 21.75, cz: sz + 38, halfW: 16.25, halfD: 1.25, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 38, cz: sz, halfW: 1.25, halfD: 38, rotation: 0, id: `${s.id}-wall-w` });
  for (const [tx, tz] of [[-38, -38], [38, -38], [38, 38], [-38, 38]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 3.2, id: `${s.id}-tower-${tx}-${tz}` });
  }
  for (const [tx, tz] of [[0, -38], [38, 0], [-38, 0]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 2.5, id: `${s.id}-midtower-${tx}-${tz}` });
  }
  circles.push({ x: sx - 4, z: sz + 38, radius: 1.5, id: `${s.id}-gate-l` });
  circles.push({ x: sx + 4, z: sz + 38, radius: 1.5, id: `${s.id}-gate-r` });
  boxes.push({ cx: sx + 22, cz: sz - 15, halfW: 3.5, halfD: 2.5, rotation: 0, id: `${s.id}-barracks` });
  boxes.push({ cx: sx + 22, cz: sz - 23, halfW: 3.5, halfD: 2, rotation: 0, id: `${s.id}-barracks2` });
  boxes.push({ cx: sx + 25, cz: sz + 12, halfW: 3, halfD: 2.25, rotation: 1.5, id: `${s.id}-stable` });
  circles.push({ x: sx - 22, z: sz + 10, radius: 1.5, id: `${s.id}-smithy` });
  circles.push({ x: sx + 8, z: sz + 18, radius: 0.8, id: `${s.id}-well` });
  addCapitalHouseCollision(sx, sz, s.id, circles, boxes);
}

function addCapitalHouseCollision(sx: number, sz: number, sid: string, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  const rng = seededRng(7777);
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const r = 20 + rng() * 10;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    const rot = angle + Math.PI + (rng() - 0.5) * 0.4;
    const w = 4 + rng() * 2.5;
    const d = 4.5 + rng() * 2.5;
    rng(); rng(); rng(); rng(); rng(); // h, s1, s2, chimney, shed
    boxes.push({ cx: sx + hx, cz: sz + hz, halfW: w / 2, halfD: d / 2, rotation: rot, id: `${sid}-house-o${i}` });
  }
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    const r = 10 + rng() * 4;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    const rot = angle + Math.PI;
    const w = 3.5 + rng() * 1.5;
    const d = 4 + rng() * 1.5;
    rng(); rng(); // h, chimney
    boxes.push({ cx: sx + hx, cz: sz + hz, halfW: w / 2, halfD: d / 2, rotation: rot, id: `${sid}-house-i${i}` });
  }
}

// === FARMING VILLAGE ===
function addFarmingVillageCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  const rng = seededRng(3333);
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rng() * 0.5;
    const r = 8 + rng() * 14;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    const rot = angle + Math.PI + rng() * 0.6;
    const isLarger = i < 3;
    const w = isLarger ? 4.5 + rng() : 3 + rng() * 1.5;
    const d = isLarger ? 5 + rng() : 3.5 + rng() * 1.5;
    rng(); rng(); rng(); rng(); // h, style, chimney, shed
    boxes.push({ cx: sx + hx, cz: sz + hz, halfW: w / 2, halfD: d / 2, rotation: rot, id: `${s.id}-house-${i}` });
  }
  boxes.push({ cx: sx + 14, cz: sz + 6, halfW: 3.5, halfD: 4.5, rotation: 0.5, id: `${s.id}-barn` });
  circles.push({ x: sx - 18, z: sz - 20, radius: 2.5, id: `${s.id}-mill` });
  circles.push({ x: sx, z: sz, radius: 0.8, id: `${s.id}-well` });
}

// === SMALL VILLAGE ===
function addSmallVillageCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  const rng = seededRng(sx * 100 + sz);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + rng() * 0.5;
    const r = 5 + rng() * 7;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    const rot = angle + Math.PI;
    const w = 3 + rng();
    const d = 3.5 + rng();
    rng(); rng(); rng(); rng(); // h, style, chimney, shed
    boxes.push({ cx: sx + hx, cz: sz + hz, halfW: w / 2, halfD: d / 2, rotation: rot, id: `${s.id}-house-${i}` });
  }
  circles.push({ x: sx, z: sz, radius: 0.8, id: `${s.id}-well` });
}

// === MILITARY FORT ===
function addFortCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz - 20, halfW: 20, halfD: 0.9, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx + 20, cz: sz, halfW: 0.9, halfD: 20, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx - 12.5, cz: sz + 20, halfW: 7.5, halfD: 0.9, rotation: 0, id: `${s.id}-wall-s-l` });
  boxes.push({ cx: sx + 12.5, cz: sz + 20, halfW: 7.5, halfD: 0.9, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 20, cz: sz, halfW: 0.9, halfD: 20, rotation: 0, id: `${s.id}-wall-w` });
  for (const [tx, tz] of [[-20, -20], [20, -20], [20, 20], [-20, 20]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 2.2, id: `${s.id}-tower-${tx}-${tz}` });
  }
  circles.push({ x: sx - 3.5, z: sz + 20, radius: 1.5, id: `${s.id}-gate-l` });
  circles.push({ x: sx + 3.5, z: sz + 20, radius: 1.5, id: `${s.id}-gate-r` });
  boxes.push({ cx: sx, cz: sz - 8, halfW: 4, halfD: 3.5, rotation: 0, id: `${s.id}-cmd` });
  boxes.push({ cx: sx - 10, cz: sz + 3, halfW: 3, halfD: 2.5, rotation: 0.1, id: `${s.id}-barracks-1` });
  boxes.push({ cx: sx + 10, cz: sz + 3, halfW: 2.5, halfD: 2.5, rotation: -0.1, id: `${s.id}-barracks-2` });
  boxes.push({ cx: sx - 10, cz: sz - 10, halfW: 2, halfD: 2, rotation: 0, id: `${s.id}-armory` });
  circles.push({ x: sx, z: sz - 18, radius: 2.5, id: `${s.id}-beacon` });
}

// === RUINS ===
function addRuinsCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 3, halfD: 3, rotation: 0, id: `${s.id}-altar` });
  circles.push({ x: sx - 5, z: sz + 25, radius: 1.25, id: `${s.id}-arch-l` });
  circles.push({ x: sx + 5, z: sz + 25, radius: 1.25, id: `${s.id}-arch-r` });
  boxes.push({ cx: sx - 15, cz: sz - 5, halfW: 4, halfD: 0.5, rotation: 0, id: `${s.id}-hall-wall` });
  circles.push({ x: sx + 20, z: sz - 15, radius: 3, id: `${s.id}-ruin-tower` });
  const rng = seededRng(9999);
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rng() * 0.3;
    const r = 12 + rng() * 22;
    const hx = Math.cos(angle) * r;
    const hz = Math.sin(angle) * r;
    rng(); // wallH
    const rot = rng() * Math.PI * 2;
    const w = 3 + rng() * 4;
    const d = 3 + rng() * 4;
    boxes.push({ cx: sx + hx, cz: sz + hz, halfW: w / 2, halfD: d / 2, rotation: rot, id: `${s.id}-ruin-${i}` });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rng(); rng(); // h, standing
    circles.push({ x: sx + Math.cos(a) * 9, z: sz + Math.sin(a) * 9, radius: 0.5, id: `${s.id}-pillar-${i}` });
  }
}

// === BANDIT CAMP ===
function addBanditCampCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  const rng = seededRng(5555);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rng() * 0.6;
    const r = 5 + rng() * 11;
    const tentSize = 1.2 + rng() * 1.8;
    rng(); rng(); // rotation, material
    circles.push({
      x: sx + Math.cos(angle) * r, z: sz + Math.sin(angle) * r,
      radius: tentSize * 0.5, id: `${s.id}-tent-${i}`,
    });
  }
  circles.push({ x: sx - 13, z: sz + 9, radius: 0.6, id: `${s.id}-lookout-1` });
  circles.push({ x: sx + 11, z: sz - 11, radius: 0.6, id: `${s.id}-lookout-2` });
  circles.push({ x: sx + 7, z: sz + 7, radius: 0.7, id: `${s.id}-cage` });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const angleDiff = Math.abs(((a - 0 + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (angleDiff < 0.3) continue;
    circles.push({ x: sx + Math.cos(a) * 17, z: sz + Math.sin(a) * 17, radius: 0.35, id: `${s.id}-pal-${i}` });
  }
  circles.push({ x: sx - 8, z: sz + 8, radius: 0.3, id: `${s.id}-gallows` });
}

// === OUTPOST ===
function addOutpostCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 2.5, halfD: 3, rotation: 0, id: `${s.id}-main` });
  boxes.push({ cx: sx - 9, cz: sz + 3, halfW: 1.75, halfD: 2, rotation: 0.5, id: `${s.id}-cabin` });
  boxes.push({ cx: sx + 7, cz: sz + 2, halfW: 1.5, halfD: 1.25, rotation: 0, id: `${s.id}-shed` });
  circles.push({ x: sx + 5, z: sz - 5, radius: 0.8, id: `${s.id}-shrine` });
  circles.push({ x: sx + 3, z: sz - 3, radius: 0.8, id: `${s.id}-well` });
}

// === MONASTERY ===
function addMonasteryCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 3.5, halfD: 6.5, rotation: 0, id: `${s.id}-nave` });
  circles.push({ x: sx, z: sz - 7.5, radius: 3.5, id: `${s.id}-apse` });
  boxes.push({ cx: sx, cz: sz - 11, halfW: 1.5, halfD: 1.5, rotation: 0, id: `${s.id}-tower` });
  boxes.push({ cx: sx + 8, cz: sz, halfW: 2, halfD: 5, rotation: Math.PI / 2, id: `${s.id}-wing-e` });
  boxes.push({ cx: sx - 8, cz: sz, halfW: 2, halfD: 5, rotation: -Math.PI / 2, id: `${s.id}-wing-w` });
  boxes.push({ cx: sx, cz: sz - 14, halfW: 14, halfD: 0.6, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx - 14, cz: sz, halfW: 0.6, halfD: 14, rotation: 0, id: `${s.id}-wall-w` });
  boxes.push({ cx: sx + 14, cz: sz, halfW: 0.6, halfD: 14, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx + 8.5, cz: sz + 14, halfW: 5.5, halfD: 0.6, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 8.5, cz: sz + 14, halfW: 5.5, halfD: 0.6, rotation: 0, id: `${s.id}-wall-s-l` });
  circles.push({ x: sx + 3, z: sz + 10, radius: 0.8, id: `${s.id}-well` });
}

// ========== POI OBSTACLES ==========
function addPOIObstacles(circles: CircleObstacle[], boxes: BoxObstacle[]) {
  for (const poi of SMALL_POIS) {
    const [px, pz] = poi.position;
    switch (poi.type) {
      case 'inn':
        boxes.push({ cx: px, cz: pz, halfW: 3.5, halfD: 3, rotation: 0, id: `poi-${poi.id}` });
        break;
      case 'watchtower':
        circles.push({ x: px, z: pz, radius: 1.5, id: `poi-${poi.id}` });
        break;
      case 'supply_depot':
        boxes.push({ cx: px, cz: pz, halfW: 2, halfD: 1.5, rotation: 0, id: `poi-${poi.id}` });
        break;
      case 'hunter_camp':
        circles.push({ x: px, z: pz, radius: 1.2, id: `poi-${poi.id}` });
        break;
      case 'ruined_house':
        boxes.push({ cx: px, cz: pz, halfW: 2.5, halfD: 2, rotation: 0, id: `poi-${poi.id}` });
        break;
      case 'cave':
        circles.push({ x: px, z: pz, radius: 2, id: `poi-${poi.id}` });
        break;
      case 'stone_circle':
        circles.push({ x: px, z: pz, radius: 1.2, id: `poi-${poi.id}` });
        break;
      case 'wagon':
        boxes.push({ cx: px, cz: pz, halfW: 0.75, halfD: 1.5, rotation: Math.sin(px) * 0.5, id: `poi-${poi.id}` });
        break;
      default:
        break;
    }
  }
}

// ========== TOWN DISTRICT OBSTACLES ==========
function addTownDistrictObstacles(circles: CircleObstacle[], boxes: BoxObstacle[]) {
  for (const b of TOWN_BUILDINGS) {
    boxes.push({
      cx: b.x, cz: b.z,
      halfW: b.w / 2, halfD: b.d / 2,
      rotation: b.rot,
      id: `town-${b.x}-${b.z}`,
    });
  }
  // Town props (stalls, carts, barrels, hay, troughs, lanterns, shrine) — see TownDistrict.tsx
  for (let i = 0; i < TOWN_PROPS.length; i++) {
    const p = TOWN_PROPS[i];
    if (p.shape === 'circle') {
      circles.push({
        x: p.x, z: p.z,
        radius: p.radius ?? 0.3,
        id: `town-prop-${i}`,
      });
    } else {
      boxes.push({
        cx: p.x, cz: p.z,
        halfW: p.halfW ?? 0.5,
        halfD: p.halfD ?? 0.5,
        rotation: p.rotation ?? 0,
        id: `town-prop-${i}`,
      });
    }
  }
}

// ========== WILDERNESS STRUCTURE OBSTACLES ==========
function addWildernessObstacles(circles: CircleObstacle[], boxes: BoxObstacle[]) {
  for (const b of WILDERNESS_BUILDINGS) {
    if (b.type === 'camp') {
      circles.push({ x: b.x, z: b.z, radius: 0.8, id: `wild-${b.x}-${b.z}` });
    } else if (b.type === 'shrine_hut') {
      circles.push({ x: b.x, z: b.z, radius: 0.6, id: `wild-${b.x}-${b.z}` });
    } else {
      boxes.push({
        cx: b.x, cz: b.z,
        halfW: b.w / 2, halfD: b.d / 2,
        rotation: b.rot,
        id: `wild-${b.x}-${b.z}`,
      });
    }
  }
}

// ========== NEW KINGDOM COLLISION (from shared KingdomBuildingData) ==========
function addKingdomHouseCollision(
  houses: { x: number; z: number; rot: number; w: number; d: number }[],
  sx: number, sz: number, sid: string,
  boxes: BoxObstacle[],
) {
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i];
    boxes.push({
      cx: sx + h.x, cz: sz + h.z,
      halfW: h.w / 2, halfD: h.d / 2,
      rotation: h.rot,
      id: `${sid}-house-${i}`,
    });
  }
}

function addFortifiedCityCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  // Walls
  boxes.push({ cx: sx, cz: sz - 45, halfW: 45, halfD: 1, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx + 45, cz: sz, halfW: 1, halfD: 45, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx - 25.5, cz: sz + 45, halfW: 19.5, halfD: 1, rotation: 0, id: `${s.id}-wall-s-l` });
  boxes.push({ cx: sx + 25.5, cz: sz + 45, halfW: 19.5, halfD: 1, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 45, cz: sz, halfW: 1, halfD: 45, rotation: 0, id: `${s.id}-wall-w` });
  for (const [tx, tz] of [[-45, -45], [45, -45], [45, 45], [-45, 45]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 3.5, id: `${s.id}-tower-${tx}-${tz}` });
  }
  circles.push({ x: sx - 5, z: sz + 45, radius: 2, id: `${s.id}-gate-l` });
  circles.push({ x: sx + 5, z: sz + 45, radius: 2, id: `${s.id}-gate-r` });
  boxes.push({ cx: sx, cz: sz - 10, halfW: 7, halfD: 7, rotation: 0, id: `${s.id}-citadel` });
  // Houses — from shared data
  addKingdomHouseCollision(FORTIFIED_CITY_HOUSES, sx, sz, s.id, boxes);
}

function addRiverTownCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 4, halfD: 5, rotation: 0, id: `${s.id}-hall` });
  boxes.push({ cx: sx, cz: sz - 5, halfW: 1.5, halfD: 1.5, rotation: 0, id: `${s.id}-tower` });
  circles.push({ x: sx + 25, z: sz - 28, radius: 1.5, id: `${s.id}-light` });
  boxes.push({ cx: sx, cz: sz + 30, halfW: 30, halfD: 0.06, rotation: 0, id: `${s.id}-fence-s` });
  boxes.push({ cx: sx - 30, cz: sz, halfW: 0.06, halfD: 30, rotation: 0, id: `${s.id}-fence-w` });
  boxes.push({ cx: sx + 30, cz: sz, halfW: 0.06, halfD: 30, rotation: 0, id: `${s.id}-fence-e` });
  // Houses — from shared data
  addKingdomHouseCollision(RIVER_TOWN_HOUSES, sx, sz, s.id, boxes);
}

function addMountainHoldCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz, halfW: 8, halfD: 10, rotation: 0, id: `${s.id}-hall` });
  circles.push({ x: sx - 10, z: sz - 12, radius: 3, id: `${s.id}-ftower-l` });
  circles.push({ x: sx + 10, z: sz - 12, radius: 3, id: `${s.id}-ftower-r` });
  boxes.push({ cx: sx - 20, cz: sz - 5, halfW: 2, halfD: 1.25, rotation: 0, id: `${s.id}-mine` });
  boxes.push({ cx: sx, cz: sz - 25, halfW: 25, halfD: 1, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx + 25, cz: sz, halfW: 1, halfD: 25, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx - 15, cz: sz + 25, halfW: 10, halfD: 1, rotation: 0, id: `${s.id}-wall-s-l` });
  boxes.push({ cx: sx + 15, cz: sz + 25, halfW: 10, halfD: 1, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 25, cz: sz, halfW: 1, halfD: 25, rotation: 0, id: `${s.id}-wall-w` });
  for (const [tx, tz] of [[-25, -25], [25, -25], [25, 25], [-25, 25]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 2.5, id: `${s.id}-tower-${tx}-${tz}` });
  }
  circles.push({ x: sx - 4, z: sz + 25, radius: 1.8, id: `${s.id}-gate-l` });
  circles.push({ x: sx + 4, z: sz + 25, radius: 1.8, id: `${s.id}-gate-r` });
  // Houses — from shared data
  addKingdomHouseCollision(MOUNTAIN_HOLD_HOUSES, sx, sz, s.id, boxes);
}

function addFrontierCampCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx - 30, cz: sz - 15, halfW: 1, halfD: 10, rotation: 0, id: `${s.id}-rwall-w` });
  boxes.push({ cx: sx + 25, cz: sz - 13, halfW: 1, halfD: 7.5, rotation: 0, id: `${s.id}-rwall-e` });
  boxes.push({ cx: sx, cz: sz - 30, halfW: 15, halfD: 1, rotation: 0, id: `${s.id}-rwall-n` });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const angleDiff = Math.abs(((a - 0 + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (angleDiff < 0.3) continue;
    circles.push({ x: sx + Math.cos(a) * 25, z: sz + Math.sin(a) * 25, radius: 0.35, id: `${s.id}-pal-${i}` });
  }
  // Lookout towers
  circles.push({ x: sx - 20, z: sz + 18, radius: 1.5, id: `${s.id}-lookout-1` });
  circles.push({ x: sx + 18, z: sz - 18, radius: 1.5, id: `${s.id}-lookout-2` });
  // Houses — from shared data
  addKingdomHouseCollision(FRONTIER_CAMP_HOUSES, sx, sz, s.id, boxes);
}

function addTradeCityCollision(s: SettlementDef, sx: number, sz: number, circles: CircleObstacle[], boxes: BoxObstacle[]) {
  boxes.push({ cx: sx, cz: sz - 35, halfW: 40, halfD: 1, rotation: 0, id: `${s.id}-wall-n` });
  boxes.push({ cx: sx + 40, cz: sz, halfW: 1, halfD: 35, rotation: 0, id: `${s.id}-wall-e` });
  boxes.push({ cx: sx - 22.5, cz: sz + 35, halfW: 17.5, halfD: 1, rotation: 0, id: `${s.id}-wall-s-l` });
  boxes.push({ cx: sx + 22.5, cz: sz + 35, halfW: 17.5, halfD: 1, rotation: 0, id: `${s.id}-wall-s-r` });
  boxes.push({ cx: sx - 40, cz: sz, halfW: 1, halfD: 35, rotation: 0, id: `${s.id}-wall-w` });
  for (const [tx, tz] of [[-40, -35], [40, -35], [40, 35], [-40, 35]]) {
    circles.push({ x: sx + tx, z: sz + tz, radius: 2.5, id: `${s.id}-tower-${tx}-${tz}` });
  }
  circles.push({ x: sx - 4, z: sz + 35, radius: 1.8, id: `${s.id}-gate-l` });
  circles.push({ x: sx + 4, z: sz + 35, radius: 1.8, id: `${s.id}-gate-r` });
  boxes.push({ cx: sx, cz: sz - 10, halfW: 7, halfD: 6, rotation: 0, id: `${s.id}-hall` });
  // Houses — from shared data
  addKingdomHouseCollision(TRADE_CITY_HOUSES, sx, sz, s.id, boxes);
}

// ========== COLLISION RESOLUTION ==========

export function resolveCollision(px: number, pz: number, playerRadius: number): { x: number; z: number } {
  let x = px;
  let z = pz;

  for (let pass = 0; pass < 2; pass++) {
    for (const obs of circleObstacles) {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const distSq = dx * dx + dz * dz;
      const minDist = playerRadius + obs.radius;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        x += (dx / dist) * overlap;
        z += (dz / dist) * overlap;
      }
    }

    for (const obs of boxObstacles) {
      const cos = _cos(obs.rotation);
      const sin = _sin(obs.rotation);
      const lx = cos * (x - obs.cx) + sin * (z - obs.cz);
      const lz = -sin * (x - obs.cx) + cos * (z - obs.cz);
      const clampX = Math.max(-obs.halfW, Math.min(obs.halfW, lx));
      const clampZ = Math.max(-obs.halfD, Math.min(obs.halfD, lz));
      const dlx = lx - clampX;
      const dlz = lz - clampZ;
      const dSq = dlx * dlx + dlz * dlz;

      if (dSq < playerRadius * playerRadius) {
        if (dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          const overlap = playerRadius - d;
          const nlx = dlx / d;
          const nlz = dlz / d;
          x += cos * (nlx * overlap) - sin * (nlz * overlap);
          z += sin * (nlx * overlap) + cos * (nlz * overlap);
        } else {
          const overlapX = obs.halfW - Math.abs(lx) + playerRadius;
          const overlapZ = obs.halfD - Math.abs(lz) + playerRadius;
          if (overlapX < overlapZ) {
            const sign = lx >= 0 ? 1 : -1;
            x += cos * (sign * overlapX);
            z += sin * (sign * overlapX);
          } else {
            const sign = lz >= 0 ? 1 : -1;
            x += -sin * (sign * overlapZ);
            z += cos * (sign * overlapZ);
          }
        }
      }
    }
  }

  return { x, z };
}

export function isPlacementBlocked(px: number, pz: number, buildRadius: number): boolean {
  for (const obs of circleObstacles) {
    const dx = px - obs.x;
    const dz = pz - obs.z;
    if (dx * dx + dz * dz < (buildRadius + obs.radius) ** 2) return true;
  }
  for (const obs of boxObstacles) {
    const cos = _cos(obs.rotation);
    const sin = _sin(obs.rotation);
    const lx = cos * (px - obs.cx) + sin * (pz - obs.cz);
    const lz = -sin * (px - obs.cx) + cos * (pz - obs.cz);
    const clampX = Math.max(-obs.halfW, Math.min(obs.halfW, lx));
    const clampZ = Math.max(-obs.halfD, Math.min(obs.halfD, lz));
    const dlx = lx - clampX;
    const dlz = lz - clampZ;
    if (dlx * dlx + dlz * dlz < buildRadius * buildRadius) return true;
  }
  return false;
}
