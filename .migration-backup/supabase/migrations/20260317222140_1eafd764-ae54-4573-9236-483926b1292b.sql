
-- =============================================
-- SECURITY HARDENING MIGRATION
-- =============================================

-- 1. wallet_sessions table for cryptographic auth
CREATE TABLE public.wallet_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_sessions_token ON public.wallet_sessions(session_token);
CREATE INDEX idx_wallet_sessions_wallet ON public.wallet_sessions(wallet_address);
ALTER TABLE public.wallet_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_sessions" ON public.wallet_sessions FOR ALL USING (false) WITH CHECK (false);

-- 2. security_logs table for suspicious activity tracking
CREATE TABLE public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  wallet_address text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_security_logs" ON public.security_logs FOR ALL USING (false) WITH CHECK (false);

-- 3. Add issued_by column to active_coins for per-wallet rate limiting
ALTER TABLE public.active_coins ADD COLUMN IF NOT EXISTS issued_by text;

-- 4. verify_wallet_session helper
CREATE OR REPLACE FUNCTION public.verify_wallet_session(_wallet_address text, _session_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _session_token IS NULL OR _session_token = '' THEN
    RETURN false;
  END IF;
  -- Update last_used_at on valid session check
  UPDATE public.wallet_sessions
  SET last_used_at = now()
  WHERE wallet_address = _wallet_address
    AND session_token = _session_token
    AND expires_at > now();
  RETURN FOUND;
END;
$$;

-- 5. create_wallet_session (called by edge function after signature verification)
CREATE OR REPLACE FUNCTION public.create_wallet_session(_wallet_address text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token text;
  _clean_wallet text;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RAISE EXCEPTION 'No account for this wallet';
  END IF;
  -- Revoke old sessions
  DELETE FROM public.wallet_sessions WHERE wallet_address = _clean_wallet;
  -- Generate secure token
  _token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.wallet_sessions (wallet_address, session_token, expires_at)
  VALUES (_clean_wallet, _token, now() + interval '24 hours');
  RETURN _token;
END;
$$;

-- 6. Drop public SELECT policies on sensitive tables
DROP POLICY IF EXISTS "public_read_balances" ON public.player_balances;
DROP POLICY IF EXISTS "public_read_progression" ON public.player_progression;
DROP POLICY IF EXISTS "public_read_active_coins" ON public.active_coins;

-- 7. Hardened save_player_progression with bounds + rate limit + session check
CREATE OR REPLACE FUNCTION public.save_player_progression(
  _wallet_address text, _enemies_killed integer, _structures_built integer,
  _total_wood_gathered integer, _total_stone_gathered integer, _tier integer,
  _areas_secured text[], _session_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _merged_areas text[];
  _last_save timestamptz;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- Session verification (required when token provided, logged when invalid)
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      INSERT INTO public.security_logs (event_type, wallet_address, details)
      VALUES ('invalid_session', _clean_wallet, '{"action":"save_progression"}'::jsonb);
      RAISE EXCEPTION 'Invalid session';
    END IF;
  END IF;

  -- Sanity bounds
  IF _enemies_killed < 0 OR _enemies_killed > 100000 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('bounds_violation', _clean_wallet, jsonb_build_object('field', 'enemies_killed', 'value', _enemies_killed));
    RAISE EXCEPTION 'Invalid progression value';
  END IF;
  IF _structures_built < 0 OR _structures_built > 10000 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('bounds_violation', _clean_wallet, jsonb_build_object('field', 'structures_built', 'value', _structures_built));
    RAISE EXCEPTION 'Invalid progression value';
  END IF;
  IF _total_wood_gathered < 0 OR _total_wood_gathered > 1000000 THEN
    RAISE EXCEPTION 'Invalid progression value';
  END IF;
  IF _total_stone_gathered < 0 OR _total_stone_gathered > 1000000 THEN
    RAISE EXCEPTION 'Invalid progression value';
  END IF;
  IF _tier < 1 OR _tier > 10 THEN
    RAISE EXCEPTION 'Invalid progression value';
  END IF;

  -- Rate limit: max 1 save per 10 seconds
  SELECT updated_at INTO _last_save FROM public.player_progression WHERE wallet_address = _clean_wallet;
  IF _last_save IS NOT NULL AND _last_save > now() - interval '10 seconds' THEN
    RETURN; -- silently skip
  END IF;

  -- Merge areas (capped at 50)
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(pp.areas_secured, '{}') || COALESCE(_areas_secured, '{}')
    )
    FROM (SELECT areas_secured FROM public.player_progression WHERE wallet_address = _clean_wallet) pp
  ) INTO _merged_areas;
  IF _merged_areas IS NULL THEN
    _merged_areas := COALESCE(_areas_secured, '{}');
  END IF;
  IF array_length(_merged_areas, 1) IS NOT NULL AND array_length(_merged_areas, 1) > 50 THEN
    _merged_areas := _merged_areas[1:50];
  END IF;

  INSERT INTO public.player_progression (
    wallet_address, enemies_killed, structures_built,
    total_wood_gathered, total_stone_gathered, tier, areas_secured
  )
  VALUES (
    _clean_wallet, _enemies_killed, _structures_built,
    _total_wood_gathered, _total_stone_gathered, _tier, _merged_areas
  )
  ON CONFLICT (wallet_address)
  DO UPDATE SET
    enemies_killed = GREATEST(player_progression.enemies_killed, EXCLUDED.enemies_killed),
    structures_built = GREATEST(player_progression.structures_built, EXCLUDED.structures_built),
    total_wood_gathered = GREATEST(player_progression.total_wood_gathered, EXCLUDED.total_wood_gathered),
    total_stone_gathered = GREATEST(player_progression.total_stone_gathered, EXCLUDED.total_stone_gathered),
    tier = GREATEST(player_progression.tier, EXCLUDED.tier),
    areas_secured = _merged_areas,
    updated_at = now();
END;
$$;

-- 8. Hardened issue_trencheri_coins with per-wallet rate limit + session + issued_by tracking
CREATE OR REPLACE FUNCTION public.issue_trencheri_coins(
  _wallet_address text, _positions jsonb, _lifetime_seconds integer DEFAULT 300,
  _session_token text DEFAULT NULL
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
  _wallet_recent_count integer;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Session verification
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      INSERT INTO public.security_logs (event_type, wallet_address, details)
      VALUES ('invalid_session', _clean_wallet, '{"action":"issue_coins"}'::jsonb);
      RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
    END IF;
  END IF;

  -- Per-wallet rate limit: max 6 coins per 60 seconds
  SELECT count(*) INTO _wallet_recent_count
  FROM public.active_coins
  WHERE issued_by = _clean_wallet
    AND created_at > now() - interval '60 seconds';
  
  IF _wallet_recent_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet issue rate limited');
  END IF;

  IF jsonb_array_length(coalesce(_positions, '[]'::jsonb)) > 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many coins requested');
  END IF;

  IF jsonb_array_length(coalesce(_positions, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No positions');
  END IF;

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
    
    INSERT INTO public.active_coins (id, position_x, position_y, position_z, amount, expires_at, issued_by)
    VALUES (
      _coin_id,
      (_pos->>'x')::double precision,
      (_pos->>'y')::double precision,
      (_pos->>'z')::double precision,
      1,
      _expires,
      _clean_wallet
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

-- 9. Hardened claim_trencheri_coin with session check
CREATE OR REPLACE FUNCTION public.claim_trencheri_coin(
  _wallet_address text, _coin_id text, _amount integer DEFAULT 1,
  _session_token text DEFAULT NULL
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

  -- Session verification
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      INSERT INTO public.security_logs (event_type, wallet_address, details)
      VALUES ('invalid_session', _clean_wallet, '{"action":"claim_coin"}'::jsonb);
      RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
    END IF;
  END IF;

  -- Server-side rate limit: 3s per wallet
  SELECT max(claimed_at) INTO _last_claim
  FROM public.active_coins
  WHERE claimed_by = _clean_wallet;

  IF _last_claim IS NOT NULL AND _last_claim > now() - interval '3 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rate limited');
  END IF;

  -- Look up coin in registry
  SELECT * INTO _coin_row
  FROM public.active_coins
  WHERE id = _coin_id
  FOR UPDATE;

  IF _coin_row.id IS NULL THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('fake_coin_claim', _clean_wallet, jsonb_build_object('coin_id', _coin_id));
    RETURN jsonb_build_object('success', false, 'error', 'Coin not found');
  END IF;

  IF _coin_row.claimed_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  IF _coin_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coin expired');
  END IF;

  -- Mark claimed
  UPDATE public.active_coins
  SET claimed_by = _clean_wallet, claimed_at = now()
  WHERE id = _coin_id;

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

-- 10. Hardened update_wallet_profile with session check
CREATE OR REPLACE FUNCTION public.update_wallet_profile(
  _wallet_address text, _display_name text DEFAULT NULL, _community_name text DEFAULT NULL,
  _character_type text DEFAULT NULL, _session_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _clean_char text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT id INTO _account_id FROM public.player_accounts WHERE wallet_address = _clean_wallet;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- Session verification
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      RAISE EXCEPTION 'Invalid session';
    END IF;
  END IF;

  IF _character_type IS NOT NULL THEN
    _clean_char := lower(trim(_character_type));
    IF NOT public.is_valid_character_type(_clean_char) THEN
      RAISE EXCEPTION 'Invalid character type: %', _clean_char;
    END IF;
  END IF;

  UPDATE public.player_accounts
  SET
    display_name = COALESCE(nullif(left(trim(coalesce(_display_name, '')), 20), ''), display_name),
    community_name = CASE WHEN _community_name IS NOT NULL THEN nullif(left(trim(_community_name), 30), '') ELSE community_name END,
    character_type = COALESCE(_clean_char, character_type)
  WHERE id = _account_id;
END;
$$;

-- 11. Hardened update_wallet_last_position with session check
CREATE OR REPLACE FUNCTION public.update_wallet_last_position(
  _wallet_address text, _last_position_x double precision, _last_position_y double precision,
  _last_position_z double precision, _session_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT id INTO _account_id FROM public.player_accounts WHERE wallet_address = _clean_wallet;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- Session verification
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      RAISE EXCEPTION 'Invalid session';
    END IF;
  END IF;

  -- Position sanity bounds (world is ~2000 units)
  IF abs(_last_position_x) > 5000 OR abs(_last_position_y) > 500 OR abs(_last_position_z) > 5000 THEN
    RETURN; -- silently skip invalid positions
  END IF;

  UPDATE public.player_accounts
  SET last_position_x = _last_position_x, last_position_y = _last_position_y, last_position_z = _last_position_z
  WHERE id = _account_id;
END;
$$;

-- 12. Cleanup expired sessions function
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.wallet_sessions WHERE expires_at < now();
  DELETE FROM public.security_logs WHERE created_at < now() - interval '7 days';
END;
$$;
