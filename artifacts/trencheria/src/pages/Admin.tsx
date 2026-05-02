import { useState, useEffect } from 'react';
import { usePhantomWallet } from '../game/hooks/usePhantomWallet';
import { supabase } from '@/integrations/supabase/client';
import AdminWorldMap from '../admin/AdminWorldMap';

/**
 * Admin page with wallet-based access control.
 * Only wallets in the admin_wallets allowlist with a valid verified session can access.
 */
export default function Admin() {
  const phantom = usePhantomWallet();
  const [checking, setChecking] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [denied, setDenied] = useState(false);

  const handleVerify = async () => {
    setChecking(true);
    setDenied(false);

    const result = await phantom.connect();
    if (!result) {
      setChecking(false);
      return;
    }

    if (!result.sessionToken) {
      setDenied(true);
      setChecking(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('check_admin_status', {
        _wallet_address: result.address,
        _session_token: result.sessionToken,
      } as any);

      if (error || !(data as any)?.is_admin) {
        setDenied(true);
      } else {
        setIsAdmin(true);
      }
    } catch {
      setDenied(true);
    }
    setChecking(false);
  };

  if (isAdmin) {
    return <AdminWorldMap />;
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0a0a14', fontFamily: 'monospace',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ color: '#666', fontSize: 12, letterSpacing: 2 }}>ADMIN ACCESS</div>
      <div style={{ color: '#444', fontSize: 11, maxWidth: 300, textAlign: 'center' }}>
        Connect an authorized Phantom wallet to access the admin panel.
        Wallet must be in the server allowlist.
      </div>
      <button
        onClick={handleVerify}
        disabled={checking || phantom.connecting}
        style={{
          padding: '12px 32px', background: checking ? '#222' : '#333',
          color: '#aaa', border: '1px solid #444', borderRadius: 6,
          cursor: checking ? 'not-allowed' : 'pointer', fontSize: 13,
          fontFamily: 'monospace',
        }}
      >
        {checking ? '⏳ Verifying...' : '🔐 Connect Wallet'}
      </button>
      {phantom.error && (
        <div style={{ color: '#f66', fontSize: 11 }}>{phantom.error}</div>
      )}
      {denied && (
        <div style={{ color: '#f44', fontSize: 11 }}>
          Access denied. Wallet is not authorized for admin access.
        </div>
      )}
    </div>
  );
}
