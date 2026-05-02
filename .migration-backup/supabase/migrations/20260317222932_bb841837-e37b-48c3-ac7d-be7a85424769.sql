
-- =============================================
-- SECURITY HARDENING PASS 2
-- =============================================

-- 1. ENFORCE MANDATORY SESSION TOKENS ON ALL PROTECTED RPCs
-- Remove optional fallback — reject missing/invalid tokens

-- save_player_progression: session REQUIRED
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

  -- SESSION REQUIRED
  IF _session_token IS NULL OR _session_token = '' THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('missing_session', _clean_wallet, '{"action":"save_progression"}'::jsonb);
    RAISE EXCEPTION 'Session token required';
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('invalid_session', _clean_wallet, '{"action":"save_progression"}'::jsonb);
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RAISE EXCEPTION 'No account found for this wallet';
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
    RETURN;
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

-- claim_trencheri_coin: session REQUIRED + proximity validation
CREATE OR REPLACE FUNCTION public.claim_trencheri_coin(
  _wallet_address text, _coin_id text, _amount integer DEFAULT 1,
  _session_token text DEFAULT NULL,
  _player_x double precision DEFAULT NULL,
  _player_z double precision DEFAULT NULL
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
  _distance double precision;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;

  -- SESSION REQUIRED
  IF _session_token IS NULL OR _session_token = '' THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('missing_session', _clean_wallet, '{"action":"claim_coin"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Session token required');
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('invalid_session', _clean_wallet, '{"action":"claim_coin"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
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

  -- PROXIMITY VALIDATION: require player position and check distance
  IF _player_x IS NULL OR _player_z IS NULL THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('missing_position', _clean_wallet, jsonb_build_object('coin_id', _coin_id));
    RETURN jsonb_build_object('success', false, 'error', 'Player position required');
  END IF;

  -- Calculate 2D distance (XZ plane) — collection radius is 5.0 (generous to account for latency)
  _distance := sqrt(
    power(_player_x - _coin_row.position_x, 2) +
    power(_player_z - _coin_row.position_z, 2)
  );

  IF _distance > 5.0 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('remote_claim_attempt', _clean_wallet, jsonb_build_object(
      'coin_id', _coin_id, 'distance', round(_distance::numeric, 2),
      'player_x', _player_x, 'player_z', _player_z,
      'coin_x', _coin_row.position_x, 'coin_z', _coin_row.position_z
    ));
    RETURN jsonb_build_object('success', false, 'error', 'Too far from coin');
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

-- issue_trencheri_coins: session REQUIRED
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

  -- SESSION REQUIRED
  IF _session_token IS NULL OR _session_token = '' THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('missing_session', _clean_wallet, '{"action":"issue_coins"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Session token required');
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('invalid_session', _clean_wallet, '{"action":"issue_coins"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
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

-- update_wallet_profile: session REQUIRED
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

  -- SESSION REQUIRED
  IF _session_token IS NULL OR _session_token = '' THEN
    RAISE EXCEPTION 'Session token required';
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  SELECT id INTO _account_id FROM public.player_accounts WHERE wallet_address = _clean_wallet;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
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

-- update_wallet_last_position: session REQUIRED
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

  -- SESSION REQUIRED
  IF _session_token IS NULL OR _session_token = '' THEN
    RAISE EXCEPTION 'Session token required';
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  SELECT id INTO _account_id FROM public.player_accounts WHERE wallet_address = _clean_wallet;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- Position sanity bounds
  IF abs(_last_position_x) > 5000 OR abs(_last_position_y) > 500 OR abs(_last_position_z) > 5000 THEN
    RETURN;
  END IF;

  UPDATE public.player_accounts
  SET last_position_x = _last_position_x, last_position_y = _last_position_y, last_position_z = _last_position_z
  WHERE id = _account_id;
END;
$$;

-- 2. ADMIN ALLOWLIST TABLE
CREATE TABLE public.admin_wallets (
  wallet_address text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now(),
  label text
);
ALTER TABLE public.admin_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_admin_wallets" ON public.admin_wallets FOR ALL USING (false) WITH CHECK (false);

-- Admin verification function
CREATE OR REPLACE FUNCTION public.verify_admin_session(_wallet_address text, _session_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _session_token IS NULL OR _session_token = '' THEN
    RETURN false;
  END IF;
  -- Must have valid session AND be in admin allowlist
  RETURN EXISTS (
    SELECT 1 FROM public.wallet_sessions ws
    JOIN public.admin_wallets aw ON aw.wallet_address = ws.wallet_address
    WHERE ws.wallet_address = _wallet_address
      AND ws.session_token = _session_token
      AND ws.expires_at > now()
  );
END;
$$;

-- Edge function to check admin status
CREATE OR REPLACE FUNCTION public.check_admin_status(_wallet_address text, _session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.verify_admin_session(_wallet_address, _session_token) THEN
    RETURN jsonb_build_object('is_admin', true);
  ELSE
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('admin_access_denied', _wallet_address, '{}'::jsonb);
    RETURN jsonb_build_object('is_admin', false);
  END IF;
END;
$$;
