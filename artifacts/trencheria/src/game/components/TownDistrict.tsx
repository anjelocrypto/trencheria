/**
 * TownDistrict — Dense medieval town quarter outside the capital walls.
 * Sub-zones: Gate District, Market Square, Residential Ring, Workshop Corner, Bridge Approach.
 * All buildings terrain-aligned, collision-registered via CollisionSystem.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { GEO, MAT, seededRng } from '../world/SettlementPieces';
import { getTerrainHeight } from './Terrain';

// ========== BUILDING PRIMITIVES ==========

function TownHouse({ pos, rot, w, d, h, style, chimney, shed, sign }: {
  pos: [number, number, number]; rot: number; w: number; d: number; h: number;
  style: 'stone' | 'wood' | 'plaster' | 'halftimber';
  chimney?: boolean; shed?: boolean; sign?: boolean;
}) {
  const wallMat = style === 'stone' ? MAT.stoneWarm : style === 'halftimber' ? MAT.daub
    : style === 'plaster' ? MAT.plaster : MAT.woodWeathered;
  const isTimber = style === 'halftimber' || style === 'wood';
  const roofMat = isTimber ? MAT.roofThatch : MAT.roofTile;
  const roofH = Math.max(1.6, h * 0.65);

  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Foundation */}
      <mesh position={[0, 0.15, 0]} geometry={GEO.box}
        scale={[w + 0.4, 0.3, d + 0.4]} material={MAT.cobble} castShadow />
      {/* Walls */}
      <mesh position={[0, h / 2 + 0.3, 0]} geometry={GEO.box}
        scale={[w, h, d]} material={wallMat} castShadow />
      {/* Timber beams */}
      {isTimber && (
        <>
          <mesh position={[0, h + 0.3, d / 2 + 0.01]} geometry={GEO.box}
            scale={[w, 0.1, 0.05]} material={MAT.timber} />
          <mesh position={[0, 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[w, 0.1, 0.05]} material={MAT.timber} />
          <mesh position={[-w / 2 + 0.01, h / 2 + 0.3, d / 2 + 0.01]} geometry={GEO.box}
            scale={[0.08, h, 0.05]} material={MAT.timber} />
          <mesh position={[w / 2 - 0.01, h / 2 + 0.3, d / 2 + 0.01]} geometry={GEO.box}
            scale={[0.08, h, 0.05]} material={MAT.timber} />
        </>
      )}
      {/* Roof */}
      <mesh position={[0, h + 0.3 + roofH / 2, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4}
        scale={[(w + 0.5) * 0.72, roofH, (d + 0.5) * 0.72]} material={roofMat} castShadow />
      {/* Door */}
      <mesh position={[0, 0.6, d / 2 + 0.02]} geometry={GEO.box}
        scale={[0.8, 1.4, 0.05]} material={MAT.door} castShadow />
      {/* Window */}
      {w > 2.5 && (
        <mesh position={[w / 2 + 0.02, h * 0.5 + 0.3, 0]} geometry={GEO.box}
          scale={[0.05, 0.4, 0.5]} material={MAT.dark} />
      )}
      {/* Chimney */}
      {chimney && (
        <group position={[w * 0.25, h + roofH * 0.3, -d * 0.15]}>
          <mesh position={[0, 0.4, 0]} geometry={GEO.box}
            scale={[0.4, 1, 0.4]} material={MAT.stoneDark} castShadow />
        </group>
      )}
      {/* Lean-to shed */}
      {shed && (
        <group position={[-w / 2 - 0.7, 0, 0]}>
          <mesh position={[0, 0.5, 0]} geometry={GEO.box}
            scale={[0.1, 1, 0.1]} material={MAT.timber} castShadow />
          <mesh position={[-0.2, 0.9, 0]} rotation={[0, 0, 0.2]} geometry={GEO.box}
            scale={[1, 0.05, 1.2]} material={MAT.woodWeathered} castShadow />
        </group>
      )}
      {/* Hanging sign for shops */}
      {sign && (
        <group position={[w / 2 + 0.3, h * 0.6, d / 2]}>
          <mesh position={[0, 0, 0]} geometry={GEO.box}
            scale={[0.5, 0.06, 0.06]} material={MAT.iron} />
          <mesh position={[0.3, -0.2, 0]} geometry={GEO.box}
            scale={[0.5, 0.35, 0.04]} material={MAT.woodLight} castShadow />
        </group>
      )}
    </group>
  );
}

function MarketStall({ pos, rot, goods }: {
  pos: [number, number, number]; rot: number; goods?: 'crates' | 'cloth' | 'food' | 'tools';
}) {
  const goodsMat = goods === 'cloth' ? MAT.cloth : goods === 'tools' ? MAT.iron : MAT.barrel;
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[-0.8, 1.1, -0.4]} geometry={GEO.box}
        scale={[0.08, 2.2, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0.8, 1.1, -0.4]} geometry={GEO.box}
        scale={[0.08, 2.2, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[-0.8, 0.7, 0.4]} geometry={GEO.box}
        scale={[0.08, 1.4, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0.8, 0.7, 0.4]} geometry={GEO.box}
        scale={[0.08, 1.4, 0.08]} material={MAT.timber} castShadow />
      {/* Counter */}
      <mesh position={[0, 0.85, 0]} geometry={GEO.box}
        scale={[1.8, 0.08, 1]} material={MAT.woodLight} castShadow />
      {/* Awning */}
      <mesh position={[0, 2.1, 0]} rotation={[0.12, 0, 0]} geometry={GEO.box}
        scale={[2, 0.04, 1.4]} material={MAT.tent} castShadow />
      {/* Goods on counter */}
      {[[-0.3, 0], [0.3, 0.15]].map(([gx, gz], i) => (
        <mesh key={i} position={[gx, 0.98, gz]} geometry={GEO.box}
          scale={[0.25, 0.2, 0.25]} material={goodsMat} castShadow />
      ))}
    </group>
  );
}

function LanternPost({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 1.4, 0]} geometry={GEO.box}
        scale={[0.08, 2.8, 0.08]} material={MAT.iron} castShadow />
      <mesh position={[0.25, 2.6, 0]} geometry={GEO.box}
        scale={[0.4, 0.06, 0.06]} material={MAT.iron} />
      <mesh position={[0.4, 2.4, 0]} geometry={GEO.box}
        scale={[0.18, 0.28, 0.18]} material={MAT.iron} castShadow />
      <mesh position={[0.4, 2.4, 0]} geometry={GEO.box}
        scale={[0.08, 0.12, 0.08]} material={MAT.lantern} />
    </group>
  );
}

function Well({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.35, 0]} geometry={GEO.cyl8}
        scale={[0.7, 0.7, 0.7]} material={MAT.cobble} castShadow />
      <mesh position={[-0.3, 1.2, 0]} geometry={GEO.box}
        scale={[0.08, 1.6, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0.3, 1.2, 0]} geometry={GEO.box}
        scale={[0.08, 1.6, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0, 2, 0]} geometry={GEO.box}
        scale={[0.8, 0.06, 0.06]} material={MAT.timber} />
    </group>
  );
}

function NoticeBoard({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[-0.4, 0.7, 0]} geometry={GEO.box}
        scale={[0.08, 1.4, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0.4, 0.7, 0]} geometry={GEO.box}
        scale={[0.08, 1.4, 0.08]} material={MAT.timber} castShadow />
      <mesh position={[0, 1.3, 0]} geometry={GEO.box}
        scale={[1, 0.7, 0.06]} material={MAT.woodLight} castShadow />
      {/* Notices pinned */}
      <mesh position={[-0.2, 1.35, 0.035]} geometry={GEO.box}
        scale={[0.25, 0.3, 0.01]} material={MAT.chalk} />
      <mesh position={[0.15, 1.25, 0.035]} geometry={GEO.box}
        scale={[0.2, 0.25, 0.01]} material={MAT.cloth} />
    </group>
  );
}

function HayBale({ pos, rot }: { pos: [number, number, number]; rot?: number }) {
  return (
    <mesh position={pos} rotation={[0, rot || 0, 0]} geometry={GEO.box}
      scale={[1, 0.6, 0.8]} material={MAT.hay} castShadow />
  );
}

function WoodPile({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[i * 0.3 - 0.3, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}
          geometry={GEO.cyl6} scale={[0.08, 0.8, 0.08]} material={MAT.woodDark} castShadow />
      ))}
      {[0, 1].map(i => (
        <mesh key={`t${i}`} position={[i * 0.25 - 0.12, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}
          geometry={GEO.cyl6} scale={[0.08, 0.7, 0.08]} material={MAT.timber} castShadow />
      ))}
    </group>
  );
}

function Cart({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.4, 0]} geometry={GEO.box}
        scale={[1.2, 0.4, 2.2]} material={MAT.woodDark} castShadow />
      <mesh position={[-0.55, 0.7, 0]} geometry={GEO.box}
        scale={[0.06, 0.35, 2]} material={MAT.woodWeathered} castShadow />
      <mesh position={[0.55, 0.7, 0]} geometry={GEO.box}
        scale={[0.06, 0.35, 2]} material={MAT.woodWeathered} castShadow />
      {/* Wheels */}
      <mesh position={[-0.65, 0.3, 0.5]} geometry={GEO.cyl8}
        scale={[0.25, 0.05, 0.25]} material={MAT.timber} castShadow />
      <mesh position={[0.65, 0.3, 0.5]} geometry={GEO.cyl8}
        scale={[0.25, 0.05, 0.25]} material={MAT.timber} castShadow />
      {/* Shaft */}
      <mesh position={[0.3, 0.3, -1.6]} geometry={GEO.box}
        scale={[0.05, 0.05, 1]} material={MAT.woodDark} />
      <mesh position={[-0.3, 0.3, -1.6]} geometry={GEO.box}
        scale={[0.05, 0.05, 1]} material={MAT.woodDark} />
    </group>
  );
}

function Shrine({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.15, 0]} geometry={GEO.box}
        scale={[1.8, 0.3, 1.8]} material={MAT.cobble} castShadow />
      <mesh position={[0, 1, 0]} geometry={GEO.box}
        scale={[0.5, 1.4, 0.3]} material={MAT.stoneWarm} castShadow />
      <mesh position={[0, 2, 0]} geometry={GEO.cone4}
        scale={[0.3, 0.5, 0.3]} material={MAT.stone} castShadow />
    </group>
  );
}

function Barrel({ pos }: { pos: [number, number, number] }) {
  return (
    <mesh position={[pos[0], pos[1] + 0.3, pos[2]]} geometry={GEO.cyl8}
      scale={[0.2, 0.5, 0.2]} material={MAT.barrel} castShadow />
  );
}

function WaterTrough({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.25, 0]} geometry={GEO.box}
        scale={[1.6, 0.5, 0.5]} material={MAT.woodDark} castShadow />
      <mesh position={[0, 0.3, 0]} geometry={GEO.box}
        scale={[1.4, 0.25, 0.35]} material={MAT.water} />
    </group>
  );
}

function Bench({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.25, 0]} geometry={GEO.box}
        scale={[1.2, 0.06, 0.3]} material={MAT.woodDark} castShadow />
      <mesh position={[-0.5, 0.12, 0]} geometry={GEO.box}
        scale={[0.06, 0.25, 0.25]} material={MAT.timber} castShadow />
      <mesh position={[0.5, 0.12, 0]} geometry={GEO.box}
        scale={[0.06, 0.25, 0.25]} material={MAT.timber} castShadow />
    </group>
  );
}

// ========== TOWN BUILDING DATA ==========
// Deterministic layout for the outer town district

export interface TownBuildingDef {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  h: number;
  style: 'stone' | 'wood' | 'plaster' | 'halftimber';
  chimney: boolean;
  shed: boolean;
  sign: boolean;
  label?: string; // for shops
}

function generateTownBuildings(): TownBuildingDef[] {
  const buildings: TownBuildingDef[] = [];
  const rng = seededRng(54321);

  // === GATE DISTRICT (south, z = 42-60) ===
  // Buildings flanking the main road approaching the gate
  const gateBuildings: Array<[number, number, number, string?]> = [
    // East side of road
    [8, 44, -Math.PI / 2, 'Guard Post'],
    [10, 50, -Math.PI / 2 + 0.1],
    [9, 56, -Math.PI / 2 - 0.1, 'Tavern'],
    [12, 62, -Math.PI / 2 + 0.15],
    // West side of road
    [-8, 44, Math.PI / 2],
    [-10, 50, Math.PI / 2 - 0.1, 'Inn'],
    [-9, 56, Math.PI / 2 + 0.1],
    [-12, 62, Math.PI / 2, 'General Goods'],
  ];

  for (const [x, z, rot, label] of gateBuildings) {
    buildings.push({
      x, z, rot,
      w: 3.5 + rng() * 2, d: 4 + rng() * 2, h: 3 + rng() * 1.5,
      style: rng() > 0.5 ? 'stone' : 'halftimber',
      chimney: rng() > 0.4, shed: rng() > 0.7, sign: !!label,
      label,
    });
  }

  // === MARKET SQUARE (southeast, centered around [20, 55]) ===
  const marketBuildings: Array<[number, number, number, string?]> = [
    [22, 48, 0, 'Bakery'],
    [28, 50, -0.3, 'Butcher'],
    [26, 56, 0.2],
    [30, 54, -0.5, 'Food Stall'],
    [24, 60, 0.1],
    [18, 58, 0.3],
  ];

  for (const [x, z, rot, label] of marketBuildings) {
    buildings.push({
      x, z, rot,
      w: 3 + rng() * 2, d: 3.5 + rng() * 2, h: 2.5 + rng() * 1.5,
      style: rng() > 0.3 ? 'halftimber' : 'plaster',
      chimney: rng() > 0.5, shed: rng() > 0.6, sign: !!label,
      label,
    });
  }

  // === RESIDENTIAL RING (west and north, wrapping around) ===
  const residentialPositions: Array<[number, number, number]> = [
    // West side
    [-18, 48, Math.PI * 0.4],
    [-22, 44, Math.PI * 0.35],
    [-26, 50, Math.PI * 0.5],
    [-20, 56, Math.PI * 0.45],
    [-24, 60, Math.PI * 0.3],
    [-28, 54, Math.PI * 0.55],
    // Northwest
    [-30, 46, Math.PI * 0.6],
    [-34, 50, Math.PI * 0.65],
    [-32, 56, Math.PI * 0.4],
    // East spread
    [34, 48, -Math.PI * 0.3],
    [36, 54, -Math.PI * 0.4],
    [32, 60, -Math.PI * 0.2],
    // North side (behind walls)
    [-14, 42, Math.PI],
    [14, 42, -Math.PI],
    // Along roads further out — relocated south to clear Line B corridor (z≈83)
    [-16, 64, Math.PI * 0.5],
    [16, 60, -Math.PI * 0.4],
    // Was (10, 74) and (14, 72) — too close to Line B. Moved south.
    [10, 62, -Math.PI * 0.45],
    [14, 60, -Math.PI * 0.5],
  ];

  for (const [x, z, rot] of residentialPositions) {
    buildings.push({
      x, z, rot,
      w: 3 + rng() * 1.5, d: 3.5 + rng() * 1.5, h: 2.5 + rng() * 1,
      style: (['halftimber', 'wood', 'plaster'] as const)[Math.floor(rng() * 3)],
      chimney: rng() > 0.4, shed: rng() > 0.5, sign: false,
    });
  }

  // === WORKSHOP CORNER (southwest, around [-20, 65]) ===
  const workshopBuildings: Array<[number, number, number, string?]> = [
    // Relocated south to clear Line B railway corridor (z≈83, need 15u clearance)
    [-18, 56, Math.PI * 0.4, 'Blacksmith'],
    [-24, 54, Math.PI * 0.5, 'Stable'],
    [-120, 132, Math.PI * 0.3, 'Storage'],
    // Was (-82, 84) then (-82, 68) — moved well clear of Line B
    [-82, 56, Math.PI * 0.45],
  ];

  for (const [x, z, rot, label] of workshopBuildings) {
    buildings.push({
      x, z, rot,
      w: 4 + rng() * 2, d: 4.5 + rng() * 2, h: 2.8 + rng() * 1.2,
      style: rng() > 0.5 ? 'stone' : 'wood',
      chimney: !!label, shed: rng() > 0.4, sign: !!label,
      label,
    });
  }

  return buildings;
}

// Exported for collision system
export const TOWN_BUILDINGS = generateTownBuildings();

// ========== TOWN PROPS COLLISION ==========
// Hand-authored collision data for the props rendered inside TownDistrict
// (market stalls, carts, barrels, hay bales, troughs, lanterns, shrine, etc.).
// These were previously rendered without any registered obstacles, so the player
// could walk through them — visual/collision mismatch.
export interface TownPropObstacle {
  shape: 'circle' | 'box';
  x: number;
  z: number;
  radius?: number; // when shape === 'circle'
  halfW?: number;  // when shape === 'box'
  halfD?: number;  // when shape === 'box'
  rotation?: number; // when shape === 'box'
}

export const TOWN_PROPS: TownPropObstacle[] = [
  // --- Market square stalls (~1.8w x 1.0d, ref: <MarketStall>) ---
  { shape: 'box', x: 18, z: 52, halfW: 0.95, halfD: 0.55, rotation: 0.1 },
  { shape: 'box', x: 22, z: 52, halfW: 0.95, halfD: 0.55, rotation: -0.1 },
  { shape: 'box', x: 26, z: 52, halfW: 0.95, halfD: 0.55, rotation: 0.2 },
  { shape: 'box', x: 20, z: 58, halfW: 0.95, halfD: 0.55, rotation: Math.PI },
  { shape: 'box', x: 24, z: 58, halfW: 0.95, halfD: 0.55, rotation: Math.PI + 0.15 },
  // --- Well & notice board ---
  { shape: 'circle', x: 22, z: 55, radius: 0.7 },
  { shape: 'circle', x: 17, z: 55, radius: 0.45 },
  // --- Carts (~1.2w x 2.2d) ---
  { shape: 'box', x: 28, z: 58, halfW: 0.65, halfD: 1.15, rotation: 0.3 },
  { shape: 'box', x: 16, z: 58, halfW: 0.65, halfD: 1.15, rotation: -0.4 },
  // --- Barrels around stalls ---
  { shape: 'circle', x: 15, z: 53, radius: 0.28 },
  { shape: 'circle', x: 15.4, z: 53.4, radius: 0.28 },
  { shape: 'circle', x: 29, z: 53, radius: 0.28 },
  { shape: 'circle', x: 29, z: 54, radius: 0.25 }, // small crate beside barrel
  // --- Shrine near market ---
  { shape: 'box', x: 30, z: 55, halfW: 0.95, halfD: 0.95 },
  // --- Hay bales near stables ---
  { shape: 'box', x: -25, z: 64, halfW: 0.55, halfD: 0.45, rotation: 0.2 },
  { shape: 'box', x: -25.5, z: 65, halfW: 0.55, halfD: 0.45, rotation: -0.3 },
  { shape: 'box', x: -24.5, z: 64.5, halfW: 0.55, halfD: 0.45, rotation: 0.1 },
  // --- Wood piles ---
  { shape: 'box', x: -20, z: 48, halfW: 0.5, halfD: 0.45 },
  { shape: 'box', x: -28, z: 52, halfW: 0.5, halfD: 0.45 },
  { shape: 'box', x: 34, z: 46, halfW: 0.5, halfD: 0.45 },
  // --- Water troughs ---
  { shape: 'box', x: -22, z: 68, halfW: 0.85, halfD: 0.3 },
  { shape: 'box', x: 10, z: 50, halfW: 0.85, halfD: 0.3 },
  // --- Barrels near residential buildings ---
  { shape: 'circle', x: 12, z: 44, radius: 0.28 },
  { shape: 'circle', x: -14, z: 46, radius: 0.28 },
  { shape: 'circle', x: -14.4, z: 46.4, radius: 0.28 },
  // --- Workshop corner crates ---
  { shape: 'box', x: -22, z: 72, halfW: 0.4, halfD: 0.4 },
  { shape: 'box', x: -22.5, z: 72.3, halfW: 0.35, halfD: 0.35 },
  // --- Lantern posts along main road (z=44..68 east+west, x=±3) ---
  { shape: 'circle', x: 3, z: 44, radius: 0.18 },
  { shape: 'circle', x: -3, z: 44, radius: 0.18 },
  { shape: 'circle', x: 3, z: 50, radius: 0.18 },
  { shape: 'circle', x: -3, z: 50, radius: 0.18 },
  { shape: 'circle', x: 3, z: 56, radius: 0.18 },
  { shape: 'circle', x: -3, z: 56, radius: 0.18 },
  { shape: 'circle', x: 3, z: 62, radius: 0.18 },
  { shape: 'circle', x: -3, z: 62, radius: 0.18 },
  { shape: 'circle', x: 3, z: 68, radius: 0.18 },
  { shape: 'circle', x: -3, z: 68, radius: 0.18 },
];

// ========== MAIN COMPONENT ==========

interface TownDistrictProps {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function TownDistrict({ playerPositionRef }: TownDistrictProps) {
  const playerPos = playerPositionRef.current;

  // Distance cull — only render when player is within 120 units of center
  if (playerPos) {
    const dx = playerPos.x;
    const dz = playerPos.z - 55;
    if (dx * dx + dz * dz > 140 * 140) return null;
  }

  return (
    <group>
      {/* === ROADS === */}
      <TownRoads />
      {/* === BUILDINGS === */}
      <TownBuildings />
      {/* === MARKET SQUARE === */}
      <MarketSquare />
      {/* === PROPS === */}
      <TownProps />
      {/* === WORKSHOP CORNER DETAILS === */}
      <WorkshopCorner />
    </group>
  );
}

function TownRoads() {
  return (
    <group>
      {/* Main road from gate southward */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={`mr${i}`}
          position={[0, getTerrainHeight(0, 40 + i * 3.5) + 0.04, 40 + i * 3.5]}
          geometry={GEO.box} scale={[5, 0.08, 3.2]} material={MAT.cobble} />
      ))}
      {/* Market square plaza */}
      <mesh position={[22, getTerrainHeight(22, 55) + 0.05, 55]}
        geometry={GEO.box} scale={[16, 0.1, 14]} material={MAT.cobble} />
      {/* Side road east to market */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`se${i}`}
          position={[6 + i * 4.5, getTerrainHeight(6 + i * 4.5, 55) + 0.04, 55]}
          geometry={GEO.box} scale={[4, 0.08, 3.5]} material={MAT.cobble} />
      ))}
      {/* Side road west to residential */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`sw${i}`}
          position={[-6 - i * 4.5, getTerrainHeight(-6 - i * 4.5, 52) + 0.04, 52]}
          geometry={GEO.box} scale={[4, 0.08, 3]} material={MAT.cobble} />
      ))}
      {/* Road to workshop corner */}
      {[0, 1, 2].map(i => (
        <mesh key={`wk${i}`}
          position={[-14 - i * 3, getTerrainHeight(-14 - i * 3, 60 + i * 3) + 0.04, 60 + i * 3]}
          geometry={GEO.box} scale={[3.5, 0.08, 3.5]} material={MAT.cobble} />
      ))}
    </group>
  );
}

function TownBuildings() {
  return (
    <group>
      {TOWN_BUILDINGS.map((b, i) => {
        const y = getTerrainHeight(b.x, b.z);
        return (
          <TownHouse key={`tb${i}`}
            pos={[b.x, y, b.z]} rot={b.rot}
            w={b.w} d={b.d} h={b.h}
            style={b.style} chimney={b.chimney} shed={b.shed} sign={b.sign}
          />
        );
      })}
    </group>
  );
}

function MarketSquare() {
  const y = getTerrainHeight(22, 55);
  return (
    <group>
      {/* Market stalls */}
      <MarketStall pos={[18, y, 52]} rot={0.1} goods="food" />
      <MarketStall pos={[22, y, 52]} rot={-0.1} goods="cloth" />
      <MarketStall pos={[26, y, 52]} rot={0.2} goods="tools" />
      <MarketStall pos={[20, y, 58]} rot={Math.PI} goods="crates" />
      <MarketStall pos={[24, y, 58]} rot={Math.PI + 0.15} goods="food" />
      {/* Well in center of market */}
      <Well pos={[22, y, 55]} />
      {/* Notice board */}
      <NoticeBoard pos={[17, y, 55]} rot={Math.PI / 2} />
      {/* Carts */}
      <Cart pos={[28, y, 58]} rot={0.3} />
      <Cart pos={[16, y, 58]} rot={-0.4} />
      {/* Barrels and crates around stalls */}
      <Barrel pos={[15, y, 53]} />
      <Barrel pos={[15.4, y, 53.4]} />
      <Barrel pos={[29, y, 53]} />
      <mesh position={[29, y + 0.2, 54]} geometry={GEO.box}
        scale={[0.4, 0.4, 0.4]} material={MAT.woodDark} castShadow />
      {/* Benches */}
      <Bench pos={[22, y, 60]} rot={0} />
      <Bench pos={[18, y, 56]} rot={Math.PI / 2} />
    </group>
  );
}

function TownProps() {
  return (
    <group>
      {/* Lantern posts along main road */}
      {[44, 50, 56, 62, 68].map((z, i) => (
        <group key={`lp${i}`}>
          <LanternPost pos={[3, getTerrainHeight(3, z), z]} />
          <LanternPost pos={[-3, getTerrainHeight(-3, z), z]} />
        </group>
      ))}
      {/* Hay bales near stables area */}
      <HayBale pos={[-25, getTerrainHeight(-25, 64), 64]} rot={0.2} />
      <HayBale pos={[-25.5, getTerrainHeight(-25.5, 65), 65]} rot={-0.3} />
      <HayBale pos={[-24.5, getTerrainHeight(-24.5, 64.5) + 0.6, 64.5]} rot={0.1} />
      {/* Wood piles around residential */}
      <WoodPile pos={[-20, getTerrainHeight(-20, 48), 48]} />
      <WoodPile pos={[-28, getTerrainHeight(-28, 52), 52]} />
      <WoodPile pos={[34, getTerrainHeight(34, 46), 46]} />
      {/* Water troughs */}
      <WaterTrough pos={[-22, getTerrainHeight(-22, 68), 68]} />
      <WaterTrough pos={[10, getTerrainHeight(10, 50), 50]} />
      {/* Benches scattered */}
      <Bench pos={[-8, getTerrainHeight(-8, 60), 60]} rot={Math.PI / 4} />
      <Bench pos={[8, getTerrainHeight(8, 64), 64]} rot={-Math.PI / 6} />
      {/* Barrels near buildings */}
      <Barrel pos={[12, getTerrainHeight(12, 44), 44]} />
      <Barrel pos={[-14, getTerrainHeight(-14, 46), 46]} />
      <Barrel pos={[-14.4, getTerrainHeight(-14.4, 46.4), 46.4]} />
      {/* Shrine near market */}
      <Shrine pos={[30, getTerrainHeight(30, 55), 55]} />
    </group>
  );
}

function WorkshopCorner() {
  const y = getTerrainHeight(-20, 68);
  return (
    <group>
      {/* Blacksmith forge detail */}
      <group position={[-18, y, 68]}>
        <mesh position={[2, 0.5, 0]} geometry={GEO.box}
          scale={[1.2, 1, 0.8]} material={MAT.stoneDark} castShadow />
        <mesh position={[2, 1.1, 0]} geometry={GEO.box}
          scale={[0.3, 0.3, 0.3]} material={MAT.fire} />
        {/* Anvil */}
        <mesh position={[3, 0.4, 0.5]} geometry={GEO.box}
          scale={[0.3, 0.5, 0.2]} material={MAT.iron} castShadow />
        <mesh position={[3, 0.7, 0.5]} geometry={GEO.box}
          scale={[0.5, 0.12, 0.25]} material={MAT.iron} castShadow />
      </group>
      {/* Stable fence */}
      <group position={[-24, y, 66]}>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} position={[i * 1.5 - 2.25, 0.4, -3]} geometry={GEO.box}
            scale={[0.08, 0.8, 0.08]} material={MAT.fence} castShadow />
        ))}
        <mesh position={[0, 0.35, -3]} geometry={GEO.box}
          scale={[6, 0.06, 0.06]} material={MAT.fence} castShadow />
        <mesh position={[0, 0.65, -3]} geometry={GEO.box}
          scale={[6, 0.05, 0.05]} material={MAT.fence} castShadow />
      </group>
      {/* Storage crates */}
      <mesh position={[-22, y + 0.2, 72]} geometry={GEO.box}
        scale={[0.5, 0.5, 0.5]} material={MAT.woodDark} castShadow />
      <mesh position={[-22.5, y + 0.2, 72.3]} geometry={GEO.box}
        scale={[0.45, 0.45, 0.45]} material={MAT.barrel} castShadow />
      <mesh position={[-21.8, y + 0.65, 72.1]} geometry={GEO.box}
        scale={[0.4, 0.4, 0.4]} material={MAT.woodDark} castShadow />
    </group>
  );
}
