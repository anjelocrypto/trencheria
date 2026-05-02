/**
 * Hook for Phantom wallet connection with cryptographic signature verification.
 * Does NOT auto-connect on page load — user must explicitly click Connect.
 * On connect, signs a nonce message and verifies via backend edge function.
 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PhantomWallet {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sessionToken: string | null;
  connect: () => Promise<{ address: string; sessionToken: string } | null>;
  disconnect: () => void;
}

const SESSION_TOKEN_KEY = 'wallet_session_token';

function getProvider(): any | null {
  if (typeof window !== 'undefined' && (window as any).solana?.isPhantom) {
    return (window as any).solana;
  }
  return null;
}

function loadStoredToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {}
}

export function usePhantomWallet(): PhantomWallet {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(loadStoredToken);
  const providerRef = useRef<any>(null);

  const connect = useCallback(async (): Promise<{ address: string; sessionToken: string } | null> => {
    setError(null);
    setConnecting(true);

    const provider = getProvider();
    if (!provider) {
      setError('Phantom wallet not found. Please install the Phantom browser extension.');
      setConnecting(false);
      return null;
    }

    try {
      const resp = await provider.connect();
      const walletAddress = resp.publicKey.toString();
      providerRef.current = provider;
      setPublicKey(walletAddress);
      setConnected(true);

      // Sign a nonce message for cryptographic verification
      const nonce = crypto.randomUUID();
      const message = `Sign in to Trencheria: ${nonce}`;
      const encodedMessage = new TextEncoder().encode(message);
      
      let signatureResult: Uint8Array;
      try {
        const signed = await provider.signMessage(encodedMessage, 'utf8');
        signatureResult = signed.signature;
      } catch (signErr: any) {
        // User rejected signature
        setError('Signature required for secure login');
        setConnecting(false);
        try { provider.disconnect(); } catch {}
        setPublicKey(null);
        setConnected(false);
        return null;
      }

      // Convert signature to base64 for transport
      const signatureBase64 = btoa(String.fromCharCode(...signatureResult));

      // Verify signature via edge function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'verify-wallet',
        {
          body: {
            wallet_address: walletAddress,
            signature: signatureBase64,
            message,
          },
        }
      );

      if (verifyError) {
        // Edge function call failed - still allow connection but without session
        // This handles the case where account doesn't exist yet (create flow)
        setConnecting(false);
        return { address: walletAddress, sessionToken: '' };
      }

      if (verifyData?.session_token) {
        const token = verifyData.session_token;
        setSessionToken(token);
        storeToken(token);
        setConnecting(false);
        return { address: walletAddress, sessionToken: token };
      }

      // No session token but connection succeeded (e.g., new account)
      setConnecting(false);
      return { address: walletAddress, sessionToken: '' };
    } catch (err: any) {
      const msg = err?.message || 'Failed to connect Phantom wallet';
      if (err?.code === 4001 || msg.includes('User rejected')) {
        setError('Connection cancelled');
      } else {
        setError(msg);
      }
      setConnecting(false);
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (providerRef.current) {
      try { providerRef.current.disconnect(); } catch {}
      providerRef.current = null;
    }
    setPublicKey(null);
    setConnected(false);
    setError(null);
    setSessionToken(null);
    storeToken(null);
  }, []);

  return { publicKey, connected, connecting, error, sessionToken, connect, disconnect };
}
