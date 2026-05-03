/**
 * Settlement renderer — medieval architecture overhaul.
 * Each settlement type has distinct, layered architectural identity.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { SETTLEMENTS, SettlementDef } from '../world/RegionData';
import { GEO, MAT, seededRng } from '../world/SettlementPieces';
import { getTerrainHeight } from './Terrain';
import { sampleFootprint, WATER_LEVEL_Y } from '../systems/Grounding';

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

/** Terrain Y offset for a local position within a settlement group.
 * settleCx/Cz = world center of settlement, settleY = settlement group Y.
 * Returns the local Y offset needed to place an element at terrain height. */
function tY(localX: number, localZ: number, cx: number, cz: number, baseY: number): number {
  return getTerrainHeight(cx + localX, cz + localZ) - baseY;
}

// ========== ENHANCED BUILDING PRIMITIVES ==========

/** Medieval house with foundation, half-timber, roof overhang, door frame, windows */
function House({ pos, rot, w, d, h, style, chimney, shed }: {
  pos: [number, number, number]; rot: number; w: number; d: number; h: number;
  style: 'stone' | 'wood' | 'plaster' | 'ruin' | 'halftimber';
  chimney?: boolean; shed?: boolean;
}) {
  const isRuin = style === 'ruin';
  const isTimber = style === 'halftimber' || style === 'wood';
  const wallMat = style === 'stone' ? MAT.stoneWarm : isRuin ? MAT.stoneRuin
    : style === 'halftimber' ? MAT.daub : style === 'plaster' ? MAT.plaster : MAT.woodWeathered;
  const baseMat = isRuin ? MAT.stoneRuin : MAT.cobble;
  const roofMat = isRuin ? null : (isTimber ? MAT.roofThatch : MAT.roofTile);
  const roofH = isRuin ? 0 : Math.max(1.8, h * 0.7);
  const roofOverhang = 0.6;

  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Foundation */}
      <mesh position={[0, 0.2, 0]} geometry={GEO.box}
        scale={[w + 0.5, 0.4, d + 0.5]} material={baseMat}  />
      {/* Walls */}
      <mesh position={[0, h / 2 + 0.4, 0]} geometry={GEO.box}
        scale={[w, h, d]} material={wallMat}  />
      {/* Half-timber beams */}
      {isTimber && (
        <>
          <mesh position={[0, h + 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[w, 0.12, 0.06]} material={MAT.timber}  />
          <mesh position={[0, 0.5, d / 2 + 0.01]} geometry={GEO.box}
            scale={[w, 0.12, 0.06]} material={MAT.timber}  />
          <mesh position={[0, h * 0.5 + 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[w, 0.1, 0.06]} material={MAT.timber}  />
          {/* Vertical beams */}
          <mesh position={[-w / 2 + 0.01, h / 2 + 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[0.1, h, 0.06]} material={MAT.timber}  />
          <mesh position={[w / 2 - 0.01, h / 2 + 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[0.1, h, 0.06]} material={MAT.timber}  />
          <mesh position={[0, h / 2 + 0.4, d / 2 + 0.01]} geometry={GEO.box}
            scale={[0.1, h, 0.06]} material={MAT.timber}  />
          {/* Cross braces */}
          <mesh position={[-w / 4, h * 0.5 + 0.4, d / 2 + 0.02]} rotation={[0, 0, 0.6]} geometry={GEO.box}
            scale={[0.06, h * 0.4, 0.04]} material={MAT.timber} />
          <mesh position={[w / 4, h * 0.5 + 0.4, d / 2 + 0.02]} rotation={[0, 0, -0.6]} geometry={GEO.box}
            scale={[0.06, h * 0.4, 0.04]} material={MAT.timber} />
        </>
      )}
      {/* Roof with overhang */}
      {roofMat && (
        <>
          <mesh position={[0, h + 0.4 + roofH / 2, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4}
            scale={[(w + roofOverhang) * 0.72, roofH, (d + roofOverhang) * 0.72]} material={roofMat}  />
          {/* Ridge beam */}
          <mesh position={[0, h + 0.4 + roofH + 0.05, 0]} geometry={GEO.box}
            scale={[0.1, 0.1, d * 0.5]} material={MAT.timber} />
        </>
      )}
      {/* Door with frame */}
      <mesh position={[0, 0.3, d / 2 + 0.02]} geometry={GEO.box}
        scale={[1.1, 0.1, 0.12]} material={MAT.doorFrame}  />
      <mesh position={[-0.55, h * 0.35 + 0.4, d / 2 + 0.02]} geometry={GEO.box}
        scale={[0.1, h * 0.55, 0.1]} material={MAT.doorFrame}  />
      <mesh position={[0.55, h * 0.35 + 0.4, d / 2 + 0.02]} geometry={GEO.box}
        scale={[0.1, h * 0.55, 0.1]} material={MAT.doorFrame}  />
      <mesh position={[0, h * 0.35 + 0.4, d / 2 + 0.03]} geometry={GEO.box}
        scale={[0.9, h * 0.55, 0.06]} material={MAT.door}  />
      {/* Windows on sides */}
      {!isRuin && w > 3 && (
        <>
          <mesh position={[w / 2 + 0.02, h * 0.55 + 0.4, 0]} geometry={GEO.box}
            scale={[0.06, 0.5, 0.6]} material={MAT.dark} />
          <mesh position={[w / 2 + 0.03, h * 0.55 + 0.4, 0]} geometry={GEO.box}
            scale={[0.04, 0.55, 0.05]} material={MAT.timber} />
          <mesh position={[-w / 2 - 0.02, h * 0.55 + 0.4, 0]} geometry={GEO.box}
            scale={[0.06, 0.5, 0.6]} material={MAT.dark} />
          {/* Shutters */}
          <mesh position={[-w / 2 - 0.03, h * 0.55 + 0.4, -0.38]} geometry={GEO.box}
            scale={[0.04, 0.5, 0.2]} material={MAT.shutter}  />
        </>
      )}
      {/* Chimney */}
      {chimney && !isRuin && (
        <group position={[w * 0.3, h + roofH * 0.4, -d * 0.2]}>
          <mesh position={[0, 0.5, 0]} geometry={GEO.box}
            scale={[0.5, 1.2, 0.5]} material={MAT.stoneDark}  />
          <mesh position={[0, 1.15, 0]} geometry={GEO.box}
            scale={[0.6, 0.12, 0.6]} material={MAT.cobble}  />
        </group>
      )}
      {/* Lean-to shed */}
      {shed && !isRuin && (
        <group position={[-w / 2 - 0.8, 0, -d * 0.15]}>
          <mesh position={[0, 0.6, 0]} geometry={GEO.box}
            scale={[0.12, 1.2, 0.12]} material={MAT.timber}  />
          <mesh position={[0, 0.6, 1.2]} geometry={GEO.box}
            scale={[0.12, 1.2, 0.12]} material={MAT.timber}  />
          <mesh position={[-0.3, 1.1, 0.6]} rotation={[0, 0, 0.25]} geometry={GEO.box}
            scale={[1.2, 0.06, 1.6]} material={MAT.woodWeathered}  />
        </group>
      )}
    </group>
  );
}

/** Tower with tapered body, battlements or cone roof, arrow slits */
function Tower({ pos, h, r, roofStyle, mat }: {
  pos: [number, number, number]; h: number; r: number;
  roofStyle: 'cone' | 'flat' | 'battlement' | 'ruin';
  mat?: THREE.Material;
}) {
  const bodyMat = mat || MAT.stone;
  return (
    <group position={pos}>
      {/* Tapered body */}
      <mesh position={[0, h / 2, 0]} geometry={GEO.towerGeo}
        scale={[r, h, r]} material={bodyMat}  />
      {/* Base ring */}
      <mesh position={[0, 0.3, 0]} geometry={GEO.cyl12}
        scale={[r * 1.15, 0.6, r * 1.15]} material={MAT.cobble}  />
      {roofStyle === 'cone' && (
        <mesh position={[0, h + 1.8, 0]} geometry={GEO.cone8}
          scale={[r * 1.25, 3.5, r * 1.25]} material={MAT.roofSlate}  />
      )}
      {roofStyle === 'flat' && (
        <mesh position={[0, h + 0.25, 0]} geometry={GEO.cyl12}
          scale={[r * 1.2, 0.5, r * 1.2]} material={MAT.stoneDark}  />
      )}
      {roofStyle === 'battlement' && (
        <>
          <mesh position={[0, h + 0.15, 0]} geometry={GEO.cyl12}
            scale={[r * 1.15, 0.3, r * 1.15]} material={MAT.stoneDark}  />
          {/* Merlons */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = (i / 8) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * r * 1.05, h + 0.55, Math.sin(a) * r * 1.05]}
              geometry={GEO.box} scale={[0.4, 0.5, 0.3]} material={MAT.stone}  />;
          })}
        </>
      )}
      {roofStyle === 'ruin' && (
        <>
          {/* Broken top */}
          {[0, 2, 5].map(i => {
            const a = (i / 6) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * r * 0.7, h + 0.3, Math.sin(a) * r * 0.7]}
              geometry={GEO.box} scale={[0.5, 0.6 + i * 0.2, 0.4]} material={MAT.stoneRuin}  />;
          })}
        </>
      )}
      {/* Arrow slits */}
      {h > 6 && [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
        <mesh key={`slit${i}`}
          position={[Math.cos(a) * (r + 0.02), h * 0.6, Math.sin(a) * (r + 0.02)]}
          rotation={[0, a, 0]}
          geometry={GEO.box} scale={[0.15, 0.6, 0.08]} material={MAT.dark} />
      ))}
    </group>
  );
}

function Wall({ from, to, h, thickness, battlements, mat }: {
  from: [number, number, number]; to: [number, number, number];
  h: number; thickness: number; battlements?: boolean; mat?: THREE.Material;
}) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2 + h / 2;
  const cz = (from[2] + to[2]) / 2;
  const wallMat = mat || MAT.stone;

  return (
    <group>
      <mesh position={[cx, cy, cz]} rotation={[0, angle, 0]}
        geometry={GEO.box} scale={[thickness, h, len]} material={wallMat}  />
      {/* Wall base / plinth */}
      <mesh position={[cx, 0.2, cz]} rotation={[0, angle, 0]}
        geometry={GEO.box} scale={[thickness + 0.3, 0.4, len]} material={MAT.cobble}  />
      {/* Battlements */}
      {battlements && len > 3 && Array.from({ length: Math.floor(len / 2.5) }).map((_, i) => {
        const t = (i + 0.5) / Math.floor(len / 2.5);
        const mx = from[0] + dx * t;
        const mz = from[2] + dz * t;
        return (
          <mesh key={i} position={[mx, cy + h / 2 + 0.3, mz]} rotation={[0, angle, 0]}
            geometry={GEO.box} scale={[thickness + 0.15, 0.6, 1]} material={wallMat}  />
        );
      })}
    </group>
  );
}

/** Gatehouse — two towers connected by arch */
function Gatehouse({ pos, rot, w, h: height, towerR }: {
  pos: [number, number, number]; rot: number; w?: number; h?: number; towerR?: number;
}) {
  const gw = w || 5;
  const gh = height || 10;
  const tr = towerR || 1.5;
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Two flanking towers — radius matched to collision */}
      <Tower pos={[-gw / 2, 0, 0]} h={gh + 2} r={tr} roofStyle="cone" />
      <Tower pos={[gw / 2, 0, 0]} h={gh + 2} r={tr} roofStyle="cone" />
      {/* Connecting arch */}
      <mesh position={[0, gh - 1, 0]} geometry={GEO.box}
        scale={[gw + 1, 2.5, 3]} material={MAT.stone}  />
      {/* Archway (dark opening) */}
      <mesh position={[0, gh / 2 - 1.5, 0]} geometry={GEO.box}
        scale={[gw - tr * 2, gh - 3, 3.5]} material={MAT.dark} />
      {/* Portcullis grooves */}
      <mesh position={[-gw / 2 + tr * 0.6, gh / 2, 0]} geometry={GEO.box}
        scale={[0.15, gh - 2, 0.15]} material={MAT.iron} />
      <mesh position={[gw / 2 - tr * 0.6, gh / 2, 0]} geometry={GEO.box}
        scale={[0.15, gh - 2, 0.15]} material={MAT.iron} />
    </group>
  );
}

function Well({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.4, 0]} geometry={GEO.cyl8}
        scale={[0.8, 0.8, 0.8]} material={MAT.cobble}  />
      {/* Posts */}
      <mesh position={[-0.35, 1.3, 0]} geometry={GEO.box}
        scale={[0.1, 1.8, 0.1]} material={MAT.timber}  />
      <mesh position={[0.35, 1.3, 0]} geometry={GEO.box}
        scale={[0.1, 1.8, 0.1]} material={MAT.timber}  />
      {/* Crossbar + bucket */}
      <mesh position={[0, 2.2, 0]} geometry={GEO.box}
        scale={[0.9, 0.08, 0.08]} material={MAT.timber}  />
      <mesh position={[0.1, 1.5, 0]} geometry={GEO.box}
        scale={[0.01, 0.7, 0.01]} material={MAT.iron} />
      <mesh position={[0.1, 1.1, 0]} geometry={GEO.cyl8}
        scale={[0.12, 0.15, 0.12]} material={MAT.barrel}  />
    </group>
  );
}

function MarketStall({ pos, rot, goods }: {
  pos: [number, number, number]; rot: number; goods?: 'crates' | 'cloth' | 'food';
}) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Posts */}
      <mesh position={[-0.9, 1.2, -0.5]} geometry={GEO.box}
        scale={[0.1, 2.4, 0.1]} material={MAT.timber}  />
      <mesh position={[0.9, 1.2, -0.5]} geometry={GEO.box}
        scale={[0.1, 2.4, 0.1]} material={MAT.timber}  />
      <mesh position={[-0.9, 0.8, 0.5]} geometry={GEO.box}
        scale={[0.1, 1.6, 0.1]} material={MAT.timber}  />
      <mesh position={[0.9, 0.8, 0.5]} geometry={GEO.box}
        scale={[0.1, 1.6, 0.1]} material={MAT.timber}  />
      {/* Counter */}
      <mesh position={[0, 0.9, 0]} geometry={GEO.box}
        scale={[2, 0.1, 1.2]} material={MAT.woodLight}  />
      {/* Awning */}
      <mesh position={[0, 2.3, 0]} rotation={[0.15, 0, 0]} geometry={GEO.box}
        scale={[2.2, 0.05, 1.6]} material={MAT.tent}  />
      {/* Goods */}
      {goods === 'crates' && [[-0.4, 0], [0.3, 0.2]].map(([gx, gz], i) => (
        <mesh key={i} position={[gx, 1.05, gz]} geometry={GEO.box}
          scale={[0.3, 0.25, 0.3]} material={MAT.barrel}  />
      ))}
      {goods === 'cloth' && (
        <mesh position={[0, 1.05, 0]} geometry={GEO.box}
          scale={[1.2, 0.15, 0.8]} material={MAT.cloth}  />
      )}
    </group>
  );
}

function Campfire({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i / 8) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5]}
          geometry={GEO.box} scale={[0.2, 0.18, 0.2]} material={MAT.stoneDark}  />;
      })}
      <mesh position={[0, 0.35, 0]} geometry={GEO.box}
        scale={[0.2, 0.4, 0.2]} material={MAT.fire} />
      <mesh position={[0.08, 0.5, -0.05]} geometry={GEO.box}
        scale={[0.1, 0.25, 0.1]} material={MAT.fireGlow} />
      {/* Log seats */}
      <mesh position={[-1, 0.15, 0.3]} rotation={[0, 0.4, 0]} geometry={GEO.cyl6}
        scale={[0.15, 0.8, 0.15]} material={MAT.woodDark}  />
      <mesh position={[0.8, 0.15, -0.5]} rotation={[0, -0.3, 0]} geometry={GEO.cyl6}
        scale={[0.15, 0.7, 0.15]} material={MAT.woodDark}  />
    </group>
  );
}

function Fence({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2, cz = (from[2] + to[2]) / 2;
  const cy = (from[1] + to[1]) / 2;
  const postCount = Math.max(2, Math.floor(len / 2));
  return (
    <group>
      {/* Rails */}
      <group position={[cx, cy, cz]} rotation={[0, angle, 0]}>
        <mesh position={[0, 0.4, 0]} geometry={GEO.box}
          scale={[0.06, 0.06, len]} material={MAT.fence}  />
        <mesh position={[0, 0.75, 0]} geometry={GEO.box}
          scale={[0.05, 0.05, len]} material={MAT.fence}  />
      </group>
      {/* Posts */}
      {Array.from({ length: postCount }).map((_, i) => {
        const t = i / (postCount - 1);
        return <mesh key={i}
          position={[from[0] + dx * t, cy + 0.45, from[2] + dz * t]}
          geometry={GEO.box} scale={[0.08, 0.9, 0.08]}
          material={MAT.fence}  />;
      })}
    </group>
  );
}

function CropField({ pos, w, d }: { pos: [number, number, number]; w: number; d: number }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.02, 0]} geometry={GEO.box}
        scale={[w, 0.04, d]} material={MAT.crop} />
      {Array.from({ length: Math.floor(w / 1.2) }).map((_, i) => (
        <mesh key={i} position={[-w / 2 + 0.6 + i * 1.2, 0.3, 0]}
          geometry={GEO.box} scale={[0.06, 0.5, d * 0.9]} material={MAT.cropGold}  />
      ))}
    </group>
  );
}

function Palisade({ center, radius, segments, h, gateAngle }: {
  center: [number, number, number]; radius: number; segments: number; h: number; gateAngle: number;
}) {
  const posts: JSX.Element[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const angleDiff = Math.abs(((a - gateAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (angleDiff < 0.3) continue;
    const x = center[0] + Math.cos(a) * radius;
    const z = center[2] + Math.sin(a) * radius;
    posts.push(
      <group key={i}>
        <mesh position={[x, center[1] + h / 2, z]} rotation={[0, -a, 0]}
          geometry={GEO.box} scale={[0.3, h, 0.7]} material={MAT.palisade}  />
        {/* Sharpened top */}
        <mesh position={[x, center[1] + h + 0.2, z]} rotation={[0, -a, 0]}
          geometry={GEO.cone4} scale={[0.15, 0.5, 0.15]} material={MAT.palisadeSharp} />
      </group>
    );
  }
  return <>{posts}</>;
}

/** Barrels cluster */
function Barrels({ pos, count }: { pos: [number, number, number]; count: number }) {
  return (
    <group position={pos}>
      {Array.from({ length: count }).map((_, i) => {
        const x = (i % 2) * 0.6 - 0.3;
        const z = Math.floor(i / 2) * 0.6 - 0.3;
        const fallen = i === count - 1 && count > 2;
        return <mesh key={i}
          position={fallen ? [x + 0.3, 0.2, z] : [x, 0.35, z]}
          rotation={fallen ? [0, 0, Math.PI / 2] : [0, 0, 0]}
          geometry={GEO.cyl8} scale={[0.2, 0.5, 0.2]}
          material={MAT.barrel}  />;
      })}
    </group>
  );
}

/** Crate stack */
function Crates({ pos, count }: { pos: [number, number, number]; count: number }) {
  return (
    <group position={pos}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i}
          position={[(i % 2) * 0.55 - 0.25, 0.25 + Math.floor(i / 3) * 0.45, Math.floor((i % 3) / 2) * 0.5 - 0.2]}
          rotation={[0, i * 0.3, 0]}
          geometry={GEO.box} scale={[0.45, 0.45, 0.45]}
          material={MAT.woodDark}  />
      ))}
    </group>
  );
}

/** Training dummy */
function TrainingDummy({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.8, 0]} geometry={GEO.box}
        scale={[0.12, 1.6, 0.12]} material={MAT.timber}  />
      <mesh position={[0, 1.2, 0]} geometry={GEO.box}
        scale={[0.8, 0.12, 0.12]} material={MAT.timber}  />
      <mesh position={[0, 1.3, 0]} geometry={GEO.box}
        scale={[0.4, 0.5, 0.15]} material={MAT.hay}  />
      <mesh position={[0, 1.75, 0]} geometry={GEO.cyl8}
        scale={[0.15, 0.25, 0.15]} material={MAT.hay}  />
    </group>
  );
}

/** Banner on pole */
function Banner({ pos, color }: { pos: [number, number, number]; color?: THREE.Material }) {
  return (
    <group position={pos}>
      <mesh position={[0, 2.5, 0]} geometry={GEO.box}
        scale={[0.08, 5, 0.08]} material={MAT.timber}  />
      <mesh position={[0.4, 4.2, 0]} geometry={GEO.box}
        scale={[0.7, 1.1, 0.03]} material={color || MAT.banner}  />
    </group>
  );
}

/** Brazier — iron basket with fire */
function Brazier({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.6, 0]} geometry={GEO.box}
        scale={[0.12, 1.2, 0.12]} material={MAT.iron}  />
      <mesh position={[0, 1.3, 0]} geometry={GEO.box}
        scale={[0.4, 0.35, 0.4]} material={MAT.iron}  />
      <mesh position={[0, 1.55, 0]} geometry={GEO.box}
        scale={[0.2, 0.2, 0.2]} material={MAT.fire} />
    </group>
  );
}

// ========== SETTLEMENT BUILDERS ==========

function CapitalCity({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to lowest corner of the ±35 outer ring so the capital base never
  // floats. Floor-clamped above water level so kingdoms placed near water
  // never visually submerge.
  const fp = sampleFootprint(cx, cz, 35, 35, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);
  const rng = seededRng(7777);

  const houses = useMemo(() => {
    const arr: { pos: [number, number]; rot: number; w: number; d: number; h: number;
      style: 'stone' | 'plaster' | 'halftimber'; chimney: boolean; shed: boolean }[] = [];
    // Outer ring — larger buildings, more varied
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const r = 20 + rng() * 10;
      const rot = angle + Math.PI + (rng() - 0.5) * 0.4;
      const w = 4 + rng() * 2.5, d = 4.5 + rng() * 2.5, h = 3 + rng() * 1.5;
      // Always consume 2 rng() calls for style to keep RNG sync with collision
      const s1 = rng(), s2 = rng();
      const style: 'stone' | 'plaster' | 'halftimber' = s1 > 0.5 ? 'stone' : (s2 > 0.3 ? 'halftimber' : 'plaster');
      arr.push({
        pos: [Math.cos(angle) * r, Math.sin(angle) * r],
        rot, w, d, h, style,
        chimney: rng() > 0.5, shed: rng() > 0.6,
      });
    }
    // Inner buildings — administrative, stone
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const r = 10 + rng() * 4;
      const w = 3.5 + rng() * 1.5, d = 4 + rng() * 1.5;
      const h = 3.5 + rng() * 1;
      // No rng() for style (hardcoded 'stone'), no shed
      arr.push({
        pos: [Math.cos(angle) * r, Math.sin(angle) * r],
        rot: angle + Math.PI, w, d, h, style: 'stone',
        chimney: rng() > 0.4, shed: false,
      });
    }
    return arr;
  }, []);

  return (
    <group position={[cx, y, cz]}>
      {/* === CENTRAL KEEP — layered fortress === */}
      {/* Keep base platform */}
      <mesh position={[0, 1, 0]} geometry={GEO.box}
        scale={[16, 2, 16]} material={MAT.cobble}  />
      {/* Keep main body */}
      <mesh position={[0, 8, 0]} geometry={GEO.box}
        scale={[12, 12, 12]} material={MAT.stone}  />
      {/* Keep upper section — slightly narrower */}
      <mesh position={[0, 15.5, 0]} geometry={GEO.box}
        scale={[10, 3, 10]} material={MAT.stoneLight}  />
      {/* Battlements on keep */}
      {[-4.5, -1.5, 1.5, 4.5].map((x, i) =>
        [-5, 5].map((z, j) => (
          <mesh key={`kb${i}${j}`} position={[x, 17.3, z]} geometry={GEO.box}
            scale={[1.2, 0.8, 0.6]} material={MAT.stone}  />
        ))
      )}
      {[-5, 5].map((x, i) =>
        [-4.5, -1.5, 1.5, 4.5].map((z, j) => (
          <mesh key={`kbs${i}${j}`} position={[x, 17.3, z]} geometry={GEO.box}
            scale={[0.6, 0.8, 1.2]} material={MAT.stone}  />
        ))
      )}
      {/* Keep roof */}
      <mesh position={[0, 18.5, 0]} geometry={GEO.cone4}
        scale={[8, 5, 8]} material={MAT.roofSlate}  />
      {/* Banner pole on keep */}
      <mesh position={[0, 22, 0]} geometry={GEO.box}
        scale={[0.1, 4, 0.1]} material={MAT.timber}  />
      <mesh position={[0.5, 23, 0]} geometry={GEO.box}
        scale={[0.8, 1.4, 0.04]} material={MAT.banner}  />
      {/* Keep windows */}
      {[[-6.01, 8], [-6.01, 12], [6.01, 8], [6.01, 12]].map(([x, yy], i) => (
        <mesh key={`kw${i}`} position={[x, yy, 0]} geometry={GEO.box}
          scale={[0.15, 1.2, 0.5]} material={MAT.dark} />
      ))}
      {/* Buttresses */}
      {[[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([bx, bz], i) => (
        <mesh key={`but${i}`} position={[bx, 4, bz]} rotation={[0, Math.atan2(bx, bz), 0]}
          geometry={GEO.box} scale={[2.5, 8, 1.5]} material={MAT.stoneDark}  />
      ))}

      {/* === WALLS — with battlements === */}
      <Wall from={[-38, 0, -38]} to={[38, 0, -38]} h={8} thickness={2.5} battlements />
      <Wall from={[38, 0, -38]} to={[38, 0, 38]} h={8} thickness={2.5} battlements />
      <Wall from={[38, 0, 38]} to={[5.5, 0, 38]} h={8} thickness={2.5} battlements />
      <Wall from={[-5.5, 0, 38]} to={[-38, 0, 38]} h={8} thickness={2.5} battlements />
      <Wall from={[-38, 0, 38]} to={[-38, 0, -38]} h={8} thickness={2.5} battlements />

      {/* === GATEHOUSE — towers r=1.5 at ±4, visual gap=5, collision gap=5 === */}
      <Gatehouse pos={[0, 0, 38]} rot={0} w={8} h={11} towerR={1.5} />

      {/* === CORNER TOWERS — varied heights === */}
      <Tower pos={[-38, 0, -38]} h={14} r={3.2} roofStyle="cone" />
      <Tower pos={[38, 0, -38]} h={13} r={3} roofStyle="battlement" />
      <Tower pos={[38, 0, 38]} h={12} r={3} roofStyle="cone" />
      <Tower pos={[-38, 0, 38]} h={13.5} r={3.2} roofStyle="battlement" />
      {/* Mid-wall towers */}
      <Tower pos={[0, 0, -38]} h={10} r={2.5} roofStyle="flat" />
      <Tower pos={[38, 0, 0]} h={10} r={2.5} roofStyle="flat" />
      <Tower pos={[-38, 0, 0]} h={10} r={2.5} roofStyle="flat" />

      {/* === HOUSES === */}
      {houses.map((h, i) => {
        const hy = getTerrainHeight(cx + h.pos[0], cz + h.pos[1]) - y;
        return <House key={i} pos={[h.pos[0], hy, h.pos[1]]} rot={h.rot}
          w={h.w} d={h.d} h={h.h} style={h.style} chimney={h.chimney} shed={h.shed} />;
      })}

      {/* === CHAPEL === */}
      <group position={[-15, 0, -8]}>
        <mesh position={[0, 3.5, 0]} geometry={GEO.box}
          scale={[5, 7, 8]} material={MAT.stoneLight}  />
        <mesh position={[0, 8.5, 0]} geometry={GEO.cone4}
          scale={[3.5, 4, 6]} material={MAT.roofSlate}  />
        {/* Bell tower */}
        <mesh position={[0, 8, -4.5]} geometry={GEO.box}
          scale={[2, 5, 2]} material={MAT.stoneLight}  />
        <mesh position={[0, 11.5, -4.5]} geometry={GEO.cone4}
          scale={[1.5, 2, 1.5]} material={MAT.roofSlate}  />
        {/* Arched window */}
        <mesh position={[0, 4.5, 4.01]} geometry={GEO.box}
          scale={[1, 2, 0.1]} material={MAT.dark} />
      </group>

      {/* === MARKET DISTRICT === */}
      <mesh position={[8, 0.06, 14]} geometry={GEO.box}
        scale={[18, 0.12, 12]} material={MAT.cobble} />
      <MarketStall pos={[4, 0, 12]} rot={0} goods="crates" />
      <MarketStall pos={[9, 0, 12]} rot={0.2} goods="cloth" />
      <MarketStall pos={[14, 0, 14]} rot={-0.3} goods="food" />
      <Well pos={[8, 0, 18]} />

      {/* === BARRACKS === */}
      <group position={[22, 0, -15]}>
        <House pos={[0, 0, 0]} rot={0} w={7} d={5} h={3} style="stone" chimney />
        <House pos={[0, 0, -8]} rot={0} w={7} d={4} h={2.8} style="stone" />
        <TrainingDummy pos={[6, 0, -3]} />
        <TrainingDummy pos={[8, 0, -5]} />
        {/* Weapon rack */}
        <mesh position={[5, 0.8, 0]} geometry={GEO.box}
          scale={[0.1, 1.6, 1.5]} material={MAT.timber}  />
      </group>

      {/* === STABLES === */}
      <group position={[25, 0, 12]}>
        <House pos={[0, 0, 0]} rot={1.5} w={6} d={4.5} h={2.5} style="wood" />
        <Fence from={[-4, 0, -3]} to={[4, 0, -3]} />
        <Fence from={[4, 0, -3]} to={[4, 0, 3]} />
      </group>

      {/* === PROPS AND DETAILS === */}
      <Barrels pos={[12, 0, 20]} count={4} />
      <Crates pos={[-20, 0, 15]} count={3} />
      <Banner pos={[3, 0, 35]} color={MAT.banner} />
      <Banner pos={[-3, 0, 35]} color={MAT.bannerGold} />
      <Brazier pos={[6, 0, 36]} />
      <Brazier pos={[-6, 0, 36]} />
      <Barrels pos={[-18, 0, 8]} count={3} />

      {/* Gate approach road */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`groad${i}`} position={[0, 0.04, 38 + 2 + i * 2.5]}
          geometry={GEO.box} scale={[4, 0.08, 2]} material={MAT.cobble} />
      ))}

      {/* Smithy area */}
      <group position={[-22, 0, 10]}>
        <mesh position={[0, 1, 0]} geometry={GEO.box}
          scale={[3, 2, 2.5]} material={MAT.stoneDark}  />
        <mesh position={[0, 2.3, 0]} geometry={GEO.box}
          scale={[0.4, 0.8, 0.4]} material={MAT.stoneDark}  />
        <mesh position={[1.8, 0.5, 0]} geometry={GEO.box}
          scale={[0.3, 1, 0.3]} material={MAT.timber}  />
        <mesh position={[1.8, 1.1, 0]} geometry={GEO.box}
          scale={[0.8, 0.08, 0.5]} material={MAT.iron}  />
      </group>

      {/* Storage yard */}
      <Crates pos={[30, 0, 0]} count={5} />
      <Barrels pos={[28, 0, -3]} count={3} />

      {/* === NOBLE QUARTER — guard posts and authority === */}
      {/* Guard post near gate */}
      <group position={[8, 0, 32]}>
        <mesh position={[0, 0.8, 0]} geometry={GEO.box}
          scale={[0.12, 1.6, 0.12]} material={MAT.timber}  />
        <mesh position={[0, 1.8, 0]} geometry={GEO.box}
          scale={[0.3, 0.25, 0.3]} material={MAT.iron}  />
        <mesh position={[0, 2, 0]} geometry={GEO.box}
          scale={[0.12, 0.12, 0.12]} material={MAT.lantern} />
      </group>
      <group position={[-8, 0, 32]}>
        <mesh position={[0, 0.8, 0]} geometry={GEO.box}
          scale={[0.12, 1.6, 0.12]} material={MAT.timber}  />
        <mesh position={[0, 1.8, 0]} geometry={GEO.box}
          scale={[0.3, 0.25, 0.3]} material={MAT.iron}  />
        <mesh position={[0, 2, 0]} geometry={GEO.box}
          scale={[0.12, 0.12, 0.12]} material={MAT.lantern} />
      </group>

      {/* Noble district paving */}
      <mesh position={[0, 0.05, 24]} geometry={GEO.box}
        scale={[14, 0.1, 10]} material={MAT.cobble} />

      {/* Statue / memorial in noble quarter */}
      <group position={[0, 0, 25]}>
        <mesh position={[0, 0.3, 0]} geometry={GEO.box}
          scale={[1.5, 0.6, 1.5]} material={MAT.stoneLight}  />
        <mesh position={[0, 1, 0]} geometry={GEO.box}
          scale={[0.8, 0.4, 0.8]} material={MAT.stoneLight}  />
        <mesh position={[0, 2, 0]} geometry={GEO.box}
          scale={[0.4, 1.6, 0.3]} material={MAT.stoneDark}  />
        <mesh position={[0, 2.6, 0.15]} geometry={GEO.box}
          scale={[0.6, 0.08, 0.06]} material={MAT.iron}  />
      </group>

      {/* Hanging lanterns along main street */}
      {[-15, -5, 5, 15].map((lx, i) => (
        <group key={`sl${i}`} position={[lx, 0, 20]}>
          <mesh position={[0, 2.5, 0]} geometry={GEO.box}
            scale={[0.06, 0.08, 0.06]} material={MAT.iron} />
          <mesh position={[0, 2.3, 0]} geometry={GEO.box}
            scale={[0.15, 0.22, 0.15]} material={MAT.iron}  />
          <mesh position={[0, 2.3, 0]} geometry={GEO.box}
            scale={[0.06, 0.1, 0.06]} material={MAT.lantern} />
        </group>
      ))}

      {/* Water trough near stables */}
      <group position={[22, 0, 8]}>
        <mesh position={[0, 0.3, 0]} geometry={GEO.box}
          scale={[2, 0.6, 0.6]} material={MAT.woodDark}  />
        <mesh position={[0, 0.35, 0]} geometry={GEO.box}
          scale={[1.8, 0.3, 0.4]} material={MAT.water} />
      </group>
    </group>
  );
}

function FarmingVillage({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const fp = sampleFootprint(cx, cz, 25, 25, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);
  const rng = seededRng(3333);

  return (
    <group position={[cx, y, cz]}>
      {/* Houses — organic cluster */}
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2 + rng() * 0.5;
        const r = 8 + rng() * 14;
        const hx = Math.cos(angle) * r, hz = Math.sin(angle) * r;
        const hy = getTerrainHeight(cx + hx, cz + hz) - y;
        const isLarger = i < 3;
        return <House key={i} pos={[hx, hy, hz]}
          rot={angle + Math.PI + rng() * 0.6}
          w={isLarger ? 4.5 + rng() : 3 + rng() * 1.5}
          d={isLarger ? 5 + rng() : 3.5 + rng() * 1.5}
          h={isLarger ? 3 + rng() * 0.5 : 2.5 + rng() * 0.5}
          style={rng() > 0.4 ? 'halftimber' : 'wood'}
          chimney={rng() > 0.4} shed={rng() > 0.5} />;
      })}

      {/* Barn — larger structure */}
      <House pos={[14, 0, 6]} rot={0.5} w={7} d={9} h={4} style="wood" chimney={false} />

      {/* Village center */}
      <mesh position={[0, 0.04, 0]} geometry={GEO.box}
        scale={[8, 0.08, 8]} material={MAT.cobble} />
      <Well pos={[0, 0, 0]} />

      {/* Windmill */}
      <group position={[-18, 0, -20]}>
        <mesh position={[0, 4, 0]} geometry={GEO.cyl8}
          scale={[2.5, 8, 2.5]} material={MAT.stoneWarm}  />
        <mesh position={[0, 9.5, 0]} geometry={GEO.cone8}
          scale={[2.8, 3, 2.8]} material={MAT.roofThatch}  />
        {/* Sails */}
        <mesh position={[0, 7, 2.6]} geometry={GEO.box}
          scale={[0.1, 6, 0.4]} material={MAT.woodLight}  />
        <mesh position={[0, 7, 2.6]} geometry={GEO.box}
          scale={[6, 0.1, 0.4]} material={MAT.woodLight}  />
        <mesh position={[0, 7, 2.5]} geometry={GEO.box}
          scale={[0.2, 0.2, 0.2]} material={MAT.timber}  />
      </group>

      {/* Crop fields */}
      <CropField pos={[-22, 0, -8]} w={12} d={8} />
      <CropField pos={[-8, 0, -22]} w={10} d={6} />
      <CropField pos={[18, 0, -16]} w={8} d={10} />

      {/* Fences around fields */}
      <Fence from={[-28, 0, -12]} to={[-16, 0, -12]} />
      <Fence from={[-28, 0, -4]} to={[-16, 0, -4]} />
      <Fence from={[-28, 0, -12]} to={[-28, 0, -4]} />

      {/* Hay bales */}
      {[[-5, 10], [8, -5], [-12, 5], [3, 8]].map(([hx, hz], i) => (
        <mesh key={`hay${i}`} position={[hx, 0.35, hz]} geometry={GEO.cyl8}
          scale={[0.6, 0.7, 0.6]} material={MAT.hay}  />
      ))}

      {/* Cart */}
      <group position={[6, 0, 4]}>
        <mesh position={[0, 0.5, 0]} geometry={GEO.box}
          scale={[1.4, 0.5, 2.5]} material={MAT.woodDark}  />
        <mesh position={[-0.75, 0.35, -1.4]} geometry={GEO.box}
          scale={[0.06, 0.06, 1.2]} material={MAT.woodDark}  />
        <mesh position={[0.75, 0.35, -1.4]} geometry={GEO.box}
          scale={[0.06, 0.06, 1.2]} material={MAT.woodDark}  />
        {/* Wheel indicators */}
        <mesh position={[-0.75, 0.35, 0.6]} geometry={GEO.cyl8}
          scale={[0.3, 0.06, 0.3]} material={MAT.timber}  />
        <mesh position={[0.75, 0.35, 0.6]} geometry={GEO.cyl8}
          scale={[0.3, 0.06, 0.3]} material={MAT.timber}  />
      </group>

      {/* Animal pen */}
      <Fence from={[18, 0, 5]} to={[24, 0, 5]} />
      <Fence from={[24, 0, 5]} to={[24, 0, 11]} />
      <Fence from={[24, 0, 11]} to={[18, 0, 11]} />
      <Fence from={[18, 0, 11]} to={[18, 0, 7]} />

      {/* Woodpile */}
      <mesh position={[10, 0.3, 14]} geometry={GEO.box}
        scale={[2, 0.6, 0.8]} material={MAT.timber}  />
      <mesh position={[10, 0.75, 14]} geometry={GEO.box}
        scale={[1.6, 0.4, 0.7]} material={MAT.woodDark}  />

      <Barrels pos={[-4, 0, 6]} count={3} />

      {/* === VILLAGE LIFE PROPS === */}
      {/* Clothesline */}
      <group position={[-10, 0, 8]}>
        <mesh position={[0, 1, 0]} geometry={GEO.box}
          scale={[0.08, 2, 0.08]} material={MAT.timber}  />
        <mesh position={[3, 1, 0]} geometry={GEO.box}
          scale={[0.08, 2, 0.08]} material={MAT.timber}  />
        <mesh position={[1.5, 1.9, 0]} geometry={GEO.box}
          scale={[3.2, 0.02, 0.02]} material={MAT.rope} />
        {[0.5, 1.5, 2.5].map((cx, i) => (
          <mesh key={`cl${i}`} position={[cx, 1.5, 0.02]} geometry={GEO.box}
            scale={[0.4, 0.5, 0.02]} material={i % 2 === 0 ? MAT.cloth : MAT.plaster}  />
        ))}
      </group>

      {/* Water trough */}
      <group position={[20, 0, 8]}>
        <mesh position={[0, 0.25, 0]} geometry={GEO.box}
          scale={[1.5, 0.5, 0.5]} material={MAT.woodDark}  />
        <mesh position={[0, 0.3, 0]} geometry={GEO.box}
          scale={[1.3, 0.25, 0.3]} material={MAT.water} />
      </group>

      {/* Chicken coop / small shed */}
      <group position={[14, 0, -10]}>
        <mesh position={[0, 0.4, 0]} geometry={GEO.box}
          scale={[1.5, 0.8, 1]} material={MAT.woodWeathered}  />
        <mesh position={[0, 0.95, 0]} geometry={GEO.cone4}
          scale={[1.1, 0.5, 0.8]} material={MAT.roofThatch}  />
      </group>

      {/* More hay bales scattered */}
      <mesh position={[-8, 0.25, -6]} geometry={GEO.cyl8}
        scale={[0.5, 0.5, 0.5]} material={MAT.hay}  />
      <mesh position={[12, 0.25, 10]} geometry={GEO.cyl8}
        scale={[0.4, 0.5, 0.4]} material={MAT.hay}  />
    </group>
  );
}

function MilitaryFort({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to lowest corner of the ±20 wall perimeter.
  const fp = sampleFootprint(cx, cz, 22, 22, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Round 4.1 cleanup: visible packed-earth podium under the fort.
          Blackthorn's macro minY is -0.54m; the pad grounds the wall ring
          to the surrounding terrain so it doesn't appear to float after
          the floor-clamp lifts the anchor to WATER_LEVEL_Y+0.3. */}
      <mesh position={[0, -0.4, 0]} geometry={GEO.box}
        scale={[46, 1.2, 46]} material={MAT.cobble} />
      {/* Stone wall perimeter — square fort */}
      <Wall from={[-20, 0, -20]} to={[20, 0, -20]} h={5} thickness={1.8} battlements />
      <Wall from={[20, 0, -20]} to={[20, 0, 20]} h={5} thickness={1.8} battlements />
      <Wall from={[20, 0, 20]} to={[5, 0, 20]} h={5} thickness={1.8} battlements />
      <Wall from={[-5, 0, 20]} to={[-20, 0, 20]} h={5} thickness={1.8} battlements />
      <Wall from={[-20, 0, 20]} to={[-20, 0, -20]} h={5} thickness={1.8} battlements />

      {/* Corner towers */}
      <Tower pos={[-20, 0, -20]} h={9} r={2.2} roofStyle="battlement" />
      <Tower pos={[20, 0, -20]} h={9} r={2.2} roofStyle="battlement" />
      <Tower pos={[20, 0, 20]} h={9} r={2.2} roofStyle="flat" />
      <Tower pos={[-20, 0, 20]} h={9} r={2.2} roofStyle="flat" />

      {/* Gate — towers r=1.5 at ±3.5, visual gap=4, collision gap=4 */}
      <Gatehouse pos={[0, 0, 20]} rot={0} w={7} h={8} towerR={1.5} />

      {/* Command building */}
      <House pos={[0, 0, -8]} rot={0} w={8} d={7} h={4} style="stone" chimney />

      {/* Barracks */}
      <House pos={[-10, 0, 3]} rot={0.1} w={6} d={5} h={3} style="stone" />
      <House pos={[10, 0, 3]} rot={-0.1} w={5} d={5} h={3} style="stone" />

      {/* Armory */}
      <House pos={[-10, 0, -10]} rot={0} w={4} d={4} h={2.8} style="stone" />
      {/* Weapon racks */}
      <mesh position={[-6, 0.9, -10]} geometry={GEO.box}
        scale={[0.1, 1.8, 2]} material={MAT.timber}  />

      {/* Training yard */}
      <mesh position={[8, 0.04, -12]} geometry={GEO.box}
        scale={[10, 0.08, 8]} material={MAT.cobble} />
      <TrainingDummy pos={[5, 0, -11]} />
      <TrainingDummy pos={[8, 0, -13]} />
      <TrainingDummy pos={[11, 0, -11]} />

      {/* Beacon tower */}
      <Tower pos={[0, 0, -18]} h={16} r={2.5} roofStyle="flat" />
      <Brazier pos={[0, 16, -18]} />

      {/* Supply area */}
      <Crates pos={[14, 0, 10]} count={4} />
      <Barrels pos={[16, 0, 8]} count={3} />
      <Crates pos={[-14, 0, 15]} count={3} />

      {/* Campfires */}
      <Campfire pos={[-5, 0, 10]} />
      <Campfire pos={[5, 0, -5]} />

      {/* Banners */}
      <Banner pos={[2, 0, 20]} />
      <Banner pos={[-2, 0, 20]} color={MAT.bannerBlue} />

      {/* Gate approach road */}
      {[0, 1, 2].map(i => (
        <mesh key={`froad${i}`} position={[0, 0.04, 20 + 2 + i * 2.5]}
          geometry={GEO.box} scale={[3.5, 0.08, 2]} material={MAT.cobble} />
      ))}

      {/* Stables */}
      <group position={[-14, 0, 10]}>
        <mesh position={[0, 1.2, 0]} geometry={GEO.box}
          scale={[4, 2.4, 3]} material={MAT.woodWeathered}  />
        <mesh position={[0, 2.7, 0]} geometry={GEO.cone4}
          scale={[3, 1.5, 2.5]} material={MAT.roofThatch}  />
      </group>

      {/* === MILITARY CHARACTER — siege equipment and defenses === */}
      {/* Ballista / siege engine */}
      <group position={[12, 0, -16]}>
        <mesh position={[0, 0.3, 0]} geometry={GEO.box}
          scale={[1.5, 0.3, 2]} material={MAT.woodDark}  />
        <mesh position={[0, 0.6, -0.8]} geometry={GEO.box}
          scale={[0.12, 0.5, 0.12]} material={MAT.timber}  />
        <mesh position={[0, 0.6, 0.8]} geometry={GEO.box}
          scale={[0.12, 0.5, 0.12]} material={MAT.timber}  />
        <mesh position={[0, 0.9, 0]} rotation={[0.3, 0, 0]} geometry={GEO.box}
          scale={[0.08, 0.08, 2.5]} material={MAT.timber}  />
      </group>

      {/* Defensive stakes outside south wall */}
      {[-8, -4, 4, 8].map((sx, i) => (
        <group key={`stake${i}`} position={[sx, 0, 23]} rotation={[0.3, 0, 0]}>
          <mesh position={[0, 0.5, 0]} geometry={GEO.box}
            scale={[0.08, 1, 0.08]} material={MAT.palisadeSharp}  />
          <mesh position={[0, 1.1, 0]} geometry={GEO.cone4}
            scale={[0.06, 0.3, 0.06]} material={MAT.palisadeSharp} />
        </group>
      ))}

      {/* Supply wagon */}
      <group position={[15, 0, 14]}>
        <mesh position={[0, 0.4, 0]} geometry={GEO.box}
          scale={[1.2, 0.4, 2.2]} material={MAT.woodDark}  />
        <mesh position={[-0.65, 0.3, 0.5]} geometry={GEO.cyl8}
          scale={[0.25, 0.06, 0.25]} material={MAT.timber}  />
        <mesh position={[0.65, 0.3, 0.5]} geometry={GEO.cyl8}
          scale={[0.25, 0.06, 0.25]} material={MAT.timber}  />
      </group>

      {/* Watch fires */}
      <Campfire pos={[-16, 0, -16]} />

      {/* Hanging lanterns at gate */}
      {[-2.5, 2.5].map((lx, i) => (
        <group key={`fl${i}`} position={[lx, 0, 18]}>
          <mesh position={[0, 2.5, 0]} geometry={GEO.box}
            scale={[0.06, 0.08, 0.06]} material={MAT.iron} />
          <mesh position={[0, 2.3, 0]} geometry={GEO.box}
            scale={[0.15, 0.2, 0.15]} material={MAT.iron}  />
          <mesh position={[0, 2.3, 0]} geometry={GEO.box}
            scale={[0.06, 0.1, 0.06]} material={MAT.lantern} />
        </group>
      ))}
    </group>
  );
}

function RuinedCity({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const fp = sampleFootprint(cx, cz, 38, 38, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);
  const rng = seededRng(9999);

  return (
    <group position={[cx, y, cz]}>
      {/* === GRAND ARCH — imposing entrance remnant === */}
      <group position={[0, 0, 25]}>
        <mesh position={[-5, 10, 0]} geometry={GEO.box}
          scale={[2.5, 20, 2.5]} material={MAT.stoneRuin}  />
        <mesh position={[5, 8, 0]} geometry={GEO.box}
          scale={[2.5, 16, 2.5]} material={MAT.stoneRuin}  />
        <mesh position={[0, 19, 0]} geometry={GEO.box}
          scale={[14, 2.5, 3]} material={MAT.stoneRuin}  />
        {/* Broken upper section */}
        <mesh position={[-5, 21, 0.5]} rotation={[0, 0, 0.1]} geometry={GEO.box}
          scale={[2, 2, 1.5]} material={MAT.stoneRuin}  />
      </group>

      {/* === RUINED BUILDINGS — varied decay levels === */}
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2 + rng() * 0.3;
        const r = 12 + rng() * 22;
        const hx = Math.cos(angle) * r, hz = Math.sin(angle) * r;
        const hy = getTerrainHeight(cx + hx, cz + hz) - y;
        const wallH = 1 + rng() * 3.5;
        return <House key={i} pos={[hx, hy, hz]} rot={rng() * Math.PI * 2}
          w={3 + rng() * 4} d={3 + rng() * 4} h={wallH} style="ruin" />;
      })}

      {/* === COLLAPSED HALL — fallen arches === */}
      <group position={[-15, 0, -5]}>
        {/* Standing wall fragment */}
        <mesh position={[0, 3, 0]} geometry={GEO.box}
          scale={[8, 6, 1]} material={MAT.stoneRuin}  />
        {/* Arched windows (holes) */}
        <mesh position={[-2, 3.5, 0]} geometry={GEO.box}
          scale={[1.2, 2.5, 1.1]} material={MAT.dark} />
        <mesh position={[2, 3.5, 0]} geometry={GEO.box}
          scale={[1.2, 2.5, 1.1]} material={MAT.dark} />
        {/* Collapsed roof debris */}
        <mesh position={[3, 0.4, 2]} rotation={[0.2, 0.5, 0.3]} geometry={GEO.box}
          scale={[3, 0.5, 2]} material={MAT.stoneRuin}  />
        <mesh position={[-2, 0.3, 3]} rotation={[-0.1, 0.3, 0.1]} geometry={GEO.box}
          scale={[2, 0.4, 1.5]} material={MAT.stoneRuin}  />
      </group>

      {/* === PILLAR CIRCLE — ancient forum === */}
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const r = 9;
        const h = 2 + rng() * 7;
        const standing = rng() > 0.3;
        return (
          <group key={`p${i}`} position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}>
            <mesh position={[0, 0.25, 0]} geometry={GEO.box}
              scale={[1.3, 0.5, 1.3]} material={MAT.stoneRuin}  />
            {standing ? (
              <mesh position={[0, h / 2 + 0.5, 0]} geometry={GEO.cyl8}
                scale={[0.5, h, 0.5]} material={MAT.stoneDark}  />
            ) : (
              <mesh position={[1, 0.3, 0.5]} rotation={[0, rng() * 2, Math.PI / 2]}
                geometry={GEO.cyl8} scale={[0.4, h * 0.6, 0.4]} material={MAT.stoneRuin}  />
            )}
          </group>
        );
      })}

      {/* === CENTRAL ALTAR PLATFORM === */}
      <mesh position={[0, 0.3, 0]} geometry={GEO.box}
        scale={[10, 0.6, 10]} material={MAT.stoneRuin}  />
      <mesh position={[0, 0.8, 0]} geometry={GEO.box}
        scale={[6, 0.4, 6]} material={MAT.cobble}  />
      <mesh position={[0, 1.4, 0]} geometry={GEO.box}
        scale={[3, 0.8, 1.5]} material={MAT.stoneDark}  />

      {/* Fallen column */}
      <mesh position={[8, 0.35, -8]} rotation={[0, 0.5, Math.PI / 2]}
        geometry={GEO.cyl8} scale={[0.4, 6, 0.4]} material={MAT.stoneRuin}  />

      {/* === RUINED TOWER === */}
      <Tower pos={[20, 0, -15]} h={10} r={3} roofStyle="ruin" mat={MAT.stoneRuin} />

      {/* Broken stairway */}
      <group position={[-8, 0, 15]}>
        {[0, 1, 2, 3, 4].map(i => (
          <mesh key={i} position={[0, i * 0.4 + 0.2, i * 0.8]}
            geometry={GEO.box} scale={[3, 0.3, 0.7]}
            material={i > 2 ? MAT.stoneRuin : MAT.stoneDark}  />
        ))}
      </group>

      {/* Broken road fragments */}
      <mesh position={[0, 0.05, 20]} geometry={GEO.box}
        scale={[4, 0.1, 25]} material={MAT.stoneRuin} />
      <mesh position={[20, 0.05, 0]} rotation={[0, 0, 0]} geometry={GEO.box}
        scale={[25, 0.1, 3.5]} material={MAT.stoneRuin} />

      {/* Moss / overgrowth */}
      {[[-3, 5], [6, -4], [-10, -10], [12, 8]].map(([mx, mz], i) => (
        <mesh key={`moss${i}`} position={[mx, 0.08, mz]} geometry={GEO.box}
          scale={[2 + rng() * 3, 0.06, 2 + rng() * 3]} material={MAT.moss} />
      ))}

      {/* Grave markers near ruins */}
      {[[15, 10], [17, 12], [14, 13]].map(([gx, gz], i) => (
        <mesh key={`g${i}`} position={[gx, 0.4, gz]} rotation={[0, 0, rng() * 0.15 - 0.07]}
          geometry={GEO.box} scale={[0.5, 0.8, 0.12]} material={MAT.grave}  />
      ))}

      {/* === MYSTICAL ATMOSPHERE === */}
      {/* Ancient inscription stones */}
      {[[-20, 15], [18, 18], [-12, -20]].map(([ix, iz], i) => (
        <group key={`insc${i}`} position={[ix, 0, iz]}>
          <mesh position={[0, 0.6, 0]} rotation={[0, i * 1.2, 0]} geometry={GEO.box}
            scale={[1.2, 1.2, 0.2]} material={MAT.stoneDark}  />
          <mesh position={[0, 0.6, 0.11]} rotation={[0, i * 1.2, 0]} geometry={GEO.box}
            scale={[0.8, 0.6, 0.02]} material={MAT.chalk} />
        </group>
      ))}

      {/* Rubble piles */}
      {[[-8, -18], [25, 5], [-25, 10], [10, -22]].map(([rx, rz], i) => (
        <group key={`rub${i}`} position={[rx, 0, rz]}>
          <mesh position={[0, 0.15, 0]} geometry={GEO.box}
            scale={[1.5 + rng(), 0.3, 1.5 + rng()]} material={MAT.stoneRuin}  />
          <mesh position={[0.3, 0.3, 0.2]} rotation={[0.3, rng(), 0.2]} geometry={GEO.box}
            scale={[0.5, 0.4, 0.5]} material={MAT.stoneDark}  />
        </group>
      ))}

      {/* Overgrown vines on pillars */}
      {[0, 3, 6].map(i => {
        const a = (i / 10) * Math.PI * 2;
        return <mesh key={`vine${i}`}
          position={[Math.cos(a) * 9 + 0.3, 1.5, Math.sin(a) * 9]}
          geometry={GEO.box} scale={[0.3, 3, 0.15]} material={MAT.herb}  />;
      })}

      {/* Eerie altar glow */}
      <mesh position={[0, 1.9, 0]} geometry={GEO.sphere8}
        scale={[0.15, 0.15, 0.15]} material={MAT.stainedGlass} />
    </group>
  );
}

function BanditCamp({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const y = getTerrainHeight(cx, cz);
  const rng = seededRng(5555);

  return (
    <group position={[cx, y, cz]}>
      {/* Tents — ragged, varied sizes, asymmetric placement */}
      {Array.from({ length: 7 }).map((_, i) => {
        const angle = (i / 7) * Math.PI * 2 + rng() * 0.6;
        const r = 5 + rng() * 11;
        const sz = 1.2 + rng() * 1.8;
        const tx = Math.cos(angle) * r, tz = Math.sin(angle) * r;
        return (
          <group key={`t${i}`} position={[tx, 0, tz]} rotation={[0, rng() * Math.PI * 2, 0]}>
            <mesh position={[0, sz * 0.45, 0]}
              geometry={GEO.cone6} scale={[sz, sz * 0.9, sz]}
              material={rng() > 0.5 ? MAT.tentRagged : MAT.tentDark}  />
            {/* Support pole visible through top */}
            <mesh position={[0, sz * 0.7, 0]} geometry={GEO.box}
              scale={[0.06, sz * 0.3, 0.06]} material={MAT.timber} />
          </group>
        );
      })}

      {/* Lookout towers — crude wooden */}
      {[[-13, 9], [11, -11]].map(([lx, lz], i) => (
        <group key={`lp${i}`} position={[lx, 0, lz]}>
          {/* Four legs */}
          {[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([px, pz], j) => (
            <mesh key={j} position={[px, 2.5, pz]} geometry={GEO.box}
              scale={[0.12, 5, 0.12]} material={MAT.timber}  />
          ))}
          <mesh position={[0, 5, 0]} geometry={GEO.box}
            scale={[2, 0.1, 2]} material={MAT.woodWeathered}  />
          <mesh position={[0, 5.8, 0]} geometry={GEO.box}
            scale={[0.1, 1.5, 0.1]} material={MAT.timber}  />
        </group>
      ))}

      {/* Sharpened stakes */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2 + rng() * 0.3;
        const r = 15 + rng() * 3;
        return (
          <group key={`sk${i}`} position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
            rotation={[0.15 * Math.sin(a), a, 0]}>
            <mesh position={[0, 0.6, 0]} geometry={GEO.box}
              scale={[0.08, 1.2, 0.08]} material={MAT.palisadeSharp}  />
            <mesh position={[0, 1.3, 0]} geometry={GEO.cone4}
              scale={[0.06, 0.3, 0.06]} material={MAT.palisadeSharp} />
          </group>
        );
      })}

      {/* Stolen goods piles */}
      <Crates pos={[-3, 0, -2]} count={5} />
      <Crates pos={[4, 0, 3]} count={3} />
      <Barrels pos={[6, 0, -4]} count={4} />
      <Barrels pos={[-5, 0, 5]} count={2} />

      {/* Cage */}
      <group position={[7, 0, 7]}>
        {/* Posts */}
        {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([px, pz], i) => (
          <mesh key={i} position={[px, 0.8, pz]} geometry={GEO.box}
            scale={[0.06, 1.6, 0.06]} material={MAT.iron}  />
        ))}
        {/* Bars */}
        {[-0.3, 0, 0.3].map((x, i) => (
          <mesh key={`b${i}`} position={[x, 0.8, 0.6]} geometry={GEO.box}
            scale={[0.04, 1.6, 0.04]} material={MAT.iron} />
        ))}
        <mesh position={[0, 1.6, 0]} geometry={GEO.box}
          scale={[1.3, 0.06, 1.3]} material={MAT.iron}  />
      </group>

      {/* Campfires */}
      <Campfire pos={[0, 0, 0]} />
      <Campfire pos={[-8, 0, -6]} />

      {/* Crude palisade */}
      <Palisade center={[0, 0, 0]} radius={17} segments={22} h={2.5} gateAngle={0} />

      {/* Execution post / gallows */}
      <group position={[-8, 0, 8]}>
        <mesh position={[0, 2, 0]} geometry={GEO.box}
          scale={[0.15, 4, 0.15]} material={MAT.timber}  />
        <mesh position={[0.8, 3.8, 0]} geometry={GEO.box}
          scale={[1.5, 0.12, 0.12]} material={MAT.timber}  />
        <mesh position={[1.2, 3.2, 0]} geometry={GEO.box}
          scale={[0.02, 0.6, 0.02]} material={MAT.rope} />
      </group>

      {/* === HOSTILE ATMOSPHERE === */}
      {/* Warning skull-on-stake markers around perimeter */}
      {[[-14, -14], [14, 12], [-10, 15]].map(([wx, wz], i) => (
        <group key={`warn${i}`} position={[wx, 0, wz]}>
          <mesh position={[0, 1, 0]} geometry={GEO.box}
            scale={[0.08, 2, 0.08]} material={MAT.palisadeSharp}  />
          <mesh position={[0, 2.1, 0]} geometry={GEO.sphere8}
            scale={[0.12, 0.15, 0.12]} material={MAT.bone}  />
        </group>
      ))}

      {/* Blood-stained ground patches */}
      <mesh position={[-2, 0.02, 3]} geometry={GEO.box}
        scale={[2, 0.04, 1.5]} material={MAT.bloodStain} />
      <mesh position={[5, 0.02, -3]} geometry={GEO.box}
        scale={[1.5, 0.04, 2]} material={MAT.bloodStain} />

      {/* Crude weapon racks */}
      <group position={[3, 0, -5]}>
        <mesh position={[0, 0.6, 0]} geometry={GEO.box}
          scale={[0.08, 1.2, 0.08]} material={MAT.timber}  />
        <mesh position={[0.8, 0.6, 0]} geometry={GEO.box}
          scale={[0.08, 1.2, 0.08]} material={MAT.timber}  />
        <mesh position={[0.4, 1.1, 0]} geometry={GEO.box}
          scale={[1, 0.06, 0.06]} material={MAT.timber}  />
        <mesh position={[0.2, 0.5, 0.05]} rotation={[0, 0, 0.2]} geometry={GEO.box}
          scale={[0.04, 0.8, 0.04]} material={MAT.ironRusty}  />
        <mesh position={[0.6, 0.5, 0.05]} rotation={[0, 0, -0.15]} geometry={GEO.box}
          scale={[0.04, 0.9, 0.04]} material={MAT.ironRusty}  />
      </group>

      {/* More fire pits */}
      <Campfire pos={[6, 0, 5]} />
    </group>
  );
}

function ForestOutpost({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const y = getTerrainHeight(cx, cz);

  return (
    <group position={[cx, y, cz]}>
      {/* Main lodge */}
      <House pos={[0, 0, 0]} rot={0} w={5} d={6} h={3.2} style="wood" chimney shed />

      {/* Secondary cabin */}
      <House pos={[-9, 0, 3]} rot={0.5} w={3.5} d={4} h={2.5} style="wood" chimney />

      {/* Storage shed */}
      <group position={[7, 0, 2]}>
        <mesh position={[0, 1, 0]} geometry={GEO.box}
          scale={[3, 2, 2.5]} material={MAT.woodWeathered}  />
        <mesh position={[0, 2.3, 0]} geometry={GEO.cone4}
          scale={[2.2, 1.2, 2]} material={MAT.roofThatch}  />
      </group>

      {/* Shrine stone */}
      <group position={[5, 0, -5]}>
        <mesh position={[0, 0.6, 0]} geometry={GEO.box}
          scale={[1.5, 1.2, 0.5]} material={MAT.stoneDark}  />
        <mesh position={[0, 1.5, 0]} geometry={GEO.cone4}
          scale={[0.6, 0.8, 0.4]} material={MAT.stone}  />
        <mesh position={[0, 0.02, 0]} geometry={GEO.box}
          scale={[2.5, 0.04, 2]} material={MAT.cobble} />
      </group>

      <Campfire pos={[-3, 0, -6]} />
      <Well pos={[3, 0, -3]} />

      {/* Wooden walkway */}
      <mesh position={[0, 0.1, -9]} geometry={GEO.box}
        scale={[2, 0.08, 6]} material={MAT.woodDark} />

      {/* Drying rack */}
      <group position={[-5, 0, -4]}>
        <mesh position={[-0.6, 1, 0]} geometry={GEO.box}
          scale={[0.08, 2, 0.08]} material={MAT.timber}  />
        <mesh position={[0.6, 1, 0]} geometry={GEO.box}
          scale={[0.08, 2, 0.08]} material={MAT.timber}  />
        <mesh position={[0, 1.8, 0]} geometry={GEO.box}
          scale={[1.4, 0.06, 0.06]} material={MAT.timber}  />
      </group>

      <Barrels pos={[6, 0, -2]} count={2} />
      {/* Woodpile */}
      <mesh position={[-7, 0.25, -2]} geometry={GEO.box}
        scale={[1.5, 0.5, 0.6]} material={MAT.timber}  />

      {/* === OUTPOST CHARACTER === */}
      {/* Border marker post */}
      <group position={[0, 0, -12]}>
        <mesh position={[0, 1.2, 0]} geometry={GEO.box}
          scale={[0.12, 2.4, 0.12]} material={MAT.timber}  />
        <mesh position={[0, 2.5, 0]} geometry={GEO.box}
          scale={[0.5, 0.35, 0.04]} material={MAT.woodLight}  />
      </group>

      {/* Lantern at entrance */}
      <group position={[1, 0, -8]}>
        <mesh position={[0, 1.5, 0]} geometry={GEO.box}
          scale={[0.06, 3, 0.06]} material={MAT.iron}  />
        <mesh position={[0, 2.8, 0]} geometry={GEO.box}
          scale={[0.15, 0.2, 0.15]} material={MAT.iron}  />
        <mesh position={[0, 2.8, 0]} geometry={GEO.box}
          scale={[0.06, 0.1, 0.06]} material={MAT.lantern} />
      </group>

      {/* Firewood supply */}
      <group position={[8, 0, -3]}>
        <mesh position={[0, 0.15, 0]} geometry={GEO.box}
          scale={[1, 0.3, 0.5]} material={MAT.woodDark}  />
        <mesh position={[0, 0.35, 0]} geometry={GEO.box}
          scale={[0.8, 0.2, 0.45]} material={MAT.timber}  />
      </group>
    </group>
  );
}

function MountainMonastery({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const y = getTerrainHeight(cx, cz);

  return (
    <group position={[cx, y, cz]}>
      {/* === MAIN CHAPEL === */}
      <group position={[0, 0, 0]}>
        {/* Nave */}
        <mesh position={[0, 3.5, 0]} geometry={GEO.box}
          scale={[7, 7, 13]} material={MAT.stoneWarm}  />
        <mesh position={[0, 8.2, 0]} geometry={GEO.cone4}
          scale={[5, 4.5, 9.5]} material={MAT.roofSlate}  />
        {/* Apse */}
        <mesh position={[0, 3, -7.5]} geometry={GEO.cyl8}
          scale={[3.5, 6, 3.5]} material={MAT.stoneWarm}  />
        <mesh position={[0, 7, -7.5]} geometry={GEO.cone8}
          scale={[3.8, 3, 3.8]} material={MAT.roofSlate}  />
        {/* Rose window */}
        <mesh position={[0, 5.5, 6.51]} geometry={GEO.cyl8}
          scale={[1, 0.1, 1]} material={MAT.dark} />
        {/* Door */}
        <mesh position={[0, 1.5, 6.52]} geometry={GEO.box}
          scale={[1.5, 3, 0.1]} material={MAT.door}  />
        <mesh position={[0, 3.1, 6.52]} geometry={GEO.box}
          scale={[1.8, 0.15, 0.12]} material={MAT.stoneDark}  />
        {/* Side windows */}
        {[-1, 1, 3, -3].map((z, i) => (
          <mesh key={`cw${i}`} position={[3.51, 4, z * 1.5]} geometry={GEO.box}
            scale={[0.1, 1.5, 0.5]} material={MAT.dark} />
        ))}
      </group>

      {/* === BELL TOWER === */}
      <group position={[0, 0, -11]}>
        <mesh position={[0, 7, 0]} geometry={GEO.box}
          scale={[3, 14, 3]} material={MAT.stoneWarm}  />
        {/* Belfry openings */}
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 1.51, 12, Math.sin(a) * 1.51]}
            rotation={[0, a, 0]} geometry={GEO.box}
            scale={[0.1, 1.5, 0.8]} material={MAT.dark} />
        ))}
        <mesh position={[0, 15.5, 0]} geometry={GEO.cone4}
          scale={[2.2, 3.5, 2.2]} material={MAT.roofSlate}  />
        {/* Cross */}
        <mesh position={[0, 17.8, 0]} geometry={GEO.box}
          scale={[0.08, 0.8, 0.08]} material={MAT.iron}  />
        <mesh position={[0, 18, 0]} geometry={GEO.box}
          scale={[0.4, 0.08, 0.08]} material={MAT.iron}  />
      </group>

      {/* === CLOISTER WINGS === */}
      {/* East wing */}
      <House pos={[8, 0, 0]} rot={Math.PI / 2} w={4} d={10} h={3} style="stone" />
      {/* West wing */}
      <House pos={[-8, 0, 0]} rot={-Math.PI / 2} w={4} d={10} h={3} style="stone" />

      {/* === COURTYARD === */}
      <mesh position={[0, 0.06, 10]} geometry={GEO.box}
        scale={[14, 0.12, 8]} material={MAT.cobble} />
      <Well pos={[3, 0, 10]} />

      {/* === ENCLOSURE WALLS === */}
      <Wall from={[-14, 0, -14]} to={[14, 0, -14]} h={3} thickness={1.2} />
      <Wall from={[-14, 0, -14]} to={[-14, 0, 14]} h={3} thickness={1.2} />
      <Wall from={[14, 0, -14]} to={[14, 0, 14]} h={3} thickness={1.2} />
      {/* South wall with gate gap */}
      <Wall from={[14, 0, 14]} to={[3, 0, 14]} h={3} thickness={1.2} />
      <Wall from={[-3, 0, 14]} to={[-14, 0, 14]} h={3} thickness={1.2} />

      {/* === HERB GARDEN === */}
      <group position={[-8, 0, 10]}>
        <mesh position={[0, 0.04, 0]} geometry={GEO.box}
          scale={[4, 0.08, 4]} material={MAT.herb} />
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([gx, gz], i) => (
          <mesh key={i} position={[gx, 0.2, gz]} geometry={GEO.box}
            scale={[0.8, 0.3, 0.8]} material={MAT.herb}  />
        ))}
      </group>

      {/* === CEMETERY === */}
      <group position={[10, 0, -10]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[(i % 3) * 1.5 - 1.5, 0.4, Math.floor(i / 3) * 2 - 1]}
            rotation={[0, 0, Math.sin(i * 3.7) * 0.08]}
            geometry={GEO.box} scale={[0.5, 0.8, 0.12]} material={MAT.grave}  />
        ))}
      </group>

      {/* Stone path to entrance */}
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={`path${i}`} position={[0, 0.04, 14 + i * 2.5]}
          geometry={GEO.box} scale={[2.5, 0.08, 2]} material={MAT.cobble} />
      ))}

      {/* === SACRED ATMOSPHERE === */}
      {/* Prayer candles near chapel entrance */}
      <group position={[-1.5, 0, 7]}>
        {[0, 0.15, 0.3, -0.15, -0.3].map((cx, i) => (
          <group key={`candle${i}`} position={[cx, 0, i * 0.12]}>
            <mesh position={[0, 0.15, 0]} geometry={GEO.box}
              scale={[0.04, 0.3, 0.04]} material={MAT.cloth} />
            <mesh position={[0, 0.32, 0]} geometry={GEO.box}
              scale={[0.02, 0.04, 0.02]} material={MAT.fire} />
          </group>
        ))}
        <mesh position={[0, 0.02, 0]} geometry={GEO.box}
          scale={[0.8, 0.04, 0.4]} material={MAT.stoneDark} />
      </group>

      {/* Meditation stones in garden */}
      <group position={[8, 0, 8]}>
        {[[-1, 0], [0, -1], [1, 0], [0, 1]].map(([sx, sz], i) => (
          <mesh key={`med${i}`} position={[sx, 0.15, sz]} geometry={GEO.box}
            scale={[0.5, 0.3, 0.5]} material={MAT.stoneWarm}  />
        ))}
      </group>

      {/* Stained glass glow inside rose window */}
      <mesh position={[0, 5.5, 6.5]} geometry={GEO.cyl8}
        scale={[0.9, 0.08, 0.9]} material={MAT.stainedGlass} />

      {/* Bell in tower */}
      <mesh position={[0, 12.5, -11]} geometry={GEO.cone8}
        scale={[0.4, 0.5, 0.4]} material={MAT.goldTrim}  />

      {/* Scripture lectern near entrance */}
      <group position={[2, 0, 12]}>
        <mesh position={[0, 0.5, 0]} geometry={GEO.box}
          scale={[0.1, 1, 0.1]} material={MAT.timber}  />
        <mesh position={[0, 1, 0]} rotation={[0.3, 0, 0]} geometry={GEO.box}
          scale={[0.4, 0.02, 0.3]} material={MAT.woodDark}  />
      </group>
    </group>
  );
}

function SmallVillage({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  const y = getTerrainHeight(cx, cz);
  const rng = seededRng(cx * 100 + cz);

  return (
    <group position={[cx, y, cz]}>
      {Array.from({ length: 5 }).map((_, i) => {
        const angle = (i / 5) * Math.PI * 2 + rng() * 0.5;
        const r = 5 + rng() * 7;
        const hx = Math.cos(angle) * r, hz = Math.sin(angle) * r;
        const hy = getTerrainHeight(cx + hx, cz + hz) - y;
        return <House key={i} pos={[hx, hy, hz]} rot={angle + Math.PI}
          w={3 + rng()} d={3.5 + rng()} h={2.3 + rng() * 0.5}
          style={rng() > 0.5 ? 'halftimber' : 'wood'}
          chimney={rng() > 0.5} shed={rng() > 0.6} />;
      })}
      <Well pos={[0, 0, 0]} />
      <mesh position={[0, 0.03, 0]} geometry={GEO.box}
        scale={[5, 0.06, 5]} material={MAT.cobble} />
      <mesh position={[4, 0.35, -3]} geometry={GEO.cyl8}
        scale={[0.6, 0.7, 0.6]} material={MAT.hay}  />
      <Barrels pos={[-3, 0, 4]} count={2} />
      {/* Fence around a small garden */}
      <Fence from={[6, 0, 3]} to={[10, 0, 3]} />
      <Fence from={[10, 0, 3]} to={[10, 0, 7]} />

      {/* Domestic props */}
      <mesh position={[-5, 0.2, -4]} geometry={GEO.box}
        scale={[1, 0.4, 0.5]} material={MAT.timber}  />
      <mesh position={[6, 0.25, 5]} geometry={GEO.cyl8}
        scale={[0.5, 0.5, 0.5]} material={MAT.hay}  />
      {/* Lantern post */}
      <group position={[1, 0, 3]}>
        <mesh position={[0, 1.2, 0]} geometry={GEO.box}
          scale={[0.06, 2.4, 0.06]} material={MAT.iron}  />
        <mesh position={[0, 2.3, 0]} geometry={GEO.box}
          scale={[0.12, 0.18, 0.12]} material={MAT.iron}  />
        <mesh position={[0, 2.3, 0]} geometry={GEO.box}
          scale={[0.05, 0.08, 0.05]} material={MAT.lantern} />
      </group>
    </group>
  );
}

// ========== SETTLEMENT DISPATCHER ==========
import { FortifiedCity, RiverTown, MountainHold, FrontierCamp, TradeCity } from './NewKingdomRenderers';

function SettlementRenderer({ def, playerPos }: { def: SettlementDef; playerPos: THREE.Vector3 | null }) {
  if (playerPos) {
    const dx = playerPos.x - def.position[0];
    const dz = playerPos.z - def.position[1];
    const distSq = dx * dx + dz * dz;
    const cullDist = def.size === 'large' ? 300 : def.size === 'medium' ? 220 : 160;
    if (distSq > cullDist * cullDist) return null;
  }

  switch (def.type) {
    case 'capital': return <CapitalCity def={def} />;
    case 'village': return def.size === 'small' ? <SmallVillage def={def} /> : <FarmingVillage def={def} />;
    case 'fort': return <MilitaryFort def={def} />;
    case 'ruins': return <RuinedCity def={def} />;
    case 'bandit_camp': return <BanditCamp def={def} />;
    case 'outpost': return <ForestOutpost def={def} />;
    case 'monastery': return <MountainMonastery def={def} />;
    case 'fortified_city': return <FortifiedCity def={def} />;
    case 'river_town': return <RiverTown def={def} />;
    case 'mountain_hold': return <MountainHold def={def} />;
    case 'frontier_camp': return <FrontierCamp def={def} />;
    case 'trade_city': return <TradeCity def={def} />;
    default: return null;
  }
}

export function Settlements({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group>
      {SETTLEMENTS.map(def => (
        <SettlementRenderer key={def.id} def={def} playerPos={playerPos} />
      ))}
    </group>
  );
}
