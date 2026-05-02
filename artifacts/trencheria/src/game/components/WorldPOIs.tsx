/**
 * World POIs and small landmarks renderer.
 * Each POI type has distinct, atmospheric medieval architecture.
 */
import * as THREE from 'three';
import { SMALL_POIS, SmallPOIDef } from '../world/RegionData';
import { GEO, MAT } from '../world/SettlementPieces';
import { getTerrainHeight } from './Terrain';
import { sampleCircleFootprint } from '../systems/Grounding';

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

function SmallPOIRenderer({ poi, playerPos }: { poi: SmallPOIDef; playerPos: THREE.Vector3 | null }) {
  if (playerPos) {
    const dx = playerPos.x - poi.position[0];
    const dz = playerPos.z - poi.position[1];
    if (dx * dx + dz * dz > 140 * 140) return null;
  }

  const [px, pz] = poi.position;
  // Anchor to LOWEST sample within a 3u radius so towers/shrines on slopes
  // don't have one corner floating above the ground.
  const y = sampleCircleFootprint(px, pz, 3).minY;

  switch (poi.type) {
    case 'shrine':
      return (
        <group position={[px, y, pz]}>
          {/* Stone base platform */}
          <mesh position={[0, 0.15, 0]} geometry={GEO.box}
            scale={[2.5, 0.3, 2.5]} material={MAT.cobble} castShadow />
          {/* Main stone */}
          <mesh position={[0, 1.2, 0]} geometry={GEO.box}
            scale={[0.7, 1.8, 0.35]} material={MAT.stoneWarm} castShadow />
          {/* Cross / top piece */}
          <mesh position={[0, 2.4, 0]} geometry={GEO.cone4}
            scale={[0.4, 0.6, 0.4]} material={MAT.stone} castShadow />
          {/* Offering bowl */}
          <mesh position={[0.8, 0.4, 0]} geometry={GEO.cyl8}
            scale={[0.2, 0.15, 0.2]} material={MAT.stoneDark} castShadow />
          {/* Candle */}
          <mesh position={[-0.5, 0.45, 0.3]} geometry={GEO.box}
            scale={[0.06, 0.2, 0.06]} material={MAT.cloth} />
          <mesh position={[-0.5, 0.58, 0.3]} geometry={GEO.box}
            scale={[0.03, 0.06, 0.03]} material={MAT.fire} />
        </group>
      );
    case 'wagon':
      return (
        <group position={[px, y, pz]} rotation={[0, Math.sin(px) * 2, Math.sin(pz) * 0.12]}>
          {/* Wagon body */}
          <mesh position={[0, 0.5, 0]} geometry={GEO.box}
            scale={[1.5, 0.5, 3]} material={MAT.woodDark} castShadow />
          {/* Sides */}
          <mesh position={[-0.7, 0.85, 0]} geometry={GEO.box}
            scale={[0.08, 0.4, 2.8]} material={MAT.woodWeathered} castShadow />
          <mesh position={[0.7, 0.85, 0]} geometry={GEO.box}
            scale={[0.08, 0.4, 2.8]} material={MAT.woodWeathered} castShadow />
          {/* Shafts */}
          <mesh position={[-0.5, 0.35, -2]} geometry={GEO.box}
            scale={[0.06, 0.06, 1.5]} material={MAT.woodDark} />
          <mesh position={[0.5, 0.35, -2]} geometry={GEO.box}
            scale={[0.06, 0.06, 1.5]} material={MAT.woodDark} />
          {/* Wheel shapes */}
          <mesh position={[-0.8, 0.35, 0.7]} geometry={GEO.cyl8}
            scale={[0.3, 0.06, 0.3]} material={MAT.timber} castShadow />
          <mesh position={[0.8, 0.35, 0.7]} geometry={GEO.cyl8}
            scale={[0.3, 0.06, 0.3]} material={MAT.timber} castShadow />
          {/* Spilled cargo */}
          <mesh position={[1.5, 0.2, 0.5]} geometry={GEO.box}
            scale={[0.4, 0.4, 0.4]} material={MAT.barrel} castShadow />
          <mesh position={[1.2, 0.15, -0.3]} rotation={[0.3, 0.5, 0]} geometry={GEO.box}
            scale={[0.3, 0.3, 0.3]} material={MAT.woodDark} castShadow />
        </group>
      );
    case 'bridge':
      return (
        <group position={[px, y, pz]}>
          {/* Bridge deck */}
          <mesh position={[0, 1, 0]} geometry={GEO.box}
            scale={[5, 0.4, 2.2]} material={MAT.stoneDark} castShadow />
          {/* Railings */}
          <mesh position={[-2.2, 1.5, 0]} geometry={GEO.box}
            scale={[0.3, 1.2, 2.2]} material={MAT.stone} castShadow />
          <mesh position={[2.2, 1.5, 0]} geometry={GEO.box}
            scale={[0.3, 1.2, 2.2]} material={MAT.stone} castShadow />
          {/* Support pillars */}
          <mesh position={[-1, 0.3, 0]} geometry={GEO.box}
            scale={[0.6, 1, 0.6]} material={MAT.cobble} castShadow />
          <mesh position={[1, 0.3, 0]} geometry={GEO.box}
            scale={[0.6, 1, 0.6]} material={MAT.cobble} castShadow />
        </group>
      );
    case 'graveyard':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 0.03, 0]} geometry={GEO.box}
            scale={[8, 0.06, 6]} material={MAT.moss} />
          {Array.from({ length: 8 }).map((_, i) => (
            <group key={i} position={[(i % 4) * 1.5 - 2.25, 0, Math.floor(i / 4) * 2.5 - 1.25]}
              rotation={[0, 0, Math.sin(i * 3.7) * 0.1]}>
              <mesh position={[0, 0.45, 0]} geometry={GEO.box}
                scale={[0.5, 0.9, 0.12]} material={MAT.grave} castShadow />
            </group>
          ))}
          {/* Dead tree */}
          <mesh position={[3, 1.5, -2]} geometry={GEO.box}
            scale={[0.15, 3, 0.15]} material={MAT.timber} castShadow />
          <mesh position={[3.3, 2.8, -2]} rotation={[0, 0, 0.5]} geometry={GEO.box}
            scale={[0.08, 1.2, 0.08]} material={MAT.timber} castShadow />
        </group>
      );
    case 'hunter_camp':
      return (
        <group position={[px, y, pz]}>
          {/* Tent */}
          <mesh position={[0, 0.9, 0]} geometry={GEO.cone6}
            scale={[1.8, 1.8, 1.8]} material={MAT.tent} castShadow />
          {/* Drying rack */}
          <group position={[2.5, 0, 0]}>
            <mesh position={[-0.5, 0.8, 0]} geometry={GEO.box}
              scale={[0.08, 1.6, 0.08]} material={MAT.timber} castShadow />
            <mesh position={[0.5, 0.8, 0]} geometry={GEO.box}
              scale={[0.08, 1.6, 0.08]} material={MAT.timber} castShadow />
            <mesh position={[0, 1.5, 0]} geometry={GEO.box}
              scale={[1.2, 0.06, 0.06]} material={MAT.timber} castShadow />
            {/* Hanging pelts */}
            <mesh position={[0, 1.1, 0]} geometry={GEO.box}
              scale={[0.5, 0.6, 0.04]} material={MAT.leather} castShadow />
          </group>
          {/* Fire ring */}
          {[0, 1, 2, 3, 4, 5].map(i => {
            const a = (i / 6) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 0.45 + 2.5, 0.08, Math.sin(a) * 0.45 + 2]}
              geometry={GEO.box} scale={[0.18, 0.14, 0.18]} material={MAT.stoneDark} castShadow />;
          })}
          <mesh position={[2.5, 0.2, 2]} geometry={GEO.box}
            scale={[0.12, 0.2, 0.12]} material={MAT.fire} />
        </group>
      );
    case 'ruined_house':
      return (
        <group position={[px, y, pz]}>
          {/* Foundation */}
          <mesh position={[0, 0.15, 0]} geometry={GEO.box}
            scale={[5, 0.3, 4]} material={MAT.cobble} castShadow />
          {/* Remaining walls */}
          <mesh position={[-2.3, 1, 0]} geometry={GEO.box}
            scale={[0.4, 2, 3.5]} material={MAT.stoneRuin} castShadow />
          <mesh position={[0, 1.3, -1.8]} geometry={GEO.box}
            scale={[4.2, 2.6, 0.4]} material={MAT.stoneRuin} castShadow />
          {/* Collapsed wall piece */}
          <mesh position={[1.5, 0.3, 1.5]} rotation={[0.3, 0.2, 0.5]} geometry={GEO.box}
            scale={[2, 1, 0.35]} material={MAT.stoneRuin} castShadow />
          {/* Debris */}
          <mesh position={[0.5, 0.15, 0.5]} geometry={GEO.box}
            scale={[0.6, 0.3, 0.5]} material={MAT.stoneRuin} castShadow />
        </group>
      );
    case 'watchtower':
      return (
        <group position={[px, y, pz]}>
          {/* Tower */}
          <mesh position={[0, 5, 0]} geometry={GEO.box}
            scale={[2.5, 10, 2.5]} material={MAT.woodDark} castShadow />
          {/* Platform */}
          <mesh position={[0, 10.3, 0]} geometry={GEO.box}
            scale={[3.5, 0.25, 3.5]} material={MAT.woodDark} castShadow />
          {/* Railing */}
          {[[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]].map(([rx, rz], i) => (
            <mesh key={i} position={[rx, 11, rz]} geometry={GEO.box}
              scale={[i < 2 ? 0.08 : 3.2, 1.2, i < 2 ? 3.2 : 0.08]} material={MAT.timber} castShadow />
          ))}
          {/* Signal pole */}
          <mesh position={[0, 12.5, 0]} geometry={GEO.box}
            scale={[0.1, 3, 0.1]} material={MAT.timber} castShadow />
          {/* Brazier on top */}
          <mesh position={[0, 14.2, 0]} geometry={GEO.box}
            scale={[0.3, 0.25, 0.3]} material={MAT.iron} castShadow />
          <mesh position={[0, 14.5, 0]} geometry={GEO.box}
            scale={[0.15, 0.15, 0.15]} material={MAT.fire} />
          {/* Ladder */}
          <mesh position={[1.3, 5, 0]} geometry={GEO.box}
            scale={[0.06, 10, 0.5]} material={MAT.timber} castShadow />
        </group>
      );
    case 'cave':
      return (
        <group position={[px, y, pz]}>
          {/* Rock mass */}
          <mesh position={[0, 1.5, -0.5]} geometry={GEO.box}
            scale={[4, 3, 2.5]} material={MAT.stoneDark} castShadow />
          <mesh position={[1, 2, -1]} geometry={GEO.box}
            scale={[2.5, 2, 2]} material={MAT.stoneDark} castShadow />
          {/* Cave opening */}
          <mesh position={[0, 0.8, 0.8]} geometry={GEO.box}
            scale={[1.8, 1.6, 0.3]} material={MAT.dark} />
          {/* Stalactite */}
          <mesh position={[0.3, 1.6, 0.7]} geometry={GEO.cone4}
            scale={[0.15, 0.4, 0.15]} material={MAT.stoneDark} />
          {/* Moss */}
          <mesh position={[-1, 0.04, 1]} geometry={GEO.box}
            scale={[1.5, 0.08, 1]} material={MAT.moss} />
        </group>
      );
    case 'watchpost':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 2.5, 0]} geometry={GEO.box}
            scale={[0.2, 5, 0.2]} material={MAT.timber} castShadow />
          <mesh position={[0, 4.5, 0]} geometry={GEO.box}
            scale={[2, 0.12, 2]} material={MAT.woodDark} castShadow />
          {/* Small roof */}
          <mesh position={[0, 5.3, 0]} geometry={GEO.cone4}
            scale={[1.5, 1.2, 1.5]} material={MAT.roofThatch} castShadow />
        </group>
      );
    case 'inn':
      return (
        <group position={[px, y, pz]}>
          {/* Foundation */}
          <mesh position={[0, 0.2, 0]} geometry={GEO.box}
            scale={[7, 0.4, 6]} material={MAT.cobble} castShadow />
          {/* Main structure */}
          <mesh position={[0, 2.2, 0]} geometry={GEO.box}
            scale={[6.5, 3.5, 5.5]} material={MAT.plasterWarm} castShadow />
          {/* Timber framing */}
          <mesh position={[0, 2.2, 2.76]} geometry={GEO.box}
            scale={[6.5, 0.12, 0.06]} material={MAT.timber} />
          <mesh position={[0, 0.6, 2.76]} geometry={GEO.box}
            scale={[6.5, 0.12, 0.06]} material={MAT.timber} />
          <mesh position={[0, 4, 2.76]} geometry={GEO.box}
            scale={[6.5, 0.12, 0.06]} material={MAT.timber} />
          {/* Roof */}
          <mesh position={[0, 5, 0]} geometry={GEO.cone4}
            scale={[5, 2.8, 4.5]} material={MAT.roofTile} castShadow />
          {/* Door */}
          <mesh position={[0, 1, 2.76]} geometry={GEO.box}
            scale={[1, 1.8, 0.08]} material={MAT.door} castShadow />
          {/* Sign */}
          <mesh position={[-2.5, 3.2, 2.8]} geometry={GEO.box}
            scale={[0.08, 2, 0.08]} material={MAT.timber} castShadow />
          <mesh position={[-2.5, 3.8, 2.8]} geometry={GEO.box}
            scale={[0.8, 0.5, 0.04]} material={MAT.woodLight} castShadow />
          {/* Chimney */}
          <mesh position={[2, 5.5, -1]} geometry={GEO.box}
            scale={[0.5, 1.5, 0.5]} material={MAT.stoneDark} castShadow />
          {/* Windows */}
          <mesh position={[1.5, 2.5, 2.77]} geometry={GEO.box}
            scale={[0.8, 0.6, 0.06]} material={MAT.dark} />
          <mesh position={[-1.5, 2.5, 2.77]} geometry={GEO.box}
            scale={[0.8, 0.6, 0.06]} material={MAT.dark} />
          {/* Benches outside */}
          <mesh position={[2, 0.3, 3.2]} geometry={GEO.box}
            scale={[1.2, 0.08, 0.3]} material={MAT.woodDark} castShadow />
          <mesh position={[-2, 0.3, 3.2]} geometry={GEO.box}
            scale={[1.2, 0.08, 0.3]} material={MAT.woodDark} castShadow />
        </group>
      );
    case 'clearing':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 0.03, 0]} geometry={GEO.box}
            scale={[8, 0.06, 8]} material={MAT.crop} />
          {[[-2, -2], [2, 2], [-3, 1], [1, -3]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx, 0.2, sz]} geometry={GEO.box}
              scale={[0.8, 0.4, 0.8]} material={MAT.stoneDark} castShadow />
          ))}
          {/* Fallen log */}
          <mesh position={[3, 0.2, -1]} rotation={[0, 0.8, Math.PI / 2]}
            geometry={GEO.cyl6} scale={[0.2, 3, 0.2]} material={MAT.timber} castShadow />
        </group>
      );
    case 'stone_circle':
      return (
        <group position={[px, y, pz]}>
          {/* Central altar */}
          <mesh position={[0, 0.3, 0]} geometry={GEO.box}
            scale={[2, 0.6, 2]} material={MAT.cobble} castShadow />
          <mesh position={[0, 0.8, 0]} geometry={GEO.box}
            scale={[1, 0.4, 0.6]} material={MAT.stoneDark} castShadow />
          {/* Standing stones — varied heights */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const h = 1.5 + Math.sin(i * 2.5) * 1.5;
            const leaning = Math.sin(i * 3.1) * 0.08;
            return <mesh key={i}
              position={[Math.cos(a) * 4.5, h / 2, Math.sin(a) * 4.5]}
              rotation={[leaning, 0, Math.cos(i * 1.7) * 0.05]}
              geometry={GEO.box} scale={[0.7, h, 0.35]} material={MAT.grave} castShadow />;
          })}
        </group>
      );
    case 'pond':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}
            geometry={GEO.cyl8} scale={[4, 4, 0.1]} material={MAT.water} />
          {/* Reeds */}
          {[[-2, 3], [3, -2], [-3.5, -1]].map(([rx, rz], i) => (
            <mesh key={i} position={[rx, 0.5, rz]} geometry={GEO.box}
              scale={[0.04, 1, 0.04]} material={MAT.herb} castShadow />
          ))}
        </group>
      );
    case 'burned_village':
      return (
        <group position={[px, y, pz]}>
          {[[-3.5, -2.5], [2.5, 1.5], [-1, 4.5]].map(([bx, bz], i) => (
            <group key={i} position={[bx, 0, bz]}>
              {/* Charred foundation */}
              <mesh position={[0, 0.15, 0]} geometry={GEO.box}
                scale={[3, 0.3, 2.5]} material={MAT.cobble} castShadow />
              {/* Remaining walls */}
              <mesh position={[0, 0.7, 0]} geometry={GEO.box}
                scale={[2.8, 1, 2.2]} material={MAT.dark} castShadow />
              {/* Charred beam */}
              <mesh position={[0.8, 0.8, 0.5]} rotation={[0.2, 0.5, 0.3]} geometry={GEO.box}
                scale={[0.12, 1.5, 0.12]} material={MAT.dark} castShadow />
            </group>
          ))}
          {/* Ash ground */}
          <mesh position={[0, 0.02, 1]} geometry={GEO.box}
            scale={[10, 0.04, 10]} material={MAT.cobble} />
        </group>
      );
    case 'supply_depot':
      return (
        <group position={[px, y, pz]}>
          {/* Shelter */}
          <mesh position={[0, 1.2, 0]} geometry={GEO.box}
            scale={[4, 2.4, 3]} material={MAT.woodWeathered} castShadow />
          <mesh position={[0, 2.7, 0]} geometry={GEO.cone4}
            scale={[3, 1.5, 2.5]} material={MAT.roofThatch} castShadow />
          {/* Crate stacks */}
          {Array.from({ length: 5 }).map((_, i) => (
            <mesh key={i}
              position={[(i % 2) * 1.2 - 0.6 + 3, 0.3 + Math.floor(i / 3) * 0.5, Math.floor((i % 3) / 2) * 1 - 0.5]}
              geometry={GEO.box} scale={[0.6, 0.6, 0.6]} material={MAT.woodDark} castShadow />
          ))}
          {/* Barrel */}
          <mesh position={[-2.5, 0.35, 0]} geometry={GEO.cyl8}
            scale={[0.25, 0.6, 0.25]} material={MAT.barrel} castShadow />
          <mesh position={[-2.5, 0.35, 0.6]} geometry={GEO.cyl8}
            scale={[0.25, 0.6, 0.25]} material={MAT.barrel} castShadow />
        </group>
      );
    case 'crossroads':
      return (
        <group position={[px, y, pz]}>
          {/* Signpost */}
          <mesh position={[0, 1.8, 0]} geometry={GEO.box}
            scale={[0.15, 3.5, 0.15]} material={MAT.timber} castShadow />
          <mesh position={[0.6, 3, 0]} rotation={[0, 0, 0]} geometry={GEO.box}
            scale={[1.2, 0.25, 0.08]} material={MAT.woodLight} castShadow />
          <mesh position={[-0.3, 2.5, 0.1]} rotation={[0, 0.7, 0]} geometry={GEO.box}
            scale={[1, 0.22, 0.07]} material={MAT.woodLight} castShadow />
          <mesh position={[0.4, 2, 0]} rotation={[0, -0.4, 0]} geometry={GEO.box}
            scale={[0.8, 0.2, 0.07]} material={MAT.woodLight} castShadow />
          {/* Stone base */}
          <mesh position={[0, 0.1, 0]} geometry={GEO.cyl8}
            scale={[0.5, 0.2, 0.5]} material={MAT.cobble} castShadow />
        </group>
      );
    case 'milestone':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 0.5, 0]} geometry={GEO.box}
            scale={[0.4, 1, 0.25]} material={MAT.stoneWarm} castShadow />
          <mesh position={[0, 1.1, 0]} geometry={GEO.cone4}
            scale={[0.25, 0.3, 0.18]} material={MAT.stone} castShadow />
          <mesh position={[0, 0.5, 0.13]} geometry={GEO.box}
            scale={[0.25, 0.3, 0.02]} material={MAT.chalk} />
        </group>
      );
    case 'lantern_post':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 1.5, 0]} geometry={GEO.box}
            scale={[0.1, 3, 0.1]} material={MAT.iron} castShadow />
          <mesh position={[0.3, 2.8, 0]} geometry={GEO.box}
            scale={[0.5, 0.08, 0.08]} material={MAT.iron} castShadow />
          <mesh position={[0.5, 2.55, 0]} geometry={GEO.box}
            scale={[0.2, 0.3, 0.2]} material={MAT.iron} castShadow />
          <mesh position={[0.5, 2.55, 0]} geometry={GEO.box}
            scale={[0.08, 0.12, 0.08]} material={MAT.lantern} />
        </group>
      );
    case 'roadside_cross':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 0.15, 0]} geometry={GEO.box}
            scale={[1.2, 0.3, 1.2]} material={MAT.cobble} castShadow />
          <mesh position={[0, 1.8, 0]} geometry={GEO.box}
            scale={[0.15, 3, 0.15]} material={MAT.stoneWarm} castShadow />
          <mesh position={[0, 2.8, 0]} geometry={GEO.box}
            scale={[0.8, 0.12, 0.12]} material={MAT.stoneWarm} castShadow />
          <mesh position={[0.3, 0.35, 0.5]} geometry={GEO.box}
            scale={[0.06, 0.15, 0.06]} material={MAT.cloth} />
          <mesh position={[0.3, 0.45, 0.5]} geometry={GEO.box}
            scale={[0.03, 0.04, 0.03]} material={MAT.fire} />
        </group>
      );
    case 'abandoned_camp':
      return (
        <group position={[px, y, pz]}>
          {/* Collapsed tent */}
          <mesh position={[0, 0.3, 0]} rotation={[0.15, 0.3, 0.1]} geometry={GEO.box}
            scale={[2, 0.04, 1.5]} material={MAT.tentDark} castShadow />
          <mesh position={[0.5, 0.5, 0]} geometry={GEO.box}
            scale={[0.08, 1, 0.08]} material={MAT.timber} castShadow />
          {/* Cold fire ring */}
          {[0, 1, 2, 3, 4, 5].map(i => {
            const a = (i / 6) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 0.4 - 1.5, 0.06, Math.sin(a) * 0.4]}
              geometry={GEO.box} scale={[0.15, 0.1, 0.15]} material={MAT.stoneDark} castShadow />;
          })}
          <mesh position={[-1.5, 0.08, 0]} geometry={GEO.box}
            scale={[0.3, 0.04, 0.3]} material={MAT.charred} />
          {/* Discarded items */}
          <mesh position={[1.5, 0.1, 0.8]} geometry={GEO.cyl8}
            scale={[0.15, 0.3, 0.15]} material={MAT.barrel} castShadow />
        </group>
      );
    case 'gallows':
      return (
        <group position={[px, y, pz]}>
          <mesh position={[0, 0.15, 0]} geometry={GEO.box}
            scale={[3, 0.3, 3]} material={MAT.woodDark} castShadow />
          <mesh position={[0, 2.5, 0]} geometry={GEO.box}
            scale={[0.2, 5, 0.2]} material={MAT.timber} castShadow />
          <mesh position={[1, 4.8, 0]} geometry={GEO.box}
            scale={[2, 0.15, 0.15]} material={MAT.timber} castShadow />
          <mesh position={[1.5, 4, 0]} geometry={GEO.box}
            scale={[0.02, 0.8, 0.02]} material={MAT.rope} />
          {/* Warning sign */}
          <mesh position={[-1.5, 1.5, 0]} geometry={GEO.box}
            scale={[0.08, 3, 0.08]} material={MAT.timber} castShadow />
          <mesh position={[-1.5, 2.8, 0]} geometry={GEO.box}
            scale={[0.6, 0.4, 0.04]} material={MAT.woodDark} castShadow />
        </group>
      );
    default:
      return null;
  }
}

export function WorldPOIs({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group>
      {SMALL_POIS.map(poi => (
        <SmallPOIRenderer key={poi.id} poi={poi} playerPos={playerPos} />
      ))}
    </group>
  );
}
