/**
 * Menu UI overlay with Guest / Register (with faction) / Log In flows.
 * Registration requires choosing 1 of 7 permanent factions.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePhantomWallet } from '../hooks/usePhantomWallet';
import { usePlayerAccount, loadWalletSession, clearWalletSession } from '../hooks/usePlayerAccount';
import { useCharacter, CharacterType } from '../context/CharacterContext';
import { sanitizeDisplayName, validateDisplayName, NAME_MIN_LENGTH, NAME_MAX_LENGTH } from '../utils/profanityFilter';
import { FACTIONS, FactionDef } from '../systems/FactionData';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  onEnterWorld: (playerName: string) => Promise<void>;
  isReconnecting: boolean;
}

type MenuMode = 'main' | 'create' | 'login' | 'faction_select';

export function MenuOverlay({ onEnterWorld, isReconnecting }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameValidation, setNameValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('main');
  const [selectedFaction, setSelectedFaction] = useState<FactionDef | null>(null);
  // For login: force faction selection if account has no faction_id
  const [needsFactionMigration, setNeedsFactionMigration] = useState(false);
  const [pendingLoginAccount, setPendingLoginAccount] = useState<any>(null);
  const [pendingSessionToken, setPendingSessionToken] = useState<string>('');

  const phantom = usePhantomWallet();
  const playerAccount = usePlayerAccount();
  const { setCharacter } = useCharacter();

  // Detect mobile/touch devices
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || ('ontouchstart' in window && window.innerWidth < 1024);
  }, []);

  // Check for existing wallet session on mount
  const [walletSession, setWalletSession] = useState(() => loadWalletSession());

  // Sync errors from sub-hooks
  useEffect(() => {
    if (phantom.error) setError(phantom.error);
  }, [phantom.error]);
  useEffect(() => {
    if (playerAccount.error) setError(playerAccount.error);
  }, [playerAccount.error]);

  // Real-time name validation
  const handleNameChange = useCallback((value: string) => {
    setPlayerName(value);
    if (!value.trim()) {
      setNameValidation(null);
      return;
    }
    const result = validateDisplayName(value);
    setNameValidation(result.error);
  }, []);

  // === GUEST FLOW ===
  const handleGuestPlay = async () => {
    const name = sanitizeDisplayName(playerName);
    setBusy(true);
    setError(null);
    try {
      await onEnterWorld(name);
    } catch (err: any) {
      setError(err.message || 'Failed to enter world');
    } finally {
      setBusy(false);
    }
  };

  // === CREATE ACCOUNT — Step 1: Connect wallet, then show faction select ===
  const handleCreateAccount = async () => {
    if (playerName.trim()) {
      const result = validateDisplayName(playerName);
      if (!result.valid) {
        setError(result.error || 'Invalid display name');
        return;
      }
    }

    setBusy(true);
    setError(null);
    const result = await phantom.connect();
    if (!result) {
      setBusy(false);
      return;
    }

    // Store connection info and show faction selection
    setPendingSessionToken(result.sessionToken || '');
    setPendingLoginAccount({ address: result.address });
    setBusy(false);
    setMenuMode('faction_select');
  };

  // === CREATE ACCOUNT — Step 2: Register with chosen faction ===
  const handleRegisterWithFaction = async (faction: FactionDef) => {
    if (!pendingLoginAccount?.address) return;

    setBusy(true);
    setError(null);

    const name = sanitizeDisplayName(playerName);
    const community = communityName.replace(/<[^>]*>/g, '').trim().slice(0, 30) || null;

    // Call register_with_faction RPC.
    // T004: pass the verified wallet session token so the SQL function can
    // reject calls from anyone who knows a wallet address but didn't actually
    // sign in with that wallet.
    const { data, error: rpcError } = await supabase.rpc('register_with_faction' as any, {
      _wallet_address: pendingLoginAccount.address,
      _display_name: name || 'Knight',
      _community_name: community,
      _faction_id: faction.id,
      _session_token: pendingSessionToken,
    });

    if (rpcError) {
      setError(rpcError.message || 'Registration failed');
      setBusy(false);
      return;
    }

    const result = data as any;
    if (!result?.success) {
      setError(result?.error || 'Registration failed');
      setBusy(false);
      return;
    }

    // Now login to get full account data
    const account = await playerAccount.loginAccount(pendingLoginAccount.address, pendingSessionToken);
    if (!account) {
      setBusy(false);
      return;
    }

    setCharacter(faction.characterType);
    try {
      await onEnterWorld(account.display_name);
    } catch (err: any) {
      setError(err.message || 'Failed to enter world');
    } finally {
      setBusy(false);
    }
  };

  // === FACTION MIGRATION for existing accounts without faction ===
  const handleMigrateFaction = async (faction: FactionDef) => {
    if (!pendingLoginAccount) return;

    setBusy(true);
    setError(null);

    // Use register_with_faction RPC which handles:
    // - setting faction_id on player_accounts
    // - creating clan_members entry
    // - setting character_type to match faction
    // T004: pass the verified wallet session token (same migration path as
    // handleRegisterWithFaction above).
    const { data, error: rpcError } = await supabase.rpc('register_with_faction' as any, {
      _wallet_address: pendingLoginAccount.wallet_address,
      _display_name: pendingLoginAccount.display_name || 'Knight',
      _community_name: pendingLoginAccount.community_name || undefined,
      _faction_id: faction.id,
      _session_token: pendingSessionToken,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    const result = data as any;
    if (!result?.success) {
      setError(result?.error || 'Faction migration failed');
      setBusy(false);
      return;
    }

    // Re-login to get updated faction data into session
    const account = await playerAccount.loginAccount(pendingLoginAccount.wallet_address, pendingSessionToken);
    if (!account) {
      setBusy(false);
      return;
    }

    setCharacter(faction.characterType);
    setNeedsFactionMigration(false);

    try {
      await onEnterWorld(account.display_name);
    } catch (err: any) {
      setError(err.message || 'Failed to enter world');
    } finally {
      setBusy(false);
    }
  };

  // === LOGIN FLOW ===
  const handleLogin = async () => {
    setBusy(true);
    setMenuMode('login');
    setError(null);

    const result = await phantom.connect();
    if (!result) {
      setBusy(false);
      return;
    }

    const account = await playerAccount.loginAccount(result.address, result.sessionToken);
    if (!account) {
      setBusy(false);
      return;
    }

    // Check if account has faction_id
    const accountData = account as any;
    if (!accountData.faction_id) {
      // Existing account needs faction migration
      setPendingLoginAccount(accountData);
      setPendingSessionToken(result.sessionToken || '');
      setNeedsFactionMigration(true);
      setMenuMode('faction_select');
      setBusy(false);
      return;
    }

    setPlayerName(account.display_name);
    setCommunityName(account.community_name || '');
    setCharacter(account.character_type as CharacterType);
    // Session is already saved by loginAccount() with faction data
    setWalletSession(loadWalletSession());

    try {
      await onEnterWorld(account.display_name);
    } catch (err: any) {
      setError(err.message || 'Failed to enter world');
    } finally {
      setBusy(false);
    }
  };

  // === CLEAR WALLET SESSION ===
  const handleClearSession = () => {
    clearWalletSession();
    setWalletSession(null);
    phantom.disconnect();
    playerAccount.clearAccount();
    setPlayerName('');
    setCommunityName('');
    setMenuMode('main');
    setSelectedFaction(null);
    setNeedsFactionMigration(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy && menuMode === 'main') {
      handleGuestPlay();
    }
  };

  const isBusy = busy || phantom.connecting || playerAccount.loading;
  const nameHasError = !!nameValidation && !!playerName.trim();

  if (isReconnecting) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="text-center p-8 rounded-2xl" style={{
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div className="text-3xl mb-3" style={{ color: '#e8d5b7' }}>⚔️</div>
          <div className="text-xl font-bold mb-2" style={{ color: '#e8d5b7' }}>Reconnecting...</div>
          <div className="text-sm" style={{ color: '#8a9ab5' }}>Returning to the world</div>
        </div>
      </div>
    );
  }

  // === FACTION SELECTION SCREEN ===
  if (menuMode === 'faction_select') {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }} />
        <div className="relative w-full max-w-3xl mx-4 p-8 rounded-2xl pointer-events-auto"
          style={{
            background: 'rgba(10,10,20,0.95)',
            border: '1px solid rgba(232,213,183,0.2)',
            backdropFilter: 'blur(30px)',
            boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-widest mb-1" style={{
              color: '#e8d5b7', fontFamily: 'Georgia, serif',
            }}>
              {needsFactionMigration ? 'CHOOSE YOUR FACTION' : 'SELECT YOUR FACTION'}
            </h2>
            <p className="text-xs" style={{ color: '#8a9ab5' }}>
              {needsFactionMigration
                ? 'Your account needs a permanent faction. This choice cannot be changed.'
                : 'This choice is permanent and determines your character, home kingdom, and allies.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{
              background: 'rgba(255,60,60,0.1)', color: '#ff8888', border: '1px solid rgba(255,60,60,0.2)',
            }}>
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline opacity-70 hover:opacity-100">dismiss</button>
            </div>
          )}

          <div className="grid grid-cols-7 gap-2 mb-6">
            {FACTIONS.map(f => {
              const isSelected = selectedFaction?.id === f.id;
              const isLocked = !f.available;
              return (
                <button key={f.id}
                  onClick={() => { if (!isLocked) setSelectedFaction(f); }}
                  disabled={isLocked}
                  title={isLocked ? `${f.name} — coming soon (assets in development)` : f.name}
                  className="rounded-xl overflow-hidden text-center transition-all duration-200 p-3"
                  style={{
                    background: isSelected
                      ? `linear-gradient(180deg, ${f.colorHex}25, ${f.colorHex}10)`
                      : 'rgba(255,255,255,0.03)',
                    border: isSelected ? `2px solid ${f.colorHex}` : '2px solid rgba(255,255,255,0.08)',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    transform: isSelected ? 'translateY(-4px)' : 'none',
                    boxShadow: isSelected ? `0 8px 30px ${f.colorHex}30` : 'none',
                    opacity: isLocked ? 0.45 : 1,
                    filter: isLocked ? 'grayscale(0.7)' : 'none',
                  }}>
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="text-xs font-bold tracking-wide mb-0.5" style={{
                    color: isSelected ? f.colorHex : 'rgba(255,255,255,0.6)',
                  }}>{f.name}</div>
                  <div className="w-4 h-4 rounded-full mx-auto mb-1" style={{ background: f.colorHex }} />
                  <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {f.kingdomName}
                  </div>
                  {isLocked && (
                    <div className="text-[7px] mt-1 px-1 py-0.5 rounded" style={{
                      background: 'rgba(255,200,0,0.1)', color: '#cc9900', border: '1px solid rgba(255,200,0,0.2)',
                    }}>Coming Soon</div>
                  )}
                  {isSelected && (
                    <div className="text-[8px] mt-1 font-bold uppercase tracking-widest" style={{ color: '#66cc66' }}>
                      ✓ Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedFaction && (
            <div className="mb-4 px-4 py-3 rounded-lg" style={{
              background: `${selectedFaction.colorHex}08`,
              border: `1px solid ${selectedFaction.colorHex}30`,
            }}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xl">{selectedFaction.icon}</span>
                <span className="font-bold text-sm" style={{ color: selectedFaction.colorHex }}>{selectedFaction.name}</span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>→ {selectedFaction.kingdomName}</span>
              </div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Character: {selectedFaction.characterType} · Home spawn: {selectedFaction.kingdomName}
                {!selectedFaction.available && ' · ⚠️ Placeholder character until assets are ready'}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setMenuMode('main'); setSelectedFaction(null); setNeedsFactionMigration(false); }}
              className="px-6 py-3 rounded-lg text-sm font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9ab5', border: '1px solid rgba(255,255,255,0.1)' }}>
              Back
            </button>
            <button
              onClick={() => {
                if (!selectedFaction) return;
                if (needsFactionMigration) handleMigrateFaction(selectedFaction);
                else handleRegisterWithFaction(selectedFaction);
              }}
              disabled={!selectedFaction || isBusy}
              className="flex-1 py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-50"
              style={{
                background: selectedFaction
                  ? `linear-gradient(135deg, ${selectedFaction.colorHex}, ${selectedFaction.colorHex}aa)`
                  : 'rgba(255,255,255,0.05)',
                color: '#fff',
                boxShadow: selectedFaction ? `0 4px 20px ${selectedFaction.colorHex}40` : 'none',
              }}>
              {isBusy ? '⏳ Registering...' : needsFactionMigration ? 'Confirm Faction' : 'Register & Enter World'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === MAIN MENU ===
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e8d5b7',
  };
  const labelStyle: React.CSSProperties = { color: '#8a9ab5' };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
      }} />

      <div className="relative w-full max-w-md mx-4 p-8 rounded-2xl pointer-events-auto"
        style={{
          background: 'rgba(10,10,20,0.85)',
          border: '1px solid rgba(232,213,183,0.2)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>

        {/* Mobile warning */}
        {isMobile && (
          <div className="mb-4 px-4 py-3 rounded-lg text-xs text-center" style={{
            background: 'rgba(255,160,0,0.1)',
            color: '#ffaa44',
            border: '1px solid rgba(255,160,0,0.25)',
          }}>
            ⚠️ Trencheria is designed for desktop browsers with keyboard & mouse.
            Mobile experience is not yet supported.
          </div>
        )}

        {/* Alpha badge */}
        <div className="mb-4 text-center">
          <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full" style={{
            background: 'rgba(232,168,56,0.1)',
            color: '#d4a854',
            border: '1px solid rgba(232,168,56,0.2)',
          }}>
            Alpha Preview
          </span>
        </div>

        <div className="text-center mb-6">
          <div className="text-5xl mb-2" style={{
            color: '#e8d5b7',
            textShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 60px rgba(232,213,183,0.2)',
          }}>⚔️</div>
          <h1 className="text-3xl font-bold tracking-widest mb-1" style={{
            color: '#e8d5b7',
            textShadow: '0 2px 15px rgba(0,0,0,0.8)',
            fontFamily: 'Georgia, serif',
          }}>TRENCHERIA</h1>
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: '#8a9ab5' }}>
            7 Factions · Shared Online World
          </p>
        </div>

        {/* Wallet session indicator */}
        {walletSession && (
          <div className="mb-4 px-4 py-3 rounded-lg flex items-center justify-between" style={{
            background: 'rgba(120,200,120,0.08)',
            border: '1px solid rgba(120,200,120,0.2)',
          }}>
            <div>
              <div className="text-xs font-bold" style={{ color: '#88cc88' }}>
                🔗 Wallet Account {walletSession.session_token ? '✓' : ''}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#8a9ab5' }}>
                {walletSession.display_name}
              </div>
            </div>
            <button
              onClick={handleClearSession}
              className="text-xs px-2 py-1 rounded"
              style={{ color: '#aa6666', background: 'rgba(170,100,100,0.1)' }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Name input */}
        <div className="mb-3">
          <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={labelStyle}>
            Display Name
          </label>
          <input
            value={playerName}
            onChange={e => handleNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Choose your name (2–20 chars)..."
            maxLength={NAME_MAX_LENGTH}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
            style={{
              ...inputStyle,
              border: nameHasError
                ? '1px solid rgba(255,80,80,0.4)'
                : inputStyle.border,
            }}
          />
          <div className="flex justify-between mt-1 px-1">
            <span style={{
              fontSize: 10,
              color: nameHasError ? 'hsl(0,60%,60%)' : 'rgba(138,154,181,0.5)',
            }}>
              {nameHasError ? `⚠️ ${nameValidation}` : `${playerName.trim().length}/${NAME_MAX_LENGTH}`}
            </span>
            {!playerName.trim() && (
              <span style={{ fontSize: 10, color: 'rgba(138,154,181,0.4)' }}>
                Default: Knight
              </span>
            )}
          </div>
        </div>

        {/* Community Name */}
        <div className="mb-5">
          <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={labelStyle}>
            Community Name <span className="font-normal opacity-60">(optional)</span>
          </label>
          <input
            value={communityName}
            onChange={e => setCommunityName(e.target.value)}
            placeholder="Your guild or group..."
            maxLength={30}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
            style={inputStyle}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{
            background: 'rgba(255,60,60,0.1)',
            color: '#ff8888',
            border: '1px solid rgba(255,60,60,0.2)',
          }}>
            {error}
            <button
              onClick={() => { setError(null); playerAccount.setError(null); }}
              className="ml-2 underline opacity-70 hover:opacity-100"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGuestPlay}
            disabled={isBusy}
            className="w-full py-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(135deg, #e8a838 0%, #c47f17 100%)',
              color: '#1a1a2e',
              boxShadow: '0 4px 20px rgba(232,168,56,0.3)',
              fontSize: '1rem',
            }}
          >
            {isBusy && menuMode === 'main' ? '⏳ Connecting...' : 'Play as Guest'}
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleCreateAccount}
              disabled={isBusy || nameHasError}
              className="flex-1 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{
                background: 'rgba(138,100,200,0.15)',
                color: '#b088e0',
                border: '1px solid rgba(138,100,200,0.3)',
              }}
            >
              {isBusy && menuMode === 'create' ? '⏳...' : 'Create Account'}
            </button>
            <button
              onClick={handleLogin}
              disabled={isBusy}
              className="flex-1 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{
                background: 'rgba(100,160,220,0.12)',
                color: '#88bbee',
                border: '1px solid rgba(100,160,220,0.25)',
              }}
            >
              {isBusy && menuMode === 'login' ? '⏳...' : 'Log In'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: '#444' }}>
          Guest — play instantly · Wallet — permanent faction & saved profile
        </p>
        <p className="text-center text-xs mt-1" style={{ color: '#333' }}>
          Requires <a href="https://phantom.app" target="_blank" rel="noopener" style={{ color: '#7768ae' }}>Phantom wallet</a> for account features
        </p>
      </div>
    </div>
  );
}
