import { forwardRef } from 'react';
import * as THREE from 'three';
import { InterpolatedPlayer, LOD_HIDDEN_DISTANCE } from './types';
import { RemotePlayer } from './RemotePlayer';

interface Props {
  remotePlayers: Map<string, InterpolatedPlayer>;
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

const auditRenderCounts: Record<string, number> = {};
const AUDIT_RENDER_LIMIT = 3;

function mpAuditRender(label: string, data?: Record<string, unknown>) {
  const count = auditRenderCounts[label] ?? 0;
  if (count >= AUDIT_RENDER_LIMIT) return;
  auditRenderCounts[label] = count + 1;
  const suffix = data ? ' — ' + JSON.stringify(data) : '';
  console.log(`[MP-Audit] ${label}${suffix}`);
}

export const RemotePlayers = forwardRef<THREE.Group, Props>(function RemotePlayers({ remotePlayers, playerPositionRef }, ref) {
  const players = Array.from(remotePlayers.values());

  mpAuditRender('RemotePlayers render count', { count: players.length });

  if (players.length === 0) {
    return <group ref={ref} visible={false} />;
  }

  // Pre-filter: skip players beyond LOD_HIDDEN_DISTANCE (200u) entirely
  const localPos = playerPositionRef.current;
  const visiblePlayers = localPos
    ? players.filter(p => {
        const dx = p.targetPosition[0] - localPos.x;
        const dz = p.targetPosition[2] - localPos.z;
        return dx * dx + dz * dz < LOD_HIDDEN_DISTANCE * LOD_HIDDEN_DISTANCE;
      })
    : players;

  return (
    <group ref={ref}>
      {visiblePlayers.map(p => (
        <RemotePlayer key={p.playerId} player={p} playerPositionRef={playerPositionRef} />
      ))}
    </group>
  );
});
