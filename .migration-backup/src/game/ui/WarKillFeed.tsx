import { useState, useEffect, useCallback, useRef } from 'react';
import { CLAN_COLOR_HEX, ClanColor, TerritoryInfo, ChallengeInfo } from '../hooks/useClanSystem';

interface KillEntry {
  id: string;
  killerName: string;
  killerColor: string;
  victimName: string;
  victimColor: string;
  timestamp: number;
}

interface WarKillFeedProps {
  playerX: number;
  playerZ: number;
  territories: TerritoryInfo[];
  challenges: ChallengeInfo[];
  /** Called by parent when a PvP kill event is observed */
  killEvents: KillEntry[];
}

const ENTRY_LIFETIME_MS = 12000;
const MAX_ENTRIES = 5;

export function WarKillFeed({ playerX, playerZ, territories, challenges, killEvents }: WarKillFeedProps) {
  const [entries, setEntries] = useState<KillEntry[]>([]);
  const lastProcessedRef = useRef(0);

  // Find active war the player is inside of
  const activeChallenge = challenges.find(ch => {
    if (ch.status !== 'active') return false;
    const territory = territories.find(t => t.id === ch.territory_id);
    if (!territory) return false;
    const dx = playerX - territory.center_x;
    const dz = playerZ - territory.center_z;
    return Math.sqrt(dx * dx + dz * dz) <= territory.radius * 1.3;
  });

  // Process incoming kill events
  useEffect(() => {
    if (killEvents.length <= lastProcessedRef.current) return;
    const newEntries = killEvents.slice(lastProcessedRef.current);
    lastProcessedRef.current = killEvents.length;
    setEntries(prev => [...prev, ...newEntries].slice(-MAX_ENTRIES));
  }, [killEvents]);

  // Prune expired entries
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setEntries(prev => prev.filter(e => now - e.timestamp < ENTRY_LIFETIME_MS));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  if (!activeChallenge || entries.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 pointer-events-none" style={{ maxWidth: 260 }}>
      <div className="flex flex-col gap-1">
        {entries.map((entry, i) => {
          const age = Date.now() - entry.timestamp;
          const opacity = Math.max(0.3, 1 - age / ENTRY_LIFETIME_MS);
          return (
            <div key={entry.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded"
              style={{
                background: 'hsla(0,0%,0%,0.7)',
                border: '1px solid hsla(0,40%,30%,0.3)',
                backdropFilter: 'blur(4px)',
                opacity,
                transition: 'opacity 0.5s',
                fontSize: 10,
              }}>
              <span className="font-bold truncate" style={{ color: entry.killerColor, maxWidth: 90 }}>
                {entry.killerName}
              </span>
              <span style={{ color: 'hsl(0,60%,55%)', fontSize: 11 }}>⚔️</span>
              <span className="font-bold truncate" style={{ color: entry.victimColor, maxWidth: 90 }}>
                {entry.victimName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { KillEntry };
