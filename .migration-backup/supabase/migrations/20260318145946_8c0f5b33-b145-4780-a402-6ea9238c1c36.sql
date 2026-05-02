
-- Add 'active_war' to territory_war_state enum
ALTER TYPE territory_war_state ADD VALUE IF NOT EXISTS 'active_war' AFTER 'contested';

-- Territory challenges table
CREATE TABLE public.territory_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id text NOT NULL REFERENCES territories(id),
  attacker_clan_id uuid NOT NULL REFERENCES clans(id),
  defender_clan_id uuid NOT NULL REFERENCES clans(id),
  attacker_clan_name text NOT NULL,
  attacker_clan_color text NOT NULL,
  defender_clan_name text NOT NULL,
  defender_clan_color text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending, active, resolved, cancelled, expired
  challenge_created_at timestamptz NOT NULL DEFAULT now(),
  war_starts_at timestamptz NOT NULL,
  war_ends_at timestamptz NOT NULL,
  cooldown_ends_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution text,  -- 'attacker_won', 'defender_held', 'cancelled', 'expired'
  cancelled_by text,  -- wallet that cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.territory_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_territory_challenges ON public.territory_challenges FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX idx_challenges_territory ON public.territory_challenges (territory_id, status);
CREATE INDEX idx_challenges_attacker ON public.territory_challenges (attacker_clan_id, status);
CREATE INDEX idx_challenges_defender ON public.territory_challenges (defender_clan_id, status);

-- Challenge territory RPC
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

  -- Must be clan leader
  SELECT cm.clan_id, cm.role INTO _membership
  FROM clan_members cm WHERE cm.wallet_address = _clean_wallet;
  IF _membership.clan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;
  IF _membership.role <> 'leader' THEN
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

  -- One active outgoing challenge per clan
  SELECT count(*) INTO _existing_outgoing
  FROM territory_challenges
  WHERE attacker_clan_id = _membership.clan_id
    AND status IN ('pending', 'active');
  IF _existing_outgoing >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your clan already has an active challenge. Cancel or wait for it to resolve.');
  END IF;

  -- One active challenge per territory
  SELECT count(*) INTO _existing_incoming
  FROM territory_challenges
  WHERE territory_id = _territory_id
    AND status IN ('pending', 'active');
  IF _existing_incoming >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This territory already has a pending challenge');
  END IF;

  -- Get clan info
  SELECT * INTO _attacker_clan FROM clans WHERE id = _membership.clan_id;
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

-- Cancel challenge RPC (attacker leader only, only while pending)
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
  IF _membership.role <> 'leader' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can cancel challenges');
  END IF;

  SELECT * INTO _challenge FROM territory_challenges WHERE id = _challenge_id FOR UPDATE;
  IF _challenge.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not found');
  END IF;
  IF _challenge.attacker_clan_id <> _membership.clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the attacking clan can cancel');
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

  SELECT * INTO _attacker_clan FROM clans WHERE id = _membership.clan_id;

  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_challenge.territory_id, (SELECT name FROM territories WHERE id = _challenge.territory_id),
          _membership.clan_id, _attacker_clan.name, _attacker_clan.color::text, 'war_cancelled', _clean_wallet);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Get active challenges RPC
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
      'war_starts_at', tc.war_starts_at,
      'war_ends_at', tc.war_ends_at,
      'cooldown_ends_at', tc.cooldown_ends_at,
      'created_at', tc.created_at
    ) ORDER BY tc.created_at DESC
  ), '[]'::jsonb)
  FROM territory_challenges tc
  JOIN territories t ON t.id = tc.territory_id
  WHERE tc.status IN ('pending', 'active')
  LIMIT LEAST(_limit, 100);
$$;
