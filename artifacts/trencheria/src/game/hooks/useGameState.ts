import { useState, useCallback, useRef } from 'react';
import { SurvivalState, ResourceInventory, GameMode, ProgressionState, LootPickup } from '../types';
import { MAX_HEALTH, MAX_STAMINA, MAX_HUNGER, MAX_TEMPERATURE, TIER2_KILLS_REQUIRED, TIER2_STRUCTURES_REQUIRED } from '../constants';
import { PlacedStructure, BUILDABLES, BuildableConfig } from '../systems/BuildingData';
import { HorseData, createPlayerHorse } from '../systems/HorseData';

export function useGameState() {
  const [survival, setSurvival] = useState<SurvivalState>({
    health: MAX_HEALTH,
    stamina: MAX_STAMINA,
    hunger: MAX_HUNGER * 0.8,
    temperature: MAX_TEMPERATURE * 0.7,
  });

  const [inventory, setInventory] = useState<ResourceInventory>({ wood: 0, stone: 0, food: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('explore');
  const [interactionText, setInteractionText] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [selectedBuildIndex, setSelectedBuildIndex] = useState(0);
  const [structures, setStructures] = useState<PlacedStructure[]>([]);
  const [buildFeedback, setBuildFeedback] = useState<string | null>(null);
  const [damageFlash, setDamageFlash] = useState(0);
  const [lootPickups, setLootPickups] = useState<LootPickup[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single companion horse
  const [horse, setHorse] = useState<HorseData>(() => createPlayerHorse());
  const [isMounted, setIsMounted] = useState(false);

  const [progression, setProgression] = useState<ProgressionState>({
    enemiesKilled: 0,
    structuresBuilt: 0,
    areasSecured: [],
    tier: 1,
    totalWoodGathered: 0,
    totalStoneGathered: 0,
  });

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  const updateSurvival = useCallback((updates: Partial<SurvivalState>) => {
    setSurvival(prev => ({
      health: Math.max(0, Math.min(MAX_HEALTH, updates.health ?? prev.health)),
      stamina: Math.max(0, Math.min(MAX_STAMINA, updates.stamina ?? prev.stamina)),
      hunger: Math.max(0, Math.min(MAX_HUNGER, updates.hunger ?? prev.hunger)),
      temperature: Math.max(0, Math.min(MAX_TEMPERATURE, updates.temperature ?? prev.temperature)),
    }));
  }, []);

  const addResource = useCallback((type: keyof ResourceInventory, amount: number) => {
    setInventory(prev => ({ ...prev, [type]: Math.max(0, prev[type] + amount) }));
    if (amount > 0 && (type === 'wood' || type === 'stone')) {
      setProgression(prev => ({
        ...prev,
        totalWoodGathered: prev.totalWoodGathered + (type === 'wood' ? amount : 0),
        totalStoneGathered: prev.totalStoneGathered + (type === 'stone' ? amount : 0),
      }));
    }
  }, []);

  const applyPlayerDamage = useCallback((amount: number) => {
    setSurvival(prev => ({ ...prev, health: Math.max(0, prev.health - amount) }));
    setDamageFlash(1);
    setTimeout(() => setDamageFlash(0), 200);
  }, []);

  const recordEnemyKill = useCallback((enemyType: string) => {
    setProgression(prev => {
      const newKills = prev.enemiesKilled + 1;
      const newTier = (newKills >= TIER2_KILLS_REQUIRED && prev.structuresBuilt >= TIER2_STRUCTURES_REQUIRED) ? 2 : prev.tier;
      if (newTier > prev.tier) {
        showNotification('⬆️ TIER 2 UNLOCKED — New structures available!');
      }
      return { ...prev, enemiesKilled: newKills, tier: newTier };
    });
  }, [showNotification]);

  const secureArea = useCallback((poiKey: string) => {
    setProgression(prev => {
      if (prev.areasSecured.includes(poiKey)) return prev;
      showNotification(`🏴 Area Secured: ${poiKey.charAt(0).toUpperCase() + poiKey.slice(1)}`);
      return { ...prev, areasSecured: [...prev.areasSecured, poiKey] };
    });
  }, [showNotification]);

  const addLootPickups = useCallback((pickups: LootPickup[]) => {
    setLootPickups(prev => [...prev, ...pickups]);
  }, []);

  const collectLoot = useCallback((id: string) => {
    setLootPickups(prev => {
      const pickup = prev.find(p => p.id === id);
      if (!pickup || pickup.collected) return prev;
      setInventory(inv => ({ ...inv, [pickup.type]: (inv[pickup.type as keyof ResourceInventory] || 0) + pickup.amount }));
      showNotification(`+${pickup.amount} ${pickup.type}`);
      return prev.map(p => p.id === id ? { ...p, collected: true } : p);
    });
  }, [showNotification]);

  const eatFood = useCallback(() => {
    setInventory(prev => {
      if (prev.food <= 0) return prev;
      setSurvival(s => ({
        ...s,
        hunger: Math.min(MAX_HUNGER, s.hunger + 25),
        // HP is combat-only — no healing from food
      }));
      showNotification('🍖 Ate food — hunger restored');
      return { ...prev, food: prev.food - 1 };
    });
  }, [showNotification]);

  const toggleBuildMode = useCallback(() => {
    setBuildMode(prev => !prev);
    setBuildFeedback(null);
  }, []);

  const cycleBuild = useCallback((dir: number) => {
    setSelectedBuildIndex(prev => {
      const availableCount = BUILDABLES.filter(b => b.tier <= progression.tier).length;
      const next = prev + dir;
      if (next < 0) return availableCount - 1;
      if (next >= availableCount) return 0;
      return next;
    });
  }, [progression.tier]);

  const getAvailableBuildables = useCallback((): BuildableConfig[] => {
    return BUILDABLES.filter(b => b.tier <= progression.tier);
  }, [progression.tier]);

  const placeStructure = useCallback((structure: PlacedStructure) => {
    const config = BUILDABLES.find(b => b.type === structure.type);
    if (!config) return;
    setInventory(prev => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(config.cost)) {
        next[key as keyof ResourceInventory] -= val || 0;
      }
      return next;
    });
    setStructures(prev => [...prev, structure]);
    setProgression(prev => {
      const newBuilt = prev.structuresBuilt + 1;
      const newTier = (prev.enemiesKilled >= TIER2_KILLS_REQUIRED && newBuilt >= TIER2_STRUCTURES_REQUIRED) ? 2 : prev.tier;
      if (newTier > prev.tier) {
        showNotification('⬆️ TIER 2 UNLOCKED — New structures available!');
      }
      return { ...prev, structuresBuilt: newBuilt, tier: newTier };
    });
    showNotification(`🔨 Built ${config.label}`);
  }, [showNotification]);

  // Add structure from remote player (no cost deduction)
  const addRemoteStructure = useCallback((structure: PlacedStructure) => {
    setStructures(prev => {
      if (prev.some(s => s.id === structure.id)) return prev;
      return [...prev, structure];
    });
  }, []);

  // Horse actions
  const mountHorse = useCallback(() => {
    setIsMounted(true);
    setHorse(prev => ({ ...prev, state: 'mounted' as const }));
    showNotification('🐴 Mounted — press E to dismount');
    setBuildMode(false);
  }, [showNotification]);

  const dismountHorse = useCallback(() => {
    setIsMounted(false);
    setHorse(prev => ({ ...prev, state: 'waiting' as const }));
    showNotification('🐴 Dismounted');
  }, [showNotification]);

  const callHorse = useCallback(() => {
    if (isMounted) return;
    setHorse(prev => {
      if (prev.state === 'mounted') return prev;
      if (prev.state === 'approaching' || prev.state === 'called') {
        showNotification('🐴 Horse is on the way...');
        return prev;
      }
      showNotification('🐴 Calling horse...');
      return { ...prev, state: 'called' as const };
    });
  }, [isMounted, showNotification]);

  const updateHorse = useCallback((updates: Partial<HorseData>) => {
    setHorse(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    survival, updateSurvival,
    inventory, addResource, eatFood,
    interactionText, setInteractionText,
    gameMode, setGameMode,
    buildMode, toggleBuildMode,
    selectedBuildIndex, cycleBuild,
    structures, placeStructure,
    buildFeedback, setBuildFeedback,
    damageFlash, applyPlayerDamage,
    progression, setProgression, recordEnemyKill, secureArea,
    lootPickups, addLootPickups, collectLoot,
    notification,
    getAvailableBuildables,
    // Horse — single companion
    horse, isMounted,
    mountHorse, dismountHorse, callHorse, updateHorse,
    addRemoteStructure,
  };
}
