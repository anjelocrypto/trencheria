-- =====================================================================
-- T004: Require verified wallet session for faction registration.
--
-- Original issue (Codex audit, item #2):
--   `register_with_faction` accepted a wallet address + faction without
--   requiring proof that the caller actually controls the wallet. A user
--   could register/migrate any wallet they knew the address of.
--
-- Fix:
--   1. Drop the old 4-arg signature so we don't end up with two overloads
--      (one secure, one not) — PostgreSQL would NOT replace the old function
--      because the new one has a different argument count.
--   2. Create a new register_with_faction with `_session_token` and
--      validate it via `verify_wallet_session(...)`.
--   3. Loosen `create_wallet_session` so brand-new wallets (no
--      player_accounts row yet) can receive a session token. Without this,
--      registration of a brand-new wallet is impossible: the verify-wallet
--      edge function would fail to issue a token, MenuOverlay would send
--      an empty `_session_token`, and secure register_with_faction would
--      reject the new user. The Phantom signature is already verified by
--      the edge function before create_wallet_session is called, so
--      issuing a token for a wallet without an account is safe.
--   4. Wrap everything in a single transaction so partial application
--      cannot leave the database in a half-migrated state.
--   5. Explicit REVOKE + GRANT EXECUTE so authenticated/anon clients can
--      still call the new function.
--
-- DEPLOYMENT SAFETY:
--   - Apply this SQL at the same time as (or before) the matching
--     MenuOverlay.tsx change that passes `_session_token`. If the
--     frontend ships first without this SQL, the old 4-arg function
--     keeps working for existing players but the new `_session_token`
--     keyword arg will be rejected by Supabase. If this SQL ships first,
--     the old frontend will simply hit the new function with NULL token
--     and get a friendly 'Session token required' error.
--   - This file lives in `supabase/pending/` because there is no active
--     `supabase/migrations/` folder in this repo (the real source lives
--     elsewhere). Apply via your Supabase tooling, then delete this file.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Drop the old 4-arg signature.
--    PostgreSQL identifies functions by (name, argument types), so
--    CREATE OR REPLACE with a new arg count creates an OVERLOAD, leaving
--    the old function in place. We must explicitly drop it.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_with_faction(text, text, text, uuid);

-- (Belt and suspenders: also drop the new signature if a partial run
--  already created it. Safe no-op otherwise.)
DROP FUNCTION IF EXISTS public.register_with_faction(text, text, text, uuid, text);

-- ---------------------------------------------------------------------
-- 2. Create the new register_with_faction with `_session_token`.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.register_with_faction(
  _wallet_address text,
  _display_name text DEFAULT 'Knight'::text,
  _community_name text DEFAULT NULL::text,
  _faction_id uuid DEFAULT NULL::uuid,
  _session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _clean_wallet text;
  _clean_name text;
  _clean_community text;
  _account_id uuid;
  _existing_faction uuid;
  _faction_row record;
  _char_type text;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  _clean_name := left(trim(coalesce(_display_name, '')), 20);
  _clean_community := nullif(left(trim(coalesce(_community_name, '')), 30), '');

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet address');
  END IF;

  -- T004: require a verified wallet session. Fail-closed if missing/invalid.
  IF _session_token IS NULL OR _session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session token required');
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  IF _clean_name = '' THEN _clean_name := 'Knight'; END IF;

  -- Validate faction exists and is one of the 7 fixed factions
  IF _faction_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Faction selection required');
  END IF;

  SELECT * INTO _faction_row FROM public.clans WHERE id = _faction_id AND leader_wallet = '__system__';
  IF _faction_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid faction');
  END IF;

  -- Map faction to character type
  _char_type := CASE _faction_row.name
    WHEN 'Octopus' THEN 'octopus'
    WHEN 'NemoClaw' THEN 'nemoclaw'
    WHEN 'Goblins' THEN 'goblin'
    WHEN 'Soldiers' THEN 'soldier'
    WHEN 'ChillGuys' THEN 'chillhouse'
    WHEN 'Yetis' THEN 'yeti'
    WHEN 'Dogs' THEN 'dog'
    ELSE 'goblin'
  END;

  -- Check existing account
  SELECT id, faction_id INTO _account_id, _existing_faction
  FROM public.player_accounts WHERE wallet_address = _clean_wallet;

  IF _account_id IS NOT NULL THEN
    -- MIGRATION PATH: existing account without faction
    IF _existing_faction IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Faction already assigned. Identity is permanent.');
    END IF;

    -- Assign faction + character type to existing account
    UPDATE public.player_accounts
    SET faction_id = _faction_id,
        character_type = _char_type,
        updated_at = now()
    WHERE id = _account_id;

    -- Add to clan_members
    INSERT INTO public.clan_members (clan_id, wallet_address, role)
    VALUES (_faction_id, _clean_wallet, 'member')
    ON CONFLICT DO NOTHING;

    -- Update member count
    UPDATE public.clans SET member_count = (
      SELECT count(*) FROM public.clan_members WHERE clan_id = _faction_id
    ) WHERE id = _faction_id;

    RETURN jsonb_build_object(
      'success', true,
      'account_id', _account_id,
      'faction_id', _faction_id,
      'faction_name', _faction_row.name,
      'character_type', _char_type,
      'migrated', true
    );
  END IF;

  -- NEW ACCOUNT: Create with faction
  INSERT INTO public.player_accounts (wallet_address, display_name, community_name, character_type, faction_id)
  VALUES (_clean_wallet, _clean_name, _clean_community, _char_type, _faction_id)
  RETURNING id INTO _account_id;

  -- Add to clan_members
  INSERT INTO public.clan_members (clan_id, wallet_address, role)
  VALUES (_faction_id, _clean_wallet, 'member')
  ON CONFLICT DO NOTHING;

  -- Update member count
  UPDATE public.clans SET member_count = (
    SELECT count(*) FROM public.clan_members WHERE clan_id = _faction_id
  ) WHERE id = _faction_id;

  RETURN jsonb_build_object(
    'success', true,
    'account_id', _account_id,
    'faction_id', _faction_id,
    'faction_name', _faction_row.name,
    'character_type', _char_type,
    'migrated', false
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Lock down execute privileges on the new function.
--    register_with_faction can be callable by anon/authenticated because
--    it validates `_session_token` via verify_wallet_session() before
--    doing anything sensitive. SECURITY DEFINER + REVOKE FROM PUBLIC +
--    explicit GRANT is the standard hardening pattern: only Supabase
--    auth roles can call it, and the function body runs with the
--    function owner's rights.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.register_with_faction(text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_with_faction(text, text, text, uuid, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Allow brand-new wallets to receive a session token.
--    The original create_wallet_session refused wallets with no
--    player_accounts row, but registration creates the row AFTER the
--    session is issued. The Phantom signature has already been verified
--    by the verify-wallet edge function before this function is called,
--    so issuing a session for a not-yet-registered wallet is safe — the
--    wallet_sessions row carries no privileges on its own.
-- ---------------------------------------------------------------------
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
  -- Note: the previous version required an existing player_accounts row
  -- here. We removed that check so brand-new wallets can register a
  -- faction (the account row is created later inside register_with_faction).
  -- Revoke old sessions
  DELETE FROM public.wallet_sessions WHERE wallet_address = _clean_wallet;
  -- Generate secure token
  _token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.wallet_sessions (wallet_address, session_token, expires_at)
  VALUES (_clean_wallet, _token, now() + interval '24 hours');
  RETURN _token;
END;
$$;

-- create_wallet_session must be service_role ONLY. The verify-wallet edge
-- function (running as service_role) is the only legitimate caller; it
-- creates a session AFTER cryptographically verifying a Phantom signature.
-- If anon/authenticated could call this directly, anyone could mint a
-- session token for any wallet address without signing — the entire
-- wallet-auth model would be bypassed.
REVOKE ALL ON FUNCTION public.create_wallet_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_wallet_session(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet_session(text) TO service_role;

COMMIT;
