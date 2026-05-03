/**
 * Bridge visual renderer — matches BridgeData definitions.
 * Bridges are walkable via getBridgeHeight in Player movement.
 */
import * as THREE from 'three';
import { BRIDGES, BridgeDef, INTENTIONAL_FORDS, FordDef } from '../world/BridgeData';
import { GEO, MAT } from '../world/SettlementPieces';
import { getTerrainHeight } from './Terrain';

function BridgeRenderer({ bridge, playerPos }: { bridge: BridgeDef; playerPos: THREE.Vector3 | null }) {
  if (playerPos) {
    const dx = playerPos.x - bridge.position[0];
    const dz = playerPos.z - bridge.position[2];
    if (dx * dx + dz * dz > 200 * 200) return null;
  }

  const [px, py, pz] = bridge.position;
  const isStone = bridge.style === 'stone' || bridge.style === 'grand';
  const deckMat = isStone ? MAT.cobble : MAT.woodDark;
  const railMat = isStone ? MAT.stone : MAT.timber;
  const supportMat = isStone ? MAT.stoneDark : MAT.woodWeathered;
  const deckH = 0.4;

  return (
    <group position={[px, py, pz]} rotation={[0, bridge.rotation, 0]}>
      {/* Deck */}
      <mesh position={[0, 0.8, 0]} geometry={GEO.box}
        scale={[bridge.width, deckH, bridge.length]} material={deckMat}  />
      {/* Railings */}
      <mesh position={[-bridge.width / 2 - 0.15, 1.5, 0]} geometry={GEO.box}
        scale={[0.3, 1.2, bridge.length]} material={railMat}  />
      <mesh position={[bridge.width / 2 + 0.15, 1.5, 0]} geometry={GEO.box}
        scale={[0.3, 1.2, bridge.length]} material={railMat}  />
      {/* Support pillars — extend from ground to just below deck */}
      {[-bridge.length * 0.35, 0, bridge.length * 0.35].map((zOff, i) => {
        const pillarH = Math.max(2, py + 2);
        return (
          <mesh key={i} position={[0, -pillarH / 2 + 0.8, zOff]} geometry={GEO.box}
            scale={[bridge.width * 0.3, pillarH, bridge.width * 0.3]} material={supportMat}  />
        );
      })}
      {/* Grand bridge extras */}
      {bridge.style === 'grand' && (
        <>
          {/* Decorative posts */}
          {[-bridge.length / 2 + 1, bridge.length / 2 - 1].map((zOff, i) => (
            <group key={`post-${i}`}>
              <mesh position={[-bridge.width / 2 - 0.15, 2.2, zOff]} geometry={GEO.box}
                scale={[0.5, 0.5, 0.5]} material={MAT.stoneWarm}  />
              <mesh position={[bridge.width / 2 + 0.15, 2.2, zOff]} geometry={GEO.box}
                scale={[0.5, 0.5, 0.5]} material={MAT.stoneWarm}  />
            </group>
          ))}
          {/* Arch under deck */}
          <mesh position={[0, -0.2, 0]} geometry={GEO.box}
            scale={[bridge.width + 1, 0.6, bridge.length * 0.6]} material={MAT.stoneDark}  />
        </>
      )}
    </group>
  );
}

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

/**
 * Codex follow-up #3: render a visible shallow ford / quay / causeway at every
 * INTENTIONAL_FORDS entry so the validator's "this is intentional" suppression
 * is actually backed by a thing the player can see. The ford is a low pebble
 * causeway slab + a couple of plank-deck strips spanning the road direction,
 * sitting just above local terrain so the road visibly continues across the
 * shoreline instead of vanishing into the water.
 */
function FordRenderer({ ford, playerPos }: { ford: FordDef; playerPos: THREE.Vector3 | null }) {
  if (playerPos) {
    const dx = playerPos.x - ford.position[0];
    const dz = playerPos.z - ford.position[1];
    if (dx * dx + dz * dz > 200 * 200) return null;
  }
  const [fx, fz] = ford.position;
  // Shoreline is sloped; sample center and lift slightly above water.
  const baseY = Math.max(getTerrainHeight(fx, fz), 0) + 0.05;
  const slabSize = ford.radius * 1.6;     // gravel/cobble approach apron
  const plankLen = ford.radius * 1.8;     // plank causeway along approach
  return (
    <group position={[fx, baseY, fz]} rotation={[0, ford.heading, 0]}>
      {/* Pebble / cobble apron — wide flat slab just above water level */}
      <mesh position={[0, 0.02, 0]} geometry={GEO.box}
        scale={[slabSize, 0.08, slabSize * 0.7]} material={MAT.cobble} receiveShadow />
      {/* Plank causeway strip (two narrow decks side-by-side) */}
      <mesh position={[-0.45, 0.12, 0]} geometry={GEO.box}
        scale={[0.85, 0.08, plankLen]} material={MAT.woodWeathered} receiveShadow  />
      <mesh position={[ 0.45, 0.12, 0]} geometry={GEO.box}
        scale={[0.85, 0.08, plankLen]} material={MAT.woodWeathered} receiveShadow  />
      {/* Two short mooring posts at the shore end (suggests quay) */}
      <mesh position={[-1.2, 0.5, plankLen * 0.45]} geometry={GEO.box}
        scale={[0.18, 1.0, 0.18]} material={MAT.timber}  />
      <mesh position={[ 1.2, 0.5, plankLen * 0.45]} geometry={GEO.box}
        scale={[0.18, 1.0, 0.18]} material={MAT.timber}  />
    </group>
  );
}

export function Bridges({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group>
      {BRIDGES.map(bridge => (
        <BridgeRenderer key={bridge.id} bridge={bridge} playerPos={playerPos} />
      ))}
      {INTENTIONAL_FORDS.map(ford => (
        <FordRenderer key={ford.id} ford={ford} playerPos={playerPos} />
      ))}
    </group>
  );
}
