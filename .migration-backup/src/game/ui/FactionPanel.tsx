/**
 * Faction & Kingdom Panel — replaces old ClanPanel.
 * Shows permanent faction identity, home kingdom, members, territories, wars.
 * No create/join/leave clan flows — factions are fixed and permanent.
 */
import { useState, useEffect } from 'react';
import { loadWalletSession } from '../hooks/usePlayerAccount';
import {
  ClanColor,
  CLAN_COLOR_HEX,
  TerritoryInfo,
  ClanMemberInfo,
  ChallengeInfo,
  TerritoryHistoryEntry,
} from '../hooks/useClanSystem';
import { FACTIONS, getFactionById } from '../systems/FactionData';

// Accept the shared clanSystem instance from GameScene to avoid duplicate polling
type ClanSystemReturn = ReturnType<typeof import('../hooks/useClanSystem').useClanSystem>;

interface Props {
  open: boolean;
  onClose: () => void;
  playerX: number;
  playerZ: number;
  clanSystem: ClanSystemReturn;
}

type Tab = 'my_faction' | 'kingdoms' | 'wars' | 'history';

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(160deg, hsla(0,0%,6%,0.97), hsla(0,0%,10%,0.97))',
  border: '1px solid hsla(40,30%,35%,0.5)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.8), inset 0 1px 0 hsla(40,30%,50%,0.1)',
  backdropFilter: 'blur(20px)',
};

const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'hsla(40,40%,40%,0.25)' : 'hsla(0,0%,100%,0.03)',
  color: active ? 'hsl(40,50%,80%)' : 'hsl(40,15%,50%)',
  border: active ? '1px solid hsla(40,40%,50%,0.3)' : '1px solid hsla(0,0%,100%,0.08)',
});

function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'Now';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function WarStateBadge({ state, challenge }: { state: string; challenge?: ChallengeInfo }) {
  const configs: Record<string, { icon: string; label: string; bg: string; color: string; border: string }> = {
    peaceful: { icon: '☮️', label: 'Peaceful', bg: 'hsla(120,30%,30%,0.1)', color: 'hsl(120,40%,60%)', border: 'hsla(120,30%,40%,0.2)' },
    contested: { icon: '⚔️', label: 'Challenged', bg: 'hsla(30,60%,40%,0.15)', color: 'hsl(30,70%,65%)', border: 'hsla(30,60%,50%,0.3)' },
    active_war: { icon: '🔥', label: 'WAR ACTIVE', bg: 'hsla(0,60%,40%,0.2)', color: 'hsl(0,70%,65%)', border: 'hsla(0,60%,50%,0.4)' },
    pending_resolution: { icon: '⏳', label: 'AWAITING RESOLUTION', bg: 'hsla(40,60%,40%,0.15)', color: 'hsl(40,70%,65%)', border: 'hsla(40,60%,50%,0.3)' },
    cooldown: { icon: '🛡️', label: 'Cooldown', bg: 'hsla(210,40%,40%,0.1)', color: 'hsl(210,50%,65%)', border: 'hsla(210,40%,50%,0.2)' },
  };
  const c = configs[state] || configs.peaceful;
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ fontSize: 12 }}>{c.icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, letterSpacing: '0.06em' }}>{c.label}</span>
      {challenge && state === 'contested' && (
        <span style={{ fontSize: 9, color: 'hsl(30,50%,55%)', marginLeft: 4 }}>
          War in {formatCountdown(challenge.war_starts_at)}
        </span>
      )}
      {challenge && state === 'active_war' && (
        <span style={{ fontSize: 9, color: 'hsl(0,50%,55%)', marginLeft: 4 }}>
          Ends {formatCountdown(challenge.war_ends_at)}
        </span>
      )}
    </div>
  );
}

export function FactionPanel({ open, onClose, playerX, playerZ, clanSystem: clan }: Props) {
  const [tab, setTab] = useState<Tab>('my_faction');
  const [, setTick] = useState(0);

  const wallet = loadWalletSession();
  const isWallet = !!wallet?.wallet_address && !!wallet?.session_token;

  // Determine my faction from clan system (clan_id maps to faction UUID)
  const myFaction = clan.myClan
    ? FACTIONS.find(f => f.id === clan.myClan!.clan_id) || null
    : null;

  useEffect(() => {
    if (!open || clan.challenges.length === 0) return;
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [open, clan.challenges.length]);

  useEffect(() => {
    if (open) { clan.refresh(); clan.setError(null); }
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (open && clan.myClan) clan.loadClanMembers(clan.myClan.clan_id);
  }, [open, clan.myClan?.clan_id]); // eslint-disable-line

  useEffect(() => {
    if (open && tab === 'history') clan.loadHistory();
  }, [open, tab]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  const myChallenges = clan.challenges.filter(
    c => c.attacker_clan_id === clan.myClan?.clan_id || c.defender_clan_id === clan.myClan?.clan_id
  );

  const getChallengeForTerritory = (tid: string) => clan.challenges.find(c => c.territory_id === tid);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        style={panelStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-wide" style={{ color: 'hsl(40,50%,88%)' }}>
            🏰 FACTIONS & KINGDOMS
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: 'hsla(0,0%,100%,0.05)', color: 'hsl(40,15%,55%)', border: '1px solid hsla(0,0%,100%,0.1)' }}
          >✕</button>
        </div>

        {!isWallet ? (
          <div className="px-4 py-6 rounded-lg text-center" style={{
            background: 'hsla(0,0%,100%,0.03)', border: '1px dashed hsla(0,0%,100%,0.1)',
          }}>
            <p className="text-sm mb-2" style={{ color: 'hsl(40,20%,65%)' }}>🔒 Faction System</p>
            <p className="text-xs" style={{ color: 'hsl(40,15%,40%)' }}>
              Connect a Phantom wallet and register to join a faction
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {(['my_faction', 'kingdoms', 'wars', 'history'] as Tab[]).map(t => (
                <button key={t}
                  onClick={() => { setTab(t); clan.setError(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                  style={btnStyle(tab === t)}
                >
                  {t === 'my_faction' ? 'My Faction' : t === 'kingdoms' ? 'Kingdoms' : t === 'wars' ? 'Wars' : 'History'}
                </button>
              ))}
            </div>

            {clan.error && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{
                background: 'hsla(0,50%,40%,0.1)', color: 'hsl(0,60%,65%)', border: '1px solid hsla(0,50%,50%,0.2)',
              }}>⚠️ {clan.error}</div>
            )}

            {/* MY FACTION TAB */}
            {tab === 'my_faction' && (
              myFaction ? (
                <div>
                  {/* Faction identity card */}
                  <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{
                    background: `${myFaction.colorHex}10`,
                    border: `1px solid ${myFaction.colorHex}40`,
                  }}>
                    <div className="text-3xl">{myFaction.icon}</div>
                    <div className="flex-1">
                      <div className="text-sm font-bold" style={{ color: myFaction.colorHex }}>{myFaction.name}</div>
                      <div className="text-xs" style={{ color: 'hsl(40,15%,50%)' }}>
                        {myFaction.kingdomName} · {myFaction.characterType}
                        {!myFaction.available && ' · ⚠️ Placeholder character'}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full" style={{ background: myFaction.colorHex }} />
                  </div>

                  {/* Home kingdom info */}
                  <div className="mb-4 px-3 py-2 rounded-lg" style={{
                    background: 'hsla(120,30%,30%,0.08)', border: '1px solid hsla(120,30%,40%,0.15)',
                  }}>
                    <div className="text-xs font-bold" style={{ color: 'hsl(120,40%,65%)' }}>
                      🏠 Home Kingdom: {myFaction.kingdomName}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'hsl(40,15%,45%)' }}>
                      Spawn: ({myFaction.spawnX}, {myFaction.spawnZ}) · Permanent faction territory
                    </div>
                  </div>

                  {/* Active wars */}
                  {myChallenges.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(30,50%,60%)' }}>
                        ⚔️ Active Wars
                      </div>
                      {myChallenges.map(ch => {
                        const isAttacker = ch.attacker_clan_id === clan.myClan?.clan_id;
                        const attackerFaction = FACTIONS.find(f => f.id === ch.attacker_clan_id);
                        const defenderFaction = FACTIONS.find(f => f.id === ch.defender_clan_id);
                        return (
                          <div key={ch.id} className="px-3 py-2.5 rounded-lg mb-1.5" style={{
                            background: 'hsla(30,50%,30%,0.1)', border: '1px solid hsla(30,50%,40%,0.2)',
                          }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'hsl(30,60%,70%)' }}>
                                {ch.territory_name}
                              </span>
                              <span style={{ fontSize: 9, color: 'hsl(40,15%,45%)' }}>
                                {isAttacker ? '(Attacking)' : '(Defending)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span>{attackerFaction?.icon || '⚔️'}</span>
                              <span style={{ fontSize: 10, color: attackerFaction?.colorHex || '#888' }}>{ch.attacker_clan_name}</span>
                              <span style={{ fontSize: 10, color: 'hsl(40,15%,45%)' }}>vs</span>
                              <span>{defenderFaction?.icon || '🛡️'}</span>
                              <span style={{ fontSize: 10, color: defenderFaction?.colorHex || '#888' }}>{ch.defender_clan_name}</span>
                            </div>
                            <span style={{ fontSize: 9, color: 'hsl(30,50%,55%)' }}>
                              {ch.status === 'pending' ? `⏳ War in ${formatCountdown(ch.war_starts_at)}`
                                : ch.status === 'active' ? `🔥 Ends ${formatCountdown(ch.war_ends_at)}`
                                : ch.status === 'pending_resolution' ? `⏳ Awaiting admin resolution`
                                : `🛡️ Cooldown ${formatCountdown(ch.cooldown_ends_at)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Faction members roster */}
                  <div className="mb-4">
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(40,20%,55%)' }}>
                      Faction Members ({clan.clanMembers.length})
                    </div>
                    <div className="space-y-1 max-h-[25vh] overflow-y-auto">
                      {clan.clanMembers.map((m: ClanMemberInfo) => (
                        <div key={m.wallet_address} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
                          background: 'hsla(0,0%,100%,0.02)',
                          border: '1px solid hsla(0,0%,100%,0.04)',
                        }}>
                          <span style={{ fontSize: 12 }}>⚔️</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate" style={{ color: 'hsl(40,40%,80%)' }}>{m.display_name}</div>
                            <div className="text-[9px]" style={{ color: 'hsl(40,15%,40%)' }}>{m.character_type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm mb-3" style={{ color: 'hsl(40,20%,60%)' }}>No faction assigned</p>
                  <p className="text-xs" style={{ color: 'hsl(40,15%,40%)' }}>
                    Register with a Phantom wallet to join a faction permanently
                  </p>
                </div>
              )
            )}

            {/* KINGDOMS TAB */}
            {tab === 'kingdoms' && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(40,20%,55%)' }}>
                  Faction Kingdoms ({clan.territories.length})
                </div>
                <div className="space-y-2">
                  {clan.territories.map((t: TerritoryInfo) => {
                    const ownerFaction = FACTIONS.find(f => f.id === t.owning_clan_id);
                    const ch = getChallengeForTerritory(t.id);
                    const dist = Math.sqrt((playerX - t.center_x) ** 2 + (playerZ - t.center_z) ** 2);
                    const inRange = dist <= t.radius + 30;

                    return (
                      <div key={t.id} className="px-3 py-2.5 rounded-lg" style={{
                        background: ownerFaction ? `${ownerFaction.colorHex}10` : 'hsla(0,0%,100%,0.03)',
                        border: ownerFaction ? `1px solid ${ownerFaction.colorHex}30` : '1px solid hsla(0,0%,100%,0.06)',
                      }}>
                        <div className="flex items-center gap-2 mb-1">
                          {ownerFaction && <span>{ownerFaction.icon}</span>}
                          <span className="text-xs font-bold" style={{ color: 'hsl(40,40%,80%)' }}>{t.name}</span>
                          <WarStateBadge state={t.war_state} challenge={ch} />
                          <span className="ml-auto text-[10px]" style={{ color: 'hsl(40,15%,40%)' }}>
                            {inRange ? '📍 In range' : `${Math.round(dist)}u`}
                          </span>
                        </div>
                        <div className="text-[10px]" style={{ color: 'hsl(40,15%,45%)' }}>
                          {ownerFaction
                            ? `🏴 ${ownerFaction.name} Faction Home Kingdom`
                            : '⬜ Neutral territory'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WARS TAB */}
            {tab === 'wars' && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(30,50%,60%)' }}>
                  ⚔️ Active Conflicts ({clan.challenges.length})
                </div>
                {clan.challenges.length === 0 ? (
                  <div className="text-xs text-center py-6" style={{ color: 'hsl(40,15%,40%)' }}>
                    No active faction wars. The kingdoms are at peace... for now.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clan.challenges.map((ch: ChallengeInfo) => {
                      const attackerFaction = FACTIONS.find(f => f.id === ch.attacker_clan_id);
                      const defenderFaction = FACTIONS.find(f => f.id === ch.defender_clan_id);
                      return (
                        <div key={ch.id} className="px-3 py-2.5 rounded-lg" style={{
                          background: 'hsla(30,50%,30%,0.1)', border: '1px solid hsla(30,50%,40%,0.2)',
                        }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span>{attackerFaction?.icon || '⚔️'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: attackerFaction?.colorHex || '#888' }}>
                              {ch.attacker_clan_name}
                            </span>
                            <span style={{ fontSize: 10, color: 'hsl(40,15%,45%)' }}>vs</span>
                            <span>{defenderFaction?.icon || '🛡️'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: defenderFaction?.colorHex || '#888' }}>
                              {ch.defender_clan_name}
                            </span>
                          </div>
                          <div className="text-[10px]" style={{ color: 'hsl(40,15%,45%)' }}>
                            📍 {ch.territory_name} ·{' '}
                            {ch.status === 'pending' ? `War in ${formatCountdown(ch.war_starts_at)}`
                              : ch.status === 'active' ? `Ends ${formatCountdown(ch.war_ends_at)}`
                              : ch.status === 'pending_resolution' ? 'Awaiting resolution'
                              : `Cooldown ${formatCountdown(ch.cooldown_ends_at)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {tab === 'history' && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(40,20%,55%)' }}>
                  📜 Territory History ({clan.history.length})
                </div>
                {clan.history.length === 0 ? (
                  <div className="text-xs text-center py-6" style={{ color: 'hsl(40,15%,40%)' }}>
                    No territory events recorded yet.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                    {clan.history.map((h: TerritoryHistoryEntry) => {
                      const factionForEvent = FACTIONS.find(f => f.id === h.clan_id);
                      const eventConfig: Record<string, { icon: string; label: string; color: string }> = {
                        claimed: { icon: '🏴', label: 'Claimed', color: 'hsl(120,40%,60%)' },
                        released: { icon: '🏳️', label: 'Released', color: 'hsl(40,40%,60%)' },
                        dissolved: { icon: '💀', label: 'Dissolved', color: 'hsl(0,40%,55%)' },
                        challenged: { icon: '⚔️', label: 'Challenged', color: 'hsl(30,60%,60%)' },
                        war_cancelled: { icon: '🚫', label: 'Cancelled', color: 'hsl(0,30%,55%)' },
                        war_started: { icon: '🔥', label: 'War Started', color: 'hsl(0,60%,60%)' },
                        war_ended_pending_resolution: { icon: '⏳', label: 'Awaiting Resolution', color: 'hsl(40,60%,60%)' },
                        war_resolved_defender_held: { icon: '🛡️', label: 'Defender Held', color: 'hsl(210,50%,60%)' },
                        war_resolved_attacker_won: { icon: '⚔️', label: 'Attacker Won', color: 'hsl(0,60%,60%)' },
                      };
                      const cfg = eventConfig[h.event_type] || { icon: '📋', label: h.event_type, color: 'hsl(40,15%,55%)' };
                      const timeAgo = (() => {
                        const diff = Date.now() - new Date(h.created_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return 'just now';
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        return `${Math.floor(hrs / 24)}d ago`;
                      })();

                      return (
                        <div key={h.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg" style={{
                          background: 'hsla(0,0%,100%,0.02)', border: '1px solid hsla(0,0%,100%,0.04)',
                        }}>
                          <span style={{ fontSize: 13, lineHeight: '18px' }}>{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                              <span style={{ fontSize: 9, color: 'hsl(40,15%,40%)' }}>·</span>
                              <span className="truncate" style={{ fontSize: 10, fontWeight: 600, color: 'hsl(40,30%,70%)' }}>{h.territory_name}</span>
                            </div>
                            {factionForEvent && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span>{factionForEvent.icon}</span>
                                <span style={{ fontSize: 9, color: factionForEvent.colorHex }}>{factionForEvent.name}</span>
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: 'hsl(40,15%,35%)', whiteSpace: 'nowrap' }}>{timeAgo}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid hsla(0,0%,100%,0.05)' }}>
          <p className="text-[9px] text-center" style={{ color: 'hsl(40,15%,35%)' }}>
            Press C to toggle · ESC to close · 7 permanent factions · Faction wars
          </p>
        </div>
      </div>
    </div>
  );
}
