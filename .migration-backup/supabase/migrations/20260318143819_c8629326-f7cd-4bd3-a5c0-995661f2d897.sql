
CREATE OR REPLACE FUNCTION public.claim_territory(
  _wallet_address text,
  _session_token text,
  _territory_id text,
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
  _membership record;
  _territory record;
  _existing_territory_count integer;
  _distance double precision;
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
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can claim territories');
  END IF;

  -- *** 1-territory-per-clan limit ***
  SELECT count(*) INTO _existing_territory_count
  FROM territories WHERE owning_clan_id = _membership.clan_id;
  IF _existing_territory_count >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your clan already owns a territory. Release it first or wait for future war system.');
  END IF;

  -- Territory must exist and be unclaimed
  SELECT * INTO _territory FROM territories WHERE id = _territory_id FOR UPDATE;
  IF _territory.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory not found');
  END IF;
  IF _territory.owning_clan_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory already claimed');
  END IF;
  IF _territory.war_state <> 'peaceful' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory is in war/cooldown state');
  END IF;

  -- Proximity check
  IF _player_x IS NOT NULL AND _player_z IS NOT NULL THEN
    _distance := sqrt(power(_player_x - _territory.center_x, 2) + power(_player_z - _territory.center_z, 2));
    IF _distance > _territory.radius + 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Too far from territory center');
    END IF;
  END IF;

  -- Claim it
  UPDATE territories
  SET owning_clan_id = _membership.clan_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _territory_id;

  RETURN jsonb_build_object('success', true, 'territory_id', _territory_id);
END;
$$;
