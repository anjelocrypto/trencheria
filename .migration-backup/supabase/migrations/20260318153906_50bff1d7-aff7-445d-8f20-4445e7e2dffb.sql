
-- Phase 3b: War kill logging table + secure RPC

-- War kills table — logs kills during active wars for future resolution logic
CREATE TABLE public.war_kills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL,
  territory_id text NOT NULL,
  killer_wallet text NOT NULL,
  killer_clan_id uuid NOT NULL,
  victim_wallet text NOT NULL,
  victim_clan_id uuid NOT NULL,
  kill_x double precision NOT NULL,
  kill_z double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by challenge
CREATE INDEX idx_war_kills_challenge ON public.war_kills(challenge_id);
CREATE INDEX idx_war_kills_territory ON public.war_kills(territory_id);

-- RLS: deny all direct access (only via RPC)
ALTER TABLE public.war_kills ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_war_kills ON public.war_kills FOR ALL TO public USING (false) WITH CHECK (false);

-- RPC: log_war_kill — validates session, active war, proximity, cooldown, anti-spam
CREATE OR REPLACE FUNCTION public.log_war_kill(
  _wallet_address text,
  _session_token text,
  _victim_wallet text,
  _kill_x double precision,
  _kill_z double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _clean_victim text;
  _killer_clan_id uuid;
  _victim_clan_id uuid;
  _challenge record;
  _territory record;
  _distance double precision;
  _recent_kills integer;
  _last_kill_at timestamptz;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  _clean_victim := trim(coalesce(_victim_wallet, ''));

  -- Basic validation
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid killer wallet');
  END IF;

  -- Session validation
  IF _session_token IS NULL OR _session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session required');
  END IF;
  IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('invalid_session', _clean_wallet, '{"action":"log_war_kill"}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  -- Cannot kill yourself
  IF _clean_wallet = _clean_victim THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-kill rejected');
  END IF;

  -- Both must have accounts
  IF NOT EXISTS (SELECT 1 FROM player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Killer has no account');
  END IF;
  IF _clean_victim ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' AND
     NOT EXISTS (SELECT 1 FROM player_accounts WHERE wallet_address = _clean_victim) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Victim has no account');
  END IF;

  -- Get killer clan
  SELECT cm.clan_id INTO _killer_clan_id
  FROM clan_members cm WHERE cm.wallet_address = _clean_wallet;
  IF _killer_clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Killer not in a clan');
  END IF;

  -- Get victim clan
  SELECT cm.clan_id INTO _victim_clan_id
  FROM clan_members cm WHERE cm.wallet_address = _clean_victim;
  IF _victim_clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Victim not in a clan');
  END IF;

  -- Must be different clans
  IF _killer_clan_id = _victim_clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Same clan');
  END IF;

  -- Find active war challenge involving both clans
  SELECT tc.id AS challenge_id, tc.territory_id,
         t.center_x, t.center_z, t.radius
  INTO _challenge
  FROM territory_challenges tc
  JOIN territories t ON t.id = tc.territory_id
  WHERE tc.status = 'active'
    AND (
      (tc.attacker_clan_id = _killer_clan_id AND tc.defender_clan_id = _victim_clan_id) OR
      (tc.attacker_clan_id = _victim_clan_id AND tc.defender_clan_id = _killer_clan_id)
    )
  LIMIT 1;

  IF _challenge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active war between these clans');
  END IF;

  -- Proximity check: kill must be within territory radius * 1.5 (generous for border fights)
  _distance := sqrt(
    power(_kill_x - _challenge.center_x, 2) +
    power(_kill_z - _challenge.center_z, 2)
  );
  IF _distance > _challenge.radius * 1.5 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('remote_war_kill', _clean_wallet, jsonb_build_object(
      'distance', round(_distance::numeric, 2),
      'radius', _challenge.radius,
      'challenge_id', _challenge.challenge_id
    ));
    RETURN jsonb_build_object('success', false, 'error', 'Kill too far from territory');
  END IF;

  -- Anti-spam: max 1 kill per 3 seconds per killer
  SELECT max(created_at) INTO _last_kill_at
  FROM war_kills
  WHERE killer_wallet = _clean_wallet
    AND challenge_id = _challenge.challenge_id;

  IF _last_kill_at IS NOT NULL AND _last_kill_at > now() - interval '3 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kill rate limited');
  END IF;

  -- Anti-spam: max 30 kills per killer per challenge
  SELECT count(*) INTO _recent_kills
  FROM war_kills
  WHERE killer_wallet = _clean_wallet
    AND challenge_id = _challenge.challenge_id;

  IF _recent_kills >= 30 THEN
    INSERT INTO public.security_logs (event_type, wallet_address, details)
    VALUES ('war_kill_cap', _clean_wallet, jsonb_build_object('challenge_id', _challenge.challenge_id, 'count', _recent_kills));
    RETURN jsonb_build_object('success', false, 'error', 'Kill cap reached for this war');
  END IF;

  -- World bounds check
  IF abs(_kill_x) > 900 OR abs(_kill_z) > 900 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Out of bounds');
  END IF;

  -- Log the kill
  INSERT INTO war_kills (challenge_id, territory_id, killer_wallet, killer_clan_id, victim_wallet, victim_clan_id, kill_x, kill_z)
  VALUES (_challenge.challenge_id, _challenge.territory_id, _clean_wallet, _killer_clan_id, _clean_victim, _victim_clan_id, _kill_x, _kill_z);

  RETURN jsonb_build_object('success', true, 'challenge_id', _challenge.challenge_id);
END;
$$;

-- RPC: get_war_kills — returns kill counts per clan for a challenge (admin or public stats)
CREATE OR REPLACE FUNCTION public.get_war_kills(_challenge_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'challenge_id', _challenge_id,
    'kills', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('clan_id', killer_clan_id, 'kill_count', cnt)
      )
      FROM (
        SELECT killer_clan_id, count(*) AS cnt
        FROM war_kills
        WHERE challenge_id = _challenge_id
        GROUP BY killer_clan_id
      ) sub
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM war_kills WHERE challenge_id = _challenge_id)
  );
$$;
