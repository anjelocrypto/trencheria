
CREATE OR REPLACE FUNCTION public.transition_war_states()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _transitioned integer := 0;
  _ch record;
  _cooldown_count integer;
BEGIN
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

  FOR _ch IN
    SELECT tc.id AS challenge_id, tc.territory_id, tc.attacker_clan_name, tc.attacker_clan_color,
           tc.attacker_clan_id, tc.defender_clan_name, tc.defender_clan_color, tc.defender_clan_id,
           tc.cooldown_ends_at, t.name AS territory_name
    FROM territory_challenges tc
    JOIN territories t ON t.id = tc.territory_id
    WHERE tc.status = 'active' AND tc.war_ends_at <= now()
    FOR UPDATE OF tc
  LOOP
    UPDATE territory_challenges
    SET status = 'resolved', resolution = 'defender_held', resolved_at = now(), updated_at = now()
    WHERE id = _ch.challenge_id;
    UPDATE territories
    SET war_state = 'cooldown', war_cooldown_until = _ch.cooldown_ends_at, updated_at = now()
    WHERE id = _ch.territory_id;
    INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type)
    VALUES (_ch.territory_id, _ch.territory_name, _ch.defender_clan_id, _ch.defender_clan_name, _ch.defender_clan_color, 'war_resolved_defender_held');
    _transitioned := _transitioned + 1;
  END LOOP;

  UPDATE territories
  SET war_state = 'peaceful', war_cooldown_until = NULL, updated_at = now()
  WHERE war_state = 'cooldown'
    AND war_cooldown_until IS NOT NULL
    AND war_cooldown_until <= now();

  GET DIAGNOSTICS _cooldown_count = ROW_COUNT;
  _transitioned := _transitioned + _cooldown_count;

  RETURN jsonb_build_object('success', true, 'transitions', _transitioned);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_challenges(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      'created_at', tc.created_at
    ) ORDER BY tc.created_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT * FROM territory_challenges
    WHERE status IN ('pending', 'active')
       OR (status = 'resolved' AND resolved_at > now() - interval '5 minutes')
    ORDER BY created_at DESC
    LIMIT LEAST(_limit, 100)
  ) tc
  JOIN territories t ON t.id = tc.territory_id;
$$;
