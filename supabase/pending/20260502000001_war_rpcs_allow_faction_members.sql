-- =====================================================================
-- T006: Allow fixed-faction members to start and cancel territory wars.
--
-- Original issue (Codex audit, area #5):
--   `challenge_territory` and `cancel_challenge` require
--   `clan_members.role = 'leader'`. The new fixed-faction system
--   registers all real users with role='member' (the synthetic
--   '__system__' wallet is the leader of every faction clan), so NO
--   real user can currently start or cancel a faction war.
--
-- Fix:
--   Allow members to call these RPCs **only** when the clan in question
--   is a fixed faction, identified by `clans.leader_wallet = '__system__'`.
--   For any user-created clan (where leader_wallet is a real wallet),
--   leader-only behavior is preserved.
--
--   Both functions are recreated CREATE OR REPLACE inside a transaction;
--   no data is modified. Existing territory_challenges, territory_history,
--   wallets, clans, clan_members, etc. are untouched.
--
-- DEPLOYMENT SAFETY:
--   - This SQL is independent of any frontend change. The frontend
--     already calls `challenge_territory` and `cancel_challenge` with
--     wallet+session+territory/challenge args; only the *internal*
--     authorization rule changes.
--   - If this SQL is NOT applied, the new FactionPanel "Challenge" /
--     "Cancel" buttons will return the server error
--     "Only clan leaders can challenge territories" / "...cancel
--     challenges" — the buttons remain visible but no rows are written.
--   - This file lives in `supabase/pending/` because there is no active
--     `supabase/migrations/` folder in this repo. Apply via your Supabase
--     tooling, then delete this file.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. challenge_territory — allow fixed-faction members to challenge
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.challenge_territory(
  _wallet_address text,
  _session_token text,
  _territory_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _membership record;
  _territory record;
  _defender_clan record;
  _existing_outgoing integer;
  _existing_incoming integer;
  _challenge_id uuid;
  _war_start timestamptz;
  _war_end timestamptz;
  _cooldown_end timestamptz;
  _attacker_clan record;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  -- Membership lookup
  SELECT cm.clan_id, cm.role INTO _membership
  FROM clan_members cm WHERE cm.wallet_address = _clean_wallet;
  IF _membership.clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;

  -- Resolve attacker clan (also used later for the insert)
  SELECT * INTO _attacker_clan FROM clans WHERE id = _membership.clan_id;
  IF _attacker_clan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attacker clan missing');
  END IF;

  -- Authorization: leaders always allowed; members allowed ONLY for
  -- fixed-faction clans (leader_wallet = '__system__').
  IF _membership.role <> 'leader'
     AND _attacker_clan.leader_wallet IS DISTINCT FROM '__system__' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can challenge territories');
  END IF;

  -- Territory must exist and be owned
  SELECT * INTO _territory FROM territories WHERE id = _territory_id;
  IF _territory.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory not found');
  END IF;
  IF _territory.owning_clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory is unclaimed — claim it instead');
  END IF;

  -- Cannot challenge own territory
  IF _territory.owning_clan_id = _membership.clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot challenge your own territory');
  END IF;

  -- Territory must be in peaceful state
  IF _territory.war_state <> 'peaceful' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory is already contested or in cooldown');
  END IF;

  -- Check cooldown
  IF _territory.war_cooldown_until IS NOT NULL AND _territory.war_cooldown_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory is in cooldown until ' || _territory.war_cooldown_until::text);
  END IF;

  -- One outgoing challenge per clan at any in-flight stage. Includes
  -- 'pending_resolution' so a faction whose previous war is awaiting admin
  -- resolution cannot stack a second challenge — keeps server enforcement
  -- in lockstep with the FactionPanel UI guard.
  SELECT count(*) INTO _existing_outgoing
  FROM territory_challenges
  WHERE attacker_clan_id = _membership.clan_id
    AND status IN ('pending', 'active', 'pending_resolution');
  IF _existing_outgoing >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your faction already has an active challenge. Cancel or wait for it to resolve.');
  END IF;

  -- One active challenge per territory
  SELECT count(*) INTO _existing_incoming
  FROM territory_challenges
  WHERE territory_id = _territory_id
    AND status IN ('pending', 'active');
  IF _existing_incoming >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This territory already has a pending challenge');
  END IF;

  SELECT * INTO _defender_clan FROM clans WHERE id = _territory.owning_clan_id;

  -- Schedule: war starts in 15 min, lasts 10 min, cooldown 30 min after
  _war_start := now() + interval '15 minutes';
  _war_end := _war_start + interval '10 minutes';
  _cooldown_end := _war_end + interval '30 minutes';

  -- Create challenge record
  INSERT INTO territory_challenges (
    territory_id, attacker_clan_id, defender_clan_id,
    attacker_clan_name, attacker_clan_color, defender_clan_name, defender_clan_color,
    status, war_starts_at, war_ends_at, cooldown_ends_at
  ) VALUES (
    _territory_id, _membership.clan_id, _territory.owning_clan_id,
    _attacker_clan.name, _attacker_clan.color::text, _defender_clan.name, _defender_clan.color::text,
    'pending', _war_start, _war_end, _cooldown_end
  ) RETURNING id INTO _challenge_id;

  -- Update territory state to contested
  UPDATE territories
  SET war_state = 'contested', updated_at = now()
  WHERE id = _territory_id;

  -- Log history
  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_territory_id, _territory.name, _membership.clan_id, _attacker_clan.name, _attacker_clan.color::text, 'challenged', _clean_wallet);

  RETURN jsonb_build_object(
    'success', true,
    'challenge_id', _challenge_id,
    'war_starts_at', _war_start,
    'war_ends_at', _war_end,
    'cooldown_ends_at', _cooldown_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.challenge_territory(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.challenge_territory(text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. cancel_challenge — allow fixed-faction members to cancel
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_challenge(
  _wallet_address text,
  _session_token text,
  _challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _membership record;
  _challenge record;
  _attacker_clan record;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT cm.clan_id, cm.role INTO _membership
  FROM clan_members cm WHERE cm.wallet_address = _clean_wallet;
  IF _membership.clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;

  SELECT * INTO _attacker_clan FROM clans WHERE id = _membership.clan_id;
  IF _attacker_clan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attacker clan missing');
  END IF;

  -- Authorization: leaders always allowed; members allowed ONLY for
  -- fixed-faction clans (leader_wallet = '__system__').
  IF _membership.role <> 'leader'
     AND _attacker_clan.leader_wallet IS DISTINCT FROM '__system__' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can cancel challenges');
  END IF;

  SELECT * INTO _challenge FROM territory_challenges WHERE id = _challenge_id FOR UPDATE;
  IF _challenge.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not found');
  END IF;
  IF _challenge.attacker_clan_id <> _membership.clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the attacking faction can cancel');
  END IF;
  IF _challenge.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel pending challenges');
  END IF;

  -- Cancel
  UPDATE territory_challenges
  SET status = 'cancelled', resolution = 'cancelled', cancelled_by = _clean_wallet,
      resolved_at = now(), updated_at = now()
  WHERE id = _challenge_id;

  -- Reset territory state
  UPDATE territories
  SET war_state = 'peaceful', updated_at = now()
  WHERE id = _challenge.territory_id;

  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_challenge.territory_id, (SELECT name FROM territories WHERE id = _challenge.territory_id),
          _membership.clan_id, _attacker_clan.name, _attacker_clan.color::text, 'war_cancelled', _clean_wallet);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_challenge(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_challenge(text, text, uuid)
  TO anon, authenticated, service_role;

COMMIT;

-- =====================================================================
-- POST-APPLY VERIFICATION QUERIES
-- Run these after applying the migration; both should return 1 row each.
-- =====================================================================

-- 1. Confirm both functions exist with the expected 3-arg signatures
-- and SECURITY DEFINER flag.
--
-- SELECT
--   p.proname,
--   pg_get_function_identity_arguments(p.oid) AS args,
--   p.prosecdef AS security_definer
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('challenge_territory', 'cancel_challenge')
-- ORDER BY p.proname;
--
-- Expected:
--   cancel_challenge      | _wallet_address text, _session_token text, _challenge_id uuid | t
--   challenge_territory   | _wallet_address text, _session_token text, _territory_id text | t

-- 2. Confirm execute privileges are restricted to anon/authenticated/service_role.
--
-- SELECT
--   p.proname,
--   array_agg(DISTINCT g.grantee::text ORDER BY g.grantee::text) AS grantees
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- LEFT JOIN information_schema.role_routine_grants g
--        ON g.specific_schema = 'public'
--       AND g.routine_name = p.proname
--       AND g.privilege_type = 'EXECUTE'
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('challenge_territory', 'cancel_challenge')
-- GROUP BY p.proname
-- ORDER BY p.proname;
--
-- Expected (PUBLIC must NOT appear):
--   cancel_challenge     | {anon,authenticated,service_role}
--   challenge_territory  | {anon,authenticated,service_role}

-- 3. Sanity check: confirm the 7 fixed factions all have leader_wallet='__system__'.
--
-- SELECT id, name, leader_wallet
-- FROM clans
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0000-000000000002',
--   '00000000-0000-0000-0000-000000000003',
--   '00000000-0000-0000-0000-000000000004',
--   '00000000-0000-0000-0000-000000000005',
--   '00000000-0000-0000-0000-000000000006',
--   '00000000-0000-0000-0000-000000000007'
-- )
-- ORDER BY id;
--
-- All 7 rows should show leader_wallet = '__system__'. If any row shows a
-- different leader_wallet, the new authorization rule will reject members
-- of that faction; investigate before deploying the FactionPanel UI.
