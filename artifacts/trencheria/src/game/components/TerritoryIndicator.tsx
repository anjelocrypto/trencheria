/**
 * Territory entry/exit notification — shows when player enters a territory zone.
 * Also shows ownership-change flash when a territory gets captured.
 */
import { useState, useEffect, useRef } from 'react';
import { TerritoryInfo, CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';

interface Props {
  territories: TerritoryInfo[];
  playerX: number;
  playerZ: number;
}

interface OwnershipChange {
  territoryName: string;
  newOwnerName: string | null;
  newColor: string;
  oldColor: string;
  timestamp: number;
}

export function TerritoryIndicator({ territories, playerX, playerZ }: Props) {
  const [currentTerritory, setCurrentTerritory] = useState<TerritoryInfo | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [ownershipChange, setOwnershipChange] = useState<OwnershipChange | null>(null);
  const lastTerritoryRef = useRef<string | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const prevOwnersRef = useRef<Map<string, string | null>>(new Map());

  // Territory entry/exit detection
  useEffect(() => {
    let inside: TerritoryInfo | null = null;
    for (const t of territories) {
      const dx = playerX - t.center_x;
      const dz = playerZ - t.center_z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= t.radius) {
        inside = t;
        break;
      }
    }

    const newId = inside?.id ?? null;
    if (newId !== lastTerritoryRef.current) {
      lastTerritoryRef.current = newId;
      setCurrentTerritory(inside);
      if (inside) {
        setShowBanner(true);
        if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
        bannerTimeoutRef.current = setTimeout(() => setShowBanner(false), 4000);
      } else {
        setShowBanner(false);
      }
    }
  }, [playerX, playerZ, territories]);

  // Ownership change detection — fires when any territory changes owner
  useEffect(() => {
    const prevMap = prevOwnersRef.current;

    for (const t of territories) {
      const prevOwner = prevMap.get(t.id);
      const currentOwner = t.owning_clan_id;

      // Skip initial load
      if (prevOwner === undefined) continue;

      if (prevOwner !== currentOwner && currentOwner !== null) {
        const newColor = t.owning_clan_color
          ? CLAN_COLOR_HEX[t.owning_clan_color as ClanColor] || '#888'
          : '#888';
        const oldColor = prevOwner ? '#666' : '#444'; // simplified

        setOwnershipChange({
          territoryName: t.name,
          newOwnerName: t.owning_clan_name,
          newColor,
          oldColor,
          timestamp: Date.now(),
        });

        if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = setTimeout(() => setOwnershipChange(null), 5000);
      }
    }

    // Update prev owners map
    const newMap = new Map<string, string | null>();
    for (const t of territories) {
      newMap.set(t.id, t.owning_clan_id);
    }
    prevOwnersRef.current = newMap;
  }, [territories]);

  return (
    <>
      {/* Territory entry banner */}
      {showBanner && currentTerritory && (() => {
        const color = currentTerritory.owning_clan_color
          ? CLAN_COLOR_HEX[currentTerritory.owning_clan_color as ClanColor]
          : '#888';

        return (
          <div
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
            style={{ animation: 'fadeInSlide 0.6s ease-out' }}
          >
            <div
              className="px-6 py-3 rounded-xl text-center"
              style={{
                background: `linear-gradient(135deg, ${color}20, ${color}08)`,
                border: `1px solid ${color}40`,
                backdropFilter: 'blur(12px)',
                boxShadow: `0 8px 32px ${color}15`,
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-sm font-bold tracking-wide" style={{ color: 'hsl(40,50%,88%)' }}>
                  {currentTerritory.name}
                </span>
              </div>
              <div className="text-[10px]" style={{ color: 'hsl(40,15%,55%)' }}>
                {currentTerritory.owning_clan_name
                  ? `🏴 Controlled by ${currentTerritory.owning_clan_name}`
                  : '⬜ Unclaimed Territory'
                }
              </div>
            </div>
          </div>
        );
      })()}

      {/* Ownership change flash — TERRITORY CAPTURED banner */}
      {ownershipChange && (
        <div
          className="fixed top-32 left-1/2 -translate-x-1/2 z-[55] pointer-events-none"
          style={{ animation: 'captureFlash 0.5s ease-out' }}
        >
          <div className="px-8 py-4 rounded-xl text-center" style={{
            background: `linear-gradient(135deg, ${ownershipChange.newColor}30, ${ownershipChange.newColor}10)`,
            border: `2px solid ${ownershipChange.newColor}60`,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 40px ${ownershipChange.newColor}30, 0 12px 40px rgba(0,0,0,0.4)`,
          }}>
            <div className="text-xs font-black tracking-[0.15em] uppercase mb-1" style={{
              color: ownershipChange.newColor,
              textShadow: `0 0 12px ${ownershipChange.newColor}60`,
            }}>
              ⚔️ TERRITORY CAPTURED ⚔️
            </div>
            <div className="text-sm font-bold" style={{ color: 'hsl(40,50%,90%)' }}>
              {ownershipChange.territoryName}
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'hsl(40,15%,55%)' }}>
              Now controlled by <span style={{ color: ownershipChange.newColor, fontWeight: 700 }}>
                {ownershipChange.newOwnerName || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInSlide {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes captureFlash {
          0%   { opacity: 0; transform: translate(-50%, -20px) scale(0.9); }
          50%  { opacity: 1; transform: translate(-50%, 0) scale(1.05); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>
    </>
  );
}
