/**
 * Minimap HUD — top-right corner showing player position, settlements, roads, horse, territory ownership.
 * Medieval-styled circular minimap with parchment aesthetic.
 * TERRA-style flashing for contested / active_war / pending_resolution zones.
 */
import { useRef, useEffect, useCallback } from 'react';
import { SETTLEMENTS, REGIONS, ROADS, SMALL_POIS, LANDMARKS, getRegionAt } from '../world/RegionData';
import { TerritoryInfo, CLAN_COLOR_HEX, ClanColor } from '../hooks/useClanSystem';
import type { InterpolatedPlayer } from '../multiplayer/types';

interface RemotePlayerDot {
  x: number;
  z: number;
  color: string;
}

interface MinimapProps {
  playerX: number;
  playerZ: number;
  playerRotation: number;
  horseX: number;
  horseZ: number;
  isMounted: boolean;
  mapOpen: boolean;
  onCloseMap: () => void;
  territories?: TerritoryInfo[];
  remotePlayersRef?: React.RefObject<Map<string, InterpolatedPlayer>>;
}

const MAP_SIZE = 160;
const MAP_WORLD_RADIUS = 120;
const FULL_MAP_WORLD = 850;

/** Smooth color transition cache for territory ownership changes */
const territoryColorTransitions: Map<string, {
  fromR: number; fromG: number; fromB: number;
  toR: number; toG: number; toB: number;
  startTime: number; duration: number;
}> = new Map();
const lastKnownOwnerColor: Map<string, string> = new Map();
const COLOR_TRANSITION_MS = 2500;

function getTransitionedColor(territoryId: string, targetHex: string, alpha: number): string {
  const prev = lastKnownOwnerColor.get(territoryId);
  if (prev && prev !== targetHex) {
    // Start transition
    const [fr, fg, fb] = hexToRgb(prev);
    const [tr, tg, tb] = hexToRgb(targetHex);
    territoryColorTransitions.set(territoryId, {
      fromR: fr, fromG: fg, fromB: fb,
      toR: tr, toG: tg, toB: tb,
      startTime: performance.now(), duration: COLOR_TRANSITION_MS,
    });
  }
  lastKnownOwnerColor.set(territoryId, targetHex);

  const trans = territoryColorTransitions.get(territoryId);
  if (trans) {
    const elapsed = performance.now() - trans.startTime;
    const t = Math.min(1, elapsed / trans.duration);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    const r = Math.round(trans.fromR + (trans.toR - trans.fromR) * ease);
    const g = Math.round(trans.fromG + (trans.toG - trans.fromG) * ease);
    const b = Math.round(trans.fromB + (trans.toB - trans.fromB) * ease);
    if (t >= 1) territoryColorTransitions.delete(territoryId);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexToRgba(targetHex, alpha);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Check if any territory is in a non-peaceful war state or has active color transitions */
function hasActiveWarState(territories?: TerritoryInfo[]): boolean {
  if (territoryColorTransitions.size > 0) return true;
  if (!territories) return false;
  return territories.some(t => {
    const ws = t.war_state as string;
    return ws === 'contested' || ws === 'active_war' || ws === 'pending_resolution';
  });
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  size: number,
  worldRadius: number,
  playerX: number,
  playerZ: number,
  playerRot: number,
  horseX: number,
  horseZ: number,
  isMounted: boolean,
  fullMap: boolean,
  territories?: TerritoryInfo[],
  animPhase?: number,
  remotePlayers?: RemotePlayerDot[],
) {
  const half = size / 2;
  const scale = half / worldRadius;
  const phase = animPhase ?? 0;

  ctx.clearRect(0, 0, size, size);

  // Background
  if (fullMap) {
    ctx.fillStyle = '#d4c8a0';
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.fillStyle = '#c4b890';
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Transform: center on player (or world center for full map)
  const cx = fullMap ? 0 : playerX;
  const cz = fullMap ? 0 : playerZ;

  // Territory fills — TERRA-style strong colored zones
  for (const r of REGIONS) {
    const rx = (r.center[0] - cx) * scale + half;
    const rz = (r.center[1] - cz) * scale + half;
    const rr = r.radius * scale;
    const territory = territories?.find(t => t.id === r.id);
    const warState = (territory?.war_state as string) || 'peaceful';

    if (territory?.owning_clan_color) {
      const clanHex = CLAN_COLOR_HEX[territory.owning_clan_color as ClanColor] || r.color;

      // === TERRA-STYLE TERRITORY FILL ===
      if (warState === 'active_war') {
        // Strong pulsing red flash — alternates between clan color and red
        const flashAlpha = 0.35 + Math.sin(phase * Math.PI * 2) * 0.25; // pulses 0.10 - 0.60
        const isRedPhase = Math.sin(phase * Math.PI * 2 * 2) > 0; // faster alternation
        ctx.fillStyle = isRedPhase
          ? `rgba(231, 76, 60, ${flashAlpha})`
          : hexToRgba(clanHex, flashAlpha);
        ctx.beginPath();
        ctx.arc(rx, rz, rr, 0, Math.PI * 2);
        ctx.fill();

        // Thick pulsing red border
        ctx.strokeStyle = `rgba(231, 76, 60, ${0.6 + Math.sin(phase * Math.PI * 2) * 0.3})`;
        ctx.lineWidth = fullMap ? 4 : 3;
        ctx.stroke();

        // Inner glow ring
        ctx.strokeStyle = `rgba(231, 76, 60, ${0.2 + Math.sin(phase * Math.PI * 2) * 0.15})`;
        ctx.lineWidth = fullMap ? 8 : 5;
        ctx.stroke();

      } else if (warState === 'contested') {
        // Orange flashing — alternates opacity
        const flashAlpha = 0.25 + Math.sin(phase * Math.PI * 2) * 0.2;
        ctx.fillStyle = hexToRgba(clanHex, flashAlpha);
        ctx.beginPath();
        ctx.arc(rx, rz, rr, 0, Math.PI * 2);
        ctx.fill();

        // Dashed orange border that pulses
        ctx.strokeStyle = `rgba(230, 126, 34, ${0.5 + Math.sin(phase * Math.PI * 2) * 0.3})`;
        ctx.lineWidth = fullMap ? 3 : 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

      } else if (warState === 'pending_resolution') {
        // Amber pulsing glow
        const flashAlpha = 0.25 + Math.sin(phase * Math.PI * 2 * 0.7) * 0.15;
        ctx.fillStyle = hexToRgba(clanHex, flashAlpha);
        ctx.beginPath();
        ctx.arc(rx, rz, rr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(243, 156, 18, ${0.5 + Math.sin(phase * Math.PI * 2 * 0.7) * 0.2})`;
        ctx.lineWidth = fullMap ? 3 : 2;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Outer amber glow
        ctx.strokeStyle = `rgba(243, 156, 18, ${0.15 + Math.sin(phase * Math.PI * 2 * 0.7) * 0.1})`;
        ctx.lineWidth = fullMap ? 6 : 4;
        ctx.stroke();

      } else if (warState === 'cooldown') {
        // Stable blue tint
        ctx.fillStyle = hexToRgba(clanHex, 0.3);
        ctx.beginPath();
        ctx.arc(rx, rz, rr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(52, 152, 219, 0.4)`;
        ctx.lineWidth = fullMap ? 2 : 1.5;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

      } else {
        // Peaceful — strong stable faction color fill with smooth transition
        const tid = territory?.id || r.id;
        ctx.fillStyle = getTransitionedColor(tid, clanHex, 0.4);
        ctx.beginPath();
        ctx.arc(rx, rz, rr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = getTransitionedColor(tid, clanHex, 0.6);
        ctx.lineWidth = fullMap ? 2.5 : 1.5;
        ctx.stroke();
      }
    } else {
      // Unclaimed — faint neutral fill
      ctx.fillStyle = r.color + '30';
      ctx.beginPath();
      ctx.arc(rx, rz, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads
  ctx.strokeStyle = '#6b5b47';
  ctx.lineWidth = fullMap ? 2 : 1.5;
  for (const road of ROADS) {
    const fx = (road.from[0] - cx) * scale + half;
    const fz = (road.from[1] - cz) * scale + half;
    const tx = (road.to[0] - cx) * scale + half;
    const tz = (road.to[1] - cz) * scale + half;
    ctx.beginPath();
    ctx.moveTo(fx, fz);
    ctx.lineTo(tx, tz);
    ctx.stroke();
  }

  // Small POIs
  if (fullMap) {
    ctx.fillStyle = '#8a7a5a';
    for (const poi of SMALL_POIS) {
      const sx = (poi.position[0] - cx) * scale + half;
      const sz = (poi.position[1] - cz) * scale + half;
      ctx.beginPath();
      ctx.arc(sx, sz, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Settlements
  for (const s of SETTLEMENTS) {
    const sx = (s.position[0] - cx) * scale + half;
    const sz = (s.position[1] - cz) * scale + half;
    if (!fullMap && (sx < -10 || sx > size + 10 || sz < -10 || sz > size + 10)) continue;

    const dotSize = s.size === 'large' ? 5 : s.size === 'medium' ? 3.5 : 2.5;
    const color = s.type === 'capital' ? '#c4a040' :
      s.type === 'village' ? '#4a8a3a' :
      s.type === 'fort' ? '#6a6a8a' :
      s.type === 'ruins' ? '#7a6a4a' :
      s.type === 'bandit_camp' ? '#8a3a3a' :
      s.type === 'monastery' ? '#9a9aaa' : '#5a7a4a';

    ctx.fillStyle = color;
    if (s.type === 'capital') {
      ctx.beginPath();
      ctx.moveTo(sx, sz - dotSize);
      ctx.lineTo(sx + dotSize, sz);
      ctx.lineTo(sx, sz + dotSize);
      ctx.lineTo(sx - dotSize, sz);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a7020';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(sx, sz, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (fullMap) {
      ctx.fillStyle = '#2a1a0a';
      ctx.font = s.size === 'large' ? 'bold 11px serif' : '9px serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, sx, sz - dotSize - 4);
    }
  }

  // Landmarks on full map
  if (fullMap) {
    for (const lm of LANDMARKS) {
      const lx = (lm.position[0] - cx) * scale + half;
      const lz = (lm.position[1] - cz) * scale + half;
      ctx.fillStyle = '#5a4a2a';
      ctx.beginPath();
      ctx.moveTo(lx, lz - 4);
      ctx.lineTo(lx + 3, lz + 2);
      ctx.lineTo(lx - 3, lz + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Territory ownership labels on full map
  if (fullMap && territories) {
    for (const t of territories) {
      const tx = (t.center_x - cx) * scale + half;
      const tz = (t.center_z - cz) * scale + half;
      if (t.owning_clan_name && t.owning_clan_color) {
        const cHex = CLAN_COLOR_HEX[t.owning_clan_color as ClanColor] || '#888';
        ctx.fillStyle = cHex;
        ctx.font = 'bold 9px serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏴 ${t.owning_clan_name}`, tx, tz + 12);

        // War state label
        const ws = t.war_state as string;
        if (ws !== 'peaceful') {
          ctx.fillStyle = ws === 'active_war' ? '#e74c3c' : ws === 'contested' ? '#e67e22' : ws === 'pending_resolution' ? '#f39c12' : '#3498db';
          ctx.font = 'bold 8px serif';
          ctx.fillText(
            ws === 'active_war' ? '🔥 WAR' : ws === 'contested' ? '⚔️ CHALLENGED' : ws === 'pending_resolution' ? '⏳ PENDING' : '🛡️ COOLDOWN',
            tx, tz + 22
          );
        }
      } else {
        ctx.fillStyle = '#6a6a6a80';
        ctx.font = 'italic 7px serif';
        ctx.textAlign = 'center';
        ctx.fillText('Unclaimed', tx, tz + 12);
      }
    }
  }

  // Horse position
  if (!isMounted) {
    const hx = (horseX - cx) * scale + half;
    const hz = (horseZ - cz) * scale + half;
    if (hx > 0 && hx < size && hz > 0 && hz < size) {
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.arc(hx, hz, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a3218';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Remote player dots
  if (remotePlayers) {
    for (const rp of remotePlayers) {
      const rpx = (rp.x - cx) * scale + half;
      const rpz = (rp.z - cz) * scale + half;
      if (rpx < -5 || rpx > size + 5 || rpz < -5 || rpz > size + 5) continue;
      ctx.fillStyle = rp.color;
      ctx.beginPath();
      ctx.arc(rpx, rpz, fullMap ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Player indicator
  const ppx = (playerX - cx) * scale + half;
  const ppz = (playerZ - cz) * scale + half;
  ctx.save();
  ctx.translate(ppx, ppz);
  ctx.rotate(playerRot);
  ctx.fillStyle = '#e0c040';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.5, 4);
  ctx.lineTo(-3.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a7020';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Minimap border
  if (!fullMap) {
    ctx.strokeStyle = '#4a3a20';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#8a2020';
    ctx.font = 'bold 10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', half, 14);
  }

  // Region name at bottom
  if (!fullMap) {
    const region = getRegionAt(playerX, playerZ);
    if (region) {
      ctx.fillStyle = '#2a1a0a';
      ctx.font = '8px serif';
      ctx.textAlign = 'center';
      ctx.fillText(region.name, half, size - 6);
    }

    // Territory name labels on minimap — only show nearby visible ones
    if (territories) {
      ctx.textAlign = 'center';
      for (const t of territories) {
        const tx = (t.center_x - cx) * scale + half;
        const tz = (t.center_z - cz) * scale + half;
        // Only render if center is within the minimap circle (with margin)
        const dxp = tx - half;
        const dzp = tz - half;
        if (Math.sqrt(dxp * dxp + dzp * dzp) > half - 12) continue;

        const ws = t.war_state as string;
        if (t.owning_clan_name) {
          const cHex = CLAN_COLOR_HEX[t.owning_clan_color as ClanColor] || '#888';
          ctx.fillStyle = ws === 'active_war' ? '#e74c3c' : ws === 'contested' ? '#e67e22' : cHex;
          ctx.font = 'bold 7px serif';
          ctx.fillText(t.name.split(' ')[0], tx, tz - 3); // first word only to save space
        } else {
          ctx.fillStyle = '#6a6a6a80';
          ctx.font = 'italic 6px serif';
          ctx.fillText(t.name.split(' ')[0], tx, tz - 3);
        }
      }
    }
  }

  // Full map title and frame
  if (fullMap) {
    ctx.strokeStyle = '#4a3a20';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, size - 4, size - 4);
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, size - 12, size - 12);

    ctx.fillStyle = '#2a1a0a';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('The Realm', size / 2, 24);

    for (const r of REGIONS) {
      const rx = (r.center[0] - cx) * scale + half;
      const rz = (r.center[1] - cz) * scale + half;
      ctx.fillStyle = '#4a3a2a80';
      ctx.font = 'italic 9px serif';
      ctx.fillText(r.name, rx, rz + r.radius * scale * 0.5);
    }

    ctx.fillStyle = '#4a3a2a';
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press M to close', size / 2, size - 10);
  }
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Minimap({
  playerX, playerZ, playerRotation,
  horseX, horseZ, isMounted, mapOpen, onCloseMap, territories, remotePlayersRef,
}: MinimapProps) {
  const miniRef = useRef<HTMLCanvasElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const rafRef = useRef<number>(0);

  const hasWar = hasActiveWarState(territories);

  /** Extract remote player dots from ref (read-only snapshot) */
  const getPlayerDots = useCallback((): RemotePlayerDot[] => {
    const map = remotePlayersRef?.current;
    if (!map || map.size === 0) return [];
    const dots: RemotePlayerDot[] = [];
    for (const rp of map.values()) {
      const color = rp.clanColor
        ? (CLAN_COLOR_HEX[rp.clanColor as ClanColor] || '#aaa')
        : '#aaaaaa';
      dots.push({ x: rp.renderPosition[0], z: rp.renderPosition[2], color });
    }
    return dots;
  }, [remotePlayersRef]);

  // Animation loop for TERRA-style flashing during war states
  useEffect(() => {
    if (!hasWar) {
      animRef.current = 0;
      return;
    }

    let running = true;
    const startTime = performance.now();

    const animate = () => {
      if (!running) return;
      const elapsed = performance.now() - startTime;
      animRef.current = (elapsed % 2000) / 2000;
      const dots = getPlayerDots();

      if (!mapOpen) {
        const canvas = miniRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawMinimap(ctx, MAP_SIZE, MAP_WORLD_RADIUS, playerX, playerZ, playerRotation,
              horseX, horseZ, isMounted, false, territories, animRef.current, dots);
          }
        }
      } else {
        const canvas = fullRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawMinimap(ctx, 600, FULL_MAP_WORLD, playerX, playerZ, playerRotation,
              horseX, horseZ, isMounted, true, territories, animRef.current, dots);
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [hasWar, mapOpen, playerX, playerZ, playerRotation, horseX, horseZ, isMounted, territories, getPlayerDots]);

  // Static draw when no war is active — includes lightweight interval for live player dots
  const drawMini = useCallback(() => {
    if (hasWar) return;
    const canvas = miniRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawMinimap(ctx, MAP_SIZE, MAP_WORLD_RADIUS, playerX, playerZ, playerRotation,
      horseX, horseZ, isMounted, false, territories, 0, getPlayerDots());
  }, [playerX, playerZ, playerRotation, horseX, horseZ, isMounted, territories, hasWar, getPlayerDots]);

  const drawFull = useCallback(() => {
    if (hasWar) return;
    const canvas = fullRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawMinimap(ctx, 600, FULL_MAP_WORLD, playerX, playerZ, playerRotation,
      horseX, horseZ, isMounted, true, territories, 0, getPlayerDots());
  }, [playerX, playerZ, playerRotation, horseX, horseZ, isMounted, territories, hasWar, getPlayerDots]);

  useEffect(() => {
    if (!mapOpen) drawMini();
    else drawFull();
  }, [drawMini, drawFull, mapOpen]);

  // Lightweight peacetime interval to keep player dots live (500ms)
  useEffect(() => {
    if (hasWar) return; // war loop already handles this
    const iv = setInterval(() => {
      if (document.hidden) return;
      if (!mapOpen) {
        const canvas = miniRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) drawMinimap(ctx, MAP_SIZE, MAP_WORLD_RADIUS, playerX, playerZ, playerRotation,
            horseX, horseZ, isMounted, false, territories, 0, getPlayerDots());
        }
      } else {
        const canvas = fullRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) drawMinimap(ctx, 600, FULL_MAP_WORLD, playerX, playerZ, playerRotation,
            horseX, horseZ, isMounted, true, territories, 0, getPlayerDots());
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [hasWar, mapOpen, playerX, playerZ, playerRotation, horseX, horseZ, isMounted, territories, getPlayerDots]);

  return (
    <>
      {!mapOpen && (
        <div className="absolute right-4 pointer-events-none" style={{ width: MAP_SIZE, height: MAP_SIZE, top: 130, zIndex: 50 }}>
          <canvas ref={miniRef} width={MAP_SIZE} height={MAP_SIZE}
            style={{ width: MAP_SIZE, height: MAP_SIZE, borderRadius: '50%' }} />
        </div>
      )}

      {mapOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.6)', zIndex: 60 }} onClick={onCloseMap}>
          <canvas ref={fullRef} width={600} height={600}
            style={{ width: 600, height: 600, borderRadius: 8, boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
