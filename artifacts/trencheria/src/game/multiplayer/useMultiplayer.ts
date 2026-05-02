import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadWalletSession } from '../hooks/usePlayerAccount';
import { resetSpawnIndex } from '../systems/SafeSpawn';
// RealtimeChannel type — defined locally to remove @supabase/supabase-js dependency
type RealtimeChannel = ReturnType<typeof import('@/integrations/supabase/client').supabase.channel>;
import {
  NetworkPlayerState, InterpolatedPlayer, ChatMessage, WorldEvent,
  MovePayload, MetaPayload, ActionPayload, PvpHitData, PvpDeathData,
  MOVE_BROADCAST_MS, META_BROADCAST_MS, STALE_PLAYER_TIMEOUT_MS,
} from './types';

// Global world configuration
const GLOBAL_WORLD_KEY = 'global_world_1';
const SESSION_KEY = 'global_world_session';
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const REMOTE_PLAYERS_COMMIT_MS = 100;

// ===== MP-Audit rate-limited logger =====
const auditLogCounts: Record<string, number> = {};
const AUDIT_LOG_LIMIT = 5;

function mpAudit(label: string, data?: Record<string, unknown>) {
  const count = auditLogCounts[label] ?? 0;
  if (count >= AUDIT_LOG_LIMIT) return;
  auditLogCounts[label] = count + 1;
  const suffix = data ? ' — ' + JSON.stringify(data) : '';
  console.log(`[MP-Audit] ${label}${suffix}`);
}

// ===== Startup instrumentation =====
interface StartupTimings {
  enterWorldClicked: number;
  connectStart: number;
  channelCreated: number;
  channelSubscribed: number;
  presenceTrackSent: number;
  firstRemoteReceived: number;
  gameplayReady: number;
}

function createTimings(): StartupTimings {
  return {
    enterWorldClicked: 0, connectStart: 0, channelCreated: 0,
    channelSubscribed: 0, presenceTrackSent: 0,
    firstRemoteReceived: 0, gameplayReady: 0,
  };
}

function logTiming(label: string, timings: StartupTimings, stage: keyof StartupTimings) {
  const now = Date.now();
  (timings as any)[stage] = now;
  const elapsed = timings.enterWorldClicked > 0 ? now - timings.enterWorldClicked : 0;
  console.log(`[MP-Startup] ${label} — ${elapsed}ms from start`);
}

// ===== Stable player ID per browser session =====
function getOrCreatePlayerId(): string {
  let id = sessionStorage.getItem('mp_player_id');
  if (!id) {
    id = 'p_' + crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem('mp_player_id', id);
  }
  return id;
}

function getDisplayName(): string {
  return sessionStorage.getItem('mp_display_name') || 'Knight';
}

function persistSession(displayName: string) {
  sessionStorage.setItem('mp_display_name', displayName);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName, timestamp: Date.now() }));
}

function loadSession(): { displayName: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface MultiplayerState {
  connectionStatus: ConnectionStatus;
  connected: boolean;
  playerId: string;
  displayName: string;
  remotePlayers: Map<string, InterpolatedPlayer>;
  chatMessages: ChatMessage[];
  worldEvents: WorldEvent[];
}

// ===== Meta change detection =====
interface SentMeta {
  displayName: string;
  characterType: string;
  health: number;
  maxHealth: number;
  stamina: number;
  hunger: number;
  temperature: number;
  buildMode: boolean;
  horseState: string;
  emote: string | null;
  isSpeaking: boolean;
  clanName: string | null;
  clanColor: string | null;
}

function metaChanged(prev: SentMeta | null, state: NetworkPlayerState): boolean {
  if (!prev) return true;
  return (
    prev.displayName !== state.displayName ||
    prev.characterType !== state.characterType ||
    Math.abs(prev.health - state.health) > 0.5 ||
    prev.maxHealth !== state.maxHealth ||
    Math.abs(prev.stamina - state.stamina) > 2 ||
    Math.abs(prev.hunger - state.hunger) > 2 ||
    Math.abs(prev.temperature - state.temperature) > 2 ||
    prev.buildMode !== state.buildMode ||
    prev.horseState !== state.horseState ||
    prev.emote !== state.emote ||
    prev.isSpeaking !== state.isSpeaking ||
    prev.clanName !== state.clanName ||
    prev.clanColor !== state.clanColor
  );
}

function extractSentMeta(state: NetworkPlayerState): SentMeta {
  return {
    displayName: state.displayName,
    characterType: state.characterType,
    health: state.health,
    maxHealth: state.maxHealth,
    stamina: state.stamina,
    hunger: state.hunger,
    temperature: state.temperature,
    buildMode: state.buildMode,
    horseState: state.horseState,
    emote: state.emote,
    isSpeaking: state.isSpeaking,
    clanName: state.clanName,
    clanColor: state.clanColor,
  };
}

export function useMultiplayer() {
  const playerId = useRef(getOrCreatePlayerId()).current;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [displayName, setDisplayName] = useState(getDisplayName());
  const [, setRemotePlayersVersion] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const remotePlayersRef = useRef<Map<string, InterpolatedPlayer>>(new Map());
  const remotePlayersCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStateRef = useRef<NetworkPlayerState | null>(null);
  const lastSentMetaRef = useRef<SentMeta | null>(null);
  // COST: Track last sent position to skip idle broadcasts
  const lastSentPosRef = useRef<{ x: number; y: number; z: number; r: number } | null>(null);
  const idleTickCountRef = useRef(0); // count idle ticks to send heartbeat every ~2s
  const staleCleanupRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timingsRef = useRef<StartupTimings>(createTimings());
  const firstRemoteReceivedRef = useRef(false);
  const initialStateSentRef = useRef(false);
  const pvpHitCallbackRef = useRef<((data: PvpHitData) => void) | null>(null);

  const connected = connectionStatus === 'connected';

  const scheduleRemotePlayersCommit = useCallback((immediate = false) => {
    if (immediate) {
      if (remotePlayersCommitTimerRef.current) {
        clearTimeout(remotePlayersCommitTimerRef.current);
        remotePlayersCommitTimerRef.current = null;
      }
      setRemotePlayersVersion((v) => v + 1);
      return;
    }
    if (remotePlayersCommitTimerRef.current) return;
    remotePlayersCommitTimerRef.current = setTimeout(() => {
      remotePlayersCommitTimerRef.current = null;
      setRemotePlayersVersion((v) => v + 1);
    }, REMOTE_PLAYERS_COMMIT_MS);
  }, []);

  const updateDisplayName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 20) || 'Knight';
    setDisplayName(trimmed);
    sessionStorage.setItem('mp_display_name', trimmed);
    // Also sync wallet session localStorage so refresh restores the new name
    try {
      const raw = localStorage.getItem('wallet_account_session');
      if (raw) {
        const session = JSON.parse(raw);
        session.display_name = trimmed;
        localStorage.setItem('wallet_account_session', JSON.stringify(session));
      }
    } catch {}
  }, []);

  // ===== Canonical cleanup helper =====
  const fullCleanup = useCallback(async (channel: RealtimeChannel | null) => {
    if (moveTimerRef.current) { clearInterval(moveTimerRef.current); moveTimerRef.current = null; }
    if (metaTimerRef.current) { clearInterval(metaTimerRef.current); metaTimerRef.current = null; }
    if (staleCleanupRef.current) { clearInterval(staleCleanupRef.current); staleCleanupRef.current = null; }
    if (remotePlayersCommitTimerRef.current) {
      clearTimeout(remotePlayersCommitTimerRef.current);
      remotePlayersCommitTimerRef.current = null;
    }
    initialStateSentRef.current = false;
    lastSentMetaRef.current = null;

    if (channel) {
      try {
        await supabase.removeChannel(channel);
        mpAudit('channel removed from SDK registry');
      } catch (e) {
        console.warn('[MP-Audit] removeChannel error:', e);
      }
    }

    if (channelRef.current === channel || channel === null) {
      channelRef.current = null;
    }
  }, []);

  // ===== Helper: ensure/create InterpolatedPlayer entry =====
  function ensurePlayer(players: Map<string, InterpolatedPlayer>, id: string): InterpolatedPlayer {
    let p = players.get(id);
    if (!p) {
      p = {
        playerId: id,
        displayName: 'Knight',
        characterType: 'goblin',
        prevPosition: [0, 0, 82],
        targetPosition: [0, 0, 82],
        prevRotation: 0,
        targetRotation: 0,
        renderPosition: [0, 0, 82],
        renderRotation: 0,
        moveSpeed: 0,
        isRunning: false,
        isGrounded: true,
        isMounted: false,
        health: 100,
        maxHealth: 100,
        attackAnim: 0,
        buildMode: false,
        horsePitch: 0,
        horsePosition: [0, 0, 0],
        horseRotation: 0,
        horseState: 'idle',
        emote: null,
        isSpeaking: false,
        clanName: null,
        clanColor: null,
        lastUpdateTime: Date.now(),
        interpolationT: 0,
      };
      players.set(id, p);
    }
    return p;
  }

  // ===== Internal: subscribe to global world channel =====
  const subscribeToGlobalWorld = useCallback(async (playerName: string): Promise<boolean> => {
    const timings = timingsRef.current;
    mpAudit('subscribeToGlobalWorld start', { playerId });

    const oldChannel = channelRef.current;
    channelRef.current = null;
    if (oldChannel) {
      mpAudit('cleaning up old channel before new subscribe');
      await fullCleanup(oldChannel);
    }

    remotePlayersRef.current = new Map();
    scheduleRemotePlayersCommit(true);
    initialStateSentRef.current = false;
    lastSentMetaRef.current = null;
    lastSentPosRef.current = null;
    idleTickCountRef.current = 0;

    logTiming('Channel creating', timings, 'connectStart');

    const channel = supabase.channel(`world:${GLOBAL_WORLD_KEY}`, {
      config: { broadcast: { self: false }, presence: { key: playerId } },
    });

    logTiming('Channel created', timings, 'channelCreated');
    mpAudit('channel created', { topic: `world:${GLOBAL_WORLD_KEY}` });

    // ===== HIGH-FREQ: position/movement =====
    channel.on('broadcast', { event: 'pm' }, ({ payload }: { payload: MovePayload }) => {
      if (payload.i === playerId) return;

      if (!firstRemoteReceivedRef.current) {
        firstRemoteReceivedRef.current = true;
        logTiming('First remote player received', timingsRef.current, 'firstRemoteReceived');
      }

      const players = remotePlayersRef.current;
      const existing = players.get(payload.i);
      const now = Date.now();
      const isNew = !existing;

      const p = ensurePlayer(players, payload.i);
      p.prevPosition = [...p.targetPosition] as [number, number, number];
      p.targetPosition = payload.p;
      p.prevRotation = p.targetRotation;
      p.targetRotation = payload.r;
      p.moveSpeed = payload.s;
      p.isRunning = payload.n;
      p.isGrounded = payload.g;

      const wasMounted = p.isMounted;
      p.isMounted = payload.m;
      if (payload.m && payload.hp) {
        p.horsePosition = payload.hp;
        p.horseRotation = payload.hr ?? 0;
        p.horsePitch = payload.hP ?? 0;
      }

      p.lastUpdateTime = now;
      p.interpolationT = 0;

      scheduleRemotePlayersCommit(isNew || wasMounted !== payload.m);
    });

    // ===== LOW-FREQ: metadata =====
    channel.on('broadcast', { event: 'pme' }, ({ payload }: { payload: MetaPayload }) => {
      if (payload.i === playerId) return;

      const players = remotePlayersRef.current;
      const isNew = !players.has(payload.i);
      const p = ensurePlayer(players, payload.i);

      const charChanged = p.characterType !== (payload.ct || 'goblin');
      const nameChanged = p.displayName !== payload.dn;

      p.displayName = payload.dn;
      p.characterType = (payload.ct || 'goblin') as any;
      p.health = payload.h;
      p.maxHealth = payload.mh;
      p.buildMode = payload.bm;
      p.horseState = payload.hs;
      p.emote = payload.em;
      p.isSpeaking = payload.sp;
      p.clanName = payload.cn ?? null;
      p.clanColor = payload.cc ?? null;
      p.lastUpdateTime = Date.now();

      scheduleRemotePlayersCommit(isNew || charChanged || nameChanged);
    });

    // ===== EVENT: discrete actions =====
    channel.on('broadcast', { event: 'pa' }, ({ payload }: { payload: ActionPayload }) => {
      if (payload.i === playerId) return;
      const p = remotePlayersRef.current.get(payload.i);
      if (!p) return;

      if (payload.t === 'attack') {
        p.attackAnim = typeof payload.d === 'number' ? payload.d : 0.4;
      }

      // PvP hit: forward to callback for victim-side processing
      if (payload.t === 'pvp_hit' && payload.d) {
        const hitData = payload.d as PvpHitData;
        if (hitData.victimId === playerId) {
          pvpHitCallbackRef.current?.({ ...hitData, _attackerPlayerId: payload.i } as any);
        }
      }

      // PvP death: informational only (victim broadcasts their death)
      // No processing needed — just for remote player death animations

      scheduleRemotePlayersCommit();
    });

    // Chat messages
    channel.on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMessage }) => {
      setChatMessages(prev => [...prev.slice(-99), payload]);
    });

    // World events
    channel.on('broadcast', { event: 'world_event' }, ({ payload }: { payload: WorldEvent }) => {
      setWorldEvents(prev => [...prev.slice(-49), payload]);
    });

    // Presence — leave
    channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
      mpAudit('presence leave removed', { key });
      if (remotePlayersRef.current.delete(key)) {
        scheduleRemotePlayersCommit(true);
      }
      setChatMessages(prev => [...prev, {
        id: crypto.randomUUID(), playerId: 'system', displayName: 'System',
        text: 'A player has left the world.', timestamp: Date.now(), type: 'system',
      }]);
    });

    // Subscribe with timeout
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timeoutId = setTimeout(async () => {
        if (resolved) return;
        resolved = true;
        console.error(`[MP-Startup] SUBSCRIBE TIMEOUT after ${SUBSCRIBE_TIMEOUT_MS}ms`);
        await fullCleanup(channel);
        setConnectionStatus('disconnected');
        resolve(false);
      }, SUBSCRIBE_TIMEOUT_MS);

      channel.subscribe(async (status, err) => {
        console.log('[Multiplayer] Channel status:', status, err ? err : '');
        if (status === 'SUBSCRIBED') {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);

          logTiming('Channel subscribed', timings, 'channelSubscribed');
          channelRef.current = channel;

          await channel.track({ playerId, displayName: playerName, joinedAt: Date.now() });
          logTiming('Presence track sent', timings, 'presenceTrackSent');

          console.log('[Multiplayer] Connected successfully, status → connected');
          setConnectionStatus('connected');

          logTiming('Gameplay ready', timings, 'gameplayReady');
          const totalMs = timings.gameplayReady - timings.enterWorldClicked;
          console.log(`[MP-Startup] TOTAL STARTUP: ${totalMs}ms`);

          setChatMessages(prev => [...prev, {
            id: crypto.randomUUID(), playerId: 'system', displayName: 'System',
            text: 'You joined the world.', timestamp: Date.now(), type: 'system',
          }]);

          // Send initial full state immediately
          sendInitialState();

          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          console.warn('[Multiplayer] Channel error/closed:', status, err);
          await fullCleanup(channel);
          setConnectionStatus('disconnected');
          resolve(false);
        }
      });

      // ===== HIGH-FREQ broadcast timer (movement) — IDLE SKIP OPTIMIZATION =====
      // Only sends when position/rotation actually changed, or a heartbeat every ~2s
      const IDLE_POS_THRESHOLD = 0.05;  // world units
      const IDLE_ROT_THRESHOLD = 0.02;  // radians
      const IDLE_HEARTBEAT_TICKS = 10;  // send heartbeat every 10 idle ticks (2s at 5Hz)

      if (moveTimerRef.current) clearInterval(moveTimerRef.current);
      moveTimerRef.current = setInterval(() => {
        if (document.hidden) return; // COST: skip when tab not visible
        const state = localStateRef.current;
        const ch = channelRef.current;
        if (!state || !ch) return;

        // Check if position/rotation actually changed
        const lastP = lastSentPosRef.current;
        if (lastP) {
          const dx = Math.abs(state.position[0] - lastP.x);
          const dy = Math.abs(state.position[1] - lastP.y);
          const dz = Math.abs(state.position[2] - lastP.z);
          const dr = Math.abs(state.rotation - lastP.r);
          const moved = dx > IDLE_POS_THRESHOLD || dy > IDLE_POS_THRESHOLD || dz > IDLE_POS_THRESHOLD || dr > IDLE_ROT_THRESHOLD;

          if (!moved && state.moveSpeed < 0.1) {
            // Player is idle — only send heartbeat every ~2s so remotes don't mark us stale
            idleTickCountRef.current++;
            if (idleTickCountRef.current < IDLE_HEARTBEAT_TICKS) return; // SKIP
            idleTickCountRef.current = 0;
          } else {
            idleTickCountRef.current = 0;
          }
        }

        // Update last sent position
        lastSentPosRef.current = {
          x: state.position[0], y: state.position[1],
          z: state.position[2], r: state.rotation,
        };

        const payload: MovePayload = {
          i: state.playerId,
          p: state.position,
          r: state.rotation,
          s: state.moveSpeed,
          n: state.isRunning,
          g: state.isGrounded,
          m: state.isMounted,
        };

        // Only include horse data when mounted
        if (state.isMounted) {
          payload.hp = state.horsePosition;
          payload.hr = state.horseRotation;
          payload.hP = state.horsePitch;
        }

        ch.send({ type: 'broadcast', event: 'pm', payload });
      }, MOVE_BROADCAST_MS);

      // ===== LOW-FREQ broadcast timer (metadata, only on change) — paused when tab hidden =====
      if (metaTimerRef.current) clearInterval(metaTimerRef.current);
      metaTimerRef.current = setInterval(() => {
        if (document.hidden) return; // COST: skip when tab not visible
        const state = localStateRef.current;
        const ch = channelRef.current;
        if (!state || !ch) return;

        if (!metaChanged(lastSentMetaRef.current, state)) return;
        lastSentMetaRef.current = extractSentMeta(state);

        const payload: MetaPayload = {
          i: state.playerId,
          dn: state.displayName,
          ct: state.characterType,
          h: Math.round(state.health * 10) / 10,
          mh: state.maxHealth,
          st: Math.round(state.stamina),
          hu: Math.round(state.hunger),
          tp: Math.round(state.temperature),
          bm: state.buildMode,
          hs: state.horseState,
          em: state.emote,
          sp: state.isSpeaking,
          cn: state.clanName,
          cc: state.clanColor,
        };

        ch.send({ type: 'broadcast', event: 'pme', payload });
      }, META_BROADCAST_MS);

      mpAudit('split broadcast timers started', { moveMs: MOVE_BROADCAST_MS, metaMs: META_BROADCAST_MS });

      // Stale player cleanup
      if (staleCleanupRef.current) clearInterval(staleCleanupRef.current);
      staleCleanupRef.current = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, rp] of remotePlayersRef.current) {
          if (now - rp.lastUpdateTime > STALE_PLAYER_TIMEOUT_MS) {
            mpAudit('stale cleanup removed', { playerId: id });
            remotePlayersRef.current.delete(id);
            changed = true;
          }
        }
        if (changed) scheduleRemotePlayersCommit(true);
      }, 2000);
    });
  }, [playerId, fullCleanup, scheduleRemotePlayersCommit]);

  // Send both move + meta immediately (for first join or reconnect)
  const sendInitialState = useCallback(() => {
    const state = localStateRef.current;
    const ch = channelRef.current;
    if (!state || !ch || initialStateSentRef.current) return;
    initialStateSentRef.current = true;

    const movePayload: MovePayload = {
      i: state.playerId, p: state.position, r: state.rotation,
      s: state.moveSpeed, n: state.isRunning, g: state.isGrounded, m: state.isMounted,
    };
    if (state.isMounted) {
      movePayload.hp = state.horsePosition;
      movePayload.hr = state.horseRotation;
      movePayload.hP = state.horsePitch;
    }
    ch.send({ type: 'broadcast', event: 'pm', payload: movePayload });

    lastSentMetaRef.current = extractSentMeta(state);
    const metaPayload: MetaPayload = {
      i: state.playerId, dn: state.displayName, ct: state.characterType,
      h: Math.round(state.health * 10) / 10, mh: state.maxHealth,
      st: Math.round(state.stamina), hu: Math.round(state.hunger),
      tp: Math.round(state.temperature), bm: state.buildMode,
      hs: state.horseState, em: state.emote, sp: state.isSpeaking,
      cn: state.clanName, cc: state.clanColor,
    };
    ch.send({ type: 'broadcast', event: 'pme', payload: metaPayload });
    mpAudit('initial split state sent');
  }, []);

  // ===== Enter the global world =====
  const enterWorld = useCallback(async (playerName?: string) => {
    const name = (playerName?.trim() || displayName).slice(0, 20) || 'Knight';
    updateDisplayName(name);
    setConnectionStatus('connecting');

    const timings = createTimings();
    timings.enterWorldClicked = Date.now();
    timingsRef.current = timings;
    firstRemoteReceivedRef.current = false;
    initialStateSentRef.current = false;
    for (const k of Object.keys(auditLogCounts)) delete auditLogCounts[k];

    resetSpawnIndex();
    mpAudit('enterWorld start', { name, playerId });
    logTiming('Enter world clicked', timings, 'enterWorldClicked');

    try {
      persistSession(name);
      const success = await subscribeToGlobalWorld(name);
      if (!success) {
        console.warn('[Multiplayer] Subscribe failed or timed out');
        setConnectionStatus('disconnected');
        clearSession();
        throw new Error('Failed to connect to world — try again');
      }
    } catch (err: any) {
      console.error('Failed to enter world:', err);
      setConnectionStatus('disconnected');
      throw err;
    }
  }, [displayName, updateDisplayName, subscribeToGlobalWorld, playerId]);

  // ===== Leave world =====
  const leaveWorld = useCallback(async () => {
    mpAudit('leaveWorld called');
    const ch = channelRef.current;
    channelRef.current = null;
    await fullCleanup(ch);
    clearSession();
    setConnectionStatus('disconnected');
    remotePlayersRef.current = new Map();
    setRemotePlayersVersion((v) => v + 1);
    setChatMessages([]);
    setWorldEvents([]);
  }, [fullCleanup]);

  // Auto-reconnect disabled
  const hasAttemptedReconnect = useRef(false);
  useEffect(() => {
    if (hasAttemptedReconnect.current) return;
    hasAttemptedReconnect.current = true;
    const session = loadSession();
    if (session) {
      console.log('[Multiplayer] Found stale session — clearing (auto-reconnect disabled)');
      clearSession();
    }
  }, []);

  // ===== Broadcast local player state =====
  const prevAttackAnimRef = useRef(0);
  const updateLocalState = useCallback((state: NetworkPlayerState) => {
    localStateRef.current = state;

    // Detect attack edge → send discrete event
    if (state.attackAnim > 0 && prevAttackAnimRef.current === 0 && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast', event: 'pa',
        payload: { i: state.playerId, t: 'attack', d: state.attackAnim } as ActionPayload,
      });
    }
    prevAttackAnimRef.current = state.attackAnim;

    // Send initial state if not yet sent
    if (connected && channelRef.current && !initialStateSentRef.current) {
      sendInitialState();
    }
  }, [connected, sendInitialState]);

  // ===== Send chat (server-validated rate limit) =====
  const sendChat = useCallback(async (text: string) => {
    if (!channelRef.current || !text.trim()) return;
    const currentDisplayName = sessionStorage.getItem('mp_display_name') || 'Knight';
    const sanitized = text.trim().replace(/<[^>]*>/g, '').slice(0, 200);
    if (!sanitized) return;

    // Server-side rate limit check — fail closed: if validation errors or denies, drop the message.
    // This prevents bypassing the chat rate limit by triggering a network/RPC error.
    try {
      const session = loadWalletSession();
      const { data, error } = await supabase.rpc('validate_chat', {
        _wallet_address: session?.wallet_address || '',
        _session_token: session?.session_token || '',
        _message_length: sanitized.length,
      } as any);
      if (error) {
        console.warn('[Chat] validate_chat RPC error, dropping message:', error.message);
        return;
      }
      const result = data as unknown as { allowed: boolean; reason?: string };
      if (!result?.allowed) return; // Silently drop rate-limited messages
    } catch (err) {
      console.warn('[Chat] validate_chat threw, dropping message:', err);
      return; // fail closed
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID(), playerId,
      displayName: currentDisplayName,
      text: sanitized, timestamp: Date.now(), type: 'chat',
    };
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg });
    setChatMessages(prev => [...prev.slice(-99), msg]);
  }, [playerId]);

  // ===== Send emote =====
  const sendEmote = useCallback((emoteKey: string) => {
    if (!channelRef.current) return;
    const currentDisplayName = sessionStorage.getItem('mp_display_name') || 'Knight';
    const msg: ChatMessage = {
      id: crypto.randomUUID(), playerId,
      displayName: currentDisplayName,
      text: emoteKey, timestamp: Date.now(), type: 'emote',
    };
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg });
    setChatMessages(prev => [...prev.slice(-99), msg]);
  }, [playerId]);

  // ===== Broadcast world event =====
  const broadcastWorldEvent = useCallback((event: WorldEvent) => {
    if (!channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'world_event', payload: event });
    setWorldEvents(prev => [...prev.slice(-49), event]);
  }, []);

  // ===== PvP: broadcast hit to victim =====
  const broadcastPvpHit = useCallback((hitData: PvpHitData) => {
    if (!channelRef.current) return;
    const payload: ActionPayload = { i: playerId, t: 'pvp_hit', d: hitData };
    channelRef.current.send({ type: 'broadcast', event: 'pa', payload });
  }, [playerId]);

  // ===== PvP: broadcast own death (informational for remote animations) =====
  const broadcastPvpDeath = useCallback((deathData: PvpDeathData) => {
    if (!channelRef.current) return;
    const payload: ActionPayload = { i: playerId, t: 'pvp_death', d: deathData };
    channelRef.current.send({ type: 'broadcast', event: 'pa', payload });
  }, [playerId]);

  // ===== PvP: register hit callback =====
  const setPvpHitCallback = useCallback((cb: ((data: PvpHitData) => void) | null) => {
    pvpHitCallbackRef.current = cb;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (moveTimerRef.current) { clearInterval(moveTimerRef.current); moveTimerRef.current = null; }
      if (metaTimerRef.current) { clearInterval(metaTimerRef.current); metaTimerRef.current = null; }
      if (staleCleanupRef.current) { clearInterval(staleCleanupRef.current); staleCleanupRef.current = null; }
      if (remotePlayersCommitTimerRef.current) {
        clearTimeout(remotePlayersCommitTimerRef.current);
        remotePlayersCommitTimerRef.current = null;
      }
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) { supabase.removeChannel(ch).catch(() => {}); }
    };
  }, []);

  return {
    playerId,
    connected,
    connectionStatus,
    displayName,
    updateDisplayName,
    remotePlayers: remotePlayersRef.current,
    remotePlayersRef,
    chatMessages,
    worldEvents,
    enterWorld,
    leaveWorld,
    updateLocalState,
    sendChat,
    sendEmote,
    broadcastWorldEvent,
    broadcastPvpHit,
    broadcastPvpDeath,
    setPvpHitCallback,
    channelRef,
  };
}
