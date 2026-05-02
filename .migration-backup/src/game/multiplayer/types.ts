// ===== Multiplayer Network Types =====
// All interfaces for Supabase Realtime multiplayer sync

// ===== Full state (internal representation — NOT sent on wire) =====
export interface NetworkPlayerState {
  playerId: string;
  displayName: string;
  characterType: 'soldier' | 'goblin' | 'octopus' | 'nemoclaw' | 'chillhouse' | 'yeti' | 'dog';
  position: [number, number, number];
  rotation: number;
  moveSpeed: number;
  isRunning: boolean;
  isGrounded: boolean;
  isMounted: boolean;
  health: number;
  maxHealth: number;
  stamina: number;
  hunger: number;
  temperature: number;
  attackAnim: number; // > 0 means swinging
  buildMode: boolean;
  horsePitch: number;
  horsePosition: [number, number, number];
  horseRotation: number;
  horseState: string;
  emote: string | null; // current emote key or null
  isSpeaking: boolean; // voice chat push-to-talk active
  clanName: string | null;
  clanColor: string | null;
  timestamp: number;
}

// ===== Split wire formats for bandwidth optimization =====

/** High-frequency position/movement payload — sent at MOVE_BROADCAST_MS */
export interface MovePayload {
  i: string;                      // playerId
  p: [number, number, number];    // position
  r: number;                      // rotation
  s: number;                      // moveSpeed
  n: boolean;                     // isRunning
  g: boolean;                     // isGrounded
  m: boolean;                     // isMounted
  hp?: [number, number, number];  // horsePosition (only if mounted)
  hr?: number;                    // horseRotation (only if mounted)
  hP?: number;                    // horsePitch (only if mounted)
}

/** Low-frequency metadata payload — sent at META_BROADCAST_MS, only when changed */
export interface MetaPayload {
  i: string;       // playerId
  dn: string;      // displayName
  ct: string;      // characterType
  h: number;       // health
  mh: number;      // maxHealth
  st: number;      // stamina
  hu: number;      // hunger
  tp: number;      // temperature
  bm: boolean;     // buildMode
  hs: string;      // horseState
  em: string | null; // emote
  sp: boolean;     // isSpeaking
  cn?: string | null; // clanName
  cc?: string | null; // clanColor
}

/** Discrete action event — sent once per trigger, NOT spammed */
export interface ActionPayload {
  i: string;       // playerId
  t: 'attack' | 'emote' | 'mount' | 'dismount' | 'pvp_hit' | 'pvp_death';
  d?: unknown;     // optional data (e.g. emote key, attack duration, pvp hit info)
}

/** PvP hit payload data — carried in ActionPayload.d */
export interface PvpHitData {
  victimId: string;
  damage: number;
  attackerWallet: string;
  attackerClanId: string;
}

/** PvP death payload — victim reports own death for kill logging */
export interface PvpDeathData {
  victimWallet: string;
  killerPlayerId: string;
  killerWallet: string;
  victimX: number;
  victimZ: number;
}

/** PvP damage constants */
export const PVP_DAMAGE = 12;           // base PvP hit damage
export const PVP_COMBO_DAMAGE = 16;     // combo PvP hit damage
export const PVP_HIT_COOLDOWN_MS = 500; // min ms between taking PvP hits from same attacker
export const PVP_DEATH_LOG_COOLDOWN_MS = 5000; // min ms between logging deaths

// ===== Internal interpolated representation =====
export interface InterpolatedPlayer {
  playerId: string;
  displayName: string;
  characterType: 'soldier' | 'goblin' | 'octopus' | 'nemoclaw' | 'chillhouse' | 'yeti' | 'dog';
  // Interpolation buffers
  prevPosition: [number, number, number];
  targetPosition: [number, number, number];
  prevRotation: number;
  targetRotation: number;
  // Current rendered values
  renderPosition: [number, number, number];
  renderRotation: number;
  // State
  moveSpeed: number;
  isRunning: boolean;
  isGrounded: boolean;
  isMounted: boolean;
  health: number;
  maxHealth: number;
  attackAnim: number;
  buildMode: boolean;
  horsePitch: number;
  horsePosition: [number, number, number];
  horseRotation: number;
  horseState: string;
  emote: string | null;
  isSpeaking: boolean;
  // Clan identity
  clanName: string | null;
  clanColor: string | null;
  // Timing
  lastUpdateTime: number;
  interpolationT: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  timestamp: number;
  type: 'chat' | 'emote' | 'system';
}

export interface WorldEvent {
  type: 'building_placed' | 'building_removed' | 'resource_depleted' | 'loot_collected' | 'enemy_killed' | 'area_secured';
  payload: Record<string, unknown>;
  playerId: string;
  timestamp: number;
}

// ===== Broadcast timing =====
// COST OPTIMIZATION: Reduced from 10Hz (100ms) to 5Hz (200ms) to halve realtime traffic
export const MOVE_BROADCAST_MS = 200;    // 5Hz — position/movement (was 100ms/10Hz)
export const META_BROADCAST_MS = 500;    // 2Hz max — metadata (only on change)
export const BROADCAST_RATE_MS = 200;    // alias for interpolation math (updated to match)
export const INTERPOLATION_DELAY_MS = 200; // smoothing buffer (updated to match broadcast rate)
export const STALE_PLAYER_TIMEOUT_MS = 8000;

// ===== Scalability constants =====
export const MAX_VOICE_PEERS = 6;           // max simultaneous WebRTC peers
export const LOD_FULL_DISTANCE = 60;        // full model with all animations
export const LOD_MEDIUM_DISTANCE = 120;     // simplified capsule placeholder
export const LOD_HIDDEN_DISTANCE = 200;     // not rendered at all
export const FAR_PLAYER_THROTTLE_MS = 500;  // throttle far-player state processing

export const EMOTES: Record<string, string> = {
  wave: '👋',
  cheer: '🎉',
  bow: '🙇',
  laugh: '😂',
  angry: '😡',
  point: '👉',
};
