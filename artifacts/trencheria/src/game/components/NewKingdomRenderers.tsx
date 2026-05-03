/**
 * NewKingdomRenderers — Settlement renderers for the 5 new kingdom types.
 * Houses are read from KingdomBuildingData (shared source of truth with collision).
 */
import * as THREE from 'three';
import { SettlementDef } from '../world/RegionData';
import { GEO, MAT } from '../world/SettlementPieces';
import { sampleFootprint, WATER_LEVEL_Y } from '../systems/Grounding';
import {
  FORTIFIED_CITY_HOUSES,
  RIVER_TOWN_HOUSES,
  MOUNTAIN_HOLD_HOUSES,
  FRONTIER_CAMP_HOUSES,
  TRADE_CITY_HOUSES,
  KingdomHouseDef,
} from '../world/KingdomBuildingData';

// ========== SHARED BUILDING HELPERS ==========
function SimpleHouse({ pos, rot, w, d, h, mat, roofMat }: {
  pos: [number, number, number]; rot: number; w: number; d: number; h: number;
  mat: THREE.Material; roofMat: THREE.Material;
}) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.15, 0]} geometry={GEO.box}
        scale={[w + 0.3, 0.3, d + 0.3]} material={MAT.cobble}  />
      <mesh position={[0, h / 2 + 0.3, 0]} geometry={GEO.box}
        scale={[w, h, d]} material={mat}  />
      <mesh position={[0, h + 0.3 + h * 0.35, 0]} rotation={[0, Math.PI / 4, 0]} geometry={GEO.cone4}
        scale={[w * 0.72, h * 0.7, d * 0.72]} material={roofMat}  />
      <mesh position={[0, 0.7, d / 2 + 0.02]} geometry={GEO.box}
        scale={[0.8, 1.3, 0.06]} material={MAT.door} />
    </group>
  );
}

function SimpleWall({ from, to, h, mat }: {
  from: [number, number]; to: [number, number]; h: number; mat?: THREE.Material;
}) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  const wallMat = mat || MAT.stone;
  return (
    <group>
      <mesh position={[cx, h / 2, cz]} rotation={[0, angle, 0]}
        geometry={GEO.box} scale={[2, h, len]} material={wallMat}  />
      {len > 5 && Array.from({ length: Math.floor(len / 3) }).map((_, i) => {
        const t = (i + 0.5) / Math.floor(len / 3);
        return (
          <mesh key={i}
            position={[from[0] + dx * t, h + 0.3, from[1] + dz * t]}
            rotation={[0, angle, 0]}
            geometry={GEO.box} scale={[2.2, 0.6, 1]} material={wallMat}  />
        );
      })}
    </group>
  );
}

function SimpleTower({ pos, h, r, mat }: {
  pos: [number, number, number]; h: number; r: number; mat?: THREE.Material;
}) {
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} geometry={GEO.towerGeo}
        scale={[r, h, r]} material={mat || MAT.stone}  />
      <mesh position={[0, h + 1.5, 0]} geometry={GEO.cone8}
        scale={[r * 1.2, 3, r * 1.2]} material={MAT.roofSlate}  />
    </group>
  );
}

// Material lookup helpers for kingdom houses
const FC_MATS = [[MAT.stone, MAT.stoneWarm], [MAT.roofSlate]] as const;
const RT_MATS = [[MAT.daub, MAT.plasterWarm], [MAT.roofThatch, MAT.roofTile]] as const;
const MH_MATS = [[MAT.stoneDark], [MAT.roofSlate]] as const;
const FRONT_MATS = [[MAT.stoneRuin, MAT.woodWeathered], [MAT.tentRagged, MAT.roofThatch]] as const;
const TC_MATS = [[MAT.plasterWarm, MAT.stoneWarm], [MAT.roofTile]] as const;

function renderHouses(houses: KingdomHouseDef[], wallMats: readonly THREE.Material[], roofMats: readonly THREE.Material[], prefix: string, yOffset = 0) {
  return houses.map((h, i) => (
    <SimpleHouse key={`${prefix}-${i}`}
      pos={[h.x, yOffset, h.z]} rot={h.rot}
      w={h.w} d={h.d} h={h.h}
      mat={wallMats[h.matIndex % wallMats.length]}
      roofMat={roofMats[h.roofMatIndex % roofMats.length]} />
  ));
}

// ========== FORTIFIED CITY (Thornwall) ==========
export function FortifiedCity({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to lowest corner of the ±45 wall ring so the city base never floats.
  const fp = sampleFootprint(cx, cz, 45, 45, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Double walls — outer */}
      <SimpleWall from={[-45, -45]} to={[45, -45]} h={7} />
      <SimpleWall from={[45, -45]} to={[45, 45]} h={7} />
      <SimpleWall from={[45, 45]} to={[6, 45]} h={7} />
      <SimpleWall from={[-6, 45]} to={[-45, 45]} h={7} />
      <SimpleWall from={[-45, 45]} to={[-45, -45]} h={7} />

      {/* Corner towers */}
      <SimpleTower pos={[-45, 0, -45]} h={14} r={3.5} />
      <SimpleTower pos={[45, 0, -45]} h={14} r={3.5} />
      <SimpleTower pos={[45, 0, 45]} h={12} r={3} />
      <SimpleTower pos={[-45, 0, 45]} h={12} r={3} />

      {/* Gatehouse towers */}
      <SimpleTower pos={[-5, 0, 45]} h={11} r={2} />
      <SimpleTower pos={[5, 0, 45]} h={11} r={2} />
      {/* Gate archway */}
      <mesh position={[0, 7, 45]} geometry={GEO.box}
        scale={[12, 3, 3.5]} material={MAT.stone}  />
      <mesh position={[0, 4, 45]} geometry={GEO.box}
        scale={[6, 5, 3.5]} material={MAT.dark} />

      {/* Central citadel */}
      <mesh position={[0, 8, -10]} geometry={GEO.box}
        scale={[14, 16, 14]} material={MAT.stoneDark}  />
      <mesh position={[0, 18, -10]} geometry={GEO.cone4}
        scale={[10, 6, 10]} material={MAT.roofSlate}  />
      {/* Citadel green-banner crown (Goblin faction) */}
      <mesh position={[0, 22, -10]} geometry={GEO.box}
        scale={[0.12, 4, 0.12]} material={MAT.timber} />
      <mesh position={[0.5, 23, -10]} geometry={GEO.box}
        scale={[1.0, 1.4, 0.04]} material={MAT.herb}  />
      {/* Wall-top crenellation strip facing the gate */}
      {[-44, -36, -28, -20, -12, 12, 20, 28, 36, 44].map((bx, i) => (
        <mesh key={`crn-${i}`} position={[bx, 7.7, 45]} geometry={GEO.box}
          scale={[1.4, 1.0, 1.6]} material={MAT.stoneDark} />
      ))}
      {/* Gatehouse doors */}
      <mesh position={[-2.5, 3, 45]} geometry={GEO.box}
        scale={[2.5, 5, 0.4]} material={MAT.door} />
      <mesh position={[2.5, 3, 45]} geometry={GEO.box}
        scale={[2.5, 5, 0.4]} material={MAT.door} />
      {/* Gate torches */}
      {[-4, 4].map((tx, i) => (
        <group key={`tor-${i}`} position={[tx, 0, 47]}>
          <mesh position={[0, 1.6, 0]} geometry={GEO.box}
            scale={[0.12, 3.2, 0.12]} material={MAT.timber} />
          <mesh position={[0, 3.4, 0]} geometry={GEO.cone8}
            scale={[0.35, 0.5, 0.35]} material={MAT.fireGlow} />
        </group>
      ))}
      {/* Green faction banners along outer walls */}
      {[[-30, -45], [30, -45], [-45, 0], [45, 0]].map(([bx, bz], i) => (
        <group key={`gban-${i}`} position={[bx, 0, bz]}>
          <mesh position={[0, 8, 0]} geometry={GEO.box}
            scale={[0.1, 6, 0.1]} material={MAT.timber} />
          <mesh position={[0.4, 9, 0]} geometry={GEO.box}
            scale={[0.7, 1.4, 0.04]} material={MAT.herb} />
        </group>
      ))}

      {/* Houses from shared data */}
      {renderHouses(FORTIFIED_CITY_HOUSES, [MAT.stone, MAT.stoneWarm], [MAT.roofSlate], 'fc')}

      {/* Smithy */}
      <mesh position={[-25, 1.2, 5]} geometry={GEO.box}
        scale={[4, 2.4, 3.5]} material={MAT.stoneDark}  />
      <mesh position={[-25, 2.8, 5]} geometry={GEO.box}
        scale={[0.5, 1, 0.5]} material={MAT.stoneDark}  />

      {/* Training yard paving */}
      <mesh position={[20, 0.04, -20]} geometry={GEO.box}
        scale={[14, 0.08, 10]} material={MAT.cobble} />

      {/* Gate approach road */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`road-${i}`} position={[0, 0.04, 47 + i * 3]}
          geometry={GEO.box} scale={[5, 0.08, 2.5]} material={MAT.cobble} />
      ))}

      {/* Well */}
      <mesh position={[10, 0.35, 25]} geometry={GEO.cyl8}
        scale={[0.7, 0.7, 0.7]} material={MAT.cobble}  />
    </group>
  );
}

// ========== RIVER TOWN (Rivermoor) ==========
export function RiverTown({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to lowest corner of the ±25 wall ring so the town deck never floats.
  const fp = sampleFootprint(cx, cz, 25, 25, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Round 4.1 cleanup: visible stone-quay podium pad. The town's macro
          minY sits ~1m below water in patches; the renderer also floor-clamps
          to WATER_LEVEL_Y+0.3 but without this pad you'd see the deck float
          above the lake at the waterfront edges. The pad fills that gap from
          y=-1.0 up to the deck so the city looks GROUNDED on a real quay. */}
      <mesh position={[0, -0.4, 0]} geometry={GEO.box}
        scale={[60, 1.2, 60]} material={MAT.cobble} />
      {/* Waterfront docks — wooden platform */}
      <mesh position={[0, 0.3, -30]} geometry={GEO.box}
        scale={[40, 0.4, 8]} material={MAT.woodDark}  />
      {/* Dock posts */}
      {[-18, -10, -2, 6, 14].map((xOff, i) => (
        <mesh key={`dock-${i}`} position={[xOff, -0.5, -34]}
          geometry={GEO.box} scale={[0.3, 2, 0.3]} material={MAT.timber}  />
      ))}

      {/* Town hall — prominent */}
      <SimpleHouse pos={[0, 0, 0]} rot={0} w={8} d={10} h={5}
        mat={MAT.stoneWarm} roofMat={MAT.roofTile} />
      {/* Clock tower */}
      <mesh position={[0, 10, -5]} geometry={GEO.box}
        scale={[3, 6, 3]} material={MAT.stoneLight}  />
      <mesh position={[0, 14, -5]} geometry={GEO.cone8}
        scale={[2.2, 3, 2.2]} material={MAT.roofSlate}  />

      {/* Houses from shared data */}
      {renderHouses(RIVER_TOWN_HOUSES, [MAT.daub, MAT.plasterWarm], [MAT.roofThatch, MAT.roofTile], 'rt')}

      {/* Market stalls near dock */}
      {[-8, -2, 4, 10].map((xOff, i) => (
        <group key={`stall-${i}`} position={[xOff, 0, -22]}>
          <mesh position={[0, 0.85, 0]} geometry={GEO.box}
            scale={[1.8, 0.08, 1]} material={MAT.woodLight}  />
          <mesh position={[0, 2, 0]} rotation={[0.12, 0, 0]} geometry={GEO.box}
            scale={[2, 0.04, 1.2]} material={MAT.tent}  />
        </group>
      ))}

      {/* Fishing boats */}
      {[-15, 5].map((xOff, i) => (
        <mesh key={`boat-${i}`} position={[xOff, -0.3, -36]} rotation={[0, 0.3, 0]}
          geometry={GEO.box} scale={[1.5, 0.4, 3.5]} material={MAT.woodWeathered}  />
      ))}

      {/* Low wooden fence perimeter */}
      <mesh position={[0, 0.35, 30]} geometry={GEO.box}
        scale={[60, 0.7, 0.12]} material={MAT.fence}  />
      <mesh position={[-30, 0.35, 0]} geometry={GEO.box}
        scale={[0.12, 0.7, 60]} material={MAT.fence}  />
      <mesh position={[30, 0.35, 0]} geometry={GEO.box}
        scale={[0.12, 0.7, 60]} material={MAT.fence}  />

      {/* Lighthouse */}
      <mesh position={[25, 5, -28]} geometry={GEO.cyl8}
        scale={[1.5, 10, 1.5]} material={MAT.stoneWarm}  />
      <mesh position={[25, 11, -28]} geometry={GEO.cone8}
        scale={[2, 2, 2]} material={MAT.roofSlate}  />
      <mesh position={[25, 12.5, -28]} geometry={GEO.box}
        scale={[0.3, 0.3, 0.3]} material={MAT.lantern} />
      {/* Lighthouse glow */}
      <mesh position={[25, 12.5, -28]} geometry={GEO.sphere8}
        scale={[1.2, 1.2, 1.2]} material={MAT.fireGlow} />

      {/* Quay paving extending the dock front */}
      <mesh position={[0, 0.05, -25]} geometry={GEO.box}
        scale={[44, 0.1, 6]} material={MAT.cobble} />

      {/* Teal Octopus banners along the waterfront */}
      {[[-18, -25], [18, -25], [-25, -10], [25, -10]].map(([bx, bz], i) => (
        <group key={`tban-${i}`} position={[bx, 0, bz]}>
          <mesh position={[0, 2.3, 0]} geometry={GEO.box}
            scale={[0.08, 4.6, 0.08]} material={MAT.timber} />
          <mesh position={[0.35, 3.6, 0]} geometry={GEO.box}
            scale={[0.65, 1.0, 0.04]} material={MAT.shutter} />
        </group>
      ))}

      {/* Quay lanterns */}
      {[-12, 0, 12].map((lx, i) => (
        <group key={`qlamp-${i}`} position={[lx, 0, -23]}>
          <mesh position={[0, 1.2, 0]} geometry={GEO.box}
            scale={[0.12, 2.4, 0.12]} material={MAT.timber} />
          <mesh position={[0, 2.6, 0]} geometry={GEO.box}
            scale={[0.35, 0.35, 0.35]} material={MAT.lantern} />
        </group>
      ))}
    </group>
  );
}

// ========== MOUNTAIN HOLD (Stonepeak) ==========
export function MountainHold({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to the LOWEST corner of the outer wall footprint so the 50×50 stone
  // platform never floats over noise residue inside the plateau zone.
  const fp = sampleFootprint(cx, cz, 25, 25, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Massive stone platform */}
      <mesh position={[0, 1.5, 0]} geometry={GEO.box}
        scale={[50, 3, 50]} material={MAT.cobble}  />

      {/* Great Hall — carved stone */}
      <mesh position={[0, 7, 0]} geometry={GEO.box}
        scale={[16, 10, 20]} material={MAT.stoneDark}  />
      <mesh position={[0, 13, 0]} geometry={GEO.cone4}
        scale={[12, 5, 15]} material={MAT.roofSlate}  />

      {/* Flanking towers */}
      <SimpleTower pos={[-10, 3, -12]} h={16} r={3} mat={MAT.stoneDark} />
      <SimpleTower pos={[10, 3, -12]} h={16} r={3} mat={MAT.stoneDark} />

      {/* Walls — Round 4.1: -z wall now has a SERVICE gate gap so the
          Goldenvale → Stonepeak road can enter from the south face without
          plowing through wall geometry. Both gates flanked by gate towers. */}
      <SimpleWall from={[-25, -25]} to={[-5, -25]} h={6} mat={MAT.stoneDark} />
      <SimpleWall from={[5, -25]} to={[25, -25]} h={6} mat={MAT.stoneDark} />
      <SimpleWall from={[25, -25]} to={[25, 25]} h={6} mat={MAT.stoneDark} />
      <SimpleWall from={[25, 25]} to={[5, 25]} h={6} mat={MAT.stoneDark} />
      <SimpleWall from={[-5, 25]} to={[-25, 25]} h={6} mat={MAT.stoneDark} />
      <SimpleWall from={[-25, 25]} to={[-25, -25]} h={6} mat={MAT.stoneDark} />

      {/* Corner towers */}
      <SimpleTower pos={[-25, 3, -25]} h={10} r={2.5} mat={MAT.stoneDark} />
      <SimpleTower pos={[25, 3, -25]} h={10} r={2.5} mat={MAT.stoneDark} />
      <SimpleTower pos={[25, 3, 25]} h={10} r={2.5} mat={MAT.stoneDark} />
      <SimpleTower pos={[-25, 3, 25]} h={10} r={2.5} mat={MAT.stoneDark} />

      {/* +z (front) gate towers */}
      <SimpleTower pos={[-4, 3, 25]} h={9} r={1.8} mat={MAT.stoneDark} />
      <SimpleTower pos={[4, 3, 25]} h={9} r={1.8} mat={MAT.stoneDark} />
      {/* -z (back / service) gate towers */}
      <SimpleTower pos={[-4, 3, -25]} h={9} r={1.8} mat={MAT.stoneDark} />
      <SimpleTower pos={[4, 3, -25]} h={9} r={1.8} mat={MAT.stoneDark} />
      {/* Service-gate stairs descending the back face toward the
          Goldenvale road that now terminates at (-400, 472) world. */}
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={`bstair-${i}`} position={[0, i * 0.5, -27 - i * 1.5]}
          geometry={GEO.box} scale={[6, 0.4, 1.2]} material={MAT.cobble}  />
      ))}

      {/* Inner buildings from shared data */}
      {renderHouses(MOUNTAIN_HOLD_HOUSES, [MAT.stoneDark], [MAT.roofSlate], 'mh', 3)}

      {/* Mine entrance */}
      <mesh position={[-20, 4, -5]} geometry={GEO.box}
        scale={[3, 3, 2]} material={MAT.dark} />
      <mesh position={[-20, 5.8, -5]} geometry={GEO.box}
        scale={[4, 0.5, 2.5]} material={MAT.stoneDark}  />

      {/* Stairs approach */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <mesh key={`stair-${i}`} position={[0, i * 0.5, 27 + i * 1.5]}
          geometry={GEO.box} scale={[6, 0.4, 1.2]} material={MAT.cobble}  />
      ))}

      {/* Blue Soldier banners on the gate towers */}
      {[[-10, 12], [10, 12]].map(([bx, bz], i) => (
        <group key={`mhban-${i}`} position={[bx, 3, bz]}>
          <mesh position={[0, 8, 0]} geometry={GEO.box}
            scale={[0.1, 16, 0.1]} material={MAT.timber} />
          <mesh position={[0.5, 12, 0]} geometry={GEO.box}
            scale={[0.9, 2.0, 0.04]} material={MAT.bannerBlue} />
        </group>
      ))}
      {/* Wall battlements (stone teeth) */}
      {[-22, -16, -10, 10, 16, 22].map((bx, i) => (
        <mesh key={`mhcr-${i}`} position={[bx, 6.7, -25]} geometry={GEO.box}
          scale={[1.4, 1.0, 1.6]} material={MAT.stoneDark} />
      ))}
      {/* Mine cart prop near the entrance */}
      <group position={[-23, 3, -3]}>
        <mesh position={[0, 0.5, 0]} geometry={GEO.box}
          scale={[2, 0.9, 1.2]} material={MAT.woodDark} />
        <mesh position={[-0.7, 0.15, -0.5]} geometry={GEO.cyl8}
          rotation={[Math.PI / 2, 0, 0]} scale={[0.3, 0.2, 0.3]} material={MAT.iron} />
        <mesh position={[0.7, 0.15, -0.5]} geometry={GEO.cyl8}
          rotation={[Math.PI / 2, 0, 0]} scale={[0.3, 0.2, 0.3]} material={MAT.iron} />
      </group>
      {/* Brazier on great hall steps */}
      <group position={[0, 3, 12]}>
        <mesh position={[0, 0.5, 0]} geometry={GEO.cyl8}
          scale={[0.6, 1, 0.6]} material={MAT.iron} />
        <mesh position={[0, 1.4, 0]} geometry={GEO.cone8}
          scale={[0.5, 0.7, 0.5]} material={MAT.fireGlow} />
      </group>
    </group>
  );
}

// ========== FRONTIER CAMP (Darkhollow) ==========
export function FrontierCamp({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // GROUNDING FIX (Codex follow-up): sampleFootprint over the ±27 palisade
  // ring so Darkhollow can never float over noise residue or sink into a
  // dip. Was previously raw getTerrainHeight(cx, cz) which sampled a
  // single noisy point and let pieces clip the ground at footprint edges.
  const fp = sampleFootprint(cx, cz, 27, 27, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Cracked dirt plaza covering the full footprint */}
      <mesh position={[0, 0.03, 0]} geometry={GEO.box}
        scale={[54, 0.06, 54]} material={MAT.dirt} />

      {/* Ruined grand wall fragments */}
      <mesh position={[-30, 3, -25]} geometry={GEO.box}
        scale={[2, 6, 20]} material={MAT.stoneRuin}  />
      <mesh position={[25, 2, -20]} geometry={GEO.box}
        scale={[2, 4, 15]} material={MAT.stoneRuin}  />
      <mesh position={[0, 2.5, -30]} geometry={GEO.box}
        scale={[30, 5, 2]} material={MAT.stoneRuin}  />
      {/* Toppled wall block */}
      <mesh position={[-15, 0.6, -28]} rotation={[0, 0.4, 0.15]} geometry={GEO.box}
        scale={[3, 1.2, 2]} material={MAT.stoneRuin} />

      {/* Houses from shared data */}
      {renderHouses(FRONTIER_CAMP_HOUSES, [MAT.stoneRuin, MAT.woodWeathered], [MAT.tentRagged, MAT.roofThatch], 'front')}

      {/* Central gathering fire */}
      <mesh position={[0, 0.04, 0]} geometry={GEO.box}
        scale={[8, 0.08, 8]} material={MAT.cobble} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i / 8) * Math.PI * 2;
        return <mesh key={`fr-${i}`}
          position={[Math.cos(a) * 1, 0.1, Math.sin(a) * 1]}
          geometry={GEO.box} scale={[0.25, 0.2, 0.25]} material={MAT.stoneDark}  />;
      })}
      <mesh position={[0, 0.4, 0]} geometry={GEO.box}
        scale={[0.3, 0.5, 0.3]} material={MAT.fire} />
      <mesh position={[0, 0.85, 0]} geometry={GEO.cone8}
        scale={[0.6, 1.0, 0.6]} material={MAT.fireGlow} />

      {/* Secondary campfires for survivor camp feel */}
      {[[12, -8], [-14, 6], [-6, 14]].map(([fx, fz], i) => (
        <group key={`fire2-${i}`} position={[fx, 0, fz]}>
          <mesh position={[0, 0.04, 0]} geometry={GEO.box}
            scale={[2, 0.08, 2]} material={MAT.charred} />
          <mesh position={[0, 0.25, 0]} geometry={GEO.box}
            scale={[0.2, 0.3, 0.2]} material={MAT.fire} />
        </group>
      ))}

      {/* Makeshift palisade — sharpened tops */}
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const gateAngle = 0;
        const angleDiff = Math.abs(((a - gateAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
        if (angleDiff < 0.3) return null;
        const px = Math.cos(a) * 25;
        const pz = Math.sin(a) * 25;
        return (
          <group key={`pal-${i}`} position={[px, 0, pz]} rotation={[0, -a, 0]}>
            <mesh position={[0, 1.2, 0]} geometry={GEO.box}
              scale={[0.3, 2.4, 0.7]} material={MAT.palisade}  />
            <mesh position={[0, 2.6, 0]} geometry={GEO.cone4}
              scale={[0.45, 0.5, 0.85]} material={MAT.palisadeSharp}  />
          </group>
        );
      })}

      {/* Lookout towers — Round 4.1: NW lookout pulled inboard 5m so the
          Ashkeep approach road clears it by ≥3m (was 1.9m). */}
      <SimpleTower pos={[-25, 0, 23]} h={8} r={1.5} mat={MAT.woodWeathered} />
      <SimpleTower pos={[18, 0, -18]} h={8} r={1.5} mat={MAT.woodWeathered} />

      {/* Crimson NemoClaw banners (faction identity) */}
      {[[-20, 26], [20, 26]].map(([bx, bz], i) => (
        <group key={`crim-${i}`} position={[bx, 0, bz]}>
          <mesh position={[0, 2.5, 0]} geometry={GEO.box}
            scale={[0.08, 5, 0.08]} material={MAT.timber} />
          <mesh position={[0.4, 4, 0]} geometry={GEO.box}
            scale={[0.7, 1.1, 0.04]} material={MAT.bloodStain} />
        </group>
      ))}

      {/* Supply piles */}
      <mesh position={[8, 0.25, 8]} geometry={GEO.box}
        scale={[2, 0.5, 1.5]} material={MAT.woodDark}  />
      <mesh position={[-10, 0.3, -5]} geometry={GEO.cyl8}
        scale={[0.25, 0.5, 0.25]} material={MAT.barrel}  />
      <mesh position={[10, 0.4, -10]} geometry={GEO.cyl8}
        scale={[0.3, 0.8, 0.3]} material={MAT.barrel}  />

      {/* Gate approach */}
      {[0, 1, 2].map(i => (
        <mesh key={`froad-${i}`} position={[0, 0.04, 27 + i * 3]}
          geometry={GEO.box} scale={[4, 0.08, 2.5]} material={MAT.cobble} />
      ))}
    </group>
  );
}

// ========== TRADE CITY (Goldenvale) ==========
export function TradeCity({ def }: { def: SettlementDef }) {
  const [cx, cz] = def.position;
  // Anchor to lowest corner of the wall ring so the trade-city base never floats.
  const fp = sampleFootprint(cx, cz, 40, 35, 0);
  const y = Math.max(fp.minY, WATER_LEVEL_Y + 0.3);

  return (
    <group position={[cx, y, cz]}>
      {/* Round 4.1 cleanup: visible stone foundation pad. Macro minY dips
          to -0.58m at the southern edge; without this pad the floor-clamp
          alone would leave a visible gap between city floor and natural
          ground. The pad extends past the wall ring on all sides. */}
      <mesh position={[0, -0.4, 0]} geometry={GEO.box}
        scale={[84, 1.2, 74]} material={MAT.stoneWarm}  />
      {/* Ornate walls */}
      <SimpleWall from={[-40, -35]} to={[40, -35]} h={6} mat={MAT.stoneWarm} />
      <SimpleWall from={[40, -35]} to={[40, 35]} h={6} mat={MAT.stoneWarm} />
      <SimpleWall from={[40, 35]} to={[5, 35]} h={6} mat={MAT.stoneWarm} />
      <SimpleWall from={[-5, 35]} to={[-40, 35]} h={6} mat={MAT.stoneWarm} />
      <SimpleWall from={[-40, 35]} to={[-40, -35]} h={6} mat={MAT.stoneWarm} />

      {/* Corner towers with gold-tipped roofs */}
      {[[-40, -35], [40, -35], [40, 35], [-40, 35]].map(([tx, tz], i) => (
        <SimpleTower key={`ct-${i}`} pos={[tx, 0, tz]} h={10} r={2.5} mat={MAT.stoneWarm} />
      ))}

      {/* Gatehouse towers */}
      <SimpleTower pos={[-4, 0, 35]} h={9} r={1.8} mat={MAT.stoneWarm} />
      <SimpleTower pos={[4, 0, 35]} h={9} r={1.8} mat={MAT.stoneWarm} />
      <mesh position={[0, 6, 35]} geometry={GEO.box}
        scale={[10, 2.5, 3]} material={MAT.stoneWarm}  />
      <mesh position={[0, 3.5, 35]} geometry={GEO.box}
        scale={[5, 4, 3.5]} material={MAT.dark} />

      {/* Grand trade hall */}
      <mesh position={[0, 5, -10]} geometry={GEO.box}
        scale={[14, 10, 12]} material={MAT.plasterWarm}  />
      <mesh position={[0, 11.5, -10]} geometry={GEO.cone4}
        scale={[10, 5, 9]} material={MAT.roofTile}  />
      {/* Gold trim on trade hall */}
      <mesh position={[0, 10, -4.01]} geometry={GEO.box}
        scale={[14, 0.15, 0.05]} material={MAT.goldTrim} />

      {/* Market plaza */}
      <mesh position={[0, 0.05, 10]} geometry={GEO.box}
        scale={[24, 0.1, 16]} material={MAT.cobble} />
      {/* Market stalls */}
      {[-10, -4, 2, 8].map((xOff, i) => (
        <group key={`ms-${i}`} position={[xOff, 0, 8]}>
          <mesh position={[0, 0.85, 0]} geometry={GEO.box}
            scale={[2, 0.08, 1.2]} material={MAT.woodLight}  />
          <mesh position={[0, 2.1, 0]} rotation={[0.12, 0, 0]} geometry={GEO.box}
            scale={[2.2, 0.04, 1.5]} material={MAT.tent}  />
        </group>
      ))}

      {/* Houses from shared data */}
      {renderHouses(TRADE_CITY_HOUSES, [MAT.plasterWarm, MAT.stoneWarm], [MAT.roofTile], 'tc')}

      {/* Fountain in market center */}
      <mesh position={[0, 0.5, 12]} geometry={GEO.cyl8}
        scale={[1.5, 1, 1.5]} material={MAT.stoneLight}  />
      <mesh position={[0, 1.2, 12]} geometry={GEO.cyl8}
        scale={[0.3, 0.8, 0.3]} material={MAT.stoneLight}  />
      <mesh position={[0, 0.6, 12]} geometry={GEO.cyl8}
        scale={[1.2, 0.3, 1.2]} material={MAT.water} />

      {/* Gate approach road */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`troad-${i}`} position={[0, 0.04, 37 + i * 3]}
          geometry={GEO.box} scale={[5, 0.08, 2.5]} material={MAT.cobble} />
      ))}

      {/* Banners */}
      {[-3, 3].map((xOff, i) => (
        <group key={`ban-${i}`} position={[xOff, 0, 34]}>
          <mesh position={[0, 3, 0]} geometry={GEO.box}
            scale={[0.08, 6, 0.08]} material={MAT.timber}  />
          <mesh position={[0.4, 5, 0]} geometry={GEO.box}
            scale={[0.7, 1.1, 0.03]} material={MAT.bannerGold}  />
        </group>
      ))}
      {/* Extra gold banners on corner towers */}
      {[[-40, -35], [40, -35], [40, 35], [-40, 35]].map(([bx, bz], i) => (
        <group key={`tcban-${i}`} position={[bx, 0, bz]}>
          <mesh position={[0, 12, 0]} geometry={GEO.box}
            scale={[0.1, 5, 0.1]} material={MAT.timber} />
          <mesh position={[0.4, 13, 0]} geometry={GEO.box}
            scale={[0.7, 1.2, 0.03]} material={MAT.bannerGold} />
        </group>
      ))}
      {/* Plaza lanterns */}
      {[[-8, 14], [8, 14], [-8, 6], [8, 6]].map(([lx, lz], i) => (
        <group key={`tclamp-${i}`} position={[lx, 0, lz]}>
          <mesh position={[0, 1.4, 0]} geometry={GEO.box}
            scale={[0.12, 2.8, 0.12]} material={MAT.timber} />
          <mesh position={[0, 2.95, 0]} geometry={GEO.box}
            scale={[0.35, 0.35, 0.35]} material={MAT.lantern} />
        </group>
      ))}
      {/* Gold trim on gatehouse */}
      <mesh position={[0, 7.3, 35]} geometry={GEO.box}
        scale={[10.2, 0.2, 0.06]} material={MAT.goldTrim} />
      {/* Trade hall doors */}
      <mesh position={[0, 2, -4]} geometry={GEO.box}
        scale={[3, 4, 0.3]} material={MAT.door} />
      {/* Crops/wares around plaza for trade-city flavor */}
      {[[-11, 14], [-11, 6], [11, 14], [11, 6]].map(([px, pz], i) => (
        <mesh key={`crate-${i}`} position={[px, 0.4, pz]} geometry={GEO.box}
          scale={[1.2, 0.8, 1]} material={MAT.woodLight} />
      ))}
    </group>
  );
}
