/**
 * Hook for clan & territory system — Phase 2: challenge/war foundation.
 * Handles clan CRUD, membership, territory ownership, challenges, and local state.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadWalletSession } from './usePlayerAccount';

// ========== Types ==========
export interface TerritoryHistoryEntry {
  id: string;
  territory_id: string;
  territory_name: string;
  clan_id: string | null;
  clan_name: string | null;
  clan_color: string | null;
  event_type: string;
  created_at: string;
}
export interface ClanMemberInfo {
  wallet_address: string;
  role: 'leader' | 'member';
  joined_at: string;
  display_name: string;
  character_type: string;
}

export interface ClanInfo {
  id: string;
  name: string;
  color: ClanColor;
  leader_wallet: string;
  member_count: number;
  max_members: number;
  created_at: string;
}

export interface MyClanInfo {
  clan_id: string;
  clan_name: string;
  clan_color: ClanColor;
  role: 'leader' | 'member';
  member_count: number;
  max_members: number;
  leader_wallet: string;
  joined_at: string;
}

export interface TerritoryInfo {
  id: string;
  name: string;
  center_x: number;
  center_z: number;
  radius: number;
  owning_clan_id: string | null;
  owning_clan_name: string | null;
  owning_clan_color: ClanColor | null;
  claimed_at: string | null;
  war_state: 'peaceful' | 'contested' | 'active_war' | 'pending_resolution' | 'cooldown';
}

export interface ChallengeInfo {
  id: string;
  territory_id: string;
  territory_name: string;
  attacker_clan_id: string;
  attacker_clan_name: string;
  attacker_clan_color: string;
  defender_clan_id: string;
  defender_clan_name: string;
  defender_clan_color: string;
  status: 'pending' | 'active' | 'pending_resolution' | 'resolved' | 'cancelled' | 'expired';
  resolution?: string | null;
  war_starts_at: string;
  war_ends_at: string;
  cooldown_ends_at: string;
  created_at: string;
}

export type ClanColor =
  | 'crimson' | 'azure' | 'emerald' | 'gold' | 'violet'
  | 'silver' | 'amber' | 'teal' | 'ivory' | 'obsidian';

// Color hex map for rendering
export const CLAN_COLOR_HEX: Record<ClanColor, string> = {
  crimson:  '#c0392b',
  azure:    '#2980b9',
  emerald:  '#27ae60',
  gold:     '#f39c12',
  violet:   '#8e44ad',
  silver:   '#95a5a6',
  amber:    '#e67e22',
  teal:     '#16a085',
  ivory:    '#ecf0f1',
  obsidian: '#2c3e50',
};

export const CLAN_COLOR_OPTIONS: { value: ClanColor; label: string; hex: string }[] = [
  { value: 'crimson', label: 'Crimson', hex: '#c0392b' },
  { value: 'azure', label: 'Azure', hex: '#2980b9' },
  { value: 'emerald', label: 'Emerald', hex: '#27ae60' },
  { value: 'gold', label: 'Gold', hex: '#f39c12' },
  { value: 'violet', label: 'Violet', hex: '#8e44ad' },
  { value: 'silver', label: 'Silver', hex: '#95a5a6' },
  { value: 'amber', label: 'Amber', hex: '#e67e22' },
  { value: 'teal', label: 'Teal', hex: '#16a085' },
  { value: 'ivory', label: 'Ivory', hex: '#ecf0f1' },
  { value: 'obsidian', label: 'Obsidian', hex: '#2c3e50' },
];

// ========== Helper for session-authenticated RPCs ==========
function getSession() {
  const session = loadWalletSession();
  if (!session?.wallet_address || !session.session_token) return null;
  return session;
}

async function callRpc<T>(name: string, params: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc(name as any, params as any);
    if (error) return { data: null, error: error.message };
    return { data: data as T, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'RPC call failed' };
  }
}

export function useClanSystem() {
  const [myClan, setMyClan] = useState<MyClanInfo | null>(null);
  const [clans, setClans] = useState<ClanInfo[]>([]);
  const [territories, setTerritories] = useState<TerritoryInfo[]>([]);
  const [clanMembers, setClanMembers] = useState<ClanMemberInfo[]>([]);
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [history, setHistory] = useState<TerritoryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // ========== Loaders ==========
  const loadMyClan = useCallback(async () => {
    const session = getSession();
    if (!session) { setMyClan(null); return; }
    try {
      const { data } = await supabase.rpc('get_my_clan', { _wallet_address: session.wallet_address } as any);
      setMyClan(data as unknown as MyClanInfo | null);
    } catch { /* silent */ }
  }, []);

  const loadClans = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_clans' as any, { _limit: 50 });
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setClans(Array.isArray(parsed) ? parsed : []);
    } catch { /* silent */ }
  }, []);

  const loadClanMembers = useCallback(async (clanId?: string) => {
    const id = clanId || myClan?.clan_id;
    if (!id) { setClanMembers([]); return; }
    try {
      const { data } = await supabase.rpc('get_clan_members' as any, { _clan_id: id });
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setClanMembers(Array.isArray(parsed) ? parsed : []);
    } catch { setClanMembers([]); }
  }, [myClan?.clan_id]);

  const loadTerritories = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_territories' as any);
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setTerritories(Array.isArray(parsed) ? parsed : []);
    } catch { /* silent */ }
  }, []);

  const loadChallenges = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_active_challenges' as any, { _limit: 50 });
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setChallenges(Array.isArray(parsed) ? parsed : []);
    } catch { /* silent */ }
  }, []);

  const loadHistory = useCallback(async (territoryId?: string) => {
    try {
      const params: Record<string, unknown> = { _limit: 30 };
      if (territoryId) params._territory_id = territoryId;
      const { data } = await supabase.rpc('get_territory_history' as any, params);
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setHistory(Array.isArray(parsed) ? parsed : []);
    } catch { setHistory([]); }
  }, []);

  // Trigger war-state transitions on backend
  const transitionWarStates = useCallback(async () => {
    try {
      await supabase.rpc('transition_war_states' as any);
    } catch { /* silent */ }
  }, []);

  // Initial load
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadMyClan();
    loadClans();
    loadTerritories();
    loadChallenges();
  }, [loadMyClan, loadClans, loadTerritories, loadChallenges]);

  // Realtime subscription for territory changes — instant TERRA-style updates
  // Debounced to avoid rapid-fire RPC calls when transition_war_states updates multiple rows
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('territory-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'territories' },
        () => {
          // Debounce: batch rapid updates into one reload
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            realtimeDebounceRef.current = null;
            loadTerritories();
            loadChallenges();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadTerritories, loadChallenges]);

  // Fallback poll for challenges every 60s (challenges table not on Realtime)
  // Reduced from 30s — realtime territory sub already triggers loadChallenges on state changes
  useEffect(() => {
    const iv = setInterval(async () => {
      if (document.hidden) return;
      await loadChallenges();
    }, 60000);
    return () => clearInterval(iv);
  }, [loadChallenges]);

  // ========== Mutations ==========
  const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  // NOTE: createClan, joinClan, leaveClan removed — factions are fixed and permanent

  const claimTerritory = useCallback(async (territoryId: string, playerX?: number, playerZ?: number): Promise<boolean> => {
    const session = getSession();
    if (!session) { setError('Wallet session required'); return false; }
    return withLoading(async () => {
      const { data, error: err } = await callRpc<any>('claim_territory', {
        _wallet_address: session.wallet_address, _session_token: session.session_token,
        _territory_id: territoryId, _player_x: playerX ?? null, _player_z: playerZ ?? null,
      });
      if (!data?.success) { setError(data?.error || err || 'Failed'); return false; }
      await loadTerritories();
      return true;
    });
  }, [loadTerritories, withLoading]);

  const releaseTerritory = useCallback(async (territoryId: string): Promise<boolean> => {
    const session = getSession();
    if (!session) { setError('Wallet session required'); return false; }
    return withLoading(async () => {
      const { data, error: err } = await callRpc<any>('release_territory', {
        _wallet_address: session.wallet_address, _session_token: session.session_token, _territory_id: territoryId,
      });
      if (!data?.success) { setError(data?.error || err || 'Failed'); return false; }
      await loadTerritories();
      return true;
    });
  }, [loadTerritories, withLoading]);

  const challengeTerritory = useCallback(async (territoryId: string): Promise<boolean> => {
    const session = getSession();
    if (!session) { setError('Wallet session required'); return false; }
    return withLoading(async () => {
      const { data, error: err } = await callRpc<any>('challenge_territory', {
        _wallet_address: session.wallet_address, _session_token: session.session_token, _territory_id: territoryId,
      });
      if (!data?.success) { setError(data?.error || err || 'Failed'); return false; }
      await Promise.all([loadTerritories(), loadChallenges()]);
      return true;
    });
  }, [loadTerritories, loadChallenges, withLoading]);

  const cancelChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
    const session = getSession();
    if (!session) { setError('Wallet session required'); return false; }
    return withLoading(async () => {
      const { data, error: err } = await callRpc<any>('cancel_challenge', {
        _wallet_address: session.wallet_address, _session_token: session.session_token, _challenge_id: challengeId,
      });
      if (!data?.success) { setError(data?.error || err || 'Failed'); return false; }
      await Promise.all([loadTerritories(), loadChallenges()]);
      return true;
    });
  }, [loadTerritories, loadChallenges, withLoading]);

  // Refresh all
  const refresh = useCallback(async () => {
    await Promise.all([loadMyClan(), loadClans(), loadTerritories(), loadChallenges()]);
  }, [loadMyClan, loadClans, loadTerritories, loadChallenges]);

  return {
    myClan, clans, territories, clanMembers, challenges, history,
    loading, error, setError,
    // createClan, joinClan, leaveClan removed — factions are permanent
    claimTerritory, releaseTerritory,
    challengeTerritory, cancelChallenge,
    loadClanMembers, loadHistory, refresh, loadTerritories, loadChallenges,
    transitionWarStates,
  };
}
