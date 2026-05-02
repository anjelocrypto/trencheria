import { useRef, Suspense, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { InterpolatedPlayer, BROADCAST_RATE_MS, EMOTES, LOD_FULL_DISTANCE, LOD_MEDIUM_DISTANCE } from './types';
import { getTerrainHeight } from '../components/Terrain';
import { getBridgeHeight } from '../world/BridgeData';
import { Html } from '@react-three/drei';
import { HorseGLBModel } from '../components/HorseGLBModel';
import { CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';

import { RemoteGoblinModel } from './RemoteGoblinModel';
import { RemoteSoldierModel } from './RemoteSoldierModel';
import { RemoteOctopusModel } from './RemoteOctopusModel';
import { RemoteNemoClawModel } from './RemoteNemoClawModel';
import { RemoteChillhouseModel } from './RemoteChillhouseModel';
import { PlaceholderRemoteModel } from '../components/PlaceholderCharacterModel';
import { getFactionByCharacter } from '../systems/FactionData';

// Visible placeholder capsule shown while remote character GLBs are loading
function RemotePlayerFallback() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshStandardMaterial color="#888" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial color="#aaa" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// LOD capsule for medium-distance players — cheaper than full GLB model
function LODCapsule({ isMounted }: { isMounted: boolean }) {
  if (isMounted) {
    return (
      <group>
        {/* Horse silhouette */}
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[0.8, 1, 1.8]} />
          <meshStandardMaterial color="#8B6914" transparent opacity={0.4} />
        </mesh>
        {/* Rider silhouette */}
        <mesh position={[0, 2, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.6, 4, 6]} />
          <meshStandardMaterial color="#888" transparent opacity={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.25, 1, 4, 6]} />
        <meshStandardMaterial color="#888" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

interface Props {
  player: InterpolatedPlayer;
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

// Nametag heights per character type
const NAMETAG_HEIGHT_GOBLIN = 2.0;
const NAMETAG_HEIGHT_SOLDIER = 2.8;
const NAMETAG_HEIGHT_OCTOPUS = 2.0;
const NAMETAG_HEIGHT_NEMOCLAW = 2.4;
const NAMETAG_HEIGHT_CHILLHOUSE = 2.6;
const NAMETAG_HEIGHT_MOUNTED = 4.5;

const remoteAuditCounts: Record<string, number> = {};
const REMOTE_AUDIT_LIMIT = 3;

function mpAuditRemote(label: string, data?: Record<string, unknown>) {
  const count = remoteAuditCounts[label] ?? 0;
  if (count >= REMOTE_AUDIT_LIMIT) return;
  remoteAuditCounts[label] = count + 1;
  const suffix = data ? ' — ' + JSON.stringify(data) : '';
  console.log(`[MP-Audit] ${label}${suffix}`);
}

export function RemotePlayer({ player, playerPositionRef }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(new THREE.Vector3(...player.renderPosition));
  const currentRot = useRef(player.renderRotation);
  const distanceRef = useRef(0);

  mpAuditRemote('RemotePlayer mounted', {
    id: player.playerId,
    charType: player.characterType,
    pos: player.targetPosition,
  });

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const dt = Math.min(delta, 0.05);

    // Calculate distance to local player for LOD decisions
    const localPos = playerPositionRef.current;
    if (localPos) {
      const dx = currentPos.current.x - localPos.x;
      const dz = currentPos.current.z - localPos.z;
      distanceRef.current = Math.sqrt(dx * dx + dz * dz);
    }

    const lerpSpeed = 1000 / BROADCAST_RATE_MS;
    const t = Math.min(1, dt * lerpSpeed * 0.15);

    const tx = player.targetPosition[0];
    const tz = player.targetPosition[2];

    const bridgeY = getBridgeHeight(tx, tz);
    const rawTerrainY = getTerrainHeight(tx, tz);
    const groundY = bridgeY !== null ? bridgeY : rawTerrainY;
    const ty = groundY;

    currentPos.current.x += (tx - currentPos.current.x) * t;
    const yLerp = Math.min(1, dt * lerpSpeed * 0.3);
    currentPos.current.y += (ty - currentPos.current.y) * yLerp;
    currentPos.current.z += (tz - currentPos.current.z) * t;

    let rotDiff = player.targetRotation - currentRot.current;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    currentRot.current += rotDiff * t;

    groupRef.current.position.copy(currentPos.current);
    groupRef.current.rotation.y = currentRot.current;
  });

  const healthPct = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
  const emoteText = player.emote ? EMOTES[player.emote] || player.emote : null;
  const charType = (player.characterType || 'goblin') as string;
  const nametagY = player.isMounted
    ? NAMETAG_HEIGHT_MOUNTED
    : charType === 'goblin' ? NAMETAG_HEIGHT_GOBLIN
    : charType === 'octopus' ? NAMETAG_HEIGHT_OCTOPUS
    : charType === 'nemoclaw' ? NAMETAG_HEIGHT_NEMOCLAW
    : charType === 'chillhouse' ? NAMETAG_HEIGHT_CHILLHOUSE
    : NAMETAG_HEIGHT_SOLDIER;

  // LOD tier based on distance
  const dist = distanceRef.current;
  const isFullLOD = dist < LOD_FULL_DISTANCE;
  const isMediumLOD = dist >= LOD_FULL_DISTANCE && dist < LOD_MEDIUM_DISTANCE;

  return (
    <group ref={groupRef}>
      {/* Nametag + health + faction — always visible within render range */}
      <Html position={[0, nametagY, 0]} center distanceFactor={20}
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          textAlign: 'center', whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)', fontFamily: 'monospace',
        }}>
          {/* Faction tag */}
          {player.clanName && player.clanColor && (() => {
            const faction = getFactionByCharacter(player.characterType);
            const colorHex = faction?.colorHex || CLAN_COLOR_HEX[player.clanColor as ClanColor] || '#aaa';
            return (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                color: colorHex,
                marginBottom: 1,
              }}>
                {faction && <span style={{ fontSize: 8 }}>{faction.icon}</span>}
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: colorHex,
                  display: 'inline-block',
                  boxShadow: `0 0 4px ${colorHex}80`,
                }} />
                {player.clanName}
              </div>
            );
          })()}
          <div style={{ color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
            {player.isSpeaking && <span style={{ marginRight: 3 }}>🎙️</span>}
            {player.displayName}
          </div>
          <div style={{
            width: 50, height: 4, background: 'rgba(0,0,0,0.6)',
            borderRadius: 2, overflow: 'hidden', margin: '0 auto',
          }}>
            <div style={{
              width: `${healthPct * 100}%`, height: '100%',
              background: healthPct > 0.5 ? '#4a4' : healthPct > 0.25 ? '#aa4' : '#a44',
              transition: 'width 0.3s',
            }} />
          </div>
          {emoteText && (
            <div style={{ fontSize: 18, marginTop: 4, animation: 'bounce 0.5s ease-out' }}>
              {emoteText}
            </div>
          )}
          {player.isSpeaking && (
            <div style={{
              marginTop: 3, fontSize: 9, color: '#6f6',
              animation: 'pulse 1s infinite',
            }}>
              SPEAKING
            </div>
          )}
        </div>
      </Html>

      {/* LOD rendering */}
      {isMediumLOD ? (
        <LODCapsule isMounted={player.isMounted} />
      ) : isFullLOD ? (
        player.isMounted ? (
          <MountedRemoteModel moveSpeed={player.moveSpeed} horsePitch={player.horsePitch} charType={charType} player={player} />
        ) : (
          <Suspense fallback={<RemotePlayerFallback />}>
            {charType === 'goblin' ? (
              <RemoteGoblinModel moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            ) : charType === 'octopus' ? (
              <RemoteOctopusModel moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            ) : charType === 'nemoclaw' ? (
              <RemoteNemoClawModel moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            ) : charType === 'chillhouse' ? (
              <RemoteChillhouseModel moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            ) : (charType === 'yeti' || charType === 'dog') ? (
              <PlaceholderRemoteModel factionColor={getFactionByCharacter(charType)?.colorHex || '#888'} label={charType} moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            ) : (
              <RemoteSoldierModel moveSpeed={player.moveSpeed} isRunning={player.isRunning} isGrounded={player.isGrounded} attackAnim={player.attackAnim} health={player.health} emote={player.emote} />
            )}
          </Suspense>
        )
      ) : (
        /* Very far (LOD_MEDIUM to LOD_HIDDEN) — just nametag, no model */
        null
      )}
    </group>
  );
}

// Visible placeholder for mounted remote players while horse/rider GLBs load
function MountedRemoteFallback() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[1, 1.2, 2.2]} />
        <meshStandardMaterial color="#8B6914" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
        <meshStandardMaterial color="#888" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function MountedRemoteModel({ moveSpeed, horsePitch, charType, player }: {
  moveSpeed: number;
  horsePitch: number;
  charType: string;
  player: InterpolatedPlayer;
}) {
  return (
    <group rotation={[horsePitch, 0, 0]}>
      <Suspense fallback={<MountedRemoteFallback />}>
        <HorseGLBModel moveSpeed={moveSpeed} renderPath="mounted-remote" />
      </Suspense>
      <group position={[0, 1.2, 0]} rotation={[0, 0, 0]}>
        <Suspense fallback={<RemotePlayerFallback />}>
          {charType === 'goblin' ? (
            <RemoteGoblinModel moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          ) : charType === 'octopus' ? (
            <RemoteOctopusModel moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          ) : charType === 'nemoclaw' ? (
            <RemoteNemoClawModel moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          ) : charType === 'chillhouse' ? (
            <RemoteChillhouseModel moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          ) : (charType === 'yeti' || charType === 'dog') ? (
            <PlaceholderRemoteModel factionColor={getFactionByCharacter(charType)?.colorHex || '#888'} label={charType} moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          ) : (
            <RemoteSoldierModel moveSpeed={0} isRunning={false} isGrounded={true} attackAnim={0} health={player.health} emote={null} />
          )}
        </Suspense>
      </group>
    </group>
  );
}
