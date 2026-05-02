
-- =============================================
-- Server-issued coin registry
-- Coins are created by issue_trencheri_coins RPC, NOT by clients.
-- Each coin has a DB row with position, expiry, and claim status.
-- =============================================

CREATE TABLE public.active_coins (
  id text PRIMARY KEY,  -- server-generated: 'sc_' || gen_random_uuid()
  position_x double precision NOT NULL,
  position_y double precision NOT NULL,
  position_z double precision NOT NULL,
  amount integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  claimed_by text DEFAULT NULL,  -- wallet_address of claimer
  claimed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_coins ENABLE ROW LEVEL SECURITY;

-- Public read so clients can fetch active coins near them
CREATE POLICY "public_read_active_coins" ON public.active_coins
  FOR SELECT TO public USING (true);

-- No direct insert/update/delete from clients
CREATE POLICY "deny_direct_mutation_coins" ON public.active_coins
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Index for unclaimed + unexpired lookup
CREATE INDEX idx_active_coins_unclaimed ON public.active_coins (expires_at)
  WHERE claimed_by IS NULL;

-- =============================================
-- RPC: Issue new coins (called by client, but server controls ID + expiry)
-- Returns the issued coins so client knows positions.
-- Rate limited: max 3 coins per call, must have valid wallet.
-- =============================================
CREATE OR REPLACE FUNCTION public.issue_trencheri_coins(
  _wallet_address text,
  _positions jsonb,  -- array of {x, y, z}
  _lifetime_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _pos jsonb;
  _coin_id text;
  _issued jsonb := '[]'::jsonb;
  _active_count integer;
  _expires timestamptz;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Limit positions array size (max 3 per call)
  IF jsonb_array_length(coalesce(_positions, '[]'::jsonb)) > 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many coins requested');
  END IF;

  IF jsonb_array_length(coalesce(_positions, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No positions');
  END IF;

  -- Check total unclaimed coins globally (prevent flooding)
  SELECT count(*) INTO _active_count
  FROM public.active_coins
  WHERE claimed_by IS NULL AND expires_at > now();

  IF _active_count >= 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many active coins globally');
  END IF;

  _expires := now() + (_lifetime_seconds * interval '1 second');

  FOR _pos IN SELECT * FROM jsonb_array_elements(_positions)
  LOOP
    _coin_id := 'sc_' || gen_random_uuid();
    
    INSERT INTO public.active_coins (id, position_x, position_y, position_z, amount, expires_at)
    VALUES (
      _coin_id,
      (_pos->>'x')::double precision,
      (_pos->>'y')::double precision,
      (_pos->>'z')::double precision,
      1,
      _expires
    );

    _issued := _issued || jsonb_build_object(
      'id', _coin_id,
      'x', (_pos->>'x')::double precision,
      'y', (_pos->>'y')::double precision,
      'z', (_pos->>'z')::double precision,
      'amount', 1,
      'expires_at', _expires
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'coins', _issued);
END;
$$;

-- =============================================
-- RPC: Claim coin — now validates against active_coins registry
-- Replaces old claim_trencheri_coin with real server authority.
-- Includes per-wallet rate limiting: max 1 claim per 3 seconds.
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_trencheri_coin(
  _wallet_address text,
  _coin_id text,
  _amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _coin_row public.active_coins;
  _last_claim timestamptz;
  _new_balance integer;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Server-side rate limit: check last claim time for this wallet
  SELECT max(claimed_at) INTO _last_claim
  FROM public.active_coins
  WHERE claimed_by = _clean_wallet;

  IF _last_claim IS NOT NULL AND _last_claim > now() - interval '3 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rate limited');
  END IF;

  -- Look up the coin in the server registry
  SELECT * INTO _coin_row
  FROM public.active_coins
  WHERE id = _coin_id
  FOR UPDATE;  -- lock row to prevent race conditions

  IF _coin_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coin not found');
  END IF;

  IF _coin_row.claimed_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  IF _coin_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coin expired');
  END IF;

  -- Mark coin as claimed
  UPDATE public.active_coins
  SET claimed_by = _clean_wallet, claimed_at = now()
  WHERE id = _coin_id;

  -- Also log in coin_claims for audit trail
  INSERT INTO public.coin_claims (wallet_address, coin_id)
  VALUES (_clean_wallet, _coin_id)
  ON CONFLICT (coin_id) DO NOTHING;

  -- Upsert balance
  INSERT INTO public.player_balances (wallet_address, trencheri_balance, total_coins_collected)
  VALUES (_clean_wallet, _coin_row.amount, _coin_row.amount)
  ON CONFLICT (wallet_address)
  DO UPDATE SET
    trencheri_balance = player_balances.trencheri_balance + _coin_row.amount,
    total_coins_collected = player_balances.total_coins_collected + _coin_row.amount,
    updated_at = now();

  SELECT trencheri_balance INTO _new_balance
  FROM public.player_balances
  WHERE wallet_address = _clean_wallet;

  RETURN jsonb_build_object('success', true, 'balance', _new_balance);
END;
$$;

-- =============================================
-- RPC: Fetch active (unclaimed, unexpired) coins for client rendering
-- Returns coins within a region (or all if under limit)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_active_coins(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'x', position_x,
      'y', position_y,
      'z', position_z,
      'amount', amount,
      'expires_at', expires_at
    )
  ), '[]'::jsonb)
  FROM (
    SELECT id, position_x, position_y, position_z, amount, expires_at
    FROM public.active_coins
    WHERE claimed_by IS NULL AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT LEAST(_limit, 100)
  ) sub;
$$;

-- =============================================
-- Cleanup: purge expired and old claimed coins
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_old_coin_claims()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Remove claimed coins older than 1 hour
  DELETE FROM public.active_coins WHERE claimed_at IS NOT NULL AND claimed_at < now() - interval '1 hour';
  -- Remove expired unclaimed coins older than 30 minutes past expiry
  DELETE FROM public.active_coins WHERE claimed_by IS NULL AND expires_at < now() - interval '30 minutes';
  -- Clean claim audit log
  DELETE FROM public.coin_claims WHERE claimed_at < now() - interval '2 hours';
END;
$$;
