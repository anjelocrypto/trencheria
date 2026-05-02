/**
 * 3D Territory ownership markers — colored banners placed at territory centers.
 * Shows clan color if claimed, neutral gray if unclaimed.
 * LOD: only rendered within 200 units of the player.
 */
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TerritoryInfo, CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';
import { getTerrainHeight } from './Terrain';

interface Props {
  territories: TerritoryInfo[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

const MARKER_RENDER_DISTANCE = 200;
const POLE_HEIGHT = 8;
const BANNER_WIDTH = 1.8;
const BANNER_HEIGHT = 2.5;

function TerritoryBanner({ territory }: { territory: TerritoryInfo }) {
  const terrainY = getTerrainHeight(territory.center_x, territory.center_z);
  const warState = (territory.war_state as string) || 'peaceful';
  const isContested = warState === 'contested' || warState === 'active_war' || warState === 'pending_resolution';
  const color = territory.owning_clan_color
    ? CLAN_COLOR_HEX[territory.owning_clan_color as ClanColor] || '#888888'
    : '#666666';
  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const neutralColor = useMemo(() => new THREE.Color('#555555'), []);
  const warColor = useMemo(() => new THREE.Color(warState === 'active_war' ? '#e74c3c' : warState === 'pending_resolution' ? '#f39c12' : '#e67e22'), [warState]);
  const isClaimed = !!territory.owning_clan_id;

  // Ring color depends on war state
  const ringColor = isContested ? warColor : isClaimed ? colorObj : neutralColor;
  const ringOpacity = warState === 'active_war' ? 0.5 : isContested ? 0.4 : isClaimed ? 0.3 : 0.1;

  const statusText = warState === 'contested' ? '⚔️ CHALLENGED'
    : warState === 'active_war' ? '🔥 WAR ACTIVE'
    : warState === 'pending_resolution' ? '⏳ AWAITING RESOLUTION'
    : warState === 'cooldown' ? '🛡️ Cooldown'
    : territory.owning_clan_name ? `🏴 ${territory.owning_clan_name}` : '⬜ Unclaimed';

  return (
    <group position={[territory.center_x, terrainY, territory.center_z]}>
      {/* Pole */}
      <mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, POLE_HEIGHT, 6]} />
        <meshStandardMaterial color="#4a3520" roughness={0.9} />
      </mesh>

      {/* Banner cloth */}
      <mesh position={[BANNER_WIDTH / 2 + 0.06, POLE_HEIGHT - BANNER_HEIGHT / 2 - 0.3, 0]} castShadow>
        <planeGeometry args={[BANNER_WIDTH, BANNER_HEIGHT]} />
        <meshStandardMaterial
          color={isClaimed ? colorObj : neutralColor}
          side={THREE.DoubleSide}
          roughness={0.7}
          emissive={isContested ? warColor : isClaimed ? colorObj : neutralColor}
          emissiveIntensity={warState === 'active_war' ? 0.4 : isContested ? 0.25 : isClaimed ? 0.15 : 0.05}
        />
      </mesh>

      {/* Pole cap ornament */}
      <mesh position={[0, POLE_HEIGHT + 0.15, 0]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial
          color={isContested ? warColor : isClaimed ? colorObj : neutralColor}
          metalness={0.6}
          roughness={0.3}
          emissive={isContested ? warColor : isClaimed ? colorObj : neutralColor}
          emissiveIntensity={warState === 'active_war' ? 0.5 : isContested ? 0.3 : isClaimed ? 0.3 : 0}
        />
      </mesh>

      {/* Ownership label floating above */}
      <Html position={[0, POLE_HEIGHT + 1.5, 0]} center distanceFactor={30}
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          textAlign: 'center', whiteSpace: 'nowrap',
          textShadow: '0 2px 6px rgba(0,0,0,0.9)',
          fontFamily: 'serif',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 800,
            color: isContested ? (warState === 'active_war' ? '#e74c3c' : '#e67e22') : isClaimed ? color : '#999',
            letterSpacing: '0.08em',
          }}>
            {territory.name}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 600,
            color: isContested ? (warState === 'active_war' ? '#e74c3c' : '#e67e22') : isClaimed ? color : '#666',
            marginTop: 2,
          }}>
            {statusText}
          </div>
        </div>
      </Html>

      {/* Ground ring — war-state aware */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 3, 32]} />
        <meshStandardMaterial
          color={ringColor}
          transparent
          opacity={ringOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Extra war indicator ring */}
      {isContested && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4, 4.5, 32]} />
          <meshStandardMaterial
            color={warColor}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

export function TerritoryMarkers({ territories, playerPositionRef }: Props) {
  // Filter territories within render distance
  const visible = useMemo(() => {
    const pos = playerPositionRef.current;
    if (!pos) return territories;
    return territories.filter(t => {
      const dx = t.center_x - pos.x;
      const dz = t.center_z - pos.z;
      return Math.sqrt(dx * dx + dz * dz) < MARKER_RENDER_DISTANCE;
    });
  // Re-evaluate on territory changes; distance is checked but won't cause re-render storms
  // because this is a useMemo, not a useFrame
  }, [territories, playerPositionRef]);

  return (
    <>
      {visible.map(t => (
        <TerritoryBanner key={t.id} territory={t} />
      ))}
    </>
  );
}