import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { supabase } from '@/integrations/supabase/client';
import { devLog } from './utils/devLog';
import { useQualitySettings, tryAdaptiveDrop } from './hooks/useQualitySettings';
import { PerfBaselineR3F, PerfBaselineHUD, isPerfModeEnabled } from './debug/PerfBaseline';
import { FpsTracker } from './systems/FpsTracker';
import { Terrain, getTerrainHeight } from './components/Terrain';
import { getGroundHeight } from './systems/Grounding';
import { Water } from './components/Water';
import { Player, MountedDebugData } from './components/Player';
import { FACTIONS, getFactionById } from './systems/FactionData';
import { Atmosphere } from './components/Atmosphere';
import { Sky } from './components/Sky';
import { WorldObjects } from './components/WorldObjects';
import { Enemies, EnemiesHandle, EnemyRuntime } from './components/Enemies';
import { AmbientEffects } from './components/AmbientEffects';
import { BuildingSystem } from './components/BuildingSystem';
import { LootPickups } from './components/LootPickups';
import { Horse } from './components/Horses';
import { Settlements } from './components/Settlements';
import { WorldPOIs } from './components/WorldPOIs';
import { TownDistrict } from './components/TownDistrict';
import { CivilianNPCs } from './components/CivilianNPCs';
import { SkyCreatures } from './components/SkyCreatures';
import { WildernessStructures } from './components/WildernessStructures';
import { Bridges } from './components/Bridges';
import { NightLighting } from './components/NightLighting';
import { RailwayTrack } from './components/RailwayTrack';
import { RailwayStations } from './components/RailwayStations';
import { RailwayBridges } from './components/RailwayBridges';
import { RailwayLamps } from './components/RailwayLamps';
import { LevelCrossings } from './components/LevelCrossings';
// DEV-only side-effect: world-map audit (rail/road/bridge consistency).
// Dynamically imported under import.meta.env.DEV so the validator code is
// tree-shaken out of production bundles.
if (import.meta.env.DEV) {
  void import('./systems/RailwayValidator');
}
import { Train } from './components/Train';
import { DebugCollision } from './components/DebugCollision';
import { CameraController } from './systems/CameraController';
import { InputFlusher } from './systems/InputFlusher';
import { BuildModeController } from './systems/BuildModeController';
import { SurvivalHUD } from './ui/SurvivalHUD';
import { Leaderboard } from './ui/Leaderboard';
import { useGameState } from './hooks/useGameState';
import { useProgressionPersistence } from './hooks/useProgressionPersistence';
import { loadWalletSession } from './hooks/usePlayerAccount';
import { generateWorldResources, WorldResource, generateLootDrop } from './systems/WorldResources';
import { useTrencheriCoins } from './hooks/useTrencheriCoins';
import { generateCoinCandidates } from './systems/CoinSpawner';
import { TrencheriCoins } from './components/TrencheriCoins';
import { initInput } from './systems/InputSystem';
import { POIS, POI_ZONE_RADIUS } from './constants';
// Multiplayer
import { RemotePlayers } from './multiplayer/RemotePlayers';
import { MultiplayerBroadcaster } from './multiplayer/MultiplayerBroadcaster';
import { MultiplayerHUD } from './multiplayer/MultiplayerHUD';
import { ChatPanel } from './multiplayer/ChatPanel';
import { useProximityVoice } from './multiplayer/useProximityVoice';
import { EmoteWheel } from './ui/EmoteWheel';
import { SettingsPanel } from './ui/SettingsPanel';
import { FactionPanel } from './ui/FactionPanel';
import { TerritoryIndicator } from './components/TerritoryIndicator';
import { TerritoryMarkers } from './components/TerritoryMarkers';
import { TerritoryGateBanners } from './components/TerritoryGateBanners';
import { TerritoryBoundaries } from './components/TerritoryBoundaries';
import { useClanSystem } from './hooks/useClanSystem';
import { WarNotifications } from './ui/WarNotifications';
import { WarScoreboard } from './ui/WarScoreboard';
import type { KillEntry } from './ui/WarKillFeed';
import { CLAN_COLOR_HEX, ClanColor } from './hooks/useClanSystem';
import { useCharacter } from './context/CharacterContext';
import { WebGLRecovery } from './systems/WebGLRecovery';
import { SceneDiagnosticsBoundary } from './debug/SceneDiagnostics';
import { StartupReadiness } from './systems/StartupReadiness';

interface GameSceneProps {
  multiplayer: ReturnType<typeof import('./multiplayer/useMultiplayer').useMultiplayer>;
  onLeaveWorld: () => void;
  onSceneReady?: () => void;
}

export function GameScene({ multiplayer, onLeaveWorld, onSceneReady }: GameSceneProps) {
  const {
    survival, updateSurvival, inventory, addResource, eatFood,
    interactionText, setInteractionText,
    buildMode, toggleBuildMode, selectedBuildIndex, cycleBuild,
    structures, placeStructure, buildFeedback, setBuildFeedback,
    damageFlash, applyPlayerDamage,
    progression, setProgression, recordEnemyKill, secureArea,
    lootPickups, addLootPickups, collectLoot,
    notification, getAvailableBuildables,
    horse, isMounted, mountHorse, dismountHorse, callHorse, updateHorse,
    addRemoteStructure,
  } = useGameState();

  const { character } = useCharacter();
  const progressionPersistence = useProgressionPersistence();
  const trencheri = useTrencheriCoins();
  const quality = useQualitySettings();

  // Perf HUD: enabled via ?perf=1 URL param OR F3 hotkey toggle.
  const [perfMode, setPerfMode] = useState<boolean>(() => isPerfModeEnabled());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setPerfMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Adaptive quality: if 30s rolling avg FPS stays under 35, drop one tier.
  // One-shot per session — sets sessionStorage flag inside tryAdaptiveDrop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastCheck = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      // Only consider after 30s warm-up so loading frames don't trigger it
      if (now - lastCheck < 30000) return;
      lastCheck = now;
      const w = window as unknown as { __trencheriaAvgFps30?: number };
      const avg = w.__trencheriaAvgFps30;
      if (typeof avg === 'number' && avg > 0 && avg < 35) {
        const dropped = tryAdaptiveDrop();
        if (dropped) {
          devLog('[Quality] Adaptive fallback → tier=', dropped, 'avgFps=', avg);
        }
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const [resources, setResources] = useState<WorldResource[]>(() => generateWorldResources());
  const enemiesHandleRef = useRef<EnemiesHandle>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [currentEmote, setCurrentEmote] = useState<string | null>(null);
  const [activeEmote, setActiveEmote] = useState<{ key: string; id: number } | null>(null);
  const emoteIdRef = useRef(0);
  const playerPositionRef = useRef(new THREE.Vector3(0, 0, 0));

  // Proximity voice chat
  const voice = useProximityVoice(
    multiplayer.playerId,
    multiplayer.connected,
    multiplayer.channelRef,
    playerPositionRef,
    multiplayer.remotePlayers as any,
  );
  const playerRotationRef = useRef(0);
  const cameraAzimuthRef = useRef(0);
  const pendingPlayerDamageRef = useRef(0);
  const shakeResourceRef = useRef<string | null>(null);
  const highlightedResourceRef = useRef<string | null>(null);
  const mountedDebugRef = useRef({ terrainY: 0, horseY: 0, riderY: 0, delta: 0, pitch: 0, pushX: 0, pushZ: 0 });
  const moveSpeedRef = useRef(0);
  const isRunningRef = useRef(false);
  const isGroundedRef = useRef(true);
  const attackAnimRef = useRef(0);

  // === PVP STATE ===
  const lastDamageSourceRef = useRef<{ attackerId: string; attackerWallet: string; attackerName: string; attackerClanColor: string; timestamp: number } | null>(null);
  const pvpKillLoggedRef = useRef(false);
  const pvpDeathLogCooldownRef = useRef(0);
  const [pvpHitMarker, setPvpHitMarker] = useState(false);
  const [pvpDamageFlash, setPvpDamageFlash] = useState(false);
  const [pvpNotification, setPvpNotification] = useState<string | null>(null);
  // Respawn invulnerability (4 seconds)
  const respawnInvulnRef = useRef(0);
  const [invulnTimeLeft, setInvulnTimeLeft] = useState(0);
  // Kill feed
  const [killFeedEntries, setKillFeedEntries] = useState<KillEntry[]>([]);
  const progressionLoadedRef = useRef(false);
  const latestProgressionRef = useRef(progression);
  latestProgressionRef.current = progression;

  useEffect(() => {
    const session = loadWalletSession();
    if (session?.wallet_address) {
      progressionPersistence.setWallet(session.wallet_address);
      progressionPersistence.loadProgression(session.wallet_address).then(saved => {
        if (saved) {
          setProgression(saved);
        }
        // Mark loaded AFTER setProgression so auto-save won't fire for the hydration
        progressionLoadedRef.current = true;
      });
    } else {
      // Guest — no persistence, but mark as "loaded" so auto-save stays disabled
      progressionLoadedRef.current = true;
    }
    return () => {
      // Flush latest progression on unmount (uses ref, not stale closure)
      if (progressionLoadedRef.current) {
        progressionPersistence.flushSave(latestProgressionRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save progression only AFTER initial load completes, and only on real changes
  const prevProgressionRef = useRef(progression);
  useEffect(() => {
    // Don't save until DB load has completed (prevents saving defaults over real data)
    if (!progressionLoadedRef.current) return;
    if (prevProgressionRef.current === progression) return;
    prevProgressionRef.current = progression;
    const isMilestone = progression.enemiesKilled % 5 === 0 && progression.enemiesKilled > 0;
    progressionPersistence.saveProgression(progression, isMilestone);
  }, [progression, progressionPersistence]);

  // $TRENCHERI coin system — load balance + spawn/despawn loop
  // $TRENCHERI: Load balance on mount
  useEffect(() => {
    trencheri.loadBalance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // $TRENCHERI: Server-issued coin spawn loop + fetch active coins
  useEffect(() => {
    // Fetch existing active coins immediately
    trencheri.fetchActiveCoins();

    const spawnInterval = setInterval(async () => {
      if (document.hidden) return; // COST: skip when tab hidden
      const pos = playerPositionRef.current;
      // Prune expired local coins
      trencheri.pruneExpired();

      // Only wallet users can issue new coins
      const session = loadWalletSession();
      if (!session?.wallet_address) return;

      // Generate candidate positions and send to server for ID assignment
      if (trencheri.coins.filter(c => !c.collected).length < trencheri.MAX_LOCAL_COINS) {
        const candidates = generateCoinCandidates(pos.x, pos.z, 2);
        if (candidates.length > 0) {
          const issued = await trencheri.issueCoins(candidates);
          if (issued.length > 0) {
            trencheri.setCoins(prev => [...prev.filter(c => !c.collected && c.expiresAt > Date.now()), ...issued].slice(0, trencheri.MAX_LOCAL_COINS));
          }
        }
      }
    }, trencheri.SPAWN_INTERVAL_MS);

    // Periodically fetch all active coins (so you see coins from other players too)
    // Increased from 60s to 90s — spawn loop already returns fresh coins for local player
    const fetchInterval = setInterval(() => {
      if (document.hidden) return; // COST: skip when tab hidden
      trencheri.fetchActiveCoins();
    }, 90_000);

    return () => {
      clearInterval(spawnInterval);
      clearInterval(fetchInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Guest coin message cooldown (5s between messages)
  const lastGuestCoinMsgRef = useRef(0);

  // Coin collection callback for Player
  const handleTryCollectCoin = useCallback(() => {
    const pos = playerPositionRef.current;
    const wallet = loadWalletSession();
    const nearDist = trencheri.getNearestCoinDistance(pos.x, pos.z);
    if (nearDist !== null) {
      if (!wallet?.wallet_address) {
        // Guest — show gated message with 5s cooldown to prevent spam
        const now = Date.now();
        if (now - lastGuestCoinMsgRef.current < 5000) return;
        lastGuestCoinMsgRef.current = now;
        setInteractionText('🪙 Connect Phantom wallet to register and collect $TRENCHERI');
        setTimeout(() => setInteractionText(null), 3000);
        return;
      }
      trencheri.tryCollectCoin(pos.x, pos.z, (msg) => {
        setInteractionText(msg);
        setTimeout(() => setInteractionText(null), 2000);
      });
    }
  }, [trencheri, playerPositionRef, setInteractionText]);

  // Remote character GLBs are no longer eagerly preloaded.
  // They load on-demand when a remote player of that type first appears.

  useEffect(() => { initInput(); }, []);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (pendingPlayerDamageRef.current > 0) {
        const dmg = pendingPlayerDamageRef.current;
        pendingPlayerDamageRef.current = 0;
        applyPlayerDamage(dmg);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyPlayerDamage]);

  // Mounted horse sync — commit position to React state only on dismount,
  // not every frame. Player.tsx is sole movement authority while mounted.
  // The horse visual is hidden while mounted (rendered inline by Player).
  const mountedSyncRef = useRef(false);
  useEffect(() => {
    if (isMounted) {
      mountedSyncRef.current = true;
    } else if (mountedSyncRef.current) {
      // Just dismounted — commit final horse position to state once.
      // Use getGroundHeight so the horse sits on the BRIDGE deck if dismounted
      // on a bridge (bridge override wins), not on the terrain below.
      mountedSyncRef.current = false;
      const pos = playerPositionRef.current;
      const horseY = getGroundHeight(pos.x, pos.z);
      updateHorse({
        position: [pos.x, horseY, pos.z],
        rotation: playerRotationRef.current,
      });
    }
  }, [isMounted, updateHorse, playerPositionRef, playerRotationRef]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (document.hidden) return; // COST: skip when tab hidden
      const handle = enemiesHandleRef.current;
      if (!handle) return;
      const enemyMap = handle.getEnemies();
      for (const [key, poi] of Object.entries(POIS)) {
        if (progression.areasSecured.includes(key)) continue;
        let hasAlive = false;
        enemyMap.forEach(e => {
          if (e.state === 'dead') return;
          const dx = e.position[0] - poi.x;
          const dz = e.position[2] - poi.z;
          if (dx * dx + dz * dz < POI_ZONE_RADIUS * POI_ZONE_RADIUS) {
            hasAlive = true;
          }
        });
        if (!hasAlive) {
          secureArea(key);
        }
      }
    }, 5000); // reduced from 2s to 5s
    return () => clearInterval(checkInterval);
  }, [progression.areasSecured, secureArea]);

  // Settings panel state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clanOpen, setClanOpen] = useState(false);
  const clanSystem = useClanSystem();

  // Map toggle + settings toggle + clan toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') setMapOpen(prev => !prev);
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !isTyping) {
        setSettingsOpen(prev => !prev);
      }
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !isTyping) {
        setClanOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Handle multiplayer world events from remote players
  const processedEventCountRef = useRef(0);
  useEffect(() => {
    if (!multiplayer.connected) return;
    const events = multiplayer.worldEvents;
    const startIdx = processedEventCountRef.current;
    if (events.length <= startIdx) return;
    
    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i];
      if (ev.playerId === multiplayer.playerId) continue;

      if (ev.type === 'resource_depleted') {
        const id = ev.payload.resourceId as string;
        setResources(prev => prev.map(r => r.id === id ? { ...r, depleted: true, health: 0 } : r));
      }
      if (ev.type === 'enemy_killed') {
        const id = ev.payload.enemyId as string;
        const handle = enemiesHandleRef.current;
        if (handle) {
          const enemy = handle.getEnemies().get(id);
          if (enemy && enemy.state !== 'dead') {
            enemy.health = 0;
            enemy.state = 'dead';
            enemy.deathTimer = 0;
          }
        }
      }
      if (ev.type === 'building_placed') {
        const structure = ev.payload.structure as Record<string, unknown>;
        if (structure) {
          addRemoteStructure(structure as any);
        }
      }
    }
    processedEventCountRef.current = events.length;
  }, [multiplayer.worldEvents, multiplayer.connected, multiplayer.playerId]);

  const handleDepleteResource = useCallback((id: string) => {
    setResources(prev => prev.map(r => r.id === id ? { ...r, depleted: true, health: 0 } : r));
    if (multiplayer.connected) {
      multiplayer.broadcastWorldEvent({
        type: 'resource_depleted',
        payload: { resourceId: id },
        playerId: multiplayer.playerId,
        timestamp: Date.now(),
      });
    }
  }, [multiplayer]);

  const handleHitResource = useCallback((id: string) => {
    setResources(prev => prev.map(r => r.id === id ? { ...r, health: r.health - 1 } : r));
  }, []);

  const handleEnemyKill = useCallback((enemy: EnemyRuntime) => {
    const drops = generateLootDrop(enemy.position, enemy.type);
    if (drops.length > 0) addLootPickups(drops);
    recordEnemyKill(enemy.type);
    if (multiplayer.connected) {
      multiplayer.broadcastWorldEvent({
        type: 'enemy_killed',
        payload: { enemyId: enemy.id, killerName: multiplayer.displayName },
        playerId: multiplayer.playerId,
        timestamp: Date.now(),
      });
    }
  }, [addLootPickups, recordEnemyKill, multiplayer]);

  const handleRespawn = useCallback(() => {
    updateSurvival({ health: 100, stamina: 100, hunger: 80, temperature: 70 });
    pendingPlayerDamageRef.current = 0;
    // Reset PvP state on respawn
    lastDamageSourceRef.current = null;
    pvpKillLoggedRef.current = false;
    // Respawn invulnerability: 4 seconds
    respawnInvulnRef.current = Date.now() + 4000;
    setPvpNotification('⚔️ Respawned — invulnerable for 4s');
    setTimeout(() => setPvpNotification(null), 4000);
  }, [updateSurvival]);

  // Invulnerability countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, respawnInvulnRef.current - Date.now());
      setInvulnTimeLeft(remaining > 100 ? Math.ceil(remaining / 1000) : 0);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // === PVP: Active wars map (keyed by OPPONENT faction color) ===
  // Drives both attacker-side gating in <Player/> and receiver-side validation
  // below. Rebuilt whenever challenges/territories/myClan change.
  const activeWarsRef = useRef<Map<string, { centerX: number; centerZ: number; radius: number }>>(new Map());
  useEffect(() => {
    const map = new Map<string, { centerX: number; centerZ: number; radius: number }>();
    const myClanId = clanSystem.myClan?.clan_id;
    if (myClanId) {
      for (const ch of clanSystem.challenges) {
        if (ch.status !== 'active') continue;
        if (ch.attacker_clan_id !== myClanId && ch.defender_clan_id !== myClanId) continue;
        const oppId = ch.attacker_clan_id === myClanId ? ch.defender_clan_id : ch.attacker_clan_id;
        const oppFaction = FACTIONS.find(f => f.id === oppId);
        if (!oppFaction) continue;
        const territory = clanSystem.territories.find(t => t.id === ch.territory_id);
        if (!territory) continue;
        map.set(oppFaction.color, {
          centerX: territory.center_x,
          centerZ: territory.center_z,
          radius: territory.radius,
        });
      }
    }
    activeWarsRef.current = map;
  }, [clanSystem.challenges, clanSystem.territories, clanSystem.myClan]);

  // === PVP: Register incoming hit callback ===
  useEffect(() => {
    if (!multiplayer.connected) return;
    const session = loadWalletSession();
    const myWallet = session?.wallet_address;
    const myFactionId = session?.faction_id ?? null;

    multiplayer.setPvpHitCallback((hitData) => {
      // Only process if we are wallet-authenticated
      if (!myWallet) return;
      // Don't take PvP damage if dead
      if (survival.health <= 0) return;
      // Same-faction protection — uses stable faction UUID, not string names
      if (myFactionId && hitData.attackerClanId && myFactionId === hitData.attackerClanId) return;
      // Must be in a faction to participate in PvP
      if (!myFactionId) return;
      // Respawn invulnerability — cannot receive PvP damage
      if (Date.now() < respawnInvulnRef.current) return;

      // === Active-war gate (server-truth driven) ===
      // Receiver-side validation mirrors the attacker check in Player.tsx so a
      // malicious or out-of-date attacker cannot deal damage outside an active
      // war or outside the contested territory radius.
      //
      // SECURITY: we derive the attacker's faction from the authoritative
      // remote player record (broadcast by the server with their clanColor),
      // NOT from `hitData.attackerClanId` (attacker-supplied). We additionally
      // cross-check the two and reject any mismatch so a spoofed attackerClanId
      // cannot route damage through a war that the attacker isn't actually in.
      const attackerPlayerId = (hitData as any)._attackerPlayerId || 'unknown';
      const attackerRemote = multiplayer.remotePlayersRef?.current?.get(attackerPlayerId);
      if (!attackerRemote) return;                 // unknown attacker → reject
      if (!attackerRemote.clanColor) return;       // attacker has no faction → reject
      // Cross-check attacker-supplied id against authoritative remote color
      const claimedFaction = hitData.attackerClanId ? getFactionById(hitData.attackerClanId) : null;
      if (!claimedFaction || claimedFaction.color !== attackerRemote.clanColor) return;
      // Active-war lookup uses the authoritative color
      const war = activeWarsRef.current.get(attackerRemote.clanColor);
      if (!war) return;
      // I (defender) must be inside the war territory
      const myPos = playerPositionRef.current;
      const dxMe = myPos.x - war.centerX;
      const dzMe = myPos.z - war.centerZ;
      if (dxMe * dxMe + dzMe * dzMe > war.radius * war.radius) return;
      // Attacker must also be inside (last-known interpolated position).
      // This is a hard requirement, not a soft pass.
      const ax = attackerRemote.renderPosition[0];
      const az = attackerRemote.renderPosition[2];
      const dxA = ax - war.centerX;
      const dzA = az - war.centerZ;
      if (dxA * dxA + dzA * dzA > war.radius * war.radius) return;

      // Anti-spam: cooldown per attacker
      const now = Date.now();
      const last = lastDamageSourceRef.current;
      if (last && last.attackerId === attackerPlayerId && now - last.timestamp < 500) return;

      // Apply damage
      const clampedDmg = Math.min(hitData.damage, 20); // cap max PvP damage per hit
      pendingPlayerDamageRef.current += clampedDmg;

      // PvP-specific damage flash (distinct from NPC)
      setPvpDamageFlash(true);
      setTimeout(() => setPvpDamageFlash(false), 300);

      // Resolve attacker display info from authoritative remote (already validated above)
      const attackerName = attackerRemote.displayName || 'Unknown';
      const attackerClanColor = CLAN_COLOR_HEX[attackerRemote.clanColor as ClanColor] || '#e74c3c';

      // Track last damage source
      lastDamageSourceRef.current = {
        attackerId: attackerPlayerId,
        attackerWallet: hitData.attackerWallet,
        attackerName,
        attackerClanColor,
        timestamp: now,
      };
    });

    return () => multiplayer.setPvpHitCallback(null);
  }, [multiplayer.connected, multiplayer, survival.health]);

  // === PVP: Detect death → log war kill ===
  useEffect(() => {
    if (survival.health > 0) return;
    if (pvpKillLoggedRef.current) return;
    const source = lastDamageSourceRef.current;
    if (!source) return; // not a PvP death

    // Show death notification with killer info
    setPvpNotification(`💀 Killed by ${source.attackerName}`);
    setTimeout(() => setPvpNotification(null), 4000);

    const session = loadWalletSession();
    if (!session?.wallet_address || !session?.session_token) return;

    // Cooldown check
    const now = Date.now();
    if (now - pvpDeathLogCooldownRef.current < 5000) return;
    pvpDeathLogCooldownRef.current = now;
    pvpKillLoggedRef.current = true;

    // Add to kill feed
    const myName = multiplayer.displayName;
    const myClanColor = clanSystem.myClan?.clan_color
      ? CLAN_COLOR_HEX[clanSystem.myClan.clan_color as ClanColor] || '#27ae60'
      : '#27ae60';
    setKillFeedEntries(prev => [...prev, {
      id: crypto.randomUUID(),
      killerName: source.attackerName,
      killerColor: source.attackerClanColor,
      victimName: myName,
      victimColor: myClanColor,
      timestamp: now,
    }].slice(-5));

    // Broadcast death for remote animation
    multiplayer.broadcastPvpDeath({
      victimWallet: session.wallet_address,
      killerPlayerId: source.attackerId,
      killerWallet: source.attackerWallet,
      victimX: playerPositionRef.current.x,
      victimZ: playerPositionRef.current.z,
    });

    // Log to server (victim-initiated, server validates everything)
    const pos = playerPositionRef.current;
    supabase.rpc('report_pvp_death' as any, {
      _victim_wallet: session.wallet_address,
      _session_token: session.session_token,
      _killer_wallet: source.attackerWallet,
      _death_x: pos.x,
      _death_z: pos.z,
    }).then(({ data, error }: any) => {
      if (error) console.warn('[PvP] War kill log failed:', error.message);
      else if (data?.success) devLog('[PvP] War kill logged successfully');
      else devLog('[PvP] War kill not logged (no active war or not in territory):', data?.error);
    });
  }, [survival.health, multiplayer, playerPositionRef, clanSystem.myClan]);

  // === PVP: Attacker broadcasts hit ===
  const handlePvpHit = useCallback((victimId: string, damage: number, _isCombo: boolean) => {
    if (!multiplayer.connected) return;
    const session = loadWalletSession();
    if (!session?.wallet_address) return;
    if (!session?.faction_id) return; // Must have faction to PvP
    // Cannot deal PvP damage during respawn invulnerability
    if (Date.now() < respawnInvulnRef.current) return;

    // Show hit marker feedback
    setPvpHitMarker(true);
    setTimeout(() => setPvpHitMarker(false), 300);

    // Use stable faction UUID as clan ID
    multiplayer.broadcastPvpHit({
      victimId,
      damage,
      attackerWallet: session.wallet_address,
      attackerClanId: session.faction_id,
    });
  }, [multiplayer]);


  // Wrap placeStructure to broadcast building placement
  const handlePlaceStructure = useCallback((structure: any) => {
    placeStructure(structure);
    if (multiplayer.connected) {
      multiplayer.broadcastWorldEvent({
        type: 'building_placed',
        payload: { structure },
        playerId: multiplayer.playerId,
        timestamp: Date.now(),
      });
    }
  }, [placeStructure, multiplayer]);

  const remotePlayerCount = multiplayer.remotePlayers.size;

  return (
    <div className="w-screen h-screen bg-background overflow-hidden cursor-crosshair">
      <FpsTracker />
      {perfMode && <PerfBaselineHUD quality={quality.tier} onSetQuality={quality.setTier} />}
      <SurvivalHUD
        survival={survival}
        inventory={inventory}
        interactionText={interactionText}
        buildMode={buildMode}
        selectedBuildIndex={selectedBuildIndex}
        buildFeedback={buildFeedback}
        damageFlash={damageFlash}
        progression={progression}
        notification={notification}
        availableBuildables={getAvailableBuildables()}
        isMounted={isMounted}
        playerX={playerPositionRef.current.x}
        playerZ={playerPositionRef.current.z}
        playerRotation={playerRotationRef.current}
        horseX={horse.position[0]}
        horseZ={horse.position[2]}
        mapOpen={mapOpen}
        onCloseMap={() => setMapOpen(false)}
        isSpeaking={voice.isTalking}
        trencheriBalance={trencheri.balance}
        territories={clanSystem.territories}
        challenges={clanSystem.challenges}
        myClan={clanSystem.myClan ? { clan_name: clanSystem.myClan.clan_name, clan_color: clanSystem.myClan.clan_color, clan_id: clanSystem.myClan.clan_id } : null}
        remotePlayersRef={multiplayer.remotePlayersRef}
      />

      {/* War notifications — toast alerts + territory awareness */}
      <WarNotifications
        challenges={clanSystem.challenges}
        territories={clanSystem.territories}
        myClan={clanSystem.myClan ? { clan_name: clanSystem.myClan.clan_name, clan_color: clanSystem.myClan.clan_color, clan_id: clanSystem.myClan.clan_id } : null}
        playerX={playerPositionRef.current.x}
        playerZ={playerPositionRef.current.z}
      />

      {/* War Scoreboard — visible during active/pending_resolution wars inside territory */}
      <WarScoreboard
        playerX={playerPositionRef.current.x}
        playerZ={playerPositionRef.current.z}
        territories={clanSystem.territories}
        challenges={clanSystem.challenges}
        myClan={clanSystem.myClan ? { clan_name: clanSystem.myClan.clan_name, clan_color: clanSystem.myClan.clan_color, clan_id: clanSystem.myClan.clan_id } : null}
      />

      {/* WarKillFeed removed — kill feed is now integrated into WarScoreboard */}

      {/* Respawn invulnerability indicator */}
      {invulnTimeLeft > 0 && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-4 py-1.5 rounded-full text-xs font-bold" style={{
            background: 'hsla(200,70%,50%,0.2)',
            border: '1px solid hsla(200,70%,60%,0.5)',
            color: 'hsl(200,70%,75%)',
            boxShadow: '0 0 16px hsla(200,70%,50%,0.3)',
            letterSpacing: '0.06em',
          }}>
            🛡️ INVULNERABLE — {invulnTimeLeft}s
          </div>
        </div>
      )}

      {/* PvP hit marker — crosshair flash (improved) */}
      {pvpHitMarker && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div style={{
            width: 24, height: 24, position: 'relative',
          }}>
            {/* Crosshair lines */}
            <div style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: 8, marginLeft: -1, background: 'hsl(0,70%,55%)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: '50%', width: 2, height: 8, marginLeft: -1, background: 'hsl(0,70%,55%)' }} />
            <div style={{ position: 'absolute', left: 0, top: '50%', width: 8, height: 2, marginTop: -1, background: 'hsl(0,70%,55%)' }} />
            <div style={{ position: 'absolute', right: 0, top: '50%', width: 8, height: 2, marginTop: -1, background: 'hsl(0,70%,55%)' }} />
            {/* Center dot */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', width: 4, height: 4,
              marginTop: -2, marginLeft: -2, borderRadius: '50%',
              background: 'hsl(0,80%,60%)',
              boxShadow: '0 0 8px hsla(0,80%,55%,0.8)',
            }} />
          </div>
        </div>
      )}

      {/* PvP damage flash — red vignette distinct from NPC damage */}
      {pvpDamageFlash && (
        <div className="fixed inset-0 z-40 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, hsla(0,80%,30%,0.4) 100%)',
          animation: 'fadeOut 0.3s ease-out forwards',
        }} />
      )}

      {/* PvP notification text */}
      {pvpNotification && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fade-in">
          <div className="px-6 py-3 rounded-lg text-sm font-bold" style={{
            background: 'linear-gradient(135deg, hsla(0,0%,0%,0.85), hsla(0,0%,0%,0.7))',
            border: '1px solid hsla(0,60%,45%,0.5)',
            color: 'hsl(40,30%,90%)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 0 24px hsla(0,60%,40%,0.3)',
            textShadow: '0 1px 4px hsla(0,0%,0%,0.5)',
          }}>
            {pvpNotification}
          </div>
        </div>
      )}

      {/* Leaderboard (L key) */}
      <Leaderboard />

      {/* Multiplayer HUD */}
      <MultiplayerHUD
        connectionStatus={multiplayer.connectionStatus}
        playerCount={1 + remotePlayerCount}
        playerId={multiplayer.playerId}
        voiceState={multiplayer.connected ? { isTalking: voice.isTalking, micPermission: voice.micPermission } : undefined}
      />

      {/* Chat panel */}
      {multiplayer.connected && (
        <ChatPanel
          messages={multiplayer.chatMessages}
          onSendChat={multiplayer.sendChat}
          onSendEmote={(emote) => {
            multiplayer.sendEmote(emote);
            setCurrentEmote(emote);
            setTimeout(() => setCurrentEmote(null), 2000);
          }}
          displayName={multiplayer.displayName}
        />
      )}

      {/* Leave button */}
      {multiplayer.connected && (
        <button onClick={onLeaveWorld}
          className="fixed top-4 left-4 z-40 text-xs font-mono px-3 py-1 rounded"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#a88', border: '1px solid #533' }}>
          ← Leave World
        </button>
      )}

      {/* Settings Panel (P key) */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentDisplayName={multiplayer.displayName}
        onNameUpdated={(newName) => {
          multiplayer.updateDisplayName(newName);
        }}
        currentCommunityName={loadWalletSession()?.community_name}
      />

      {/* Faction Panel (C key) */}
      <FactionPanel
        open={clanOpen}
        onClose={() => setClanOpen(false)}
        playerX={playerPositionRef.current.x}
        playerZ={playerPositionRef.current.z}
        clanSystem={clanSystem}
      />

      {/* Territory entry indicator */}
      <TerritoryIndicator
        territories={clanSystem.territories}
        playerX={playerPositionRef.current.x}
        playerZ={playerPositionRef.current.z}
      />


      <EmoteWheel
        onSelectEmote={(key) => {
          emoteIdRef.current += 1;
          setActiveEmote({ key, id: emoteIdRef.current });
        }}
        isPlayingEmote={activeEmote !== null}
      />

      {/*
        key includes antialias because antialias is a WebGL context creation
        flag — it cannot be changed live, so we remount the Canvas (and
        therefore recreate the GL context) when the user toggles a tier
        that flips antialias. DPR / shadows / shadow-map-size update live.
      */}
      <Canvas
        key={`q-${quality.antialias ? 'aa' : 'noaa'}`}
        shadows={quality.shadows}
        dpr={quality.dpr}
        camera={{ fov: 55, near: 0.5, far: 1500, position: [0, 10, 15] }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: quality.antialias, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = quality.shadows;
          devLog('[WebGL] GameScene Canvas created', gl.getContext()?.constructor.name, 'tier=', quality.tier);
        }}>

        <WebGLRecovery />
        {onSceneReady && <StartupReadiness onReady={onSceneReady} />}
        {perfMode && <PerfBaselineR3F />}
        <InputFlusher />
        <SceneDiagnosticsBoundary>
          <BuildModeController
            buildMode={buildMode}
            onToggle={toggleBuildMode}
            onCycle={cycleBuild}
            onCancelBuild={toggleBuildMode}
          />
          <Atmosphere playerPositionRef={playerPositionRef} />
          <Sky />
          <Terrain />
          <Water />
          <Settlements playerPositionRef={playerPositionRef} />
          <WorldPOIs playerPositionRef={playerPositionRef} />
          <TownDistrict playerPositionRef={playerPositionRef} />
          <CivilianNPCs playerPositionRef={playerPositionRef} />
          <SkyCreatures playerPositionRef={playerPositionRef} />
          <WildernessStructures playerPositionRef={playerPositionRef} />
          <Bridges playerPositionRef={playerPositionRef} />
          <NightLighting playerPositionRef={playerPositionRef} />
          <AmbientEffects />
          <CameraController targetRef={playerPositionRef} azimuthRef={cameraAzimuthRef} isMounted={isMounted} />
          <Player
            survival={survival}
            onSurvivalUpdate={updateSurvival}
            playerPositionRef={playerPositionRef}
            playerRotationRef={playerRotationRef}
            cameraAzimuthRef={cameraAzimuthRef}
            enemiesHandleRef={enemiesHandleRef}

            onRespawn={handleRespawn}
            buildMode={buildMode}
            structures={structures}
            lootPickups={lootPickups}
            onCollectLoot={collectLoot}
            onEatFood={eatFood}
            onTryCollectCoin={handleTryCollectCoin}
            horse={horse}
            isMounted={isMounted}
            onMountHorse={mountHorse}
            onDismountHorse={dismountHorse}
            onCallHorse={callHorse}
            onSetInteractionText={setInteractionText}
            onAddResource={addResource}
            onDepleteResource={handleDepleteResource}
            onHitResource={handleHitResource}
            inventory={inventory}
            shakeResourceRef={shakeResourceRef}
            highlightedResourceRef={highlightedResourceRef}
            resources={resources}
            mountedDebugRef={mountedDebugRef}
            externalMoveSpeedRef={moveSpeedRef}
            externalIsRunningRef={isRunningRef}
            externalIsGroundedRef={isGroundedRef}
            externalAttackAnimRef={attackAnimRef}
            activeEmote={activeEmote?.key ?? null}
            activeEmoteId={activeEmote?.id ?? 0}
            onEmoteComplete={useCallback(() => setActiveEmote(null), [])}
            damageFlash={damageFlash}
            remotePlayersRef={multiplayer.remotePlayersRef}
            localClanId={loadWalletSession()?.faction_id ?? null}
            activeWarsRef={activeWarsRef}
            onPvpHit={handlePvpHit}
          />
          <WorldObjects
            resources={resources}
            playerPositionRef={playerPositionRef}
            shakeResourceRef={shakeResourceRef}
            highlightedResourceRef={highlightedResourceRef}
          />
          <LootPickups pickups={lootPickups} />
          <TrencheriCoins coins={trencheri.coins} playerPositionRef={playerPositionRef} />
          <Horse horse={horse} playerPositionRef={playerPositionRef} onUpdateHorse={updateHorse} isMounted={isMounted} />
          <Enemies
            ref={enemiesHandleRef}
            playerPositionRef={playerPositionRef}
            onEnemyKill={handleEnemyKill}
            pendingPlayerDamageRef={pendingPlayerDamageRef}
          />
          <BuildingSystem
            buildMode={buildMode}
            selectedIndex={selectedBuildIndex}
            playerPositionRef={playerPositionRef}
            playerRotationRef={playerRotationRef}
            structures={structures}
            inventory={inventory}
            onPlace={handlePlaceStructure}
            onSetBuildFeedback={setBuildFeedback}
            availableBuildables={getAvailableBuildables()}
          />
          <DebugCollision playerPositionRef={playerPositionRef} isMounted={isMounted} />
          {/* RAILWAY — incremental re-enable. Static tracks only (no useFrame). */}
          {/* Terrain flattening grid is safe and active. */}
          <RailwayTrack />
          <LevelCrossings />
          <RailwayLamps playerPositionRef={playerPositionRef} />
          {/* Railway structures */}
          <RailwayStations playerPositionRef={playerPositionRef} />
          <RailwayBridges playerPositionRef={playerPositionRef} />
          <Train />
          {/* <RailwayDebugPreview /> */}

          {/* Remote players from multiplayer */}
          <RemotePlayers remotePlayers={multiplayer.remotePlayers} playerPositionRef={playerPositionRef} />

          {/* 3D Territory ownership banners */}
          <TerritoryMarkers territories={clanSystem.territories} playerPositionRef={playerPositionRef} />
          <TerritoryGateBanners territories={clanSystem.territories} playerPositionRef={playerPositionRef} />
          <TerritoryBoundaries territories={clanSystem.territories} playerPositionRef={playerPositionRef} />

          {/* Multiplayer broadcaster — samples local state and pushes to network hook */}
          {multiplayer.connected && (
            <MultiplayerBroadcaster
              playerId={multiplayer.playerId}
              displayName={multiplayer.displayName}
              characterType={character}
              playerPositionRef={playerPositionRef}
              playerRotationRef={playerRotationRef}
              survival={survival}
              isMounted={isMounted}
              horse={horse}
              moveSpeedRef={moveSpeedRef}
              isRunningRef={isRunningRef}
              isGroundedRef={isGroundedRef}
              attackAnimRef={attackAnimRef}
              mountedDebugRef={mountedDebugRef}
              buildMode={buildMode}
              emote={activeEmote?.key ?? currentEmote}
              isSpeaking={voice.isTalking}
              onUpdateLocalState={multiplayer.updateLocalState}
            />
          )}
        </SceneDiagnosticsBoundary>
      </Canvas>

      {/* Debug overlay disabled for production */}
    </div>
  );
}

function MountedDebugOverlay({ debugRef, posRef }: {
  debugRef: React.MutableRefObject<MountedDebugData>;
  posRef: React.RefObject<THREE.Vector3>;
}) {
  const [data, setData] = useState<MountedDebugData & { x: number; z: number }>({
    terrainY: 0, horseY: 0, riderY: 0, delta: 0, pitch: 0, pushX: 0, pushZ: 0, x: 0, z: 0,
  });

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const d = debugRef.current;
      const p = posRef.current;
      setData({ ...d, x: p ? p.x : 0, z: p ? p.z : 0 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [debugRef, posRef]);

  const deltaColor = Math.abs(data.delta) < 0.01 ? '#0f0' : Math.abs(data.delta) < 0.1 ? '#ff0' : '#f00';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none font-mono text-xs p-3 rounded-lg"
      style={{ background: 'rgba(0,0,0,0.85)', color: '#0f0', border: '1px solid #333', minWidth: 320 }}>
      <div className="font-bold text-white mb-1">🐴 MOUNTED DEBUG (F3 toggle)</div>
      <div>Pos: X={data.x.toFixed(1)} Z={data.z.toFixed(1)}</div>
      <div>TerrainY: {data.terrainY.toFixed(3)}</div>
      <div>HorseY: {data.horseY.toFixed(3)}</div>
      <div>RiderY: {data.riderY.toFixed(3)}</div>
      <div style={{ color: deltaColor }}>
        GroundDelta: {data.delta.toFixed(4)} {Math.abs(data.delta) < 0.01 ? '✅' : '⚠️'}
      </div>
      <div>SlopePitch: {data.pitch.toFixed(1)}°</div>
      <div>ColPush: X={data.pushX.toFixed(3)} Z={data.pushZ.toFixed(3)}</div>
    </div>
  );
}
