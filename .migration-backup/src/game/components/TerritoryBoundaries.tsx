/**
 * TerritoryBoundaries — 3D ground rings showing territory borders in the world.
 * Renders a transparent colored ring at each territory's actual radius.
 * War-state aware: pulsing for contested/active_war, stable for peaceful.
 * LOD: only rendered within 300 units of the player.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TerritoryInfo, CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';

interface Props {
  territories: TerritoryInfo[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

const BOUNDARY_RENDER_DISTANCE = 300;
const RING_WIDTH = 2.5; // width of the ring band

function TerritoryRing({ territory }: { territory: TerritoryInfo }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const warState = (territory.war_state as string) || 'peaceful';
  const isWar = warState === 'active_war';
  const isContested = warState === 'contested';
  const isPending = warState === 'pending_resolution';
  const isCooldown = warState === 'cooldown';
  const isAnimated = isWar || isContested || isPending;

  const ownerColor = territory.owning_clan_color
    ? CLAN_COLOR_HEX[territory.owning_clan_color as ClanColor] || '#888888'
    : '#555555';

  const color = useMemo(() => new THREE.Color(ownerColor), [ownerColor]);
  const warColor = useMemo(() => new THREE.Color(
    isWar ? '#e74c3c' : isContested ? '#e67e22' : isPending ? '#f39c12' : '#3498db'
  ), [isWar, isContested, isPending]);

  const baseOpacity = territory.owning_clan_id
    ? (isWar ? 0.25 : isContested ? 0.18 : isPending ? 0.15 : isCooldown ? 0.1 : 0.12)
    : 0.05;

  // Animate opacity for war states
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;

    if (isAnimated) {
      const t = clock.getElapsedTime();
      const pulse = isWar
        ? 0.15 + Math.sin(t * 4) * 0.15  // fast strong pulse
        : isContested
        ? 0.12 + Math.sin(t * 2.5) * 0.1 // medium pulse
        : 0.1 + Math.sin(t * 1.5) * 0.08; // slow amber pulse

      mat.opacity = pulse;
      mat.color.copy(isWar && Math.sin(t * 6) > 0 ? warColor : isContested ? warColor : isPending ? warColor : color);

      if (glowRef.current) {
        const gm = glowRef.current.material as THREE.MeshStandardMaterial;
        gm.opacity = pulse * 0.6;
        gm.emissiveIntensity = isWar ? 0.4 + Math.sin(t * 4) * 0.3 : 0.2 + Math.sin(t * 2) * 0.15;
      }
    } else {
      mat.opacity = baseOpacity;
      mat.color.copy(color);
    }
  });

  const innerR = territory.radius - RING_WIDTH;
  const outerR = territory.radius;

  return (
    <group position={[territory.center_x, 0.15, territory.center_z]}>
      {/* Main boundary ring */}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 48]} />
        <meshStandardMaterial
          color={isAnimated ? warColor : color}
          transparent
          opacity={baseOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner glow ring for war states */}
      {isAnimated && (
        <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[innerR - 1.5, innerR, 48]} />
          <meshStandardMaterial
            color={warColor}
            transparent
            opacity={baseOpacity * 0.5}
            emissive={warColor}
            emissiveIntensity={0.2}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

export function TerritoryBoundaries({ territories, playerPositionRef }: Props) {
  const visible = useMemo(() => {
    const pos = playerPositionRef.current;
    if (!pos) return territories;
    return territories.filter(t => {
      const dx = t.center_x - pos.x;
      const dz = t.center_z - pos.z;
      // Check if player is within render distance of the territory edge
      return Math.sqrt(dx * dx + dz * dz) < BOUNDARY_RENDER_DISTANCE + t.radius;
    });
  }, [territories, playerPositionRef]);

  return (
    <>
      {visible.map(t => (
        <TerritoryRing key={t.id} territory={t} />
      ))}
    </>
  );
}
