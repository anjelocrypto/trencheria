import type { ConnectionStatus } from './useMultiplayer';

interface Props {
  connectionStatus: ConnectionStatus;
  playerCount: number;
  playerId: string;
  voiceState?: {
    isTalking: boolean;
    micPermission: string;
  };
}

export function MultiplayerHUD({ connectionStatus, playerCount, playerId, voiceState }: Props) {
  if (connectionStatus === 'disconnected') return null;

  const statusColor =
    connectionStatus === 'connected' ? '#4a4' :
    connectionStatus === 'reconnecting' ? '#ea4' : '#aaa';

  const statusLabel =
    connectionStatus === 'connected' ? 'ONLINE' :
    connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none font-mono text-xs"
      style={{ background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 6, border: '1px solid #333' }}>
      <div style={{ color: statusColor }}>● {statusLabel}</div>
      <div style={{ color: '#aaa' }}>Players Online: {playerCount}</div>
      {/* Player ID hidden from production HUD */}
      {voiceState && (
        <div style={{
          marginTop: 4,
          padding: '2px 6px',
          borderRadius: 3,
          background: voiceState.isTalking ? 'rgba(80,200,80,0.2)' : 'rgba(255,255,255,0.05)',
          border: voiceState.isTalking ? '1px solid rgba(80,200,80,0.5)' : '1px solid rgba(255,255,255,0.1)',
          color: voiceState.isTalking ? '#6f6' : '#666',
          fontSize: 9,
          textAlign: 'center' as const,
        }}>
          {voiceState.isTalking ? '🎙️ VOICE ON' :
           voiceState.micPermission === 'denied' ? '🔇 MIC DENIED' :
           '🎙️ Hold K to talk'}
        </div>
      )}
    </div>
  );
}
