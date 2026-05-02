/**
 * Hook for wallet-based player account management via RPCs.
 * Includes faction_id in session for spawn/PvP identity.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlayerAccount {
  id: string;
  wallet_address: string;
  display_name: string;
  community_name: string | null;
  character_type: string;
  last_position_x: number | null;
  last_position_y: number | null;
  last_position_z: number | null;
  created_at: string;
  faction_id?: string | null;
  faction_name?: string | null;
  faction_color?: string | null;
}

const WALLET_SESSION_KEY = 'wallet_account_session';

export interface WalletSession {
  wallet_address: string;
  display_name: string;
  community_name: string | null;
  character_type: string;
  account_id: string;
  session_token: string;
  faction_id: string | null;
  faction_name: string | null;
  faction_color: string | null;
}

function saveWalletSession(session: WalletSession) {
  localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
}

export function loadWalletSession(): WalletSession | null {
  try {
    const raw = localStorage.getItem(WALLET_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearWalletSession() {
  localStorage.removeItem(WALLET_SESSION_KEY);
  localStorage.removeItem('wallet_session_token');
}

export function usePlayerAccount() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<PlayerAccount | null>(null);

  const createAccount = useCallback(async (
    walletAddress: string,
    displayName: string,
    communityName: string | null,
    characterType: string,
    sessionToken?: string,
  ): Promise<PlayerAccount | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_wallet_account', {
        _wallet_address: walletAddress,
        _display_name: displayName || 'Knight',
        _community_name: communityName || undefined,
        _character_type: characterType || 'goblin',
      });

      if (rpcError) {
        const msg = rpcError.message || 'Failed to create account';
        if (msg.includes('Account already exists')) {
          setError('An account already exists for this wallet. Try "Log In" instead.');
        } else {
          setError(msg);
        }
        setLoading(false);
        return null;
      }

      const loginResult = await loginAccount(walletAddress, sessionToken);
      setLoading(false);
      return loginResult;
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
      setLoading(false);
      return null;
    }
  }, []);

  const loginAccount = useCallback(async (
    walletAddress: string,
    sessionToken?: string,
  ): Promise<PlayerAccount | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('login_wallet_account', {
        _wallet_address: walletAddress,
      });

      if (rpcError) {
        const msg = rpcError.message || 'Failed to log in';
        if (msg.includes('No account found')) {
          setError('No account found for this wallet. Try "Create Account" first.');
        } else {
          setError(msg);
        }
        setLoading(false);
        return null;
      }

      // login_wallet_account returns JSON with faction_id, faction_name, faction_color
      const raw = data as any;
      const profile: PlayerAccount = {
        id: raw.id,
        wallet_address: raw.wallet_address,
        display_name: raw.display_name,
        community_name: raw.community_name,
        character_type: raw.character_type,
        last_position_x: raw.last_position_x,
        last_position_y: raw.last_position_y,
        last_position_z: raw.last_position_z,
        created_at: raw.created_at,
        faction_id: raw.faction_id || null,
        faction_name: raw.faction_name || null,
        faction_color: raw.faction_color || null,
      };
      setAccount(profile);

      // Resolve session token
      let token = sessionToken || '';
      if (!token) {
        try {
          const stored = localStorage.getItem('wallet_session_token');
          if (stored) token = stored;
        } catch {}
      }
      
      saveWalletSession({
        wallet_address: profile.wallet_address,
        display_name: profile.display_name,
        community_name: profile.community_name,
        character_type: profile.character_type,
        account_id: profile.id,
        session_token: token,
        faction_id: profile.faction_id || null,
        faction_name: profile.faction_name || null,
        faction_color: profile.faction_color || null,
      });

      setLoading(false);
      return profile;
    } catch (err: any) {
      setError(err.message || 'Failed to log in');
      setLoading(false);
      return null;
    }
  }, []);

  const updatePosition = useCallback(async (
    walletAddress: string,
    x: number, y: number, z: number,
  ) => {
    try {
      const session = loadWalletSession();
      await supabase.rpc('update_wallet_last_position', {
        _wallet_address: walletAddress,
        _last_position_x: x,
        _last_position_y: y,
        _last_position_z: z,
        _session_token: session?.session_token || undefined,
      } as any);
    } catch {
      // Silent fail for position updates — non-critical
    }
  }, []);

  const updateProfile = useCallback(async (
    walletAddress: string,
    updates: { displayName?: string; communityName?: string },
  ) => {
    setError(null);
    try {
      const session = loadWalletSession();
      // NOTE: character_type changes are blocked — faction is permanent
      const { error: rpcError } = await supabase.rpc('update_wallet_profile', {
        _wallet_address: walletAddress,
        _display_name: updates.displayName || undefined,
        _community_name: updates.communityName || undefined,
        _session_token: session?.session_token || undefined,
      } as any);

      if (rpcError) {
        setError(rpcError.message);
        return false;
      }
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const clearAccount = useCallback(() => {
    setAccount(null);
    setError(null);
    clearWalletSession();
  }, []);

  return {
    account,
    loading,
    error,
    setError,
    createAccount,
    loginAccount,
    updatePosition,
    updateProfile,
    clearAccount,
  };
}
