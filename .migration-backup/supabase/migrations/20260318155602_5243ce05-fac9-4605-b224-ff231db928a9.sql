-- report_pvp_death: called by the VICTIM to log a war kill
-- Victim authenticates with their own session and reports who killed them
CREATE OR REPLACE FUNCTION public.report_pvp_death(
  _victim_wallet text,
  _session_token text,
  _killer_wallet text,
  _death_x double precision,
  _death_z double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_victim text;
  _clean_killer text;
  _victim_clan_id uuid;
  _killer_clan_id uuid;
  _challenge record;
  _territory record;
  _distance double precision;
  _recent_deaths integer;
BEGIN
  _clean_victim := trim(coalesce(_victim_wallet, ''));
  _clean_killer := trim(coalesce(_killer_wallet, ''));

  -- Validate victim wallet format
  IF _clean_victim !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid victim wallet');
  END IF;
  IF _clean_killer !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid killer wallet');
  END IF;

  -- Session validation: VICTIM authenticates
  IF _session_token IS NULL OR _session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session required');
  END IF;
  IF NOT public.verify_wallet_session(_clean_victim, _session_token) THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('invalid_session', _clean_victim, '{"action":"report_pvp_death"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  -- Cannot kill yourself
  IF _clean_victim = _clean_killer THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-kill rejected');
  END IF;

  -- Both must have accounts
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_victim) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Victim not registered');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_killer) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Killer not registered');
  END IF;

  -- Get clan memberships
  SELECT cm.clan_id INTO _victim_clan_id FROM clan_members cm WHERE cm.wallet_address = _clean_victim;
  SELECT cm.clan_id INTO _killer_clan_id FROM clan_members cm WHERE cm.wallet_address = _clean_killer;

  IF _victim_clan_id IS NULL OR _killer_clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both players must be in clans');
  END IF;
  IF _victim_clan_id = _killer_clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Same clan — friendly fire rejected');
  END IF;

  -- Find active war challenge between these two clans
  SELECT tc.id AS challenge_id, tc.territory_id,
         tc.attacker_clan_id, tc.defender_clan_id
  INTO _challenge
  FROM territory_challenges tc
  WHERE tc.status = 'active'
    AND (
      (tc.attacker_clan_id = _killer_clan_id AND tc.defender_clan_id = _victim_clan_id) OR
      (tc.attacker_clan_id = _victim_clan_id AND tc.defender_clan_id = _killer_clan_id)
    )
  LIMIT 1;

  IF _challenge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active war between these clans');
  END IF;

  -- Get territory for proximity check
  SELECT t.center_x, t.center_z, t.radius
  INTO _territory
  FROM territories t WHERE t.id = _challenge.territory_id;

  IF _territory IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory not found');
  END IF;

  -- Proximity validation: death must be within 1.5x territory radius
  _distance := sqrt(power(_death_x - _territory.center_x, 2) + power(_death_z - _territory.center_z, 2));
  IF _distance > _territory.radius * 1.5 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('remote_pvp_death', _clean_victim, jsonb_build_object(
      'killer', _clean_killer, 'distance', round(_distance::numeric, 1),
      'territory_radius', _territory.radius
    ));
    RETURN jsonb_build_object('success', false, 'error', 'Death too far from territory');
  END IF;

  -- Rate limit: max 1 death report per 5 seconds per victim
  SELECT count(*) INTO _recent_deaths
  FROM war_kills
  WHERE victim_wallet = _clean_victim
    AND created_at > now() - interval '5 seconds';
  IF _recent_deaths > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Death report rate limited');
  END IF;

  -- Cap: max 30 deaths per victim per war
  SELECT count(*) INTO _recent_deaths
  FROM war_kills
  WHERE victim_wallet = _clean_victim
    AND challenge_id = _challenge.challenge_id;
  IF _recent_deaths >= 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max deaths per war reached');
  END IF;

  -- Insert the kill record
  INSERT INTO war_kills (challenge_id, territory_id, killer_wallet, killer_clan_id, victim_wallet, victim_clan_id, kill_x, kill_z)
  VALUES (_challenge.challenge_id, _challenge.territory_id, _clean_killer, _killer_clan_id, _clean_victim, _victim_clan_id, _death_x, _death_z);

  RETURN jsonb_build_object('success', true, 'challenge_id', _challenge.challenge_id);
END;
$$;