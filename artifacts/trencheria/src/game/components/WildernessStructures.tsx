/**
 * WildernessStructures — Isolated buildings, camps, farms, and outposts
 * placed in empty wilderness areas across the full 1800x1800 world.
 * All structures are terrain-aligned and collision-registered.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { GEO, MAT } from '../world/SettlementPieces';
import { getTerrainHeight } from './Terrain';
import { SETTLEMENTS, ROADS, SMALL_POIS } from '../world/RegionData';
import { distToRailway } from '../world/RailwayData';

export interface WildernessBuilding {
  x: number; z: number; rot: number;
  type: 'cottage' | 'farmhouse' | 'ruin' | 'shed' | 'outpost' | 'camp' | 'shrine_hut';
  w: number; d: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function isNearSettlement(x: number, z: number, minDist: number): boolean {
  for (const s of SETTLEMENTS) {
    const d = Math.sqrt((x - s.position[0]) ** 2 + (z - s.position[1]) ** 2);
    if (d < minDist) return true;
  }
  return false;
}

function isNearRoad(x: number, z: number, minDist: number): boolean {
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[1]) * dz) / len2));
    const px = road.from[0] + t * dx;
    const pz = road.from[1] + t * dz;
    const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (dist < minDist + road.width) return true;
  }
  return false;
}

function isNearPOI(x: number, z: number, minDist: number): boolean {
  for (const poi of SMALL_POIS) {
    const d = Math.sqrt((x - poi.position[0]) ** 2 + (z - poi.position[1]) ** 2);
    if (d < minDist) return true;
  }
  return false;
}

function isNearRailway(x: number, z: number, minDist: number): boolean {
  const d = distToRailway(x, z, minDist);
  return d !== null; // d !== null means within minDist
}

function generateWildernessBuildings(): WildernessBuilding[] {
  const buildings: WildernessBuilding[] = [];
  const rand = seededRandom(54321);

  const clusters = [
    // === CENTRAL WORLD (original) ===
    { cx: 120, cz: 30, count: 3, spread: 15, types: ['cottage', 'shed', 'farmhouse'] as const },
    { cx: 75, cz: -20, count: 2, spread: 12, types: ['cottage', 'ruin'] as const },
    { cx: -40, cz: -120, count: 3, spread: 18, types: ['farmhouse', 'cottage', 'shed'] as const },
    { cx: 15, cz: -130, count: 2, spread: 10, types: ['ruin', 'camp'] as const },
    { cx: -175, cz: -20, count: 3, spread: 16, types: ['cottage', 'farmhouse', 'shed'] as const },
    { cx: -160, cz: 60, count: 2, spread: 12, types: ['outpost', 'shed'] as const },
    { cx: -40, cz: 140, count: 2, spread: 14, types: ['cottage', 'camp'] as const },
    { cx: 50, cz: 140, count: 2, spread: 12, types: ['farmhouse', 'shed'] as const },
    { cx: 110, cz: -140, count: 2, spread: 14, types: ['outpost', 'ruin'] as const },
    { cx: 70, cz: -120, count: 2, spread: 10, types: ['camp', 'shed'] as const },
    { cx: -240, cz: -130, count: 2, spread: 15, types: ['ruin', 'cottage'] as const },
    { cx: 240, cz: 180, count: 2, spread: 12, types: ['shrine_hut', 'camp'] as const },
    { cx: -140, cz: 210, count: 2, spread: 14, types: ['cottage', 'shed'] as const },
    { cx: 200, cz: -80, count: 2, spread: 12, types: ['outpost', 'ruin'] as const },
    { cx: -85, cz: -30, count: 2, spread: 10, types: ['farmhouse', 'shed'] as const },
    { cx: 40, cz: 70, count: 2, spread: 10, types: ['cottage', 'shrine_hut'] as const },

    // === THORNWALL CORRIDOR (SW) ===
    { cx: -350, cz: -300, count: 3, spread: 20, types: ['cottage', 'outpost', 'shed'] as const },
    { cx: -420, cz: -380, count: 2, spread: 15, types: ['ruin', 'camp'] as const },
    { cx: -480, cz: -500, count: 2, spread: 18, types: ['farmhouse', 'cottage'] as const },
    { cx: -550, cz: -480, count: 2, spread: 12, types: ['outpost', 'shed'] as const },
    { cx: -460, cz: -350, count: 2, spread: 14, types: ['camp', 'shrine_hut'] as const },

    // === GOLDENVALE CORRIDOR (W) ===
    { cx: -400, cz: 80, count: 3, spread: 18, types: ['farmhouse', 'cottage', 'shed'] as const },
    { cx: -480, cz: 60, count: 2, spread: 14, types: ['cottage', 'farmhouse'] as const },
    { cx: -520, cz: 180, count: 2, spread: 16, types: ['shed', 'camp'] as const },
    { cx: -600, cz: 50, count: 2, spread: 15, types: ['ruin', 'outpost'] as const },
    { cx: -580, cz: 160, count: 2, spread: 12, types: ['farmhouse', 'shrine_hut'] as const },

    // === RIVERMOOR CORRIDOR (NE) ===
    { cx: 350, cz: 280, count: 3, spread: 18, types: ['cottage', 'farmhouse', 'shed'] as const },
    { cx: 420, cz: 400, count: 2, spread: 14, types: ['camp', 'shed'] as const },
    { cx: 380, cz: 320, count: 2, spread: 16, types: ['farmhouse', 'cottage'] as const },
    { cx: 500, cz: 380, count: 2, spread: 12, types: ['outpost', 'shed'] as const },
    { cx: 480, cz: 420, count: 2, spread: 14, types: ['ruin', 'camp'] as const },

    // === STONEPEAK CORRIDOR (NW) ===
    { cx: -350, cz: 380, count: 3, spread: 20, types: ['cottage', 'outpost', 'ruin'] as const },
    { cx: -300, cz: 450, count: 2, spread: 15, types: ['camp', 'shed'] as const },
    { cx: -430, cz: 550, count: 2, spread: 14, types: ['cottage', 'shrine_hut'] as const },
    { cx: -450, cz: 450, count: 2, spread: 16, types: ['farmhouse', 'shed'] as const },

    // === DARKHOLLOW CORRIDOR (SE) ===
    { cx: 400, cz: -300, count: 3, spread: 18, types: ['ruin', 'camp', 'outpost'] as const },
    { cx: 480, cz: -380, count: 2, spread: 14, types: ['ruin', 'shed'] as const },
    { cx: 550, cz: -450, count: 2, spread: 16, types: ['camp', 'ruin'] as const },
    { cx: 600, cz: -350, count: 2, spread: 12, types: ['outpost', 'camp'] as const },

    // === INTER-KINGDOM CORRIDORS ===
    // Thornwall → Goldenvale
    { cx: -560, cz: -200, count: 2, spread: 15, types: ['cottage', 'shed'] as const },
    { cx: -540, cz: -80, count: 2, spread: 14, types: ['farmhouse', 'camp'] as const },
    // Goldenvale → Stonepeak
    { cx: -500, cz: 300, count: 2, spread: 16, types: ['cottage', 'outpost'] as const },
    { cx: -460, cz: 400, count: 2, spread: 14, types: ['shrine_hut', 'shed'] as const },
    // Rivermoor → Darkhollow
    { cx: 520, cz: 50, count: 2, spread: 15, types: ['ruin', 'camp'] as const },
    { cx: 530, cz: -150, count: 2, spread: 14, types: ['outpost', 'shed'] as const },
    // Stonepeak → Rivermoor (northern)
    { cx: -200, cz: 540, count: 2, spread: 16, types: ['cottage', 'camp'] as const },
    { cx: 100, cz: 530, count: 2, spread: 14, types: ['shed', 'shrine_hut'] as const },
    { cx: 300, cz: 450, count: 2, spread: 15, types: ['farmhouse', 'cottage'] as const },

    // === EMPTY ZONE FILL ===
    { cx: -650, cz: -600, count: 2, spread: 20, types: ['ruin', 'camp'] as const },
    { cx: 650, cz: 500, count: 2, spread: 18, types: ['cottage', 'shed'] as const },
    { cx: 0, cz: 600, count: 2, spread: 16, types: ['outpost', 'camp'] as const },
    { cx: -200, cz: -500, count: 2, spread: 18, types: ['ruin', 'shrine_hut'] as const },
    { cx: 200, cz: 500, count: 2, spread: 15, types: ['farmhouse', 'cottage'] as const },
  ];

  for (const cluster of clusters) {
    for (let i = 0; i < cluster.count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 3 + rand() * cluster.spread;
      const x = cluster.cx + Math.cos(angle) * r;
      const z = cluster.cz + Math.sin(angle) * r;
      const y = getTerrainHeight(x, z);

      if (y < -0.3) continue;
      if (isNearSettlement(x, z, 60)) continue;
      if (isNearRoad(x, z, 4)) continue;
      if (isNearPOI(x, z, 8)) continue;
      if (isNearRailway(x, z, 12)) continue; // Keep 12u clear of railway corridor

      const type = cluster.types[i % cluster.types.length];
      const rot = rand() * Math.PI * 2;
      let w = 3 + rand() * 2;
      let d = 3.5 + rand() * 2;

      if (type === 'shed') { w = 2; d = 2.5; }
      if (type === 'camp') { w = 2; d = 2; }
      if (type === 'shrine_hut') { w = 2; d = 2; }

      buildings.push({ x, z, rot, type, w, d });
    }
  }

  return buildings;
}

export const WILDERNESS_BUILDINGS = generateWildernessBuildings();

function WildernessCottage({ pos, rot, w, d }: { pos: [number, number, number]; rot: number; w: number; d: number }) {
  const h = 2.5 + Math.sin(pos[0] * 0.1) * 0.5;
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.15, 0]} geometry={GEO.box} scale={[w + 0.3, 0.3, d + 0.3]} material={MAT.cobble} castShadow />
      <mesh position={[0, h / 2 + 0.3, 0]} geometry={GEO.box} scale={[w, h, d]} material={MAT.plasterDirty} castShadow />
      <mesh position={[0, h + 0.3 + 0.8, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4} scale={[w * 0.75, 1.6, d * 0.75]} material={MAT.roofThatch} castShadow />
      <mesh position={[0, 0.8, d / 2 + 0.01]} geometry={GEO.box} scale={[0.7, 1.4, 0.08]} material={MAT.door} />
      <mesh position={[w / 2 + 0.01, h * 0.6, 0]} geometry={GEO.box} scale={[0.05, 0.5, 0.5]} material={MAT.dark} />
    </group>
  );
}

function WildernessFarmhouse({ pos, rot, w, d }: { pos: [number, number, number]; rot: number; w: number; d: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.15, 0]} geometry={GEO.box} scale={[w + 0.4, 0.3, d + 0.4]} material={MAT.cobble} castShadow />
      <mesh position={[0, 1.5, 0]} geometry={GEO.box} scale={[w, 3, d]} material={MAT.daub} castShadow />
      <mesh position={[0, 1.5, d / 2 + 0.01]} geometry={GEO.box} scale={[w, 0.1, 0.06]} material={MAT.timber} />
      <mesh position={[0, 0.5, d / 2 + 0.01]} geometry={GEO.box} scale={[w, 0.1, 0.06]} material={MAT.timber} />
      <mesh position={[0, 3 + 0.9, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4} scale={[w * 0.7, 1.8, d * 0.7]} material={MAT.roofTile} castShadow />
      <mesh position={[0, 0.8, d / 2 + 0.01]} geometry={GEO.box} scale={[0.8, 1.5, 0.08]} material={MAT.door} />
      <mesh position={[w * 0.3, 4, -d * 0.3]} geometry={GEO.box} scale={[0.4, 1.2, 0.4]} material={MAT.stoneDark} castShadow />
      {[-1, 0, 1].map(i => (
        <mesh key={i} position={[w * 0.7 + 1, 0.3, i * 1.2]} geometry={GEO.box}
          scale={[0.06, 0.6, 0.06]} material={MAT.fence} castShadow />
      ))}
      <mesh position={[w * 0.7 + 1, 0.5, 0]} geometry={GEO.box} scale={[0.04, 0.04, 2.4]} material={MAT.fence} />
    </group>
  );
}

function WildernessRuin({ pos, rot, w, d }: { pos: [number, number, number]; rot: number; w: number; d: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.1, 0]} geometry={GEO.box} scale={[w + 0.2, 0.2, d + 0.2]} material={MAT.cobble} castShadow />
      <mesh position={[-w / 2, 0.8, 0]} geometry={GEO.box} scale={[0.3, 1.6, d * 0.8]} material={MAT.stoneRuin} castShadow />
      <mesh position={[0, 0.6, -d / 2]} geometry={GEO.box} scale={[w * 0.7, 1.2, 0.3]} material={MAT.stoneRuin} castShadow />
      <mesh position={[w * 0.3, 0.2, d * 0.3]} rotation={[0.3, 0.4, 0.5]} geometry={GEO.box}
        scale={[1.5, 0.8, 0.25]} material={MAT.stoneRuin} castShadow />
    </group>
  );
}

function WildernessShed({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.8, 0]} geometry={GEO.box} scale={[2, 1.6, 2.5]} material={MAT.woodWeathered} castShadow />
      <mesh position={[0, 1.6 + 0.5, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4} scale={[1.5, 1, 1.8]} material={MAT.roofThatch} castShadow />
      <mesh position={[0, 0.6, 1.26]} geometry={GEO.box} scale={[0.6, 1, 0.06]} material={MAT.door} />
      <mesh position={[1.5, 0.2, 0]} geometry={GEO.box} scale={[0.6, 0.4, 1]} material={MAT.woodDark} castShadow />
    </group>
  );
}

function WildernessOutpost({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 2, 0]} geometry={GEO.box} scale={[1.8, 4, 1.8]} material={MAT.woodDark} castShadow />
      <mesh position={[0, 4.2, 0]} geometry={GEO.box} scale={[2.5, 0.15, 2.5]} material={MAT.woodDark} castShadow />
      <mesh position={[0, 5, 0]} geometry={GEO.cone4} scale={[1.8, 1.2, 1.8]} material={MAT.roofSlate} castShadow />
      <mesh position={[0, 6, 0]} geometry={GEO.box} scale={[0.06, 1.5, 0.06]} material={MAT.timber} />
      <mesh position={[0.2, 5.8, 0]} geometry={GEO.box} scale={[0.4, 0.6, 0.02]} material={MAT.banner} />
    </group>
  );
}

function WildernessCamp({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.7, 0]} geometry={GEO.cone6} scale={[1.2, 1.4, 1.2]} material={MAT.tentRagged} castShadow />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.6 + 1.5, 0.06, Math.sin(a) * 0.6]}
          geometry={GEO.box} scale={[0.15, 0.12, 0.15]} material={MAT.stoneDark} castShadow />;
      })}
      <mesh position={[1.5, 0.15, 0]} geometry={GEO.box} scale={[0.1, 0.15, 0.1]} material={MAT.fire} />
      <mesh position={[-1.2, 0.05, 0.5]} geometry={GEO.box} scale={[0.5, 0.08, 1.2]} material={MAT.leather} />
    </group>
  );
}

function WildernessShrineHut({ pos, rot }: { pos: [number, number, number]; rot: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.1, 0]} geometry={GEO.box} scale={[2, 0.2, 2]} material={MAT.cobble} castShadow />
      <mesh position={[0, 0.8, 0]} geometry={GEO.box} scale={[0.5, 1.2, 0.3]} material={MAT.stoneWarm} castShadow />
      <mesh position={[0, 1.6, 0]} geometry={GEO.cone4} scale={[0.3, 0.4, 0.3]} material={MAT.stone} castShadow />
      {[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1, pz]} geometry={GEO.box} scale={[0.06, 2, 0.06]} material={MAT.timber} castShadow />
      ))}
      <mesh position={[0, 2.1, 0]} geometry={GEO.cone4} scale={[1.2, 0.8, 1.2]} material={MAT.roofThatch} castShadow />
    </group>
  );
}

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function WildernessStructures({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;

  return (
    <group>
      {WILDERNESS_BUILDINGS.map((b, i) => {
        if (playerPos) {
          const dx = playerPos.x - b.x;
          const dz = playerPos.z - b.z;
          if (dx * dx + dz * dz > 160 * 160) return null;
        }
        const y = getTerrainHeight(b.x, b.z);
        const pos: [number, number, number] = [b.x, y, b.z];

        switch (b.type) {
          case 'cottage': return <WildernessCottage key={i} pos={pos} rot={b.rot} w={b.w} d={b.d} />;
          case 'farmhouse': return <WildernessFarmhouse key={i} pos={pos} rot={b.rot} w={b.w} d={b.d} />;
          case 'ruin': return <WildernessRuin key={i} pos={pos} rot={b.rot} w={b.w} d={b.d} />;
          case 'shed': return <WildernessShed key={i} pos={pos} rot={b.rot} />;
          case 'outpost': return <WildernessOutpost key={i} pos={pos} rot={b.rot} />;
          case 'camp': return <WildernessCamp key={i} pos={pos} rot={b.rot} />;
          case 'shrine_hut': return <WildernessShrineHut key={i} pos={pos} rot={b.rot} />;
          default: return null;
        }
      })}
    </group>
  );
}
