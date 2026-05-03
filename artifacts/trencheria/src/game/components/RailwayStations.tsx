import { devLog, devWarn } from '../utils/devLog';
/**
 * RailwayStations — Rich medieval-fantasy station structures at all 7 positions.
 * Hierarchy: capital > large > medium > small.
 * Uses shared GEO/MAT from SettlementPieces for performance.
 * All lamps are emissive meshes — zero PointLight cost.
 */
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import {
  RAILWAY_STATIONS,
  RailwayStation,
  LINE_A_WAYPOINTS,
  LINE_B_WAYPOINTS,
  STATION_DIMS,
  StationDims,
} from '../world/RailwayData';
import { getRailGroundHeight } from '../systems/Grounding';
import { sampleFootprint } from '../systems/Grounding';
import { GEO, MAT } from '../world/SettlementPieces';

// Re-export so existing local imports of STATION_DIMS / StationDims from
// this module keep working while world/RailwayData.ts is the source of truth.
export { STATION_DIMS };
export type { StationDims };

// ========== SHARED STATION MATERIALS ==========
const platformMat = new THREE.MeshLambertMaterial({ color: '#7a7068' });
const platformEdgeMat = new THREE.MeshLambertMaterial({ color: '#5a5450' });
const roofMat = new THREE.MeshLambertMaterial({ color: '#5a2222' });
const roofTrimMat = new THREE.MeshLambertMaterial({ color: '#3a1515' });
const signBoardMat = new THREE.MeshLambertMaterial({ color: '#3a2810' });
const lampPostMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
const lampGlowMat = new THREE.MeshBasicMaterial({ color: '#ffaa44' });
const lampHousingMat = new THREE.MeshLambertMaterial({ color: '#333' });
const crateMat = new THREE.MeshLambertMaterial({ color: '#6a4a20' });
const barrelMat = new THREE.MeshLambertMaterial({ color: '#5a3a18' });
const bannerClothMat = new THREE.MeshLambertMaterial({ color: '#8b2020', side: THREE.DoubleSide });
const bannerBlueMat = new THREE.MeshLambertMaterial({ color: '#2a3a8b', side: THREE.DoubleSide });
const cobbleMat = new THREE.MeshLambertMaterial({ color: '#6a6a5a' });

// STATION_DIMS now lives in world/RailwayData.ts and is re-exported above.

// ========== TRACK DIRECTION ==========
function getTrackDirectionAtStation(station: RailwayStation): number {
  const wps = station.line === 'B' ? LINE_B_WAYPOINTS :
    station.line === 'AB' ? LINE_A_WAYPOINTS : LINE_A_WAYPOINTS;
  let bestIdx = 0, bestD = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const dx = wps[i].x - station.position[0];
    const dz = wps[i].z - station.position[1];
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  const prev = wps[Math.max(0, bestIdx - 1)];
  const next = wps[Math.min(wps.length - 1, bestIdx + 1)];
  return Math.atan2(next.x - prev.x, next.z - prev.z);
}

// ========== REUSABLE SUB-COMPONENTS ==========

/** Medieval lamp post with emissive glow — no PointLight */
function StationLamp({ x, z, height = 2.8 }: { x: number; z: number; height?: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Iron post */}
      <mesh geometry={GEO.cyl8} scale={[0.06, height, 0.06]}
        position={[0, height / 2, 0]} material={lampPostMat} castShadow />
      {/* Bracket arm */}
      <mesh geometry={GEO.box} scale={[0.35, 0.06, 0.06]}
        position={[0.2, height - 0.15, 0]} material={lampPostMat} />
      {/* Lantern housing */}
      <mesh geometry={GEO.box} scale={[0.22, 0.32, 0.22]}
        position={[0.35, height - 0.35, 0]} material={lampHousingMat} castShadow />
      {/* Glow */}
      <mesh geometry={GEO.box} scale={[0.18, 0.26, 0.18]}
        position={[0.35, height - 0.35, 0]} material={lampGlowMat} />
      {/* Cap */}
      <mesh geometry={GEO.cone4} scale={[0.14, 0.12, 0.14]}
        position={[0.35, height - 0.13, 0]} material={lampPostMat} />
    </group>
  );
}

/** Wooden bench */
function Bench({ x, z, rotY = 0, length = 1.2 }: { x: number; z: number; rotY?: number; length?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* Seat */}
      <mesh geometry={GEO.box} scale={[length, 0.08, 0.35]}
        position={[0, 0.42, 0]} material={MAT.woodLight} castShadow />
      {/* Legs */}
      {[-length / 2 + 0.1, length / 2 - 0.1].map((lx, i) => (
        <mesh key={i} geometry={GEO.box} scale={[0.08, 0.4, 0.3]}
          position={[lx, 0.2, 0]} material={MAT.woodDark} />
      ))}
    </group>
  );
}

/** Cargo crate */
function Crate({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  const s = scale;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.box} scale={[0.6 * s, 0.5 * s, 0.5 * s]}
        position={[0, 0.25 * s, 0]} material={crateMat} castShadow />
      {/* Cross brace */}
      <mesh geometry={GEO.box} scale={[0.62 * s, 0.06, 0.06]}
        position={[0, 0.35 * s, 0.26 * s]} material={MAT.woodDark} />
    </group>
  );
}

/** Barrel */
function Barrel({ x, z }: { x: number; z: number }) {
  return (
    <mesh geometry={GEO.cyl8} scale={[0.25, 0.55, 0.25]}
      position={[x, 0.275, z]} material={barrelMat} castShadow />
  );
}

/** Station name sign */
function StationSign({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.cyl8} scale={[0.05, 2.2, 0.05]}
        position={[0, 1.1, 0]} material={MAT.woodDark} castShadow />
      <mesh geometry={GEO.box} scale={[2.2, 0.55, 0.08]}
        position={[0, 2.35, 0]} material={signBoardMat} castShadow />
      {/* Sign trim */}
      <mesh geometry={GEO.box} scale={[2.3, 0.06, 0.1]}
        position={[0, 2.65, 0]} material={MAT.woodDark} />
      <mesh geometry={GEO.box} scale={[2.3, 0.06, 0.1]}
        position={[0, 2.05, 0]} material={MAT.woodDark} />
    </group>
  );
}

/** Banner pole with hanging cloth */
function BannerPole({ x, z, color = 'red' }: { x: number; z: number; color?: string }) {
  const clothMat = color === 'blue' ? bannerBlueMat : bannerClothMat;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.cyl8} scale={[0.05, 3.5, 0.05]}
        position={[0, 1.75, 0]} material={MAT.woodDark} castShadow />
      {/* Finial */}
      <mesh geometry={GEO.sphere8} scale={[0.08, 0.08, 0.08]}
        position={[0, 3.55, 0]} material={MAT.goldTrim} />
      {/* Cloth banner */}
      <mesh geometry={GEO.plane} scale={[0.5, 1.2, 1]}
        position={[0.3, 2.9, 0]} rotation={[0, 0, -0.1]} material={clothMat} />
    </group>
  );
}

// ========== SHELTER BUILDER ==========

function Shelter({
  w, l, h, posts = true
}: { w: number; l: number; h: number; posts?: boolean }) {
  const roofOverhang = 0.5;
  const postInset = 0.15;
  return (
    <group>
      {/* Back wall */}
      <mesh geometry={GEO.box} scale={[w, h, 0.2]}
        position={[0, h / 2, -l / 2]} material={MAT.timber} castShadow />

      {/* Side walls — half height for open feel */}
      <mesh geometry={GEO.box} scale={[0.18, h * 0.6, l]}
        position={[-w / 2, h * 0.3, 0]} material={MAT.timber} castShadow />
      <mesh geometry={GEO.box} scale={[0.18, h * 0.6, l]}
        position={[w / 2, h * 0.3, 0]} material={MAT.timber} castShadow />

      {/* Front posts */}
      {posts && [-w / 2 + postInset, w / 2 - postInset].map((xp, i) => (
        <mesh key={`fp-${i}`} geometry={GEO.box} scale={[0.15, h + 0.15, 0.15]}
          position={[xp, (h + 0.15) / 2, l / 2 - 0.1]} material={MAT.woodDark} castShadow />
      ))}

      {/* Cross beam */}
      <mesh geometry={GEO.box} scale={[w, 0.1, 0.1]}
        position={[0, h, l / 2 - 0.1]} material={MAT.woodDark} />

      {/* Roof — peaked with overhang */}
      <mesh geometry={GEO.box} scale={[w + roofOverhang, 0.15, l + roofOverhang]}
        position={[0, h + 0.08, 0]} material={roofMat} castShadow />
      {/* Ridge beam */}
      <mesh geometry={GEO.box} scale={[w + roofOverhang + 0.1, 0.08, 0.2]}
        position={[0, h + 0.2, 0]} material={roofTrimMat} castShadow />

      {/* Timber knee braces (decorative) */}
      {[-w / 2 + postInset, w / 2 - postInset].map((xp, i) => (
        <mesh key={`kb-${i}`} geometry={GEO.box} scale={[0.08, 0.5, 0.08]}
          position={[xp, h - 0.4, l / 2 - 0.3]}
          rotation={[0.4, 0, i === 0 ? 0.3 : -0.3]}
          material={MAT.woodDark} />
      ))}
    </group>
  );
}

// ========== PLATFORM BUILDER ==========

function Platform({ w, l }: { w: number; l: number }) {
  return (
    <group>
      {/* Main platform body */}
      <mesh geometry={GEO.box} scale={[w, 0.5, l]}
        position={[0, 0.25, 0]} material={platformMat} castShadow receiveShadow />
      {/* Edge trim — darker stone lip */}
      <mesh geometry={GEO.box} scale={[w + 0.2, 0.12, l + 0.2]}
        position={[0, 0.52, 0]} material={platformEdgeMat} receiveShadow />
      {/* Base — wider cobble step */}
      <mesh geometry={GEO.box} scale={[w + 0.6, 0.15, l + 0.6]}
        position={[0, 0.075, 0]} material={cobbleMat} receiveShadow />
      {/* Approach ramp (front) */}
      <mesh geometry={GEO.box} scale={[2, 0.25, 1.5]}
        position={[0, 0.125, l / 2 + 0.7]} material={cobbleMat} receiveShadow />
    </group>
  );
}

// ========== IRONHOLD CENTRAL — custom junction-aware capital station ==========
// Line A exits ENE, Line B exits ESE → station placed SOUTH of junction point,
// clear of both rail corridors. Platform oriented along the bisector between the two lines.

const IronholdCentralStation = memo(function IronholdCentralStation({ station }: { station: RailwayStation }) {
  const layout = useMemo(() => {
    const [sx, sz] = station.position; // v8: (-100, 130) — north rail-yard, between Line A (z=135) and Line B (z=125)

    // v8 north-yard layout — both lines run dead east through the hub as
    // parallel tracks 10u apart, station is a slim 6×20 island platform
    // centred between them. Heading is hard-east (+X), so trackHeading=π/2.
    const trackHeading = Math.PI / 2;

    // Sample the 6×20 platform footprint and use the lowest point so the
    // deck stays clear of any high-side terrain. Warns are dev-only.
    const fp = sampleFootprint(sx, sz, 3, 10, trackHeading);
    if (import.meta.env.DEV) {
      if (fp.hasWater) devWarn('[RailwayStations] Ironhold Central footprint touches water');
      if (fp.heightDelta > 1.5) devWarn(`[RailwayStations] Ironhold Central footprint uneven (Δ=${fp.heightDelta.toFixed(2)}u)`);
    }
    const y = fp.minY;

    return {
      position: new THREE.Vector3(sx, y, sz),
      rotation: trackHeading,
      y,
    };
  }, [station]);

  // v8: slim island platform — 6u wide so the 10u track gauge leaves 2u of
  // clear space between platform edge and rail centerlines. Old 12-wide deck
  // would have placed rails INSIDE the platform footprint.
  const platW = 6;
  const platL = 20;

  return (
    <group position={layout.position} rotation={[0, layout.rotation, 0]}>
      {/* ===== MAIN PLATFORM ===== */}
      <Platform w={platW} l={platL} />

      {/* v8: with platW=6 the slim deck only fits centre-line shelters/benches.
          Halls are squeezed so they fit within ±2u of platform centre — wider
          structures would protrude into the rail clearance on either side. */}
      {/* ===== WEST HALL — main waiting hall ===== */}
      <group position={[0, 0.55, 4]}>
        <Shelter w={4} l={7} h={3.5} />
        <Bench x={0} z={-2} length={2.5} />
        <Bench x={0} z={0} length={2.5} />
        <Bench x={0} z={2} length={2.5} />
      </group>

      {/* ===== EAST HALL — secondary shelter ===== */}
      <group position={[0, 0.55, -5]}>
        <Shelter w={3.5} l={5} h={3.2} />
        <Bench x={0} z={-1.5} length={2} />
        <Bench x={0} z={1.5} length={2} />
      </group>

      {/* ===== CLOCK TOWER — at platform centre ===== */}
      <group position={[0, 0.55, 0]}>
        <mesh geometry={GEO.box} scale={[2, 5, 2]}
          position={[0, 2.5, 0]} material={MAT.stoneWarm} castShadow />
        {/* Tower windows on two faces */}
        <mesh geometry={GEO.box} scale={[0.35, 0.55, 0.05]}
          position={[0, 4, 1.01]} material={MAT.stainedGlass} />
        <mesh geometry={GEO.box} scale={[0.05, 0.55, 0.35]}
          position={[1.01, 4, 0]} material={MAT.stainedGlass} />
        {/* Peaked slate roof */}
        <mesh geometry={GEO.cone4} scale={[1.6, 2.2, 1.6]}
          position={[0, 6.1, 0]} rotation={[0, Math.PI / 4, 0]}
          material={MAT.roofSlate} castShadow />
        {/* Clock face */}
        <mesh geometry={GEO.cyl12} scale={[0.5, 0.04, 0.5]}
          position={[0, 4.2, 1.02]} rotation={[Math.PI / 2, 0, 0]}
          material={MAT.plaster} />
        {/* Clock hands */}
        <mesh geometry={GEO.box} scale={[0.03, 0.35, 0.03]}
          position={[0, 4.2, 1.05]} material={MAT.dark} />
        <mesh geometry={GEO.box} scale={[0.22, 0.03, 0.03]}
          position={[0.11, 4.2, 1.05]} material={MAT.dark} />
      </group>

      {/* ===== LAMPS — along both platform edges (slim island platform) ===== */}
      {Array.from({ length: 8 }, (_, i) => {
        const zp = -platL / 2 + (platL / 9) * (i + 1);
        const side = i % 2 === 0 ? platW / 2 - 0.5 : -(platW / 2 - 0.5);
        return <StationLamp key={`l-${i}`} x={side} z={zp} />;
      })}

      {/* ===== ARCHED ENTRANCE — south end (approach side) ===== */}
      {[-1.2, 1.2].map((xp, i) => (
        <group key={`arch-${i}`} position={[xp, 0, platL / 2 + 1.8]}>
          <mesh geometry={GEO.box} scale={[0.45, 3, 0.45]}
            position={[0, 1.5, 0]} material={MAT.stoneWarm} castShadow />
          <mesh geometry={GEO.sphere8} scale={[0.22, 0.22, 0.22]}
            position={[0, 3.05, 0]} material={MAT.stoneLight} />
        </group>
      ))}
      <mesh geometry={GEO.box} scale={[4, 0.3, 0.35]}
        position={[0, 3.05, platL / 2 + 1.8]} material={MAT.stoneWarm} castShadow />

      {/* ===== STATION SIGN ===== */}
      <StationSign x={0} z={platL / 2 + 0.5} />

      {/* ===== BANNER POLES at corners ===== */}
      <BannerPole x={-platW / 2 + 0.5} z={-platL / 2 + 0.5} color="red" />
      <BannerPole x={platW / 2 - 0.5} z={-platL / 2 + 0.5} color="blue" />
      <BannerPole x={-platW / 2 + 0.5} z={platL / 2 - 0.5} color="red" />
      <BannerPole x={platW / 2 - 0.5} z={platL / 2 - 0.5} color="blue" />

      {/* ===== CARGO AREA — north end corner ===== */}
      <group position={[-(platW / 2 - 2), 0.55, -platL / 2 + 2]}>
        <Crate x={0} z={0} scale={1.1} />
        <Crate x={0.8} z={0.3} scale={0.9} />
        <Crate x={-0.3} z={0.8} scale={0.85} />
        <Barrel x={1.2} z={-0.2} />
        <Barrel x={-0.6} z={-0.3} />
      </group>

      {/* ===== WAITING BENCHES — along platform open edges ===== */}
      <Bench x={0} z={platL / 3} rotY={0} length={1.6} />
      <Bench x={0} z={-platL / 3} rotY={0} length={1.6} />

      {/* ===== DECORATIVE FENCE POSTS at platform ends ===== */}
      {[-platL / 2 + 0.3, platL / 2 - 0.3].map((zp, i) => (
        <mesh key={`fence-${i}`} geometry={GEO.box} scale={[0.1, 0.8, 0.1]}
          position={[platW / 2 - 0.4, 0.95, zp]} material={MAT.fence} castShadow />
      ))}
      {[-platL / 2 + 0.3, platL / 2 - 0.3].map((zp, i) => (
        <mesh key={`fence2-${i}`} geometry={GEO.box} scale={[0.1, 0.8, 0.1]}
          position={[-(platW / 2 - 0.4), 0.95, zp]} material={MAT.fence} castShadow />
      ))}
    </group>
  );
});

// ========== GENERIC STATION RENDERER (non-capital) ==========

const StationRenderer = memo(function StationRenderer({ station }: { station: RailwayStation }) {
  const { position, dims, rotation, sideDir } = useMemo(() => {
    const [sx, sz] = station.position;
    const dims = STATION_DIMS[station.stationType] || STATION_DIMS.small;
    const rotation = getTrackDirectionAtStation(station);

    const sideAngle = rotation + Math.PI / 2;
    const sideDir = station.side === 'south' || station.side === 'west' ? -1 : 1;
    // Offset = half platform width + 2.5u clearance from rail centerline
    const offset = dims.platW / 2 + 2.5;
    const ox = Math.sin(sideAngle) * offset * sideDir;
    const oz = Math.cos(sideAngle) * offset * sideDir;
    const px = sx + ox;
    const pz = sz + oz;

    // Sample the actual platform footprint at its final offset position.
    // Use minY so the platform never floats above the lowest sample point,
    // and warn in DEV if the footprint is in water or extremely uneven.
    const fp = sampleFootprint(px, pz, dims.platW / 2, dims.platL / 2, rotation);
    if (import.meta.env.DEV) {
      if (fp.hasWater) devWarn(`[RailwayStations] ${station.id} footprint touches water at offset (${px.toFixed(1)},${pz.toFixed(1)})`);
      if (fp.heightDelta > 1.6) devWarn(`[RailwayStations] ${station.id} footprint uneven (Δ=${fp.heightDelta.toFixed(2)}u)`);
    }
    const y = fp.minY;

    return {
      position: new THREE.Vector3(px, y, pz),
      dims,
      rotation,
      sideDir,
    };
  }, [station]);

  const { platW, platL, shelterW, shelterL, shelterH, numLamps } = dims;
  const isLarge = station.stationType === 'large';
  const isMedium = station.stationType === 'medium';

  // Shelter offset: away from track side
  const shelterOffX = sideDir * (platW / 2 - shelterW / 2 - 0.4);
  // Lamp positions along platform edge (track side)
  const lampSide = -sideDir * (platW / 2 - 0.4);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ===== PLATFORM ===== */}
      <Platform w={platW} l={platL} />

      {/* ===== MAIN SHELTER ===== */}
      <group position={[shelterOffX, 0.55, 0]}>
        <Shelter w={shelterW} l={shelterL} h={shelterH} />
        {/* Interior bench */}
        <Bench x={0} z={-shelterL / 2 + 0.6} length={shelterW * 0.65} />
      </group>

      {/* ===== LAMPS ALONG PLATFORM EDGE ===== */}
      {Array.from({ length: numLamps }, (_, i) => {
        const spacing = platL / (numLamps + 1);
        const zp = -platL / 2 + spacing * (i + 1);
        return <StationLamp key={`l-${i}`} x={lampSide} z={zp} />;
      })}

      {/* ===== STATION SIGN ===== */}
      <StationSign x={0} z={platL / 2 + 0.5} />

      {/* ===== EXTRA BENCH (OUTSIDE SHELTER) ===== */}
      <Bench x={-shelterOffX * 0.3} z={platL / 4} rotY={Math.PI / 2} />

      {/* ===== LARGE STATION EXTRAS ===== */}
      {isLarge && (
        <>
          <group position={[-shelterOffX * 0.5, 0.55, -platL / 3]}>
            <Crate x={0} z={0} />
            <Crate x={0.65} z={0.15} scale={0.85} />
            <Barrel x={-0.4} z={0.3} />
          </group>
          <Bench x={lampSide * 0.4} z={-platL / 4} length={1.3} />
          <BannerPole x={-platW / 2 + 0.4} z={platL / 2 - 0.5} />
          <BannerPole x={platW / 2 - 0.4} z={platL / 2 - 0.5} color="blue" />
        </>
      )}

      {/* ===== MEDIUM STATION EXTRAS ===== */}
      {isMedium && (
        <>
          <group position={[-shelterOffX * 0.4, 0.55, platL / 4]}>
            <Crate x={0} z={0} scale={0.9} />
            <Barrel x={0.5} z={-0.2} />
          </group>
        </>
      )}

      {/* ===== ALL STATIONS: decorative fence posts at platform ends ===== */}
      {[-platL / 2 + 0.3, platL / 2 - 0.3].map((zp, i) => (
        <mesh key={`fence-${i}`} geometry={GEO.box} scale={[0.1, 0.8, 0.1]}
          position={[lampSide, 0.95, zp]} material={MAT.fence} castShadow />
      ))}
    </group>
  );
});

// ========== MAIN EXPORT ==========

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

// LOD distances per station tier — capital/large visible from far away
const STATION_LOD: Record<string, number> = {
  capital: 800,
  large: 700,
  medium: 600,
  small: 450,
};

export const RailwayStations = memo(function RailwayStations({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group name="railway-stations">
      {RAILWAY_STATIONS.map(station => {
        if (playerPos) {
          const lodDist = STATION_LOD[station.stationType] || 450;
          const dx = playerPos.x - station.position[0];
          const dz = playerPos.z - station.position[1];
          if (dx * dx + dz * dz > lodDist * lodDist) return null;
        }
        // Ironhold Central uses custom junction-aware layout
        if (station.line === 'AB') {
          return <IronholdCentralStation key={station.id} station={station} />;
        }
        return <StationRenderer key={station.id} station={station} />;
      })}
    </group>
  );
});
