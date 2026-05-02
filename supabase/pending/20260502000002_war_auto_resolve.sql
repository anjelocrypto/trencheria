-- =====================================================================
-- AUTO-RESOLVE WAR FROM KILL SCORES
--
-- Original issue (Codex audit, this round):
--   `transition_war_states` only moved wars between time-based phases
--   (pending → active → pending_resolution) and an admin had to call
--   `resolve_war` manually to pick the winner. The UI consequently
--   advertised "Admin resolves winner" which is not the SAMP-style
--   territory-battle behavior the game wants.
--
-- Fix:
--   Extend `transition_war_states` so that as soon as `now() >=
--   war_ends_at` for an `active` challenge, the function counts kills
--   from `war_kills` for both clans on that challenge, picks the winner
--   automatically (attacker wins iff attacker_kills > defender_kills,
--   else defender holds), and writes the full resolution: challenge
--   row → 'resolved' with `resolution`, territory row → new owner (if
--   attacker won) and `war_state='cooldown'`, plus a `territory_history`
--   entry. The territory automatically returns to `peaceful` once
--   `now() >= war_cooldown_until`.
--
--   The existing admin `resolve_war(_challenge_id, _winner_clan_id)`
--   RPC is left untouched so admins can still override the auto-result
--   for moderation cases. Auto-resolve runs first and is a no-op for
--   any challenge an admin already set to 'resolved'.
--
-- DEPLOYMENT SAFETY:
--   - Pure CREATE OR REPLACE on one function. No table/column changes,
--     no data migration. Reverting = re-deploying the prior body.
--   - Only `transition_war_states` is touched; all other RPCs keep
--     their current bodies. The frontend already calls
--     `transition_war_states` on a 30s cadence (see useClanSystem.ts),
--     so no frontend changes are required for the SQL to take effect.
--   - The function is SECURITY DEFINER and idempotent: running it
--     repeatedly only advances rows that are due for transition.
--   - Lives in `supabase/pending/` because there is no active
--     `supabase/migrations/` folder in this repo. Apply via the
--     Supabase SQL editor or psql, then delete this file.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.transition_war_states()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _now timestamptz := now();
  _started integer := 0;
  _resolved integer := 0;
  _cooled integer := 0;
  _ch record;
  _attacker_kills integer;
  _defender_kills integer;
  _attacker_wins boolean;
  _winner_clan_id uuid;
  _winner_name text;
  _winner_color text;
  _territory record;
BEGIN
  -- -----------------------------------------------------------------
  -- 1. pending -> active (war_starts_at reached)
  -- -----------------------------------------------------------------
  FOR _ch IN
    SELECT * FROM territory_challenges
     WHERE status = 'pending' AND war_starts_at <= _now
     FOR UPDATE
  LOOP
    UPDATE territory_challenges
       SET status = 'active', updated_at = _now
     WHERE id = _ch.id;
    UPDATE territories
       SET war_state = 'active_war', updated_at = _now
     WHERE id = _ch.territory_id;
    INSERT INTO territory_history
      (territory_id, territory_name, clan_id, clan_name, clan_color, event_type)
    VALUES
      (_ch.territory_id,
       (SELECT name FROM territories WHERE id = _ch.territory_id),
       _ch.attacker_clan_id, _ch.attacker_clan_name, _ch.attacker_clan_color,
       'war_started');
    _started := _started + 1;
  END LOOP;

  -- -----------------------------------------------------------------
  -- 2. active -> resolved (war_ends_at reached) — AUTO from kill count
  -- -----------------------------------------------------------------
  FOR _ch IN
    SELECT * FROM territory_challenges
     WHERE status = 'active' AND war_ends_at <= _now
     FOR UPDATE
  LOOP
    -- Tally kills per side from war_kills
    SELECT COALESCE(SUM(CASE WHEN killer_clan_id = _ch.attacker_clan_id THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN killer_clan_id = _ch.defender_clan_id THEN 1 ELSE 0 END), 0)
      INTO _attacker_kills, _defender_kills
      FROM war_kills
     WHERE challenge_id = _ch.id;

    -- Attacker wins ONLY on strictly greater kills; ties = defender holds
    _attacker_wins := _attacker_kills > _defender_kills;

    IF _attacker_wins THEN
      _winner_clan_id := _ch.attacker_clan_id;
      _winner_name    := _ch.attacker_clan_name;
      _winner_color   := _ch.attacker_clan_color;
    ELSE
      _winner_clan_id := _ch.defender_clan_id;
      _winner_name    := _ch.defender_clan_name;
      _winner_color   := _ch.defender_clan_color;
    END IF;

    -- Mark challenge resolved (defensive: only if still 'active' — admin
    -- override via resolve_war is the canonical winner if it ran first)
    UPDATE territory_challenges
       SET status      = 'resolved',
           resolution  = CASE WHEN _attacker_wins THEN 'attacker_won' ELSE 'defender_held' END,
           resolved_at = _now,
           updated_at  = _now
     WHERE id = _ch.id AND status = 'active';
    IF NOT FOUND THEN
      CONTINUE;  -- Admin already resolved this war; skip ownership/history writes
    END IF;

    -- Update territory: new owner if attacker won, always go to cooldown
    SELECT * INTO _territory FROM territories WHERE id = _ch.territory_id;

    IF _attacker_wins THEN
      UPDATE territories
         SET owning_clan_id    = _ch.attacker_clan_id,
             claimed_at        = _now,
             war_state         = 'cooldown',
             war_cooldown_until = _ch.cooldown_ends_at,
             updated_at        = _now
       WHERE id = _ch.territory_id;
    ELSE
      UPDATE territories
         SET war_state         = 'cooldown',
             war_cooldown_until = _ch.cooldown_ends_at,
             updated_at        = _now
       WHERE id = _ch.territory_id;
    END IF;

    -- History entry
    INSERT INTO territory_history
      (territory_id, territory_name, clan_id, clan_name, clan_color, event_type)
    VALUES
      (_ch.territory_id,
       COALESCE(_territory.name, _ch.territory_id),
       _winner_clan_id, _winner_name, _winner_color,
       CASE WHEN _attacker_wins THEN 'territory_captured' ELSE 'territory_defended' END);

    _resolved := _resolved + 1;
  END LOOP;

  -- -----------------------------------------------------------------
  -- 3. cooldown -> peaceful (war_cooldown_until reached)
  -- -----------------------------------------------------------------
  UPDATE territories
     SET war_state = 'peaceful', updated_at = _now
   WHERE war_state = 'cooldown'
     AND war_cooldown_until IS NOT NULL
     AND war_cooldown_until <= _now;
  GET DIAGNOSTICS _cooled = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'started', _started,
    'resolved', _resolved,
    'cooled', _cooled,
    'now', _now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_war_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_war_states()
  TO anon, authenticated, service_role;

COMMIT;

-- =====================================================================
-- POST-APPLY VERIFICATION
-- =====================================================================
-- 1. Confirm the function still has the expected signature:
--
-- SELECT p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args,
--        p.prosecdef AS security_definer
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'transition_war_states';
--
-- Expected: transition_war_states |  | t
--
-- 2. Manual smoke test (run in Supabase SQL editor):
--
-- SELECT transition_war_states();
--
-- Expected JSON result like:
--   { "success": true, "started": N, "resolved": M, "cooled": K, "now": "..." }
--
-- 3. End-to-end:
--   - Have a clan member challenge an enemy territory.
--   - Manually shift the challenge times forward to simulate war end:
--       UPDATE territory_challenges
--          SET war_starts_at = now() - interval '1 minute',
--              war_ends_at  = now() - interval '1 second',
--              status       = 'active'
--        WHERE id = '<challenge_id>';
--   - Insert a few war_kills rows for both sides.
--   - Run SELECT transition_war_states();
--   - Verify: status='resolved', resolution set, territory owner /
--     war_state updated, territory_history row added.
