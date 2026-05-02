/**
 * Bridge visual renderer — matches BridgeData definitions.
 * Bridges are walkable via getBridgeHeight in Player movement.
 */
import * as THREE from 'three';
import { BRIDGES, BridgeDef } from '../world/BridgeData';
import { GEO, MAT } from '../world/SettlementPieces';

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
        scale={[bridge.width, deckH, bridge.length]} material={deckMat} castShadow />
      {/* Railings */}
      <mesh position={[-bridge.width / 2 - 0.15, 1.5, 0]} geometry={GEO.box}
        scale={[0.3, 1.2, bridge.length]} material={railMat} castShadow />
      <mesh position={[bridge.width / 2 + 0.15, 1.5, 0]} geometry={GEO.box}
        scale={[0.3, 1.2, bridge.length]} material={railMat} castShadow />
      {/* Support pillars — extend from ground to just below deck */}
      {[-bridge.length * 0.35, 0, bridge.length * 0.35].map((zOff, i) => {
        const pillarH = Math.max(2, py + 2);
        return (
          <mesh key={i} position={[0, -pillarH / 2 + 0.8, zOff]} geometry={GEO.box}
            scale={[bridge.width * 0.3, pillarH, bridge.width * 0.3]} material={supportMat} castShadow />
        );
      })}
      {/* Grand bridge extras */}
      {bridge.style === 'grand' && (
        <>
          {/* Decorative posts */}
          {[-bridge.length / 2 + 1, bridge.length / 2 - 1].map((zOff, i) => (
            <group key={`post-${i}`}>
              <mesh position={[-bridge.width / 2 - 0.15, 2.2, zOff]} geometry={GEO.box}
                scale={[0.5, 0.5, 0.5]} material={MAT.stoneWarm} castShadow />
              <mesh position={[bridge.width / 2 + 0.15, 2.2, zOff]} geometry={GEO.box}
                scale={[0.5, 0.5, 0.5]} material={MAT.stoneWarm} castShadow />
            </group>
          ))}
          {/* Arch under deck */}
          <mesh position={[0, -0.2, 0]} geometry={GEO.box}
            scale={[bridge.width + 1, 0.6, bridge.length * 0.6]} material={MAT.stoneDark} castShadow />
        </>
      )}
    </group>
  );
}

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function Bridges({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group>
      {BRIDGES.map(bridge => (
        <BridgeRenderer key={bridge.id} bridge={bridge} playerPos={playerPos} />
      ))}
    </group>
  );
}
