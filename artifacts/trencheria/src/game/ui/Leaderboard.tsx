/**
 * Leaderboard panel — shows top players by total score.
 * Toggled with L key. Only shows data for wallet-connected players.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LeaderboardEntry {
  display_name: string;
  community_name: string | null;
  character_type: string;
  enemies_killed: number;
  structures_built: number;
  total_wood_gathered: number;
  total_stone_gathered: number;
  tier: number;
  total_score: number;
}

const CHARACTER_ICONS: Record<string, string> = {
  goblin: '👺',
  soldier: '⚔️',
  octopus: '🐙',
  nemoclaw: '🐾',
  chillhouse: '🏠',
};

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, hsla(0,0%,0%,0.88), hsla(0,0%,0%,0.75))',
  border: '1px solid hsla(40,30%,45%,0.4)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 40px hsla(0,0%,0%,0.5), inset 0 1px 0 hsla(40,30%,60%,0.08)',
};

export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_leaderboard', { _limit: 20 });
      if (!error && data) {
        setEntries(data as LeaderboardEntry[]);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle with L key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyL' && !(e.target instanceof HTMLInputElement)) {
        setOpen(prev => {
          const next = !prev;
          if (next) fetchLeaderboard();
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchLeaderboard]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto rounded-xl overflow-hidden" style={{ ...panelStyle, width: 480, maxHeight: '70vh' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{
          background: 'linear-gradient(90deg, hsla(35,60%,45%,0.2), transparent)',
          borderBottom: '1px solid hsla(40,30%,45%,0.2)',
        }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">🏆</span>
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '0.06em',
              color: 'hsl(35,60%,65%)', fontFamily: 'Georgia, serif',
            }}>LEADERBOARD</span>
          </div>
          <button onClick={() => setOpen(false)} style={{
            color: 'hsl(40,15%,50%)', fontSize: 12, fontWeight: 600,
            background: 'hsla(40,20%,50%,0.1)', border: '1px solid hsla(40,20%,50%,0.2)',
            borderRadius: 4, padding: '2px 10px',
          }}>ESC</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 64px)' }}>
          {loading ? (
            <div className="py-12 text-center" style={{ color: 'hsl(40,15%,50%)', fontSize: 13 }}>
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center" style={{ color: 'hsl(40,15%,45%)', fontSize: 13 }}>
              No entries yet. Connect a wallet and play to appear here!
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid hsla(40,30%,45%,0.15)' }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Player</th>
                  <th style={thStyle}>⚔️</th>
                  <th style={thStyle}>🔨</th>
                  <th style={thStyle}>🪵</th>
                  <th style={thStyle}>🪨</th>
                  <th style={thStyle}>Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid hsla(40,30%,45%,0.08)',
                    background: i === 0 ? 'hsla(45,60%,50%,0.06)' : i < 3 ? 'hsla(40,30%,50%,0.03)' : 'transparent',
                  }}>
                    <td style={{ ...tdStyle, fontWeight: 800, color: i < 3 ? 'hsl(35,60%,60%)' : 'hsl(40,15%,45%)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      <div className="flex items-center gap-2">
                        <span>{CHARACTER_ICONS[e.character_type] || '⚔️'}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: 'hsl(40,30%,85%)', fontSize: 12 }}>{e.display_name}</div>
                          {e.community_name && (
                            <div style={{ fontSize: 9, color: 'hsl(40,15%,40%)' }}>{e.community_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>{e.enemies_killed}</td>
                    <td style={tdStyle}>{e.structures_built}</td>
                    <td style={tdStyle}>{e.total_wood_gathered}</td>
                    <td style={tdStyle}>{e.total_stone_gathered}</td>
                    <td style={{ ...tdStyle, fontWeight: 800, color: 'hsl(45,70%,60%)' }}>{e.total_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2 text-center" style={{
          borderTop: '1px solid hsla(40,30%,45%,0.15)',
          fontSize: 10, color: 'hsl(40,15%,35%)',
        }}>
          Press <strong style={{ color: 'hsl(40,20%,55%)' }}>L</strong> to toggle • Wallet account required to appear
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'hsl(40,15%,50%)',
  textAlign: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  color: 'hsl(40,20%,65%)',
  textAlign: 'center',
};
