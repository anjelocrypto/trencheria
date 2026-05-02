/**
 * useTrencheriCoins — Server-authoritative $TRENCHERI coin system.
 * All coin operations require authenticated session tokens.
 * Claims require player position for server-side proximity validation.
 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadWalletSession } from './usePlayerAccount';

export interface TrencheriCoin {
  id: string;
  position: [number, number, number];
  spawnedAt: number;
  amount: number;
  collected: boolean;
  expiresAt: number;
}

const COIN_LIFETIME_MS = 5 * 60 * 1000;
const MAX_LOCAL_COINS = 30;
const SPAWN_INTERVAL_MS = 20_000;
const CLAIM_COOLDOWN_MS = 3500;
const COLLECTION_RADIUS = 3.0;
const FETCH_INTERVAL_MS = 60_000;

export function useTrencheriCoins() {
  const [balance, setBalance] = useState<number | null>(null);
  const [coins, setCoins] = useState<TrencheriCoin[]>([]);
  const lastClaimTimeRef = useRef(0);
  const walletRef = useRef<string | null>(null);
  const balanceLoadedRef = useRef(false);
  const lastIssueTimeRef = useRef(0);

  const loadBalance = useCallback(async () => {
    const session = loadWalletSession();
    if (!session?.wallet_address) {
      setBalance(null);
      walletRef.current = null;
      balanceLoadedRef.current = true;
      return;
    }
    walletRef.current = session.wallet_address;
    try {
      const { data, error } = await supabase.rpc('get_trencheri_balance', {
        _wallet_address: session.wallet_address,
      });
      if (!error && typeof data === 'number') {
        setBalance(data);
      } else {
        setBalance(0);
      }
    } catch {
      setBalance(0);
    }
    balanceLoadedRef.current = true;
  }, []);

  const fetchActiveCoins = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_active_coins', { _limit: 50 });
      if (error || !data) return;

      const serverCoins = data as unknown as Array<{
        id: string; x: number; y: number; z: number;
        amount: number; expires_at: string;
      }>;

      if (!Array.isArray(serverCoins)) return;

      setCoins(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newCoins: TrencheriCoin[] = [];

        for (const sc of serverCoins) {
          if (existingIds.has(sc.id)) continue;
          newCoins.push({
            id: sc.id,
            position: [sc.x, sc.y, sc.z],
            spawnedAt: Date.now(),
            amount: sc.amount,
            collected: false,
            expiresAt: new Date(sc.expires_at).getTime(),
          });
        }

        if (newCoins.length === 0) return prev;
        const alive = prev.filter(c => !c.collected && c.expiresAt > Date.now());
        return [...alive, ...newCoins].slice(0, MAX_LOCAL_COINS);
      });
    } catch {
      // Silent fail
    }
  }, []);

  const issueCoins = useCallback(async (
    positions: Array<{ x: number; y: number; z: number }>
  ): Promise<TrencheriCoin[]> => {
    const wallet = walletRef.current;
    if (!wallet || positions.length === 0) return [];

    const now = Date.now();
    if (now - lastIssueTimeRef.current < SPAWN_INTERVAL_MS * 0.8) return [];
    lastIssueTimeRef.current = now;

    try {
      const session = loadWalletSession();
      if (!session?.session_token) return []; // Session required

      const { data, error } = await supabase.rpc('issue_trencheri_coins', {
        _wallet_address: wallet,
        _positions: positions as any,
        _lifetime_seconds: Math.floor(COIN_LIFETIME_MS / 1000),
        _session_token: session.session_token,
      } as any);

      if (error) return [];

      const result = data as unknown as {
        success: boolean;
        coins?: Array<{ id: string; x: number; y: number; z: number; amount: number; expires_at: string }>;
        error?: string;
      };

      if (!result?.success || !result.coins) return [];

      return result.coins.map(c => ({
        id: c.id,
        position: [c.x, c.y, c.z] as [number, number, number],
        spawnedAt: Date.now(),
        amount: c.amount,
        collected: false,
        expiresAt: new Date(c.expires_at).getTime(),
      }));
    } catch {
      return [];
    }
  }, []);

  /** Claim a coin — now requires player position for proximity validation */
  const claimCoin = useCallback(async (
    coinId: string,
    playerX: number,
    playerZ: number,
  ): Promise<boolean> => {
    const now = Date.now();
    if (now - lastClaimTimeRef.current < CLAIM_COOLDOWN_MS) return false;

    const wallet = walletRef.current;
    if (!wallet) return false;

    const session = loadWalletSession();
    if (!session?.session_token) return false; // Session required

    lastClaimTimeRef.current = now;

    try {
      const { data, error } = await supabase.rpc('claim_trencheri_coin', {
        _wallet_address: wallet,
        _coin_id: coinId,
        _session_token: session.session_token,
        _player_x: playerX,
        _player_z: playerZ,
      } as any);

      if (error) return false;

      const result = data as unknown as { success: boolean; balance?: number; error?: string };
      if (result?.success && typeof result.balance === 'number') {
        setBalance(result.balance);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /** Try to collect a coin at player position — passes position for server proximity check */
  const tryCollectCoin = useCallback(async (
    playerX: number, playerZ: number,
    showNotification: (msg: string) => void,
  ): Promise<string | null> => {
    if (!walletRef.current) return null;

    let closestCoin: TrencheriCoin | null = null;
    let closestDist = COLLECTION_RADIUS * COLLECTION_RADIUS;
    const now = Date.now();

    for (const coin of coins) {
      if (coin.collected) continue;
      if (coin.expiresAt < now) continue;
      const dx = playerX - coin.position[0];
      const dz = playerZ - coin.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq < closestDist) {
        closestDist = distSq;
        closestCoin = coin;
      }
    }

    if (!closestCoin) return null;

    const coinId = closestCoin.id;
    const amount = closestCoin.amount;

    setCoins(prev => prev.map(c => c.id === coinId ? { ...c, collected: true } : c));

    // Pass player position for server-side proximity validation
    const success = await claimCoin(coinId, playerX, playerZ);
    if (success) {
      showNotification(`+${amount} $TRENCHERI`);
      return coinId;
    } else {
      setCoins(prev => prev.map(c => c.id === coinId ? { ...c, collected: false } : c));
      return null;
    }
  }, [coins, claimCoin]);

  const getNearestCoinDistance = useCallback((playerX: number, playerZ: number): number | null => {
    let minDist = Infinity;
    const now = Date.now();
    for (const coin of coins) {
      if (coin.collected || coin.expiresAt < now) continue;
      const dx = playerX - coin.position[0];
      const dz = playerZ - coin.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist) minDist = distSq;
    }
    return minDist < COLLECTION_RADIUS * COLLECTION_RADIUS ? Math.sqrt(minDist) : null;
  }, [coins]);

  const pruneExpired = useCallback(() => {
    const now = Date.now();
    setCoins(prev => {
      const alive = prev.filter(c => !c.collected && c.expiresAt > now);
      return alive.length !== prev.length ? alive : prev;
    });
  }, []);

  return {
    balance,
    coins,
    setCoins,
    loadBalance,
    fetchActiveCoins,
    issueCoins,
    tryCollectCoin,
    getNearestCoinDistance,
    pruneExpired,
    balanceLoaded: balanceLoadedRef.current,
    walletConnected: !!walletRef.current,
    COIN_LIFETIME_MS,
    MAX_LOCAL_COINS,
    SPAWN_INTERVAL_MS,
    FETCH_INTERVAL_MS,
    COLLECTION_RADIUS,
  };
}
