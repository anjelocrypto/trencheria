/**
 * Gate/entrance banners for territory ownership.
 * Places clan-colored banners at the approach roads to each kingdom,
 * offset from center along the main road directions.
 * LOD: only rendered within 150 units of the player.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { TerritoryInfo, CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';
import { getTerrainHeight } from './Terrain';

interface Props {
  territories: TerritoryInfo[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

const GATE_RENDER_DISTANCE = 150;
const POLE_H = 6;

// Each territory gets 2 gate banners along primary approach directions
// Offsets are based on known road approach angles from RegionData/ROADS
const GATE_OFFSETS: Record<string, [number, number][]> = {
  'thornwall':  [[60, 50], [-40, 60]],   // SE approach, NE approach
  'rivermoor':  [[-50, -50], [-60, 20]],  // SW approach, W approach
  'stonepeak':  [[50, -50], [30, 60]],    // SE approach, E approach
  'darkhollow': [[-50, 50], [-60, -20]],  // NW approach, W approach
  'goldenvale': [[50, -50], [50, 20]],    // E approach, SE approach
  'frostmere':  [[50, -40], [-40, -50]],  // SE approach, SW approach (Yetis)
  'blackthorn': [[-40, 40], [50, 30]],    // NW approach, E approach (Dogs)
};

function GateBanner({ x, z, color, isClaimed, clanName }: {
  x: number; z: number; color: string; isClaimed: boolean; clanName: string | null;
}) {
  const terrainY = getTerrainHeight(x, z);
  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const neutralColor = useMemo(() => new THREE.Color('#444444'), []);

  return (
    <group position={[x, terrainY, z]}>
      {/* Left pole */}
      <mesh position={[-1.2, POLE_H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, POLE_H, 6]} />
        <meshStandardMaterial color="#3a2a15" roughness={0.9} />
      </mesh>
      {/* Right pole */}
      <mesh position={[1.2, POLE_H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, POLE_H, 6]} />
        <meshStandardMaterial color="#3a2a15" roughness={0.9} />
      </mesh>
      {/* Cross bar */}
      <mesh position={[0, POLE_H - 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
        <meshStandardMaterial color="#3a2a15" roughness={0.9} />
      </mesh>
      {/* Banner hanging from cross bar */}
      <mesh position={[0, POLE_H - 1.2, 0.02]} castShadow>
        <planeGeometry args={[2.0, 1.8]} />
        <meshStandardMaterial
          color={isClaimed ? colorObj : neutralColor}
          side={THREE.DoubleSide}
          roughness={0.75}
          emissive={isClaimed ? colorObj : neutralColor}
          emissiveIntensity={isClaimed ? 0.12 : 0.03}
        />
      </mesh>
      {/* Pole cap ornaments */}
      {[-1.2, 1.2].map((px, i) => (
        <mesh key={i} position={[px, POLE_H + 0.1, 0]} castShadow>
          <sphereGeometry args={[0.08, 6, 6]} />
          <meshStandardMaterial
            color={isClaimed ? colorObj : neutralColor}
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

export function TerritoryGateBanners({ territories, playerPositionRef }: Props) {
  const banners = useMemo(() => {
    const result: { key: string; x: number; z: number; territory: TerritoryInfo }[] = [];
    for (const t of territories) {
      const offsets = GATE_OFFSETS[t.id];
      if (!offsets) continue;
      for (let i = 0; i < offsets.length; i++) {
        result.push({
          key: `${t.id}_gate_${i}`,
          x: t.center_x + offsets[i][0],
          z: t.center_z + offsets[i][1],
          territory: t,
        });
      }
    }
    return result;
  }, [territories]);

  const visible = useMemo(() => {
    const pos = playerPositionRef.current;
    if (!pos) return banners;
    return banners.filter(b => {
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      return Math.sqrt(dx * dx + dz * dz) < GATE_RENDER_DISTANCE;
    });
  }, [banners, playerPositionRef]);

  return (
    <>
      {visible.map(b => {
        const color = b.territory.owning_clan_color
          ? CLAN_COLOR_HEX[b.territory.owning_clan_color as ClanColor] || '#666'
          : '#555';
        return (
          <GateBanner
            key={b.key}
            x={b.x}
            z={b.z}
            color={color}
            isClaimed={!!b.territory.owning_clan_id}
            clanName={b.territory.owning_clan_name}
          />
        );
      })}
    </>
  );
}
