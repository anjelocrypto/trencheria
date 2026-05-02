/**
 * In-game Settings panel for managing display name, community name, and account info.
 * Wallet users can edit; guests see a locked state.
 * Opens with P key, styled to match Trencheria's medieval aesthetic.
 */
import { useState, useEffect, useCallback } from 'react';
import { loadWalletSession, WalletSession } from '../hooks/usePlayerAccount';
import { supabase } from '@/integrations/supabase/client';
import { validateDisplayName, NAME_MIN_LENGTH, NAME_MAX_LENGTH } from '../utils/profanityFilter';

interface Props {
  open: boolean;
  onClose: () => void;
  currentDisplayName: string;
  onNameUpdated: (newName: string) => void;
  currentCommunityName?: string | null;
  onCommunityUpdated?: (newCommunity: string | null) => void;
}

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(160deg, hsla(0,0%,6%,0.97), hsla(0,0%,10%,0.97))',
  border: '1px solid hsla(40,30%,35%,0.5)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.8), inset 0 1px 0 hsla(40,30%,50%,0.1)',
  backdropFilter: 'blur(20px)',
};

export function SettingsPanel({ open, onClose, currentDisplayName, onNameUpdated, currentCommunityName, onCommunityUpdated }: Props) {
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [communityInput, setCommunityInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load wallet session on open
  useEffect(() => {
    if (open) {
      const session = loadWalletSession();
      setWalletSession(session);
      setNameInput(currentDisplayName);
      setCommunityInput(currentCommunityName || session?.community_name || '');
      setNameError(null);
      setSaveSuccess(false);
    }
  }, [open, currentDisplayName, currentCommunityName]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  // Real-time validation
  const handleNameChange = useCallback((value: string) => {
    setNameInput(value);
    setSaveSuccess(false);
    if (!value.trim()) {
      setNameError(null);
      return;
    }
    const result = validateDisplayName(value);
    setNameError(result.error);
  }, []);

  const handleSave = useCallback(async () => {
    if (!walletSession) return;

    const result = validateDisplayName(nameInput);
    if (!result.valid) {
      setNameError(result.error);
      return;
    }

    const cleanedCommunity = communityInput.replace(/<[^>]*>/g, '').trim().slice(0, 30) || null;
    const nameUnchanged = result.cleaned === currentDisplayName;
    const communityUnchanged = (cleanedCommunity || null) === (currentCommunityName || walletSession.community_name || null);

    if (nameUnchanged && communityUnchanged) {
      setNameError(null);
      setSaveSuccess(true);
      return;
    }

    setSaving(true);
    setNameError(null);
    setSaveSuccess(false);

    try {
      const { error: rpcError } = await supabase.rpc('update_wallet_profile', {
        _wallet_address: walletSession.wallet_address,
        _display_name: nameUnchanged ? undefined : result.cleaned,
        _community_name: communityUnchanged ? undefined : (cleanedCommunity || ''),
        _session_token: walletSession.session_token,
      } as any);

      if (rpcError) {
        setNameError(rpcError.message || 'Failed to update profile');
        setSaving(false);
        return;
      }

      // Update local session storage
      const updatedSession: WalletSession = {
        ...walletSession,
        display_name: result.cleaned,
        community_name: cleanedCommunity,
      };
      localStorage.setItem('wallet_account_session', JSON.stringify(updatedSession));
      setWalletSession(updatedSession);

      // Propagate to game
      if (!nameUnchanged) onNameUpdated(result.cleaned);
      if (!communityUnchanged && onCommunityUpdated) onCommunityUpdated(cleanedCommunity);
      setSaveSuccess(true);
    } catch (err: any) {
      setNameError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [walletSession, nameInput, communityInput, currentDisplayName, currentCommunityName, onNameUpdated, onCommunityUpdated]);

  if (!open) return null;

  const isWalletUser = !!walletSession?.wallet_address;
  const hasValidSession = !!walletSession?.session_token;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-8 max-w-lg w-full mx-4"
        style={panelStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold tracking-wide" style={{ color: 'hsl(40,50%,88%)' }}>
              ⚙️ SETTINGS
            </h2>
            <p className="text-xs mt-1" style={{ color: 'hsl(40,15%,45%)' }}>
              Press ESC to close
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{
              background: 'hsla(0,0%,100%,0.05)',
              color: 'hsl(40,15%,55%)',
              border: '1px solid hsla(0,0%,100%,0.1)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Account Status */}
        <div className="mb-6 px-4 py-3 rounded-lg" style={{
          background: isWalletUser
            ? 'hsla(120,30%,40%,0.08)'
            : 'hsla(40,30%,40%,0.08)',
          border: isWalletUser
            ? '1px solid hsla(120,30%,50%,0.2)'
            : '1px solid hsla(40,30%,45%,0.2)',
        }}>
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: isWalletUser ? 'hsl(120,40%,60%)' : 'hsl(40,30%,55%)',
            }}>
              {isWalletUser ? '🔗 Wallet Account' : '👤 Guest Session'}
            </span>
            {hasValidSession && (
              <span style={{
                fontSize: 8,
                fontWeight: 600,
                color: 'hsl(120,40%,50%)',
                background: 'hsla(120,40%,50%,0.1)',
                padding: '1px 6px',
                borderRadius: 3,
              }}>
                VERIFIED
              </span>
            )}
          </div>
          {isWalletUser && (
            <div className="text-xs mt-1 font-mono" style={{ color: 'hsl(40,15%,40%)' }}>
              {walletSession!.wallet_address.slice(0, 6)}...{walletSession!.wallet_address.slice(-4)}
            </div>
          )}
        </div>

        {isWalletUser && hasValidSession ? (
          <>
            {/* Display Name Section */}
            <div className="mb-4">
              <label
                className="block text-xs font-bold mb-2 uppercase tracking-wider"
                style={{ color: 'hsl(40,20%,65%)' }}
              >
                Display Name
              </label>
              <input
                value={nameInput}
                onChange={e => handleNameChange(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleSave();
                }}
                onKeyUp={e => e.stopPropagation()}
                placeholder="Enter display name..."
                maxLength={NAME_MAX_LENGTH}
                disabled={saving}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
                style={{
                  background: 'hsla(0,0%,100%,0.06)',
                  border: nameError
                    ? '1px solid hsla(0,60%,50%,0.5)'
                    : '1px solid hsla(0,0%,100%,0.1)',
                  color: 'hsl(40,30%,85%)',
                }}
              />
              <div className="flex justify-between mt-1.5 px-1">
                <span style={{
                  fontSize: 10,
                  color: nameInput.trim().length < NAME_MIN_LENGTH
                    ? 'hsl(0,50%,55%)'
                    : 'hsl(40,15%,40%)',
                }}>
                  {nameInput.trim().length}/{NAME_MAX_LENGTH} characters (min {NAME_MIN_LENGTH})
                </span>
              </div>
            </div>

            {/* Community Name Section */}
            <div className="mb-5">
              <label
                className="block text-xs font-bold mb-2 uppercase tracking-wider"
                style={{ color: 'hsl(40,20%,65%)' }}
              >
                Community Name <span className="font-normal" style={{ color: 'hsl(40,15%,40%)' }}>(optional)</span>
              </label>
              <input
                value={communityInput}
                onChange={e => { setCommunityInput(e.target.value); setSaveSuccess(false); }}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleSave();
                }}
                onKeyUp={e => e.stopPropagation()}
                placeholder="Your guild or group..."
                maxLength={30}
                disabled={saving}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all focus:ring-2"
                style={{
                  background: 'hsla(0,0%,100%,0.06)',
                  border: '1px solid hsla(0,0%,100%,0.1)',
                  color: 'hsl(40,30%,85%)',
                }}
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !!nameError || !nameInput.trim()}
              className="w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 mb-4"
              style={{
                background: saving
                  ? 'hsla(40,30%,40%,0.2)'
                  : 'linear-gradient(135deg, hsl(35,60%,45%), hsl(30,50%,35%))',
                color: saving ? 'hsl(40,15%,50%)' : 'hsl(40,30%,90%)',
                border: '1px solid hsla(40,30%,50%,0.3)',
              }}
            >
              {saving ? '⏳ Saving...' : 'Save Changes'}
            </button>

            {/* Validation error */}
            {nameError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{
                background: 'hsla(0,50%,40%,0.1)',
                color: 'hsl(0,60%,65%)',
                border: '1px solid hsla(0,50%,50%,0.2)',
              }}>
                ⚠️ {nameError}
              </div>
            )}

            {/* Success feedback */}
            {saveSuccess && !nameError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{
                background: 'hsla(120,40%,40%,0.1)',
                color: 'hsl(120,50%,65%)',
                border: '1px solid hsla(120,40%,50%,0.2)',
              }}>
                ✓ Profile updated successfully
              </div>
            )}
          </>
        ) : (
          /* Guest locked state */
          <div className="mb-6 px-4 py-4 rounded-lg text-center" style={{
            background: 'hsla(0,0%,100%,0.03)',
            border: '1px dashed hsla(0,0%,100%,0.1)',
          }}>
            <div className="text-sm mb-2" style={{ color: 'hsl(40,20%,65%)' }}>
              {currentDisplayName}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'hsl(40,15%,40%)' }}>
              🔒 Connect a Phantom wallet and register an account to manage your permanent display name and community tag
            </p>
          </div>
        )}

        {/* Name Rules Info */}
        <div className="px-4 py-3 rounded-lg" style={{
          background: 'hsla(0,0%,100%,0.02)',
          border: '1px solid hsla(0,0%,100%,0.05)',
        }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'hsl(40,15%,45%)',
            marginBottom: 6,
          }}>
            Name Rules
          </div>
          <ul className="space-y-1">
            {[
              `${NAME_MIN_LENGTH}–${NAME_MAX_LENGTH} characters`,
              'Letters, numbers, spaces, hyphens, underscores, periods',
              'No profanity or offensive content',
              'Reserved names (Admin, Moderator, etc.) are blocked',
              '"Knight" is allowed (it is the default name)',
            ].map((rule, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'hsl(40,15%,40%)' }}>
                <span style={{ color: 'hsl(40,30%,50%)' }}>•</span> {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
