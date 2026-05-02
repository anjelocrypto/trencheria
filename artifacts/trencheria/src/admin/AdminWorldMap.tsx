/**
 * Admin 2D World Map — Phase 1.5 — Clean & Detailed
 * Full read-only top-down visualization of Trencheria.
 * No permanent text labels on map surface — all identification via hover/click.
 * Zoom-based LOD for progressive detail reveal.
 */
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CLAN_COLOR_HEX, ClanColor, TerritoryInfo, ChallengeInfo } from '../game/hooks/useClanSystem';
import { loadWalletSession } from '../game/hooks/usePlayerAccount';
// ===== Real world data imports =====
import { WORLD_SIZE, HALF_WORLD } from '../game/constants';
import { REGIONS, SETTLEMENTS, ROADS, SMALL_POIS, LANDMARKS } from '../game/world/RegionData';
import { LINE_A_WAYPOINTS, LINE_B_WAYPOINTS, RAILWAY_STATIONS } from '../game/world/RailwayData';
import { RIVERS, LAKES } from '../game/world/WaterData';
import { BRIDGES } from '../game/world/BridgeData';
import { TOWN_BUILDINGS } from '../game/components/TownDistrict';
import { WILDERNESS_BUILDINGS } from '../game/components/WildernessStructures';
import {
  FORTIFIED_CITY_HOUSES, RIVER_TOWN_HOUSES, MOUNTAIN_HOLD_HOUSES,
  FRONTIER_CAMP_HOUSES, TRADE_CITY_HOUSES,
} from '../game/world/KingdomBuildingData';
import { getTerrainHeight } from '../game/components/Terrain';

// ===== Types =====
interface LayerState {
  terrain: boolean;
  regions: boolean;
  settlements: boolean;
  roads: boolean;
  railways: boolean;
  stations: boolean;
  water: boolean;
  bridges: boolean;
  pois: boolean;
  buildings: boolean;
  landmarks: boolean;
  collision: boolean;
  gridLabels: boolean;
}

interface ViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface InspectInfo {
  name: string;
  type: string;
  layer: string;
  x: number;
  z: number;
  extra?: Record<string, string | number>;
}

interface HoverInfo {
  worldX: number;
  worldZ: number;
  terrainH: number;
  screenX: number;
  screenY: number;
  label?: string;
  type?: string;
}

// ===== LOD thresholds =====
const LOD = {
  FAR: 0.08,      // world overview — only terrain, water, settlements, rail
  MID: 0.25,      // regions visible, roads, bridges, stations
  CLOSE: 0.6,     // POIs, landmarks, buildings
  DETAIL: 1.2,    // building outlines, collision, waypoint dots
  ULTRA: 2.5,     // per-pixel detail
};

// ===== Kingdom house map =====
const KINGDOM_HOUSE_MAP: { type: string; houses: typeof FORTIFIED_CITY_HOUSES; settlementId: string }[] = [
  { type: 'fortified_city', houses: FORTIFIED_CITY_HOUSES, settlementId: 'thornwall_city' },
  { type: 'river_town', houses: RIVER_TOWN_HOUSES, settlementId: 'rivermoor_city' },
  { type: 'mountain_hold', houses: MOUNTAIN_HOLD_HOUSES, settlementId: 'stonepeak_hold' },
  { type: 'frontier_camp', houses: FRONTIER_CAMP_HOUSES, settlementId: 'darkhollow_camp' },
  { type: 'trade_city', houses: TRADE_CITY_HOUSES, settlementId: 'goldenvale_city' },
];

// ===== Precompute terrain heightmap =====
const TERRAIN_GRID_SIZE = 6;
const TERRAIN_COLS = Math.ceil(WORLD_SIZE / TERRAIN_GRID_SIZE) + 1;
const TERRAIN_ROWS = TERRAIN_COLS;

let _terrainCache: Float32Array | null = null;
let _terrainMin = 0;
let _terrainMax = 0;

function getTerrainCache(): { data: Float32Array; min: number; max: number } {
  if (_terrainCache) return { data: _terrainCache, min: _terrainMin, max: _terrainMax };
  const data = new Float32Array(TERRAIN_COLS * TERRAIN_ROWS);
  let min = Infinity, max = -Infinity;
  for (let row = 0; row < TERRAIN_ROWS; row++) {
    const z = -HALF_WORLD + row * TERRAIN_GRID_SIZE;
    for (let col = 0; col < TERRAIN_COLS; col++) {
      const x = -HALF_WORLD + col * TERRAIN_GRID_SIZE;
      const h = getTerrainHeight(x, z);
      data[row * TERRAIN_COLS + col] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  _terrainCache = data;
  _terrainMin = min;
  _terrainMax = max;
  return { data, min, max };
}

// ===== Build collision data =====
interface CollisionCircle { x: number; z: number; radius: number; id: string }
interface CollisionBox { cx: number; cz: number; halfW: number; halfD: number; rotation: number; id: string }

function buildCollisionData(): { circles: CollisionCircle[]; boxes: CollisionBox[] } {
  const circles: CollisionCircle[] = [];
  const boxes: CollisionBox[] = [];
  for (const b of TOWN_BUILDINGS) {
    boxes.push({ cx: b.x, cz: b.z, halfW: b.w / 2, halfD: b.d / 2, rotation: b.rot, id: `town-${b.x.toFixed(0)}-${b.z.toFixed(0)}` });
  }
  for (const b of WILDERNESS_BUILDINGS) {
    if (b.type === 'camp' || b.type === 'shrine_hut') {
      circles.push({ x: b.x, z: b.z, radius: b.type === 'camp' ? 0.8 : 0.6, id: `wild-${b.type}` });
    } else {
      boxes.push({ cx: b.x, cz: b.z, halfW: b.w / 2, halfD: b.d / 2, rotation: b.rot, id: `wild-${b.type}` });
    }
  }
  for (const km of KINGDOM_HOUSE_MAP) {
    const s = SETTLEMENTS.find(s => s.id === km.settlementId);
    if (!s) continue;
    for (let i = 0; i < km.houses.length; i++) {
      const h = km.houses[i];
      boxes.push({ cx: s.position[0] + h.x, cz: s.position[1] + h.z, halfW: h.w / 2, halfD: h.d / 2, rotation: h.rot, id: `${km.type}-house-${i}` });
    }
  }
  for (const poi of SMALL_POIS) {
    const [px, pz] = poi.position;
    if (poi.type === 'inn') boxes.push({ cx: px, cz: pz, halfW: 3.5, halfD: 3, rotation: 0, id: `poi-${poi.id}` });
    else if (poi.type === 'watchtower') circles.push({ x: px, z: pz, radius: 1.5, id: `poi-${poi.id}` });
    else if (poi.type === 'supply_depot') boxes.push({ cx: px, cz: pz, halfW: 2, halfD: 1.5, rotation: 0, id: `poi-${poi.id}` });
    else if (poi.type === 'hunter_camp') circles.push({ x: px, z: pz, radius: 1.2, id: `poi-${poi.id}` });
    else if (poi.type === 'ruined_house') boxes.push({ cx: px, cz: pz, halfW: 2.5, halfD: 2, rotation: 0, id: `poi-${poi.id}` });
    else if (poi.type === 'cave') circles.push({ x: px, z: pz, radius: 2, id: `poi-${poi.id}` });
    else if (poi.type === 'stone_circle') circles.push({ x: px, z: pz, radius: 1.2, id: `poi-${poi.id}` });
    else if (poi.type === 'wagon') boxes.push({ cx: px, cz: pz, halfW: 0.75, halfD: 1.5, rotation: 0, id: `poi-${poi.id}` });
  }
  return { circles, boxes };
}

// ===== Settlement colors =====
const SETTLEMENT_COLORS: Record<string, string> = {
  capital: '#ffd700', village: '#8bc34a', fort: '#ff5722', ruins: '#9e9e9e',
  bandit_camp: '#f44336', outpost: '#ff9800', monastery: '#ce93d8',
  fortified_city: '#b0bec5', river_town: '#4fc3f7', mountain_hold: '#78909c',
  frontier_camp: '#a1887f', trade_city: '#ffb74d',
};

// ===== Screen transforms =====
function worldToScreen(wx: number, wz: number, view: ViewState, cw: number, ch: number): [number, number] {
  return [cw / 2 + (wx - view.offsetX) * view.zoom, ch / 2 + (wz - view.offsetY) * view.zoom];
}

function screenToWorld(sx: number, sy: number, view: ViewState, cw: number, ch: number): [number, number] {
  return [(sx - cw / 2) / view.zoom + view.offsetX, (sy - ch / 2) / view.zoom + view.offsetY];
}

// ===== Terrain ImageData (cached) =====
let _terrainImageData: ImageData | null = null;

function getTerrainImageData(): ImageData {
  if (_terrainImageData) return _terrainImageData;
  const { data, min, max } = getTerrainCache();
  const img = new ImageData(TERRAIN_COLS, TERRAIN_ROWS);
  const range = max - min || 1;
  for (let i = 0; i < data.length; i++) {
    const t = (data[i] - min) / range;
    const h = data[i];
    let r: number, g: number, b: number;
    if (h < -0.5) {
      r = 15; g = 28; b = 50;
    } else if (t < 0.2) {
      r = 25 + t * 80; g = 50 + t * 100; b = 28 + t * 40;
    } else if (t < 0.4) {
      const u = (t - 0.2) / 0.2;
      r = 41 + u * 35; g = 70 - u * 5; b = 36 - u * 4;
    } else if (t < 0.6) {
      const u = (t - 0.4) / 0.2;
      r = 76 + u * 30; g = 65 + u * 8; b = 32 + u * 20;
    } else if (t < 0.8) {
      const u = (t - 0.6) / 0.2;
      r = 106 + u * 24; g = 96 + u * 20; b = 86 + u * 18;
    } else {
      const u = (t - 0.8) / 0.2;
      r = 130 + u * 60; g = 126 + u * 60; b = 120 + u * 60;
    }
    const idx = i * 4;
    img.data[idx] = Math.min(255, r);
    img.data[idx + 1] = Math.min(255, g);
    img.data[idx + 2] = Math.min(255, b);
    img.data[idx + 3] = 210;
  }
  _terrainImageData = img;
  return img;
}

// ===== Check if point is on screen =====
function onScreen(sx: number, sy: number, W: number, H: number, pad = 30): boolean {
  return sx > -pad && sx < W + pad && sy > -pad && sy < H + pad;
}

// ===== Main draw =====
function drawMap(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  layers: LayerState,
  collisionData: { circles: CollisionCircle[]; boxes: CollisionBox[] },
  selectedObj: InspectInfo | null,
  territories: TerritoryInfo[],
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const z = view.zoom;
  const toS = (wx: number, wz: number) => worldToScreen(wx, wz, view, W, H);

  ctx.fillStyle = '#080814';
  ctx.fillRect(0, 0, W, H);

  // ===== TERRAIN =====
  if (layers.terrain) {
    const imgData = getTerrainImageData();
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = TERRAIN_COLS;
    tmpCanvas.height = TERRAIN_ROWS;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.putImageData(imgData, 0, 0);
    const [x1, y1] = toS(-HALF_WORLD, -HALF_WORLD);
    const [x2, y2] = toS(HALF_WORLD, HALF_WORLD);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmpCanvas, x1, y1, x2 - x1, y2 - y1);
  }

  // ===== COORDINATE GRID =====
  {
    const [bx1, by1] = toS(-HALF_WORLD, -HALF_WORLD);
    const [bx2, by2] = toS(HALF_WORLD, HALF_WORLD);

    // Adaptive grid step
    let step = 500;
    if (z > 0.08) step = 200;
    if (z > 0.2) step = 100;
    if (z > 0.6) step = 50;
    if (z > 1.5) step = 25;

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let g = -HALF_WORLD; g <= HALF_WORLD; g += step) {
      const [gx, gy] = toS(g, -HALF_WORLD);
      const [, gy2] = toS(g, HALF_WORLD);
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy2); ctx.stroke();
      const [hx, hy] = toS(-HALF_WORLD, g);
      const [hx2] = toS(HALF_WORLD, g);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx2, hy); ctx.stroke();
    }

    if (layers.gridLabels && z > 0.06) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = `${Math.max(8, Math.min(10, z * 11))}px monospace`;
      ctx.textAlign = 'center';
      for (let g = -HALF_WORLD; g <= HALF_WORLD; g += step) {
        const [gx, gy] = toS(g, -HALF_WORLD);
        ctx.fillText(`${g}`, gx, gy - 3);
        const [hx, hy] = toS(-HALF_WORLD, g);
        ctx.textAlign = 'right';
        ctx.fillText(`${g}`, hx - 4, hy + 3);
        ctx.textAlign = 'center';
      }
    }

    // World boundary
    ctx.strokeStyle = 'rgba(100,120,180,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
  }

  // ===== REGIONS (LOD: MID+) =====
  if (layers.regions && z >= LOD.FAR) {
    for (const r of REGIONS) {
      const [cx, cy] = toS(r.center[0], r.center[1]);
      const sr = r.radius * z;
      if (!onScreen(cx, cy, W, H, sr)) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, sr, 0, Math.PI * 2);
      ctx.fillStyle = r.color + (layers.terrain ? '0a' : '12');
      ctx.fill();
      ctx.strokeStyle = r.color + '30';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ===== TERRITORY OWNERSHIP OVERLAY (war-state aware) =====
  if (layers.regions && territories.length > 0) {
    for (const t of territories) {
      const [cx, cy] = toS(t.center_x, t.center_z);
      const sr = t.radius * z;
      if (!onScreen(cx, cy, W, H, sr)) continue;
      const warState = ((t as any).war_state as string) || 'peaceful';
      const color = t.owning_clan_color
        ? CLAN_COLOR_HEX[t.owning_clan_color as ClanColor] || '#666'
        : null;
      if (color) {
        // Filled zone
        ctx.beginPath();
        ctx.arc(cx, cy, sr, 0, Math.PI * 2);
        ctx.fillStyle = color + '18';
        ctx.fill();
        // War-state aware border
        if (warState === 'contested') {
          ctx.strokeStyle = '#e67e22cc';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (warState === 'active_war') {
          ctx.strokeStyle = '#e74c3cee';
          ctx.lineWidth = 3.5;
          ctx.stroke();
          // Outer glow ring
          ctx.strokeStyle = '#e74c3c40';
          ctx.lineWidth = 7;
          ctx.stroke();
      } else if (warState === 'cooldown') {
          ctx.strokeStyle = '#3498db80';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (warState === 'pending_resolution') {
          ctx.strokeStyle = '#f39c12dd';
          ctx.lineWidth = 3;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#f39c1250';
          ctx.lineWidth = 6;
          ctx.stroke();
        } else {
          ctx.strokeStyle = color + '60';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Clan name label
        const labelSize = Math.max(9, Math.min(14, z * 12));
        ctx.font = `bold ${labelSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color + 'cc';
        ctx.fillText(`🏴 ${t.owning_clan_name}`, cx, cy - sr * 0.15);
        ctx.font = `${Math.max(8, labelSize - 2)}px sans-serif`;
        ctx.fillStyle = color + '88';
        ctx.fillText(t.name, cx, cy + sr * 0.15);
        // War state label
        if (warState !== 'peaceful') {
          const stateLabel = warState === 'contested' ? '⚔️ CHALLENGED'
            : warState === 'active_war' ? '🔥 WAR ACTIVE'
            : warState === 'pending_resolution' ? '⏳ PENDING RESOLUTION'
            : '🛡️ COOLDOWN';
          const stateColor = warState === 'contested' ? '#e67e22'
            : warState === 'active_war' ? '#e74c3c'
            : warState === 'pending_resolution' ? '#f39c12'
            : '#3498db';
          ctx.font = `bold ${Math.max(8, labelSize - 1)}px sans-serif`;
          ctx.fillStyle = stateColor + 'dd';
          ctx.fillText(stateLabel, cx, cy + sr * 0.35);
        }
      } else {
        // Unclaimed — subtle dashed ring
        ctx.beginPath();
        ctx.arc(cx, cy, sr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150,150,150,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (z >= LOD.MID) {
          const labelSize = Math.max(8, Math.min(11, z * 10));
          ctx.font = `${labelSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(150,150,150,0.35)';
          ctx.fillText(`⬜ ${t.name}`, cx, cy);
        }
      }
    }
  }

  // ===== WATER =====
  if (layers.water) {
    // Rivers
    for (const river of RIVERS) {
      if (river.points.length < 2) continue;
      ctx.beginPath();
      const [sx, sy] = toS(river.points[0][0], river.points[0][2]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < river.points.length; i++) {
        const [px, py] = toS(river.points[i][0], river.points[i][2]);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(33,120,200,0.5)';
      ctx.lineWidth = Math.max(1.5, river.width * z * 0.6);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    // Lakes
    for (const lake of LAKES) {
      const [cx, cy] = toS(lake.position[0], lake.position[2]);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(lake.rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, lake.radiusX * z, lake.radiusZ * z, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,75,140,0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(33,150,243,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ===== ROADS (LOD: MID+) =====
  if (layers.roads && z >= LOD.FAR) {
    ctx.lineCap = 'round';
    for (const road of ROADS) {
      const [x1, y1] = toS(road.from[0], road.from[1]);
      const [x2, y2] = toS(road.to[0], road.to[1]);
      if (!onScreen((x1+x2)/2, (y1+y2)/2, W, H, 200)) continue;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = z < LOD.MID ? 'rgba(120,95,60,0.25)' : 'rgba(120,95,60,0.4)';
      ctx.lineWidth = Math.max(0.8, road.width * z * 0.3);
      ctx.stroke();
    }
  }

  // ===== BRIDGES (LOD: MID+) =====
  if (layers.bridges && z >= LOD.MID) {
    for (const bridge of BRIDGES) {
      const [cx, cy] = toS(bridge.position[0], bridge.position[2]);
      if (!onScreen(cx, cy, W, H)) continue;
      const bLen = Math.max(3, bridge.length * z);
      const bWid = Math.max(2, bridge.width * z);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(bridge.rotation);
      ctx.fillStyle = 'rgba(140,140,150,0.5)';
      ctx.fillRect(-bWid / 2, -bLen / 2, bWid, bLen);
      ctx.strokeStyle = 'rgba(200,200,220,0.4)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-bWid / 2, -bLen / 2, bWid, bLen);
      ctx.restore();
    }
  }

  // ===== BUILDINGS (LOD: CLOSE+) =====
  if (layers.buildings && z >= LOD.CLOSE) {
    const alpha = Math.min(1, (z - LOD.CLOSE) / 0.4);
    const drawBldg = (x: number, zz: number, w: number, d: number, rot: number, color: string) => {
      const [cx, cy] = toS(x, zz);
      if (!onScreen(cx, cy, W, H)) return;
      const bw = Math.max(1.5, w * z);
      const bd = Math.max(1.5, d * z);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillRect(-bw / 2, -bd / 2, bw, bd);
      if (z >= LOD.DETAIL) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-bw / 2, -bd / 2, bw, bd);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    };
    for (const b of TOWN_BUILDINGS) drawBldg(b.x, b.z, b.w, b.d, b.rot, 'rgba(130,100,70,0.6)');
    for (const b of WILDERNESS_BUILDINGS) {
      const col = b.type === 'ruin' ? 'rgba(130,130,130,0.5)' : b.type === 'camp' ? 'rgba(200,140,40,0.4)' :
        b.type === 'shrine_hut' ? 'rgba(170,120,200,0.4)' : b.type === 'outpost' ? 'rgba(200,80,30,0.4)' : 'rgba(100,70,60,0.5)';
      drawBldg(b.x, b.z, b.w, b.d, b.rot, col);
    }
    for (const km of KINGDOM_HOUSE_MAP) {
      const s = SETTLEMENTS.find(s => s.id === km.settlementId);
      if (!s) continue;
      for (const h of km.houses) drawBldg(s.position[0] + h.x, s.position[1] + h.z, h.w, h.d, h.rot, 'rgba(140,115,100,0.55)');
    }
  }

  // ===== COLLISION OVERLAY (LOD: DETAIL+) =====
  if (layers.collision && z >= LOD.DETAIL) {
    ctx.globalAlpha = 0.25;
    for (const c of collisionData.circles) {
      const [cx, cy] = toS(c.x, c.z);
      if (!onScreen(cx, cy, W, H)) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, c.radius * z), 0, Math.PI * 2);
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    for (const b of collisionData.boxes) {
      const [cx, cy] = toS(b.cx, b.cz);
      if (!onScreen(cx, cy, W, H)) continue;
      const bw = Math.max(1, b.halfW * 2 * z);
      const bd = Math.max(1, b.halfD * 2 * z);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(b.rotation);
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-bw / 2, -bd / 2, bw, bd);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ===== RAILWAYS =====
  if (layers.railways) {
    const drawRailLine = (wps: typeof LINE_A_WAYPOINTS, color: string, shadowColor: string) => {
      if (wps.length < 2) return;

      // Glow shadow
      ctx.beginPath();
      const [sx0, sy0] = toS(wps[0].x, wps[0].z);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < wps.length; i++) {
        const [px, py] = toS(wps[i].x, wps[i].z);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = shadowColor;
      ctx.lineWidth = Math.max(4, z * 6);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();

      // Main track
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < wps.length; i++) {
        const [px, py] = toS(wps[i].x, wps[i].z);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, z * 2.5);
      ctx.setLineDash([z * 6, z * 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint dots at close zoom
      if (z >= LOD.CLOSE) {
        for (const wp of wps) {
          const [wx, wy] = toS(wp.x, wp.z);
          if (!onScreen(wx, wy, W, H)) continue;
          ctx.beginPath();
          ctx.arc(wx, wy, z >= LOD.DETAIL ? 2.5 : 1.5, 0, Math.PI * 2);
          ctx.fillStyle = wp.type === 'station' ? '#fff' : wp.type === 'bridge' ? '#4fc3f7' : color;
          ctx.fill();
        }
      }
    };
    drawRailLine(LINE_A_WAYPOINTS, 'rgba(233,30,99,0.85)', 'rgba(233,30,99,0.15)');
    drawRailLine(LINE_B_WAYPOINTS, 'rgba(255,152,0,0.85)', 'rgba(255,152,0,0.15)');
  }

  // ===== STATIONS (LOD: MID+) =====
  if (layers.stations && z >= LOD.FAR) {
    for (const stn of RAILWAY_STATIONS) {
      const [sx, sy] = toS(stn.position[0], stn.position[1]);
      if (!onScreen(sx, sy, W, H)) continue;
      const r = Math.max(3, z < LOD.MID ? 4 : Math.min(8, z * 5));

      // Outer ring
      ctx.beginPath();
      ctx.arc(sx, sy, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Fill
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = stn.stationType === 'capital' ? '#ffd700' :
        stn.stationType === 'large' ? '#ff9800' :
        stn.stationType === 'medium' ? '#4caf50' : '#78909c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Small icon indicator at mid zoom (no text)
      if (z >= LOD.MID && z < LOD.CLOSE) {
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(6, r * 0.9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('■', sx, sy + 0.5);
      }
    }
  }

  // ===== SETTLEMENTS =====
  if (layers.settlements) {
    for (const s of SETTLEMENTS) {
      const [sx, sy] = toS(s.position[0], s.position[1]);
      if (!onScreen(sx, sy, W, H)) continue;
      const color = SETTLEMENT_COLORS[s.type] || '#fff';
      const baseR = s.size === 'large' ? 7 : s.size === 'medium' ? 5 : 3;
      const sr = Math.max(baseR, baseR * z * 0.6);

      // Subtle influence zone at mid zoom
      if (z >= LOD.MID) {
        const flatR = s.size === 'large' ? 70 : s.size === 'medium' ? 35 : 25;
        ctx.beginPath();
        ctx.arc(sx, sy, flatR * z, 0, Math.PI * 2);
        ctx.strokeStyle = color + '10';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, sr + 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '20';
      ctx.fill();

      // Marker
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Settlement name ONLY at mid+ zoom, only for large settlements, or close zoom for all
      if (z >= LOD.CLOSE || (z >= LOD.MID && s.size === 'large')) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(9, Math.min(13, z * 10))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(s.name, sx, sy - sr - 4);
      }
    }
  }

  // ===== LANDMARKS (LOD: CLOSE+) =====
  if (layers.landmarks && z >= LOD.MID) {
    const alpha = z < LOD.CLOSE ? 0.4 : 0.8;
    for (const lm of LANDMARKS) {
      const [sx, sy] = toS(lm.position[0], lm.position[1]);
      if (!onScreen(sx, sy, W, H)) continue;
      const sz = Math.max(4, z * 5);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.7, sy);
      ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz * 0.7, sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,215,0,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.8)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ===== POIS (LOD: CLOSE+) =====
  if (layers.pois && z >= LOD.CLOSE) {
    const alpha = Math.min(1, (z - LOD.CLOSE) / 0.5);
    for (const poi of SMALL_POIS) {
      const [sx, sy] = toS(poi.position[0], poi.position[1]);
      if (!onScreen(sx, sy, W, H)) continue;
      const r = Math.max(2, z * 2.5);
      ctx.globalAlpha = alpha * 0.7;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(156,39,176,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(156,39,176,0.8)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ===== SELECTED OBJECT HIGHLIGHT =====
  if (selectedObj) {
    const [sx, sy] = toS(selectedObj.x, selectedObj.z);
    // Pulsing ring
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(79,195,247,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Crosshair
    ctx.strokeStyle = 'rgba(79,195,247,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(sx - 25, sy); ctx.lineTo(sx - 8, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 8, sy); ctx.lineTo(sx + 25, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy - 25); ctx.lineTo(sx, sy - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + 8); ctx.lineTo(sx, sy + 25); ctx.stroke();
  }

  // ===== ORIGIN MARKER =====
  {
    const [ox, oy] = toS(0, 0);
    if (onScreen(ox, oy, W, H)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8); ctx.stroke();
    }
  }
}

// ===== Hit testing =====
function getHoverInfo(wx: number, wz: number, layers: LayerState, sx: number, sy: number): HoverInfo {
  const h = getTerrainHeight(wx, wz);
  const info: HoverInfo = {
    worldX: Math.round(wx * 10) / 10,
    worldZ: Math.round(wz * 10) / 10,
    terrainH: Math.round(h * 100) / 100,
    screenX: sx, screenY: sy,
  };

  if (layers.settlements) {
    for (const s of SETTLEMENTS) {
      const dx = wx - s.position[0], dz = wz - s.position[1];
      if (dx * dx + dz * dz < 18 * 18) { info.label = s.name; info.type = s.type.replace(/_/g, ' '); return info; }
    }
  }
  if (layers.stations) {
    for (const stn of RAILWAY_STATIONS) {
      const dx = wx - stn.position[0], dz = wz - stn.position[1];
      if (dx * dx + dz * dz < 14 * 14) { info.label = `🚂 ${stn.name}`; info.type = `Line ${stn.line} • ${stn.stationType}`; return info; }
    }
  }
  if (layers.landmarks) {
    for (const lm of LANDMARKS) {
      const dx = wx - lm.position[0], dz = wz - lm.position[1];
      if (dx * dx + dz * dz < 12 * 12) { info.label = lm.name; info.type = lm.type.replace(/_/g, ' '); return info; }
    }
  }
  if (layers.pois) {
    for (const poi of SMALL_POIS) {
      const dx = wx - poi.position[0], dz = wz - poi.position[1];
      if (dx * dx + dz * dz < 10 * 10) { info.label = poi.name; info.type = poi.type.replace(/_/g, ' '); return info; }
    }
  }
  if (layers.bridges) {
    for (const b of BRIDGES) {
      const dx = wx - b.position[0], dz = wz - b.position[2];
      if (dx * dx + dz * dz < (b.length / 2 + 5) ** 2) { info.label = b.id.replace('bridge-', ''); info.type = `${b.style} bridge`; return info; }
    }
  }
  if (layers.regions) {
    for (const r of REGIONS) {
      const dx = wx - r.center[0], dz = wz - r.center[1];
      if (Math.sqrt(dx * dx + dz * dz) < r.radius) { info.label = r.name; info.type = `region • danger ${r.danger}`; return info; }
    }
  }
  return info;
}

function getInspectInfo(wx: number, wz: number, layers: LayerState): InspectInfo | null {
  if (layers.settlements) {
    for (const s of SETTLEMENTS) {
      const dx = wx - s.position[0], dz = wz - s.position[1];
      if (dx * dx + dz * dz < 18 * 18) {
        const r = REGIONS.find(r => r.id === s.regionId);
        return { name: s.name, type: s.type.replace(/_/g, ' '), layer: 'Settlement', x: s.position[0], z: s.position[1],
          extra: { size: s.size, region: r?.name || s.regionId, danger: r?.danger ?? 0, description: s.description } };
      }
    }
  }
  if (layers.stations) {
    for (const stn of RAILWAY_STATIONS) {
      const dx = wx - stn.position[0], dz = wz - stn.position[1];
      if (dx * dx + dz * dz < 14 * 14) {
        return { name: stn.name, type: 'Railway Station', layer: 'Station', x: stn.position[0], z: stn.position[1],
          extra: { line: stn.line, stationType: stn.stationType, side: stn.side, id: stn.id } };
      }
    }
  }
  if (layers.landmarks) {
    for (const lm of LANDMARKS) {
      const dx = wx - lm.position[0], dz = wz - lm.position[1];
      if (dx * dx + dz * dz < 12 * 12) {
        return { name: lm.name, type: lm.type.replace(/_/g, ' '), layer: 'Landmark', x: lm.position[0], z: lm.position[1],
          extra: { height: lm.height, id: lm.id } };
      }
    }
  }
  if (layers.pois) {
    for (const poi of SMALL_POIS) {
      const dx = wx - poi.position[0], dz = wz - poi.position[1];
      if (dx * dx + dz * dz < 10 * 10) {
        return { name: poi.name, type: poi.type.replace(/_/g, ' '), layer: 'POI', x: poi.position[0], z: poi.position[1],
          extra: { id: poi.id } };
      }
    }
  }
  if (layers.bridges) {
    for (const b of BRIDGES) {
      const dx = wx - b.position[0], dz = wz - b.position[2];
      if (dx * dx + dz * dz < (b.length / 2 + 5) ** 2) {
        return { name: b.id.replace('bridge-', ''), type: `${b.style} bridge`, layer: 'Bridge', x: b.position[0], z: b.position[2],
          extra: { length: b.length, width: b.width, style: b.style, rotation: Math.round(b.rotation * 100) / 100 } };
      }
    }
  }
  return null;
}

// ===== Component =====
export default function AdminWorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewState>({ offsetX: 0, offsetY: 0, zoom: 0.35 });
  const [layers, setLayers] = useState<LayerState>({
    terrain: true, regions: true, settlements: true, roads: true, railways: true,
    stations: true, water: true, bridges: true, pois: true, buildings: true,
    landmarks: true, collision: false, gridLabels: true,
  });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panMoved, setPanMoved] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const animRef = useRef<number>(0);
  const targetView = useRef<ViewState | null>(null);

  const collisionData = useMemo(() => buildCollisionData(), []);

  // Territory data from backend
  const [territories, setTerritories] = useState<TerritoryInfo[]>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.rpc('get_territories' as any);
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        setTerritories(Array.isArray(parsed) ? parsed : []);
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // Challenge data for admin resolution
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [warKillStats, setWarKillStats] = useState<Record<string, { attacker_kills: number; defender_kills: number; total: number }>>({});

  useEffect(() => {
    const loadChallenges = async () => {
      try {
        const { data } = await supabase.rpc('get_active_challenges' as any, { _limit: 50 });
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const challengeList: ChallengeInfo[] = Array.isArray(parsed) ? parsed : [];
        setChallenges(challengeList);

        // Fetch kill stats for active + pending_resolution wars
        const activeWars = challengeList.filter(c => c.status === 'active' || c.status === 'pending_resolution');
        const killStats: Record<string, { attacker_kills: number; defender_kills: number; total: number }> = {};
        for (const war of activeWars) {
          try {
            const { data: killData } = await supabase.rpc('get_war_kills' as any, { _challenge_id: war.id });
            const kd = typeof killData === 'string' ? JSON.parse(killData) : killData;
            if (kd && typeof kd === 'object' && !Array.isArray(kd)) {
              const kills: { clan_id: string; kill_count: number }[] = kd.kills || [];
              let attackerKills = 0, defenderKills = 0;
              for (const k of kills) {
                const count = Number(k.kill_count) || 0;
                if (k.clan_id === war.attacker_clan_id) attackerKills += count;
                else if (k.clan_id === war.defender_clan_id) defenderKills += count;
              }
              const total = Number(kd.total) || (attackerKills + defenderKills);
              killStats[war.id] = { attacker_kills: attackerKills, defender_kills: defenderKills, total };
            } else {
              killStats[war.id] = { attacker_kills: 0, defender_kills: 0, total: 0 };
            }
          } catch {
            killStats[war.id] = { attacker_kills: 0, defender_kills: 0, total: 0 };
          }
        }
        setWarKillStats(killStats);
      } catch { /* silent */ }
    };
    loadChallenges();
    const interval = setInterval(loadChallenges, 10000);
    return () => clearInterval(interval);
  }, []);

  const pendingResolutions = challenges.filter(c => c.status === 'pending_resolution');
  const activeWars = challenges.filter(c => c.status === 'active');

  const handleResolveWar = async (challengeId: string, resolution: 'attacker_won' | 'defender_held') => {
    const session = loadWalletSession();
    if (!session?.wallet_address || !session.session_token) {
      setResolveError('No admin session');
      return;
    }
    setResolving(challengeId);
    setResolveError(null);
    try {
      const { data, error } = await supabase.rpc('resolve_war' as any, {
        _wallet_address: session.wallet_address,
        _session_token: session.session_token,
        _challenge_id: challengeId,
        _resolution: resolution,
      });
      if (error || !(data as any)?.success) {
        setResolveError((data as any)?.error || error?.message || 'Failed');
      } else {
        // Refresh data
        const { data: tData } = await supabase.rpc('get_territories' as any);
        const tp = typeof tData === 'string' ? JSON.parse(tData) : tData;
        setTerritories(Array.isArray(tp) ? tp : []);
        const { data: cData } = await supabase.rpc('get_active_challenges' as any, { _limit: 50 });
        const cp = typeof cData === 'string' ? JSON.parse(cData) : cData;
        setChallenges(Array.isArray(cp) ? cp : []);
      }
    } catch (e: any) {
      setResolveError(e.message || 'Failed');
    }
    setResolving(null);
  };

  const stats = useMemo(() => ({
    regions: REGIONS.length,
    settlements: SETTLEMENTS.length,
    roads: ROADS.length,
    'rail waypoints': LINE_A_WAYPOINTS.length + LINE_B_WAYPOINTS.length,
    stations: RAILWAY_STATIONS.length,
    rivers: RIVERS.length,
    lakes: LAKES.length,
    bridges: BRIDGES.length,
    pois: SMALL_POIS.length,
    'town buildings': TOWN_BUILDINGS.length,
    'wilderness structures': WILDERNESS_BUILDINGS.length,
    'kingdom houses': KINGDOM_HOUSE_MAP.reduce((s, v) => s + v.houses.length, 0),
    landmarks: LANDMARKS.length,
    'collision objects': collisionData.circles.length + collisionData.boxes.length,
    territories: territories.length,
    'claimed territories': territories.filter(t => t.owning_clan_id).length,
    'contested territories': territories.filter(t => {const ws = (t as any).war_state; return ws === 'contested' || ws === 'active_war' || ws === 'pending_resolution';}).length,
  }), [collisionData, territories]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, view, layers, collisionData, inspect, territories);
  }, [view, layers, collisionData, inspect, territories]);

  useEffect(() => {
    const handleResize = () => setView(v => ({ ...v }));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Smooth zoom toward cursor
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setView(v => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(0.02, Math.min(12, v.zoom * factor));
      const dpr = window.devicePixelRatio || 1;
      const cw = rect.width * dpr;
      const ch = rect.height * dpr;
      const [wx, wz] = screenToWorld(mx * dpr, my * dpr, v, cw, ch);
      return {
        zoom: newZoom,
        offsetX: wx - (mx * dpr - cw / 2) / newZoom,
        offsetY: wz - (my * dpr - ch / 2) / newZoom,
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanMoved(false);
      panStart.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
    }
  }, [view.offsetX, view.offsetY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setPanMoved(true);
      setView(v => ({
        ...v,
        offsetX: panStart.current.ox - dx / v.zoom,
        offsetY: panStart.current.oy - dy / v.zoom,
      }));
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const [wx, wz] = screenToWorld(mx, my, view, canvas.width, canvas.height);
    setHover(getHoverInfo(wx, wz, layers, e.clientX - rect.left, e.clientY - rect.top));
  }, [isPanning, view, layers]);

  const handleMouseUp = useCallback(() => { setIsPanning(false); }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (panMoved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const [wx, wz] = screenToWorld(mx, my, view, canvas.width, canvas.height);
    setInspect(getInspectInfo(wx, wz, layers));
  }, [view, layers, panMoved]);

  const resetView = useCallback(() => setView({ offsetX: 0, offsetY: 0, zoom: 0.35 }), []);
  const toggleLayer = useCallback((key: keyof LayerState) => setLayers(l => ({ ...l, [key]: !l[key] })), []);
  const toggleAll = useCallback((on: boolean) => {
    setLayers(l => {
      const next = { ...l };
      for (const k of Object.keys(next) as (keyof LayerState)[]) next[k] = on;
      return next;
    });
  }, []);
  const jumpTo = useCallback((x: number, z: number, zoom?: number) => {
    setView({ offsetX: x, offsetY: z, zoom: zoom ?? 1.2 });
  }, []);

  // LOD level display
  const lodLevel = view.zoom < LOD.FAR ? 'Overview' : view.zoom < LOD.MID ? 'Far' : view.zoom < LOD.CLOSE ? 'Mid' : view.zoom < LOD.DETAIL ? 'Close' : view.zoom < LOD.ULTRA ? 'Detail' : 'Ultra';

  const layerGroups: { group: string; items: { key: keyof LayerState; label: string; color: string }[] }[] = [
    { group: 'Environment', items: [
      { key: 'terrain', label: 'Terrain', color: '#4a7c3f' },
      { key: 'regions', label: 'Regions', color: '#6a8a4a' },
      { key: 'water', label: 'Water', color: '#2196f3' },
    ]},
    { group: 'Infrastructure', items: [
      { key: 'roads', label: 'Roads', color: '#8d6e46' },
      { key: 'railways', label: 'Railways', color: '#e91e63' },
      { key: 'stations', label: 'Stations', color: '#ff9800' },
      { key: 'bridges', label: 'Bridges', color: '#78909c' },
    ]},
    { group: 'Structures', items: [
      { key: 'settlements', label: 'Settlements', color: '#ffd700' },
      { key: 'buildings', label: 'Buildings', color: '#8d6e46' },
      { key: 'landmarks', label: 'Landmarks', color: '#ffd700' },
      { key: 'pois', label: 'POIs', color: '#9c27b0' },
    ]},
    { group: 'Debug', items: [
      { key: 'collision', label: 'Collision', color: '#ffeb3b' },
      { key: 'gridLabels', label: 'Grid Labels', color: '#555' },
    ]},
  ];

  return (
    <div style={S.root}>
      {/* LEFT SIDEBAR */}
      <div style={S.sidebar}>
        <div style={S.sidebarInner}>
          <div style={S.header}>
            <div style={S.titleRow}>
              <h1 style={S.title}>Trencheria</h1>
              <span style={S.badge}>ADMIN</span>
            </div>
            <div style={S.subtitle}>World Map Inspector</div>
          </div>

          {/* View info */}
          <div style={S.section}>
            <div style={S.sectionLabel}>VIEW</div>
            <div style={S.viewGrid}>
              <div style={S.viewItem}>
                <span style={S.viewLabel}>Zoom</span>
                <span style={S.viewValue}>{(view.zoom * 100).toFixed(0)}%</span>
              </div>
              <div style={S.viewItem}>
                <span style={S.viewLabel}>LOD</span>
                <span style={{ ...S.viewValue, color: '#4fc3f7' }}>{lodLevel}</span>
              </div>
              <div style={S.viewItem}>
                <span style={S.viewLabel}>Center</span>
                <span style={S.viewValue}>{Math.round(view.offsetX)}, {Math.round(view.offsetY)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <button onClick={resetView} style={{ ...S.btn, flex: 1 }}>Reset</button>
              <button onClick={() => toggleAll(true)} style={{ ...S.btn, flex: 1 }}>All On</button>
              <button onClick={() => toggleAll(false)} style={{ ...S.btn, flex: 1 }}>All Off</button>
            </div>
          </div>

          {/* Jump to */}
          <div style={S.section}>
            <div style={S.sectionLabel}>JUMP TO</div>
            <div style={S.jumpGrid}>
              {SETTLEMENTS.filter(s => s.size === 'large').map(s => (
                <button key={s.id} onClick={() => jumpTo(s.position[0], s.position[1])} style={S.jumpBtn}>
                  {s.name}
                </button>
              ))}
              <button onClick={() => jumpTo(0, 0, 0.35)} style={{ ...S.jumpBtn, borderColor: '#334' }}>Origin</button>
            </div>
          </div>

          {/* Layer toggles */}
          <div style={S.section}>
            <div style={S.sectionLabel}>LAYERS</div>
            {layerGroups.map(grp => (
              <div key={grp.group} style={{ marginBottom: 8 }}>
                <div style={S.groupLabel}>{grp.group}</div>
                {grp.items.map(ld => (
                  <label key={ld.key} style={{ ...S.layerRow, opacity: layers[ld.key] ? 1 : 0.3 }}>
                    <input type="checkbox" checked={layers[ld.key]} onChange={() => toggleLayer(ld.key)}
                      style={{ accentColor: ld.color, width: 12, height: 12 }} />
                    <span style={{ ...S.layerDot, background: ld.color }} />
                    <span style={{ fontSize: 11 }}>{ld.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={S.section}>
            <div style={S.sectionLabel}>WORLD DATA</div>
            <div style={S.statsBlock}>
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} style={S.statRow}>
                  <span>{k}</span>
                  <span style={{ color: '#4fc3f7', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ ...S.statRow, borderTop: '1px solid #181830', paddingTop: 4, marginTop: 4 }}>
                <span>world size</span>
                <span style={{ color: '#4fc3f7' }}>{WORLD_SIZE}²</span>
              </div>
            </div>
          </div>

          {/* War Resolution Panel */}
          {pendingResolutions.length > 0 && (
            <div style={{ ...S.section, background: '#1a1400', border: '1px solid #3a2800', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ ...S.sectionLabel, color: '#f39c12', borderColor: '#3a2800' }}>
                ⏳ PENDING WAR RESOLUTIONS ({pendingResolutions.length})
              </div>
              {resolveError && (
                <div style={{ fontSize: 9, color: '#f44', marginBottom: 6, padding: '3px 6px', background: '#2a0000', borderRadius: 3 }}>
                  ⚠️ {resolveError}
                </div>
              )}
              {pendingResolutions.map(ch => {
                const ks = warKillStats[ch.id] || { attacker_kills: 0, defender_kills: 0, total: 0 };
                return (
                <div key={ch.id} style={{ marginBottom: 10, padding: 8, background: '#0c0c1c', borderRadius: 4, border: '1px solid #252545' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e4ea', marginBottom: 4 }}>
                    {ch.territory_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLAN_COLOR_HEX[ch.attacker_clan_color as ClanColor] || '#888', display: 'inline-block' }} />
                    <span style={{ color: '#bcc' }}>{ch.attacker_clan_name}</span>
                    <span style={{ color: '#556' }}>vs</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLAN_COLOR_HEX[ch.defender_clan_color as ClanColor] || '#888', display: 'inline-block' }} />
                    <span style={{ color: '#bcc' }}>{ch.defender_clan_name}</span>
                  </div>
                  {/* Kill stats */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 6, padding: '3px 6px', background: '#0a0a1a', borderRadius: 3, border: '1px solid #1a1a3a' }}>
                    <span style={{ color: CLAN_COLOR_HEX[ch.attacker_clan_color as ClanColor] || '#e74c3c' }}>
                      ⚔️ {ks.attacker_kills} kills
                    </span>
                    <span style={{ color: '#556', fontSize: 9 }}>
                      {ks.total} total
                    </span>
                    <span style={{ color: CLAN_COLOR_HEX[ch.defender_clan_color as ClanColor] || '#27ae60' }}>
                      🛡️ {ks.defender_kills} kills
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => handleResolveWar(ch.id, 'attacker_won')}
                      disabled={resolving === ch.id}
                      style={{ ...S.btn, flex: 1, background: '#1a0a0a', borderColor: '#4a1515', color: '#e74c3c', fontSize: 9, fontWeight: 700, textAlign: 'center' as const }}
                    >
                      ⚔️ Attacker Wins
                    </button>
                    <button
                      onClick={() => handleResolveWar(ch.id, 'defender_held')}
                      disabled={resolving === ch.id}
                      style={{ ...S.btn, flex: 1, background: '#0a1a0a', borderColor: '#154a15', color: '#27ae60', fontSize: 9, fontWeight: 700, textAlign: 'center' as const }}
                    >
                      🛡️ Defender Holds
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Active Wars with Kill Stats */}
          {activeWars.length > 0 && (
            <div style={{ ...S.section, background: '#1a0505', border: '1px solid #3a1010', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ ...S.sectionLabel, color: '#e74c3c', borderColor: '#3a1010' }}>
                🔥 ACTIVE WARS ({activeWars.length})
              </div>
              {activeWars.map(ch => {
                const ks = warKillStats[ch.id] || { attacker_kills: 0, defender_kills: 0, total: 0 };
                return (
                <div key={ch.id} style={{ marginBottom: 8, padding: 8, background: '#0c0c1c', borderRadius: 4, border: '1px solid #252545' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e4ea', marginBottom: 4 }}>
                    {ch.territory_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLAN_COLOR_HEX[ch.attacker_clan_color as ClanColor] || '#888', display: 'inline-block' }} />
                    <span style={{ color: '#bcc' }}>{ch.attacker_clan_name}</span>
                    <span style={{ color: '#556' }}>vs</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLAN_COLOR_HEX[ch.defender_clan_color as ClanColor] || '#888', display: 'inline-block' }} />
                    <span style={{ color: '#bcc' }}>{ch.defender_clan_name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 6px', background: '#0a0a1a', borderRadius: 3, border: '1px solid #1a1a3a' }}>
                    <span style={{ color: CLAN_COLOR_HEX[ch.attacker_clan_color as ClanColor] || '#e74c3c' }}>
                      ⚔️ {ks.attacker_kills} kills
                    </span>
                    <span style={{ color: '#556', fontSize: 9 }}>
                      LIVE • {ks.total} total
                    </span>
                    <span style={{ color: CLAN_COLOR_HEX[ch.defender_clan_color as ClanColor] || '#27ae60' }}>
                      🛡️ {ks.defender_kills} kills
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <div style={S.footer}>
            Scroll to zoom • Drag to pan<br />
            Hover for info • Click to inspect
          </div>
        </div>
      </div>

      {/* MAP */}
      <div style={S.mapArea}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor: isPanning ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        />

        {/* Hover tooltip — floating near cursor */}
        {hover && hover.label && !isPanning && (
          <div style={{
            ...S.hoverTooltip,
            left: Math.min(hover.screenX + 16, (canvasRef.current?.getBoundingClientRect().width || 800) - 200),
            top: hover.screenY - 10,
          }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 12 }}>{hover.label}</div>
            <div style={{ color: '#8aa', fontSize: 10 }}>{hover.type}</div>
            <div style={{ color: '#4fc3f7', fontSize: 10, marginTop: 2 }}>
              [{hover.worldX}, {hover.worldZ}] H: {hover.terrainH}
            </div>
          </div>
        )}

        {/* Bottom status bar */}
        <div style={S.statusBar}>
          <span style={{ color: '#4fc3f7' }}>X: {hover?.worldX ?? '—'}</span>
          <span style={{ color: '#4fc3f7' }}>Z: {hover?.worldZ ?? '—'}</span>
          <span style={{ color: '#81c784' }}>H: {hover?.terrainH ?? '—'}</span>
          <span style={{ color: '#666' }}>|</span>
          <span style={{ color: '#888' }}>Zoom: {(view.zoom * 100).toFixed(0)}%</span>
          <span style={{ color: '#556' }}>LOD: {lodLevel}</span>
        </div>

        {/* Inspect panel */}
        {inspect && (
          <div style={S.inspectPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#4fc3f7', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>{inspect.layer}</span>
              <button onClick={() => setInspect(null)} style={S.closeBtn}>✕</button>
            </div>
            <div style={{ fontSize: 16, color: '#fff', fontWeight: 700 }}>{inspect.name}</div>
            <div style={{ fontSize: 11, color: '#8899aa', marginBottom: 8 }}>{inspect.type}</div>

            <div style={S.inspectCoord}>
              <div style={S.coordItem}><span style={S.coordLabel}>X</span><span>{inspect.x}</span></div>
              <div style={S.coordItem}><span style={S.coordLabel}>Z</span><span>{inspect.z}</span></div>
              <div style={S.coordItem}><span style={S.coordLabel}>H</span><span>{getTerrainHeight(inspect.x, inspect.z).toFixed(2)}</span></div>
            </div>

            {inspect.extra && (
              <div style={{ marginTop: 8 }}>
                {Object.entries(inspect.extra).map(([k, v]) => (
                  <div key={k} style={S.inspectRow}>
                    <span style={{ color: '#556' }}>{k}</span>
                    <span style={{ color: '#bcc' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => jumpTo(inspect.x, inspect.z, 2)} style={{ ...S.btn, marginTop: 10, width: '100%', background: '#152035', borderColor: '#2a4060' }}>
              Zoom to Object
            </button>
          </div>
        )}

        {/* Legend */}
        <div style={S.legend}>
          {[
            ['#e91e63', 'Rail A'], ['#ff9800', 'Rail B'], ['#ffd700', 'Settlement'],
            ['#2196f3', 'Water'], ['#8d6e46', 'Road'], ['#78909c', 'Bridge'],
            ['#9c27b0', 'POI'], ['#ffd700', 'Landmark'],
          ].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#778' }}>
              <span style={{ width: 8, height: 3, background: c, display: 'inline-block', borderRadius: 1, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Styles =====
const S: Record<string, React.CSSProperties> = {
  root: { display: 'flex', width: '100vw', height: '100vh', background: '#080814', fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", color: '#bcc', overflow: 'hidden' },
  sidebar: { width: 240, minWidth: 240, background: '#0c0c1c', borderRight: '1px solid #181830', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarInner: { flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  header: { borderBottom: '1px solid #181830', paddingBottom: 12, marginBottom: 6 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { color: '#e0e4ea', fontSize: 15, margin: 0, fontWeight: 700, letterSpacing: 0.3 },
  badge: { background: '#1a2a40', color: '#4fc3f7', fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: 1 },
  subtitle: { color: '#445', fontSize: 10, marginTop: 3 },
  section: { marginBottom: 6 },
  sectionLabel: { fontSize: 9, color: '#334', letterSpacing: 2, fontWeight: 700, borderBottom: '1px solid #141428', paddingBottom: 4, marginBottom: 6 },
  groupLabel: { fontSize: 8, color: '#445', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 3, marginTop: 2 },
  viewGrid: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  viewItem: { display: 'flex', justifyContent: 'space-between', fontSize: 10 },
  viewLabel: { color: '#556' },
  viewValue: { color: '#99a', fontWeight: 600 },
  btn: { background: '#10102a', border: '1px solid #1c1c38', color: '#889', padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit', display: 'block' },
  jumpGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 3 },
  jumpBtn: { background: '#10102a', border: '1px solid #1c1c38', color: '#6a9fd8', padding: '3px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' },
  layerRow: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '2px 0', transition: 'opacity 0.15s' },
  layerDot: { width: 6, height: 6, borderRadius: 2, display: 'inline-block', flexShrink: 0 },
  statsBlock: { fontSize: 10, lineHeight: 1.7 },
  statRow: { display: 'flex', justifyContent: 'space-between' },
  footer: { fontSize: 9, color: '#223', borderTop: '1px solid #141428', paddingTop: 10, marginTop: 'auto', textAlign: 'center' as const, lineHeight: 1.6 },
  mapArea: { flex: 1, position: 'relative' as const, overflow: 'hidden' },
  statusBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, background: 'rgba(8,8,20,0.9)', borderTop: '1px solid #181830', padding: '4px 12px', display: 'flex', gap: 12, fontSize: 11, fontFamily: 'inherit', pointerEvents: 'none' as const },
  hoverTooltip: { position: 'absolute' as const, background: 'rgba(12,12,28,0.95)', border: '1px solid #252545', borderRadius: 5, padding: '6px 10px', pointerEvents: 'none' as const, zIndex: 10, backdropFilter: 'blur(8px)', maxWidth: 220 },
  inspectPanel: { position: 'absolute' as const, top: 12, right: 12, width: 230, background: 'rgba(10,10,24,0.95)', border: '1px solid #1c1c38', borderRadius: 8, padding: 14, fontFamily: 'inherit', backdropFilter: 'blur(12px)' },
  closeBtn: { background: 'none', border: '1px solid #252545', color: '#667', cursor: 'pointer', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontFamily: 'inherit' },
  inspectCoord: { display: 'flex', gap: 8, background: '#0a0a1a', padding: '6px 10px', borderRadius: 4, border: '1px solid #141430' },
  coordItem: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', fontSize: 12, color: '#4fc3f7', fontWeight: 600 },
  coordLabel: { fontSize: 8, color: '#445', fontWeight: 400, marginBottom: 1 },
  inspectRow: { display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0' },
  legend: { position: 'absolute' as const, bottom: 30, right: 10, background: 'rgba(10,10,24,0.85)', border: '1px solid #181830', borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column' as const, gap: 3 },
};
