import { SurvivalState, ResourceInventory, ProgressionState } from '../types';
import { BuildableConfig } from '../systems/BuildingData';
import { TIER2_KILLS_REQUIRED, TIER2_STRUCTURES_REQUIRED } from '../constants';
import { Minimap } from './Minimap';
import type { TerritoryInfo, ChallengeInfo } from '../hooks/useClanSystem';
import { CLAN_COLOR_HEX } from '../hooks/useClanSystem';
import { FACTIONS, FactionDef } from '../systems/FactionData';
import type { InterpolatedPlayer } from '../multiplayer/types';

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

      {/* Minimap & Full Map */}
      <Minimap
        playerX={playerX} playerZ={playerZ} playerRotation={playerRotation}
        horseX={horseX} horseZ={horseZ} isMounted={isMounted}
        mapOpen={mapOpen} onCloseMap={onCloseMap}
        territories={territories}
        remotePlayersRef={remotePlayersRef}
      />

      {/* ═══ BOTTOM LEFT — Survival bars + Faction identity + War alerts ═══ */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-2">
        {/* War alert — shown when player's clan has an active challenge */}
        {myClan && challenges && (() => {
          const myCh = challenges.find(
            c => (c.attacker_clan_id === myClan.clan_id || c.defender_clan_id === myClan.clan_id)
              && (c.status === 'pending' || c.status === 'active' || c.status === 'pending_resolution' || c.status === 'resolved')
          );
          if (!myCh) return null;
          const isAttacker = myCh.attacker_clan_id === myClan.clan_id;
          const isPending = myCh.status === 'pending';
          const isActive = myCh.status === 'active';
          const isPendingRes = myCh.status === 'pending_resolution';
          const isResolved = myCh.status === 'resolved';
          const targetTime = isPending ? myCh.war_starts_at : isActive ? myCh.war_ends_at : myCh.cooldown_ends_at;
          const diff = new Date(targetTime).getTime() - Date.now();
          const mins = Math.max(0, Math.floor(diff / 60000));
          const secs = Math.max(0, Math.floor((diff % 60000) / 1000));
          const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          const borderColor = isPending ? 'hsla(30,70%,50%,0.5)' : isActive ? 'hsla(0,70%,50%,0.5)' : isPendingRes ? 'hsla(40,70%,50%,0.5)' : 'hsla(210,50%,50%,0.4)';
          const icon = isPending ? '⚔️' : isActive ? '🔥' : isPendingRes ? '⏳' : '🛡️';
          const label = isPending ? 'WAR PENDING' : isActive ? 'WAR ACTIVE' : isPendingRes ? 'AWAITING RESOLUTION' : 'COOLDOWN';
          const labelColor = isPending ? 'hsl(30,70%,65%)' : isActive ? 'hsl(0,70%,65%)' : isPendingRes ? 'hsl(40,70%,65%)' : 'hsl(210,50%,65%)';
          const timeLabel = isPending ? `Starts ${timeStr}` : isActive ? `Ends ${timeStr}` : isPendingRes ? 'Admin review pending' : `Ends ${timeStr}`;
          return (
            <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg ${isActive || isPendingRes ? 'animate-pulse' : ''}`} style={{
              ...panelStyle,
              border: `1px solid ${borderColor}`,
              boxShadow: `0 0 12px ${borderColor}`,
            }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: 'hsl(40,15%,50%)' }}>
                  {myCh.territory_name} · {isAttacker ? 'Attacking' : 'Defending'} · {timeLabel}
                </div>
              </div>
            </div>
          );
        })()}

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

      {/* ═══ TOP RIGHT — Progression panel ═══ */}
      <div className="absolute top-4 right-4 rounded-lg overflow-hidden" style={{ ...panelStyle, maxWidth: 200 }}>
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

        {/* Stats */}
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

          {/* Secured areas */}
          {progression.areasSecured.length > 0 && (
            <div style={{ borderTop: '1px solid hsla(40,30%,45%,0.2)', paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(40,15%,45%)', marginBottom: 6 }}>
                Secured Regions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {progression.areasSecured.map(a => (
                  <SecuredPill key={a} name={a.charAt(0).toUpperCase() + a.slice(1)} />
                ))}
              </div>
            </div>
          )}
        </div>
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

      {/* Build mode panel */}
      {buildMode && (
        <div className="absolute top-24 right-4 p-4 rounded-lg min-w-56" style={panelStyle}>
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
