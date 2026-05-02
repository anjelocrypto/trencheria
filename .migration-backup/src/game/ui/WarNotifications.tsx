/**
 * War Notifications — toast-style alerts for territory war state changes.
 * Tracks previous challenge states and fires visual alerts + sound cues on transitions.
 * Also shows a territory awareness bar when inside a contested/active/cooldown zone.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChallengeInfo, TerritoryInfo, ClanColor } from '../hooks/useClanSystem';
import { CLAN_COLOR_HEX } from '../hooks/useClanSystem';
import { playChallengedSound, playWarStartedSound, playCapturedSound, playResolvedSound } from '../systems/WarSounds';

interface Props {
  challenges: ChallengeInfo[];
  territories: TerritoryInfo[];
  myClan: { clan_id: string; clan_name: string; clan_color: string } | null;
  playerX: number;
  playerZ: number;
}

interface WarToast {
  id: number;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  createdAt: number;
}

const TOAST_DURATION = 6000;

export function WarNotifications({ challenges, territories, myClan, playerX, playerZ }: Props) {
  const [toasts, setToasts] = useState<WarToast[]>([]);
  const toastIdRef = useRef(0);
  const prevChallengesRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);

  const addToast = useCallback((toast: Omit<WarToast, 'id' | 'createdAt'>) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { ...toast, id, createdAt: Date.now() }].slice(-3));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION);
  }, []);

  // Track challenge state transitions and fire notifications
  useEffect(() => {
    if (!myClan) return;

    const prevMap = prevChallengesRef.current;
    const newMap = new Map<string, string>();

    for (const ch of challenges) {
      const isMine = ch.attacker_clan_id === myClan.clan_id || ch.defender_clan_id === myClan.clan_id;
      if (!isMine) continue;

      newMap.set(ch.id, ch.status);
      const prevStatus = prevMap.get(ch.id);

      // Skip on first load
      if (!initializedRef.current) continue;
      if (prevStatus === ch.status) continue;

      const isAttacker = ch.attacker_clan_id === myClan.clan_id;
      const opponentName = isAttacker ? ch.defender_clan_name : ch.attacker_clan_name;

      if (!prevStatus && (ch.status === 'pending')) {
        playChallengedSound();
        addToast({
          icon: '⚔️',
          title: isAttacker ? 'Challenge Issued!' : 'Territory Challenged!',
          subtitle: isAttacker
            ? `You challenged ${opponentName} for ${ch.territory_name}`
            : `${opponentName} is challenging your territory ${ch.territory_name}`,
          color: 'hsl(30,70%,65%)',
          borderColor: 'hsla(30,70%,50%,0.5)',
        });
      } else if (prevStatus === 'pending' && ch.status === 'active') {
        playWarStartedSound();
        addToast({
          icon: '🔥',
          title: 'WAR HAS BEGUN!',
          subtitle: `${ch.territory_name} — ${ch.attacker_clan_name} vs ${ch.defender_clan_name}`,
          color: 'hsl(0,70%,65%)',
          borderColor: 'hsla(0,70%,50%,0.6)',
        });
      } else if (prevStatus === 'active' && ch.status === 'pending_resolution') {
        playResolvedSound();
        addToast({
          icon: '⏳',
          title: 'War Ended — Awaiting Resolution',
          subtitle: `${ch.territory_name} — Admin will decide the outcome`,
          color: 'hsl(40,70%,65%)',
          borderColor: 'hsla(40,70%,50%,0.5)',
        });
      } else if ((prevStatus === 'pending_resolution' || prevStatus === 'active') && ch.status === 'resolved') {
        playCapturedSound();
        const defenderHeld = ch.resolution === 'defender_held';
        const weWon = (defenderHeld && !isAttacker) || (!defenderHeld && isAttacker);
        addToast({
          icon: defenderHeld ? '🛡️' : '⚔️',
          title: weWon ? 'Victory!' : defenderHeld ? 'Territory Defended' : 'Territory Lost!',
          subtitle: `${ch.territory_name} — ${defenderHeld ? ch.defender_clan_name + ' holds' : ch.attacker_clan_name + ' conquers'}`,
          color: weWon ? 'hsl(120,50%,60%)' : 'hsl(0,50%,60%)',
          borderColor: weWon ? 'hsla(120,50%,50%,0.4)' : 'hsla(0,50%,50%,0.4)',
        });
      } else if (ch.status === 'cancelled') {
        addToast({
          icon: '🚫',
          title: 'Challenge Cancelled',
          subtitle: `Challenge for ${ch.territory_name} was withdrawn`,
          color: 'hsl(0,30%,55%)',
          borderColor: 'hsla(0,30%,50%,0.3)',
        });
      }
    }

    // Check for challenges that disappeared (cancelled by other side)
    if (initializedRef.current) {
      for (const [id] of prevMap) {
        if (!newMap.has(id) && !challenges.find(c => c.id === id)) {
          // Challenge disappeared — could be expired/cleaned up
        }
      }
    }

    prevChallengesRef.current = newMap;
    initializedRef.current = true;
  }, [challenges, myClan, addToast]);

  // Territory awareness — check if player is inside a non-peaceful territory
  const currentTerritory = territories.find(t => {
    const ws = t.war_state as string;
    if (ws === 'peaceful') return false;
    const dx = playerX - t.center_x;
    const dz = playerZ - t.center_z;
    return Math.sqrt(dx * dx + dz * dz) < t.radius;
  });

  return (
    <>
      {/* War toasts — top center, stacked */}
      {toasts.length > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[55] flex flex-col gap-2 pointer-events-none"
          style={{ maxWidth: 360 }}>
          {toasts.map((t, i) => {
            const age = Date.now() - t.createdAt;
            const fadeOut = age > TOAST_DURATION - 800;
            return (
              <div key={t.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
                style={{
                  background: 'linear-gradient(135deg, hsla(0,0%,0%,0.88), hsla(0,0%,5%,0.88))',
                  border: `1px solid ${t.borderColor}`,
                  boxShadow: `0 4px 24px hsla(0,0%,0%,0.5), 0 0 20px ${t.borderColor}`,
                  backdropFilter: 'blur(10px)',
                  opacity: fadeOut ? 0 : 1,
                  transform: fadeOut ? 'translateY(-10px)' : 'translateY(0)',
                  animation: 'fadeIn 0.3s ease-out',
                }}
              >
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.color, letterSpacing: '0.04em' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'hsl(40,15%,55%)', marginTop: 1 }}>
                    {t.subtitle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Territory awareness bar — shown when inside a contested/active/cooldown zone */}
      {currentTerritory && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[52] pointer-events-none">
          <div className={`flex items-center gap-2.5 px-4 py-2 rounded-lg ${(currentTerritory.war_state as string) === 'active_war' ? 'animate-pulse' : ''}`}
            style={{
              background: 'linear-gradient(135deg, hsla(0,0%,0%,0.75), hsla(0,0%,5%,0.75))',
              border: `1px solid ${
                (currentTerritory.war_state as string) === 'active_war' ? 'hsla(0,70%,50%,0.5)'
                : (currentTerritory.war_state as string) === 'contested' ? 'hsla(30,70%,50%,0.4)'
                : (currentTerritory.war_state as string) === 'pending_resolution' ? 'hsla(40,70%,50%,0.5)'
                : 'hsla(210,50%,50%,0.3)'
              }`,
              boxShadow: `0 2px 12px hsla(0,0%,0%,0.4)`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ fontSize: 14 }}>
              {(currentTerritory.war_state as string) === 'active_war' ? '🔥' : (currentTerritory.war_state as string) === 'contested' ? '⚔️' : (currentTerritory.war_state as string) === 'pending_resolution' ? '⏳' : '🛡️'}
            </span>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                color: (currentTerritory.war_state as string) === 'active_war' ? 'hsl(0,70%,65%)'
                  : (currentTerritory.war_state as string) === 'contested' ? 'hsl(30,70%,65%)'
                  : (currentTerritory.war_state as string) === 'pending_resolution' ? 'hsl(40,70%,65%)'
                  : 'hsl(210,50%,65%)',
              }}>
                {(currentTerritory.war_state as string) === 'active_war' ? 'WAR ZONE'
                  : (currentTerritory.war_state as string) === 'contested' ? 'CONTESTED TERRITORY'
                  : (currentTerritory.war_state as string) === 'pending_resolution' ? 'AWAITING RESOLUTION'
                  : 'COOLDOWN ZONE'}
              </div>
              <div style={{ fontSize: 9, color: 'hsl(40,15%,50%)' }}>
                {currentTerritory.name}
                {currentTerritory.owning_clan_name && ` · ${currentTerritory.owning_clan_name}`}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
