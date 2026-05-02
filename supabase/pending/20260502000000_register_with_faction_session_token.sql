-- =====================================================================
-- T004: Require verified wallet session for faction registration.
--
-- Original issue (Codex audit, item #2):
--   `register_with_faction` accepted a wallet address + faction without
--   requiring proof that the caller actually controls the wallet. A user
--   could register/migrate any wallet they knew the address of.
--
-- Fix: add `_session_token text DEFAULT NULL` and validate it with
--   `verify_wallet_session(_clean_wallet, _session_token)` at the top of
--   the function. Returns `{ success: false, error: 'Invalid or expired
--   session' }` when the check fails. The parameter has a NULL default so
--   the SQL function shape stays backward-compatible at deploy time, but
--   any client that omits the token will be fail-closed by the runtime
--   check.
--
-- This file lives in `supabase/pending/` because there is no active
-- `supabase/migrations/` folder in this repo (the real source lives
-- elsewhere). Apply it via your Supabase tooling, then delete this file.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.register_with_faction(
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
