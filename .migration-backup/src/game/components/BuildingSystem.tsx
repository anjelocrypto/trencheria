import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getMovementInput } from '../systems/InputSystem';
import { getTerrainHeight } from './Terrain';
import { PlacedStructure, BuildableConfig, BuildableType, MIN_STRUCTURE_SPACING } from '../systems/BuildingData';
import { ResourceInventory } from '../types';
import { COLORS } from '../constants';
import { isPlacementBlocked } from '../systems/CollisionSystem';

interface Props {
  buildMode: boolean;
  selectedIndex: number;
  playerPositionRef: React.RefObject<THREE.Vector3>;
  playerRotationRef: React.RefObject<number>;
  structures: PlacedStructure[];
  inventory: ResourceInventory;
  onPlace: (structure: PlacedStructure) => void;
  onSetBuildFeedback: (text: string | null) => void;
  availableBuildables: BuildableConfig[];
}

function canAfford(cost: Partial<ResourceInventory>, inv: ResourceInventory): boolean {
  for (const [key, val] of Object.entries(cost)) {
    if ((inv[key as keyof ResourceInventory] || 0) < (val || 0)) return false;
  }
  return true;
}

function isValidPlacement(pos: [number, number, number], playerPos: THREE.Vector3, structures: PlacedStructure[], buildSize: [number, number, number]): { valid: boolean; reason?: string } {
  const dx = pos[0] - playerPos.x, dz = pos[2] - playerPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 2) return { valid: false, reason: 'Too close' };
  if (dist > 8) return { valid: false, reason: 'Too far' };
  if (pos[1] < -0.5) return { valid: false, reason: 'Water' };
  for (const s of structures) {
    const sdx = pos[0] - s.position[0], sdz = pos[2] - s.position[2];
    if (Math.sqrt(sdx * sdx + sdz * sdz) < MIN_STRUCTURE_SPACING) return { valid: false, reason: 'Too close to structure' };
  }
  // Check collision with world objects (trees, rocks, POIs)
  const buildRadius = Math.max(buildSize[0], buildSize[2]) / 2;
  if (isPlacementBlocked(pos[0], pos[2], buildRadius)) return { valid: false, reason: 'Blocked' };
  return { valid: true };
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const coneGeo = new THREE.ConeGeometry(1, 1, 4);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 5);

export function BuildingSystem({
  buildMode, selectedIndex, playerPositionRef, playerRotationRef,
  structures, inventory, onPlace, onSetBuildFeedback, availableBuildables,
}: Props) {
  const ghostPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const validRef = useRef(false);
  const idCounterRef = useRef(0);

  useFrame(() => {
    if (!buildMode) return;
    const playerPos = playerPositionRef.current;
    if (!playerPos) return;
    const config = availableBuildables[selectedIndex];
    if (!config) return;

    const rot = playerRotationRef.current || 0;
    const placeX = playerPos.x + Math.sin(rot) * 5;
    const placeZ = playerPos.z + Math.cos(rot) * 5;
    ghostPosRef.current = [placeX, getTerrainHeight(placeX, placeZ), placeZ];

    const { valid, reason } = isValidPlacement(ghostPosRef.current, playerPos, structures, config.size);
    const affordable = canAfford(config.cost, inventory);
    validRef.current = valid && affordable;

    if (!affordable) onSetBuildFeedback(`❌ Need: ${config.description}`);
    else if (!valid) onSetBuildFeedback(`❌ ${reason}`);
    else onSetBuildFeedback(`✅ ${config.label} — Click to place`);

    const input = getMovementInput();
    if (input.buildPlace && validRef.current) {
      onPlace({ id: `struct-${idCounterRef.current++}`, type: config.type, position: [...ghostPosRef.current], rotation: rot });
    }
  });

  if (!buildMode) return <StructureRenderer structures={structures} />;

  const config = availableBuildables[selectedIndex];
  return (
    <group>
      <StructureRenderer structures={structures} />
      <group position={ghostPosRef.current} rotation={[0, playerRotationRef.current || 0, 0]}>
        <StructureMesh type={config?.type || 'campfire'} ghost opacity={0.5} valid={validRef.current} />
      </group>
    </group>
  );
}

function StructureRenderer({ structures }: { structures: PlacedStructure[] }) {
  return (
    <group>
      {structures.map(s => (
        <group key={s.id} position={s.position} rotation={[0, s.rotation, 0]}>
          <StructureMesh type={s.type} ghost={false} opacity={1} valid={true} />
        </group>
      ))}
    </group>
  );
}

function StructureMesh({ type, ghost, opacity, valid }: {
  type: BuildableType; ghost: boolean; opacity: number; valid: boolean;
}) {
  const c = ghost ? (valid ? '#44ff44' : '#ff4444') : undefined;
  const t = ghost;

  switch (type) {
    case 'campfire':
      return (
        <group>
          {[0,1,2,3,4,5].map(i => {
            const a = (i/6)*Math.PI*2;
            return <mesh key={i} position={[Math.cos(a)*0.5, 0.1, Math.sin(a)*0.5]} geometry={boxGeo} scale={[0.2,0.2,0.2]} castShadow>
              <meshLambertMaterial color={c||COLORS.stoneDark} transparent={t} opacity={opacity} />
            </mesh>;
          })}
          <mesh position={[0,0.15,0]} rotation={[0,0,0.3]} geometry={cylGeo} scale={[0.07,0.6,0.07]} castShadow>
            <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
          </mesh>
          {!ghost && <pointLight position={[0,0.5,0]} color="#ff6600" intensity={2} distance={10} />}
        </group>
      );

    case 'bedroll':
      return (
        <group>
          <mesh position={[0,0.08,0]} geometry={boxGeo} scale={[1,0.12,2]} castShadow>
            <meshLambertMaterial color={c||'#5a4a30'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,0.15,-0.7]} geometry={boxGeo} scale={[0.8,0.15,0.5]} castShadow>
            <meshLambertMaterial color={c||'#6a5a3a'} transparent={t} opacity={opacity} />
          </mesh>
        </group>
      );

    case 'wall':
      return (
        <group>
          {[-1.5,1.5].map((px,i) => (
            <mesh key={i} position={[px,1.3,0]} geometry={boxGeo} scale={[0.22,2.6,0.22]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          {[0.4,0.9,1.4,1.9,2.3].map((py,i) => (
            <mesh key={`p${i}`} position={[0,py,0]} geometry={boxGeo} scale={[2.8,0.18,0.12]} castShadow>
              <meshLambertMaterial color={c||(i%2===0?'#7a5a14':'#6a4a10')} transparent={t} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );

    case 'fence':
      return (
        <group>
          {[-1.8,-0.6,0.6,1.8].map((px,i) => (
            <mesh key={i} position={[px,0.55,0]} geometry={boxGeo} scale={[0.12,1.1,0.12]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0,0.35,0]} geometry={boxGeo} scale={[3.8,0.08,0.08]} castShadow>
            <meshLambertMaterial color={c||'#6b4f10'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,0.75,0]} geometry={boxGeo} scale={[3.8,0.08,0.08]} castShadow>
            <meshLambertMaterial color={c||'#6b4f10'} transparent={t} opacity={opacity} />
          </mesh>
        </group>
      );

    case 'shelter':
      return (
        <group>
          <mesh position={[0,0.08,0]} geometry={boxGeo} scale={[3.8,0.16,3.8]} castShadow>
            <meshLambertMaterial color={c||COLORS.stoneDark} transparent={t} opacity={opacity} />
          </mesh>
          {[[-1.65,-1.65],[1.65,-1.65],[-1.65,1.65],[1.65,1.65]].map(([px,pz],i) => (
            <mesh key={i} position={[px,1.3,pz]} geometry={boxGeo} scale={[0.2,2.2,0.2]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0,0.7,-1.65]} geometry={boxGeo} scale={[3.3,1,0.12]} castShadow>
            <meshLambertMaterial color={c||'#7a5a14'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,2.9,0]} geometry={coneGeo} scale={[2.8,1.2,2.8]} castShadow>
            <meshLambertMaterial color={c||'#6a5a30'} transparent={t} opacity={opacity} />
          </mesh>
        </group>
      );

    case 'workbench':
      return (
        <group>
          {[[-0.7,-0.5],[0.7,-0.5],[-0.7,0.5],[0.7,0.5]].map(([px,pz],i) => (
            <mesh key={i} position={[px,0.4,pz]} geometry={boxGeo} scale={[0.12,0.8,0.12]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0,0.85,0]} geometry={boxGeo} scale={[1.6,0.12,1.2]} castShadow>
            <meshLambertMaterial color={c||'#6b5020'} transparent={t} opacity={opacity} />
          </mesh>
          {/* Tools on surface */}
          {!ghost && (
            <>
              <mesh position={[-0.3,0.95,0]} geometry={boxGeo} scale={[0.3,0.06,0.06]} castShadow>
                <meshLambertMaterial color="#888" />
              </mesh>
              <mesh position={[0.3,0.95,0.2]} geometry={boxGeo} scale={[0.08,0.15,0.08]} castShadow>
                <meshLambertMaterial color={COLORS.woodDark} />
              </mesh>
            </>
          )}
        </group>
      );

    case 'watchtower':
      return (
        <group>
          {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([px,pz],i) => (
            <mesh key={i} position={[px,2.5,pz]} geometry={boxGeo} scale={[0.18,5,0.18]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0,4.5,0]} geometry={boxGeo} scale={[2.5,0.15,2.5]} castShadow>
            <meshLambertMaterial color={c||'#5a4a20'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,4.7,0]} geometry={boxGeo} scale={[2.7,0.3,0.1]} castShadow>
            <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,4.7,0]} geometry={boxGeo} scale={[0.1,0.3,2.7]} castShadow>
            <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
          </mesh>
          {/* Ladder */}
          <mesh position={[1.2,2.5,0]} geometry={boxGeo} scale={[0.1,5,0.6]} castShadow>
            <meshLambertMaterial color={c||'#5a3a10'} transparent={t} opacity={opacity} />
          </mesh>
        </group>
      );

    case 'gate':
      return (
        <group>
          {[-2,2].map((px,i) => (
            <mesh key={i} position={[px,1.5,0]} geometry={boxGeo} scale={[0.25,3,0.25]} castShadow>
              <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0,2.8,0]} geometry={boxGeo} scale={[4.2,0.2,0.2]} castShadow>
            <meshLambertMaterial color={c||COLORS.woodDark} transparent={t} opacity={opacity} />
          </mesh>
          {[-1.2,-0.4,0.4,1.2].map((px,i) => (
            <mesh key={`g${i}`} position={[px,1.2,0]} geometry={boxGeo} scale={[0.15,2.2,0.1]} castShadow>
              <meshLambertMaterial color={c||'#5a3a10'} transparent={t} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );

    case 'storage':
      return (
        <group>
          <mesh position={[0,0.4,0]} geometry={boxGeo} scale={[1.2,0.8,1.2]} castShadow>
            <meshLambertMaterial color={c||'#6b4f10'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,0.4,0]} geometry={boxGeo} scale={[1.3,0.08,1.3]} castShadow>
            <meshLambertMaterial color={c||'#4a3a20'} transparent={t} opacity={opacity} />
          </mesh>
          <mesh position={[0,0.85,0]} geometry={boxGeo} scale={[1.25,0.06,1.25]} castShadow>
            <meshLambertMaterial color={c||'#5a4020'} transparent={t} opacity={opacity} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}