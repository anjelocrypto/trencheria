/**
 * Edge Function: verify-wallet
 * 
 * Verifies Phantom wallet ownership via Ed25519 signature verification.
 * Flow:
 * 1. Client signs a nonce message with Phantom wallet
 * 2. This function verifies the signature using tweetnacl
 * 3. On success, creates a secure session token via create_wallet_session RPC
 * 4. Returns the session token for use in subsequent authenticated RPCs
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Base58 decoder (Solana public keys are base58-encoded)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character: " + c);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet_address, signature, message } = await req.json();

    if (!wallet_address || !signature || !message) {
      return new Response(
        JSON.stringify({ error: "Missing wallet_address, signature, or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate wallet address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet_address)) {
      return new Response(
        JSON.stringify({ error: "Invalid wallet address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate message format (must start with our prefix to prevent replay from other dapps)
    if (!message.startsWith("Sign in to Trencheria:")) {
      return new Response(
        JSON.stringify({ error: "Invalid message format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode the public key from base58
    const publicKeyBytes = decodeBase58(wallet_address);
    if (publicKeyBytes.length !== 32) {
      return new Response(
        JSON.stringify({ error: "Invalid public key length" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode signature from base64
    let signatureBytes: Uint8Array;
    try {
      const raw = atob(signature);
      signatureBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        signatureBytes[i] = raw.charCodeAt(i);
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid signature encoding" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (signatureBytes.length !== 64) {
      return new Response(
        JSON.stringify({ error: "Invalid signature length" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Encode message to bytes
    const messageBytes = new TextEncoder().encode(message);

    // Verify Ed25519 signature
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Signature verification failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Signature is valid — create a session token via the DB function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: sessionToken, error: dbError } = await supabase.rpc(
      "create_wallet_session",
      { _wallet_address: wallet_address }
    );

    if (dbError) {
      console.error("[verify-wallet] DB error:", dbError.message);
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, session_token: sessionToken }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[verify-wallet] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
