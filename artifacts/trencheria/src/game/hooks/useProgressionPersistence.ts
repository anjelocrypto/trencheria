/**
 * Hook for saving/loading player progression to/from the database.
 * Now passes session token for authenticated saves.
 */
import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProgressionState } from '../types';
import { loadWalletSession } from './usePlayerAccount';

const SAVE_DEBOUNCE_MS = 30_000;
const SAVE_ON_MILESTONE_MS = 5_000;

export function useProgressionPersistence() {
  const lastSaveRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletRef = useRef<string | null>(null);

  const setWallet = useCallback((wallet: string | null) => {
    walletRef.current = wallet;
  }, []);

  const saveProgression = useCallback(async (progression: ProgressionState, immediate = false) => {
    const wallet = walletRef.current;
    if (!wallet) return;

    const now = Date.now();
    const elapsed = now - lastSaveRef.current;
    const debounce = immediate ? SAVE_ON_MILESTONE_MS : SAVE_DEBOUNCE_MS;

    if (elapsed < debounce && !immediate) {
      if (!saveTimerRef.current) {
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          saveProgression(progression, true);
        }, debounce - elapsed);
      }
      return;
    }

    lastSaveRef.current = now;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const session = loadWalletSession();
      const { error } = await supabase.rpc('save_player_progression', {
        _wallet_address: wallet,
        _enemies_killed: progression.enemiesKilled,
        _structures_built: progression.structuresBuilt,
        _total_wood_gathered: progression.totalWoodGathered,
        _total_stone_gathered: progression.totalStoneGathered,
        _tier: progression.tier,
        _areas_secured: progression.areasSecured,
        _session_token: session?.session_token || undefined,
      } as any);
      if (error) {
        console.warn('[Progression] Save failed:', error.message);
      }
    } catch (err) {
      console.warn('[Progression] Save error:', err);
    }
  }, []);

  const loadProgression = useCallback(async (walletAddress: string): Promise<ProgressionState | null> => {
    try {
      const { data, error } = await supabase.rpc('load_player_progression', {
        _wallet_address: walletAddress,
      });
      if (error || !data) return null;

      const d = data as Record<string, unknown>;
      return {
        enemiesKilled: (d.enemies_killed as number) || 0,
        structuresBuilt: (d.structures_built as number) || 0,
        totalWoodGathered: (d.total_wood_gathered as number) || 0,
        totalStoneGathered: (d.total_stone_gathered as number) || 0,
        tier: (d.tier as number) || 1,
        areasSecured: (d.areas_secured as string[]) || [],
      };
    } catch (err) {
      console.warn('[Progression] Load error:', err);
      return null;
    }
  }, []);

  const flushSave = useCallback(async (progression: ProgressionState) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await saveProgression(progression, true);
  }, [saveProgression]);

  return { setWallet, saveProgression, loadProgression, flushSave };
}
