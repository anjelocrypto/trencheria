import { useEffect, useState } from 'react';
import { SurvivalState, ResourceInventory, ProgressionState } from '../types';
import { BuildableConfig } from '../systems/BuildingData';
import { TIER2_KILLS_REQUIRED, TIER2_STRUCTURES_REQUIRED } from '../constants';
import { Minimap } from './Minimap';
import type { TerritoryInfo, ChallengeInfo } from '../hooks/useClanSystem';
import { CLAN_COLOR_HEX } from '../hooks/useClanSystem';
import { FACTIONS, FactionDef } from '../systems/FactionData';
import type { InterpolatedPlayer } from '../multiplayer/types';
import { supabase } from '@/integrations/supabase/client';

/* ── 8-direction compass arrow from player → target ── */
const DIR_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function compassArrow(dx: number, dz: number): string {
  // World: +x = east, +z = south. Game "north" = -z.
  const angle = Math.atan2(dx, -dz); // 0 = north, +pi/2 = east
  const idx = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return DIR_ARROWS[idx];
}

/* ── My-clan wars panel: every active/pending war for my clan with score, timer, distance + arrow ── */
function MyClanWarsPanel({
  challenges, territories, myClan, playerX, playerZ, panelStyle,
}: {
  challenges: ChallengeInfo[];
  territories: TerritoryInfo[];
  myClan: { clan_name: string; clan_color: string; clan_id: string };
  playerX: number;
  playerZ: number;
  panelStyle: React.CSSProperties;
}) {
  const myWars = challenges.filter(
    c => (c.attacker_clan_id === myClan.clan_id || c.defender_clan_id === myClan.clan_id)
      && (c.status === 'pending' || c.status === 'active' || c.status === 'pending_resolution')
  );

  const [scores, setScores] = useState<Record<string, { att: number; def: number }>>({});
  const [, setTick] = useState(0);

  // 1Hz tick for live countdowns
  useEffect(() => {
    if (myWars.length === 0) return;
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [myWars.length]);

  // Poll kill scores for active + resolving wars (20s cadence; pauses when tab hidden)
  const activeIds = myWars.filter(w => w.status === 'active' || w.status === 'pending_resolution').map(w => w.id).join(',');
  useEffect(() => {
    if (!activeIds) { setScores({}); return; }
    const ids = activeIds.split(',').filter(Boolean);
    let cancelled = false;
    const fetchAll = async () => {
      const updates: Record<string, { att: number; def: number }> = {};
      await Promise.all(ids.map(async id => {
        const ch = myWars.find(w => w.id === id);
        if (!ch) return;
        try {
          const { data } = await supabase.rpc('get_war_kills' as any, { _challenge_id: id });
          const kd = typeof data === 'string' ? JSON.parse(data) : data;
          if (kd && typeof kd === 'object' && !Array.isArray(kd)) {
            const kills: { clan_id: string; kill_count: number }[] = kd.kills || [];
            let att = 0, def = 0;
            for (const k of kills) {
              const n = Number(k.kill_count) || 0;
              if (k.clan_id === ch.attacker_clan_id) att += n;
              else if (k.clan_id === ch.defender_clan_id) def += n;
            }
            updates[id] = { att, def };
          }
        } catch { /* silent */ }
      }));
      if (!cancelled) setScores(prev => ({ ...prev, ...updates }));
    };
    fetchAll();
    const iv = setInterval(() => { if (!document.hidden) fetchAll(); }, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (myWars.length === 0) return null;

  return (
    <>
      {myWars.map(myCh => {
        const isAttacker = myCh.attacker_clan_id === myClan.clan_id;
        const isPending = myCh.status === 'pending';
        const isActive = myCh.status === 'active';
        const isPendingRes = myCh.status === 'pending_resolution';
        const targetTime = isPending ? myCh.war_starts_at : isActive ? myCh.war_ends_at : myCh.cooldown_ends_at;
        const diff = new Date(targetTime).getTime() - Date.now();
        const mins = Math.max(0, Math.floor(diff / 60000));
        const secs = Math.max(0, Math.floor((diff % 60000) / 1000));
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const borderColor = isPending ? 'hsla(30,70%,50%,0.5)' : isActive ? 'hsla(0,70%,50%,0.5)' : 'hsla(40,70%,50%,0.5)';
        const icon = isPending ? '⚔️' : isActive ? '🔥' : '⏳';
        const label = isPending ? 'WAR PENDING' : isActive ? 'WAR ACTIVE' : 'RESOLVING…';
        const labelColor = isPending ? 'hsl(30,70%,65%)' : isActive ? 'hsl(0,70%,65%)' : 'hsl(40,70%,65%)';
        const timeLabel = isPending ? `Starts ${timeStr}` : isActive ? `Ends ${timeStr}` : 'Auto-resolving from kills';

        const territory = territories.find(t => t.id === myCh.territory_id);
        let dist = 0;
        let arrow = '';
        if (territory) {
          const dx = territory.center_x - playerX;
          const dz = territory.center_z - playerZ;
          dist = Math.sqrt(dx * dx + dz * dz);
          arrow = compassArrow(dx, dz);
        }

        const score = scores[myCh.id];
        const myScore = score ? (isAttacker ? score.att : score.def) : null;
        const oppScore = score ? (isAttacker ? score.def : score.att) : null;
        const oppName = isAttacker ? myCh.defender_clan_name : myCh.attacker_clan_name;
        const myColor = isAttacker
          ? (CLAN_COLOR_HEX[myCh.attacker_clan_color as import('../hooks/useClanSystem').ClanColor] || '#ccc')
          : (CLAN_COLOR_HEX[myCh.defender_clan_color as import('../hooks/useClanSystem').ClanColor] || '#ccc');
        const oppColor = isAttacker
          ? (CLAN_COLOR_HEX[myCh.defender_clan_color as import('../hooks/useClanSystem').ClanColor] || '#ccc')
          : (CLAN_COLOR_HEX[myCh.attacker_clan_color as import('../hooks/useClanSystem').ClanColor] || '#ccc');

        return (
          <div key={myCh.id}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg ${isActive || isPendingRes ? 'animate-pulse' : ''}`}
            style={{ ...panelStyle, border: `1px solid ${borderColor}`, boxShadow: `0 0 12px ${borderColor}` }}
          >
            <span style={{ fontSize: 14 }}>{icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="flex items-center gap-2">
                <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, letterSpacing: '0.06em' }}>
                  {label}
                </div>
                {(isActive || isPendingRes) && score && (
                  <div style={{
                    fontSize: 10, fontWeight: 800, fontFamily: 'ui-monospace, monospace',
                    color: 'hsl(40,30%,85%)',
                  }}>
                    <span style={{ color: myColor }}>{myScore}</span>
                    <span style={{ color: 'hsl(40,15%,45%)' }}> – </span>
                    <span style={{ color: oppColor }}>{oppScore}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 9, color: 'hsl(40,15%,55%)' }}>
                {myCh.territory_name} · {isAttacker ? `vs ${oppName}` : `${oppName} attacking`} · {timeLabel}
              </div>
              {territory && (
                <div style={{ fontSize: 9, color: 'hsl(40,15%,45%)' }}>
                  <span style={{ color: 'hsl(40,40%,70%)', fontWeight: 700 }}>{arrow}</span>
                  {' '}{Math.round(dist)}u away
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

interface HUDProps {
  survival: SurvivalState;
  inventory: ResourceInventory;
  interactionText: string | null;
  buildMode: boolean;
  selectedBuildIndex: number;
  buildFeedback: string | null;
  damageFlash: number;
  progression: ProgressionState;
  notification: string | null;
  availableBuildables: BuildableConfig[];
  isMounted?: boolean;
  playerX: number;
  playerZ: number;
  playerRotation: number;
  horseX: number;
  horseZ: number;
  mapOpen: boolean;
  onCloseMap: () => void;
  isSpeaking?: boolean;
  trencheriBalance?: number | null;
  territories?: TerritoryInfo[];
  challenges?: ChallengeInfo[];
  myClan?: { clan_name: string; clan_color: string; clan_id: string } | null;
  remotePlayersRef?: React.RefObject<Map<string, InterpolatedPlayer>>;
}

/* ── shared panel style ── */
const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, hsla(0,0%,0%,0.72), hsla(0,0%,0%,0.58))',
  border: '1px solid hsla(40,30%,45%,0.4)',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 4px 20px hsla(0,0%,0%,0.4), inset 0 1px 0 hsla(40,30%,60%,0.08)',
};

const keycapStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 20,
  padding: '0 5px',
  borderRadius: 4,
  background: 'hsla(40,20%,50%,0.18)',
  border: '1px solid hsla(40,30%,50%,0.3)',
  fontSize: 10,
  fontFamily: 'ui-monospace, monospace',
  fontWeight: 700,
  color: 'hsl(40,30%,82%)',
  lineHeight: 1,
};

/* ── Stat bar ── */
function StatBar({ label, icon, value, max, color, warning }: {
  label: string; icon: string; value: number; max: number; color: string; warning?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm w-5 text-center" style={{ filter: warning ? 'saturate(2)' : undefined }}>{icon}</span>
      <span className={`text-[10px] font-bold uppercase tracking-widest w-7 ${warning ? 'animate-pulse' : ''}`}
        style={{ color: warning ? 'hsl(0,70%,65%)' : 'hsl(40,20%,65%)' }}>{label}</span>
      <div className="relative h-2.5 w-28 rounded-sm overflow-hidden"
        style={{ background: 'hsla(0,0%,100%,0.06)', boxShadow: 'inset 0 1px 3px hsla(0,0%,0%,0.4)' }}>
        <div className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ${warning ? 'animate-pulse' : ''}`}
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            boxShadow: `0 0 8px ${color}40`,
          }} />
      </div>
      <span className="text-[11px] font-mono w-7 text-right"
        style={{ color: warning ? 'hsl(0,70%,65%)' : 'hsl(40,20%,70%)' }}>{Math.round(value)}</span>
    </div>
  );
}

/* ── Keycap ── */
function Key({ children }: { children: React.ReactNode }) {
  return <span style={keycapStyle}>{children}</span>;
}

/* ── Control row ── */
function ControlRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
      <Key>{keys}</Key>
      <span style={{ color: 'hsl(40,15%,60%)', fontSize: 11 }}>{action}</span>
    </div>
  );
}

/* ── Section divider in controls ── */
function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.12em',
        color: 'hsl(35,60%,55%)',
        marginBottom: 4,
        paddingBottom: 2,
        borderBottom: '1px solid hsla(40,30%,45%,0.2)',
      }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Resource slot ── */
function ResourceSlot({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 44 }}>
      <span className="text-base">{icon}</span>
      <span className="text-sm font-bold" style={{ color: 'hsl(40,30%,88%)' }}>{value}</span>
      <span style={{ fontSize: 8, color: 'hsl(40,15%,50%)', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>{label}</span>
    </div>
  );
}

/* ── Secured area pill ── */
function SecuredPill({ name }: { name: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      color: 'hsl(120,30%,70%)',
      background: 'hsla(120,30%,40%,0.15)',
      border: '1px solid hsla(120,30%,50%,0.2)',
    }}>🏴 {name}</span>
  );
}

/* ── Status badge ── */
function StatusBadge({ icon, text, hue }: { icon: string; text: string; hue: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      color: `hsl(${hue})`,
      background: `hsla(${hue} / 0.12)`,
      border: `1px solid hsla(${hue} / 0.2)`,
    }}>{icon} {text}</span>
  );
}

export function SurvivalHUD({
  survival, inventory, interactionText, buildMode, selectedBuildIndex,
  buildFeedback, damageFlash, progression, notification, availableBuildables,
  isMounted = false, playerX, playerZ, playerRotation, horseX, horseZ,
  mapOpen, onCloseMap, isSpeaking = false, trencheriBalance, territories,
  challenges, myClan, remotePlayersRef,
}: HUDProps) {
  const lowHealth = survival.health < 25;

  return (
    <div className="fixed inset-0 pointer-events-none z-50" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Damage flash */}
      {damageFlash > 0 && (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 40%, hsla(0,70%,40%,0.35) 100%)' }} />
      )}

      {/* Notification banner */}
      {notification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg text-sm font-bold animate-fade-in"
          style={{
            ...panelStyle,
            color: 'hsl(40,30%,90%)',
            border: '1px solid hsl(35,70%,50%)',
            boxShadow: '0 0 30px hsla(35,70%,50%,0.25), 0 4px 20px hsla(0,0%,0%,0.4)',
          }}>
          {notification}
        </div>
      )}

      {/* Full-map overlay (M key) — rendered separately so it covers the
          whole screen. The small minimap is rendered embedded inside the
          top-right column further down so it can't overlap the Tier panel. */}
      {mapOpen && (
        <Minimap
          playerX={playerX} playerZ={playerZ} playerRotation={playerRotation}
          horseX={horseX} horseZ={horseZ} isMounted={isMounted}
          mapOpen={mapOpen} onCloseMap={onCloseMap}
          territories={territories}
          remotePlayersRef={remotePlayersRef}
        />
      )}

      {/* ═══ BOTTOM LEFT — Survival bars + Faction identity + War alerts ═══ */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-2">
        {/* My-clan wars panel — every pending/active/resolving war for my clan,
            with attacker/defender/score/timer/distance/direction. Visible to
            every faction member anywhere on the map (SAMP-style). */}
        {myClan && challenges && territories && (
          <MyClanWarsPanel
            challenges={challenges}
            territories={territories}
            myClan={myClan}
            playerX={playerX}
            playerZ={playerZ}
            panelStyle={panelStyle}
          />
        )}

        {/* Faction identity badge */}
        {myClan && (() => {
          const faction = FACTIONS.find((f: FactionDef) => f.id === myClan.clan_id);
          const colorHex = faction?.colorHex || CLAN_COLOR_HEX[myClan.clan_color as import('../hooks/useClanSystem').ClanColor] || '#888';
          return (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg" style={{
              ...panelStyle,
              border: `1px solid ${colorHex}50`,
            }}>
              {faction && <span style={{ fontSize: 14 }}>{faction.icon}</span>}
              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{
                background: colorHex,
                boxShadow: `0 0 6px ${colorHex}40`,
              }} />
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: colorHex,
                letterSpacing: '0.06em',
              }}>
                {faction?.name || myClan.clan_name}
              </span>
              <span style={{ fontSize: 9, color: 'hsl(40,15%,50%)', marginLeft: 4 }}>
                🏠 {faction?.kingdomName || ''}
              </span>
            </div>
          );
        })()}

        <div className="flex flex-col gap-2 p-4 rounded-lg" style={panelStyle}>
          <StatBar label="HP" icon="❤️" value={survival.health} max={100} color="hsl(0,70%,50%)" warning={lowHealth} />
          <StatBar label="STA" icon="⚡" value={survival.stamina} max={100} color="hsl(45,80%,50%)" />

          {(lowHealth || isMounted) && (
            <div className="flex flex-wrap gap-1.5 mt-1 pt-2" style={{ borderTop: '1px solid hsla(40,30%,45%,0.2)' }}>
              {lowHealth && <StatusBadge icon="💔" text="Wounded" hue="0,70%,60%" />}
              {isMounted && <StatusBadge icon="🐴" text="Mounted" hue="35,40%,55%" />}
            </div>
          )}
        </div>
      </div>

      {/* ═══ BOTTOM RIGHT — Inventory + $TRENCHERI ═══ */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        {/* $TRENCHERI balance */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg" style={{
          ...panelStyle,
          border: trencheriBalance !== null && trencheriBalance !== undefined
            ? '1px solid hsla(45,80%,50%,0.4)'
            : '1px solid hsla(40,30%,45%,0.3)',
        }}>
          <span style={{ fontSize: 16 }}>🪙</span>
          {trencheriBalance !== null && trencheriBalance !== undefined ? (
            <>
              <span style={{
                fontSize: 14, fontWeight: 800, color: 'hsl(45,80%,65%)',
                letterSpacing: '0.04em', fontFamily: 'ui-monospace, monospace',
              }}>
                {trencheriBalance.toLocaleString()}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'hsl(45,50%,50%)',
                letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              }}>
                $TRENCHERI
              </span>
            </>
          ) : (
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'hsl(40,15%,50%)',
              fontStyle: 'italic',
            }}>
              Connect Wallet
            </span>
          )}
        </div>

        <div className="flex gap-4 p-3.5 rounded-lg" style={panelStyle}>
          <ResourceSlot icon="🪵" value={inventory.wood} label="Wood" />
          <div style={{ width: 1, background: 'hsla(40,30%,45%,0.25)' }} />
          <ResourceSlot icon="🪨" value={inventory.stone} label="Stone" />
          <div style={{ width: 1, background: 'hsla(40,30%,45%,0.25)' }} />
          <ResourceSlot icon="🍖" value={inventory.food} label="Food" />
        </div>
      </div>

      {/* ═══ TOP RIGHT COLUMN — Tier panel + Minimap stacked ═══
          Single right-side column with a fixed width so the minimap can
          never overlap the Tier/Kills/Built panel regardless of how many
          Secured Regions accumulate. The Secured Regions list itself is
          capped and scrolls so the panel height stays bounded. */}
      <div
        className="absolute top-4 right-4 flex flex-col items-end pointer-events-none"
        style={{ width: 210, gap: 12 }}
      >
        {/* Tier / Kills / Built / Secured panel */}
        <div className="w-full rounded-lg overflow-hidden" style={panelStyle}>
          {/* Header */}
          <div className="px-4 py-2.5" style={{
            background: 'linear-gradient(90deg, hsla(35,60%,45%,0.2), transparent)',
            borderBottom: '1px solid hsla(40,30%,45%,0.2)',
          }}>
            <div className="flex items-center gap-2">
              <span className="text-base">⚔️</span>
              <span style={{
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: 'hsl(35,60%,65%)',
              }}>
                TIER {progression.tier}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'hsl(40,15%,50%)',
                marginLeft: 2,
              }}>
                — {progression.tier >= 2 ? 'Advanced' : 'Basic'}
              </span>
            </div>
          </div>

          {/* Stats — Kills and Built are ALWAYS visible (outside the
              scrollable secured-regions area) so they never get pushed
              off-screen by a long region list. */}
          <div className="px-4 py-3 flex flex-col gap-2">
            {/* Kills */}
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, color: 'hsl(40,15%,55%)', fontWeight: 600 }}>Kills</span>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'hsl(0,60%,60%)' }}>{progression.enemiesKilled}</span>
                {progression.tier < 2 && (
                  <span style={{ fontSize: 10, color: 'hsl(40,15%,40%)' }}>/ {TIER2_KILLS_REQUIRED}</span>
                )}
              </div>
            </div>
            {/* Built */}
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, color: 'hsl(40,15%,55%)', fontWeight: 600 }}>Built</span>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'hsl(35,60%,60%)' }}>{progression.structuresBuilt}</span>
                {progression.tier < 2 && (
                  <span style={{ fontSize: 10, color: 'hsl(40,15%,40%)' }}>/ {TIER2_STRUCTURES_REQUIRED}</span>
                )}
              </div>
            </div>

            {/* Secured regions — capped, scrollable. Long names wrap or
                truncate cleanly; the list never spills outside the panel. */}
            {progression.areasSecured.length > 0 && (
              <div style={{ borderTop: '1px solid hsla(40,30%,45%,0.2)', paddingTop: 8, marginTop: 4 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(40,15%,45%)' }}>
                    Secured Regions
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'hsl(40,15%,55%)' }}>
                    {progression.areasSecured.length}
                  </span>
                </div>
                <div
                  className="flex flex-wrap gap-1.5 pointer-events-auto"
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: 2,
                  }}
                >
                  {progression.areasSecured.map(a => (
                    <SecuredPill key={a} name={a.charAt(0).toUpperCase() + a.slice(1)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Minimap embedded directly under the Tier panel — guaranteed to
            sit below it with a 12px gap, never overlapping. The full-map
            overlay (M key) is rendered separately above so it still covers
            the whole screen. */}
        {!mapOpen && (
          <Minimap
            embedded
            playerX={playerX} playerZ={playerZ} playerRotation={playerRotation}
            horseX={horseX} horseZ={horseZ} isMounted={isMounted}
            mapOpen={mapOpen} onCloseMap={onCloseMap}
            territories={territories}
            remotePlayersRef={remotePlayersRef}
          />
        )}
      </div>

      {/* ═══ TOP LEFT — Controls panel ═══ */}
      <div className="absolute top-4 left-4 p-4 rounded-lg" style={{ ...panelStyle, maxWidth: 190 }}>
        <ControlSection title="Movement">
          <ControlRow keys="WASD" action="Move" />
          <ControlRow keys="SHIFT" action="Run" />
          {!isMounted && <ControlRow keys="SPACE" action="Jump" />}
          <ControlRow keys="MOUSE" action="Look" />
        </ControlSection>

        {!isMounted && (
          <ControlSection title="Combat">
            <ControlRow keys="CLICK" action="Attack" />
          </ControlSection>
        )}

        <ControlSection title="Interact">
          <ControlRow keys="E" action={isMounted ? 'Dismount' : 'Interact'} />
          <ControlRow keys="F" action="Eat Food" />
          {!isMounted && <ControlRow keys="B" action="Build" />}
        </ControlSection>

        <ControlSection title="Utility">
          {!isMounted && <ControlRow keys="H" action="Call Horse" />}
          <ControlRow keys="M" action="Map" />
          <ControlRow keys="C" action="Faction" />
          <ControlRow keys="L" action="Leaderboard" />
          <ControlRow keys="K" action="Voice (Hold)" />
          <ControlRow keys="P" action="Settings" />
          <ControlRow keys="SCROLL" action="Zoom" />
        </ControlSection>
      </div>

      {/* Build mode panel — positioned to the LEFT of the top-right
          column (column = 16px right + 210px wide, so 240px clears it
          with a small gap). Avoids overlapping the Tier panel/minimap. */}
      {buildMode && (
        <div className="absolute p-4 rounded-lg min-w-56" style={{ ...panelStyle, top: 16, right: 240 }}>
          <div className="flex items-center gap-2 mb-1 pb-2" style={{ borderBottom: '1px solid hsla(40,30%,45%,0.2)' }}>
            <span className="text-base">🔨</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'hsl(35,60%,65%)', letterSpacing: '0.04em' }}>BUILD MODE</span>
          </div>
          <div className="mb-3 px-2 py-1 rounded text-center" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            color: 'hsl(35,50%,55%)', background: 'hsla(35,40%,40%,0.1)', border: '1px solid hsla(35,40%,40%,0.15)',
          }}>
            ⚠️ Alpha Preview — Session only, not saved
          </div>
          {availableBuildables.map((b, i) => (
            <div key={b.type}
              className="py-1.5 px-2.5 rounded mb-1"
              style={i === selectedBuildIndex
                ? { background: 'hsla(35,60%,50%,0.15)', border: '1px solid hsla(35,60%,50%,0.3)' }
                : { border: '1px solid transparent' }
              }>
              <div style={{
                fontSize: 11,
                fontWeight: i === selectedBuildIndex ? 700 : 400,
                color: i === selectedBuildIndex ? 'hsl(40,30%,88%)' : 'hsl(40,15%,50%)',
              }}>
                {b.label} — {b.description}
              </div>
              {b.effect && i === selectedBuildIndex && (
                <div style={{ fontSize: 9, color: 'hsl(40,15%,40%)', marginTop: 2 }}>{b.effect}</div>
              )}
            </div>
          ))}
          <div className="mt-3 pt-2 flex flex-col gap-1" style={{ borderTop: '1px solid hsla(40,30%,45%,0.2)' }}>
            <div className="flex items-center gap-2">
              <Key>Q</Key><Key>R</Key>
              <span style={{ fontSize: 10, color: 'hsl(40,15%,50%)' }}>Cycle</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>CLICK</Key>
              <span style={{ fontSize: 10, color: 'hsl(40,15%,50%)' }}>Place</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>B</Key>
              <span style={{ fontSize: 10, color: 'hsl(40,15%,50%)' }}>Exit</span>
            </div>
          </div>
        </div>
      )}

      {/* Build feedback */}
      {buildMode && buildFeedback && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ ...panelStyle, color: 'hsl(40,30%,88%)' }}>
          {buildFeedback}
        </div>
      )}

      {/* Interaction prompt */}
      {!buildMode && interactionText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg text-sm font-semibold animate-pulse"
          style={{ ...panelStyle, color: 'hsl(40,30%,88%)', border: '1px solid hsla(35,60%,50%,0.4)' }}>
          {interactionText}
        </div>
      )}

      {/* Voice indicator */}
      {isSpeaking && (
        <div className="absolute left-1/2 -translate-x-1/2 animate-fade-in" style={{ bottom: 140 }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{
            ...panelStyle,
            border: '1px solid hsla(120,50%,50%,0.4)',
            boxShadow: '0 0 16px hsla(120,60%,40%,0.25)',
          }}>
            <span style={{ fontSize: 14 }}>🎙️</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'hsl(120,50%,65%)', letterSpacing: '0.06em' }}>
              TRANSMITTING
            </span>
            <span className="animate-pulse" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'hsl(120,60%,50%)',
              boxShadow: '0 0 6px hsl(120,60%,50%)',
            }} />
          </div>
        </div>
      )}

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          border: buildMode ? '1.5px solid hsl(35,70%,50%)' : '1.5px solid hsla(40,30%,90%,0.5)',
          boxShadow: buildMode ? '0 0 6px hsla(35,70%,50%,0.4)' : '0 0 4px hsla(0,0%,0%,0.5)',
        }} />
      </div>
    </div>
  );
}
