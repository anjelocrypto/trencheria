-- Phase 3a: Admin-resolved wars

-- 1. Add pending_resolution to territory_war_state enum
ALTER TYPE public.territory_war_state ADD VALUE IF NOT EXISTS 'pending_resolution';

-- 2. Replace transition_war_states to use pending_resolution instead of auto-resolving
CREATE OR REPLACE FUNCTION public.transition_war_states()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _transitioned integer := 0;
  _ch record;
  _cooldown_count integer;
BEGIN
  -- pending -> active (unchanged)
  FOR _ch IN
    SELECT tc.id AS challenge_id, tc.territory_id, tc.attacker_clan_name, tc.attacker_clan_color,
           tc.attacker_clan_id, tc.defender_clan_name, tc.defender_clan_color, tc.defender_clan_id,
           t.name AS territory_name
    FROM territory_challenges tc
    JOIN territories t ON t.id = tc.territory_id
    WHERE tc.status = 'pending' AND tc.war_starts_at <= now()
    FOR UPDATE OF tc
  LOOP
    UPDATE territory_challenges SET status = 'active', updated_at = now() WHERE id = _ch.challenge_id;
    UPDATE territories SET war_state = 'active_war', updated_at = now() WHERE id = _ch.territory_id;
    INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type)
    VALUES (_ch.territory_id, _ch.territory_name, _ch.attacker_clan_id, _ch.attacker_clan_name, _ch.attacker_clan_color, 'war_started');
    _transitioned := _transitioned + 1;
  END LOOP;

  -- active -> pending_resolution (NOT auto-resolved anymore)
  FOR _ch IN
    SELECT tc.id AS challenge_id, tc.territory_id,
           tc.attacker_clan_name, tc.attacker_clan_color, tc.attacker_clan_id,
           tc.defender_clan_name, tc.defender_clan_color, tc.defender_clan_id,
           t.name AS territory_name
    FROM territory_challenges tc
    JOIN territories t ON t.id = tc.territory_id
    WHERE tc.status = 'active' AND tc.war_ends_at <= now()
    FOR UPDATE OF tc
  LOOP
    UPDATE territory_challenges
    SET status = 'pending_resolution', updated_at = now()
    WHERE id = _ch.challenge_id;
    UPDATE territories
    SET war_state = 'pending_resolution', updated_at = now()
    WHERE id = _ch.territory_id;
    INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type)
    VALUES (_ch.territory_id, _ch.territory_name, _ch.attacker_clan_id, _ch.attacker_clan_name, _ch.attacker_clan_color, 'war_ended_pending_resolution');
    _transitioned := _transitioned + 1;
  END LOOP;

  -- cooldown -> peaceful (unchanged)
  UPDATE territories
  SET war_state = 'peaceful', war_cooldown_until = NULL, updated_at = now()
  WHERE war_state = 'cooldown'
    AND war_cooldown_until IS NOT NULL
    AND war_cooldown_until <= now();

  GET DIAGNOSTICS _cooldown_count = ROW_COUNT;
  _transitioned := _transitioned + _cooldown_count;

  RETURN jsonb_build_object('success', true, 'transitions', _transitioned);
END;
$function$;

-- 3. Admin resolve_war RPC
CREATE OR REPLACE FUNCTION public.resolve_war(
  _wallet_address text,
  _session_token text,
  _challenge_id uuid,
  _resolution text  -- 'attacker_won' or 'defender_held'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ch record;
  _territory record;
  _new_owner_clan_id uuid;
  _new_owner_name text;
  _new_owner_color text;
  _history_event text;
BEGIN
  -- Admin verification
  IF NOT public.verify_admin_session(_wallet_address, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Validate resolution value
  IF _resolution NOT IN ('attacker_won', 'defender_held') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid resolution. Use attacker_won or defender_held');
  END IF;

  -- Get the challenge
  SELECT * INTO _ch FROM territory_challenges WHERE id = _challenge_id FOR UPDATE;
  IF _ch.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not found');
  END IF;

  IF _ch.status <> 'pending_resolution' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge is not pending resolution (status: ' || _ch.status || ')');
  END IF;

  -- Get territory
  SELECT * INTO _territory FROM territories WHERE id = _ch.territory_id FOR UPDATE;

  IF _resolution = 'attacker_won' THEN
    -- Transfer ownership to attacker
    _new_owner_clan_id := _ch.attacker_clan_id;
    _new_owner_name := _ch.attacker_clan_name;
    _new_owner_color := _ch.attacker_clan_color;
    _history_event := 'war_resolved_attacker_won';

    -- Release the defender's territory
    UPDATE territories
    SET owning_clan_id = _ch.attacker_clan_id,
        claimed_at = now(),
        war_state = 'cooldown',
        war_cooldown_until = _ch.cooldown_ends_at,
        updated_at = now()
    WHERE id = _ch.territory_id;
  ELSE
    -- Defender holds
    _new_owner_name := _ch.defender_clan_name;
    _new_owner_color := _ch.defender_clan_color;
    _history_event := 'war_resolved_defender_held';

    UPDATE territories
    SET war_state = 'cooldown',
        war_cooldown_until = _ch.cooldown_ends_at,
        updated_at = now()
    WHERE id = _ch.territory_id;
  END IF;

  -- Mark challenge as resolved
  UPDATE territory_challenges
  SET status = 'resolved',
      resolution = _resolution,
      resolved_at = now(),
      updated_at = now()
  WHERE id = _challenge_id;

  -- Log history
  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_ch.territory_id, _territory.name,
    CASE WHEN _resolution = 'attacker_won' THEN _ch.attacker_clan_id ELSE _ch.defender_clan_id END,
    CASE WHEN _resolution = 'attacker_won' THEN _ch.attacker_clan_name ELSE _ch.defender_clan_name END,
    CASE WHEN _resolution = 'attacker_won' THEN _ch.attacker_clan_color ELSE _ch.defender_clan_color END,
    _history_event, _wallet_address);

  RETURN jsonb_build_object('success', true, 'resolution', _resolution, 'territory', _territory.name);
END;
$function$;

-- 4. Update get_active_challenges to include pending_resolution
CREATE OR REPLACE FUNCTION public.get_active_challenges(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', tc.id,
      'territory_id', tc.territory_id,
      'territory_name', t.name,
      'attacker_clan_id', tc.attacker_clan_id,
      'attacker_clan_name', tc.attacker_clan_name,
      'attacker_clan_color', tc.attacker_clan_color,
      'defender_clan_id', tc.defender_clan_id,
      'defender_clan_name', tc.defender_clan_name,
      'defender_clan_color', tc.defender_clan_color,
      'status', tc.status,
      'resolution', tc.resolution,
      'war_starts_at', tc.war_starts_at,
      'war_ends_at', tc.war_ends_at,
      'cooldown_ends_at', tc.cooldown_ends_at,
      'created_at', tc.challenge_created_at
    ) ORDER BY tc.challenge_created_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT * FROM territory_challenges
    WHERE status IN ('pending', 'active', 'pending_resolution')
       OR (status = 'resolved' AND resolved_at > now() - interval '5 minutes')
    ORDER BY challenge_created_at DESC
    LIMIT LEAST(_limit, 200)
  ) tc
  JOIN territories t ON t.id = tc.territory_id;
$function$;