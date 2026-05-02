
-- Territory ownership history table
CREATE TABLE public.territory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id text NOT NULL,
  territory_name text NOT NULL,
  clan_id uuid,
  clan_name text,
  clan_color text,
  event_type text NOT NULL, -- 'claimed', 'released', 'dissolved'
  actor_wallet text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all direct access, read via RPC
ALTER TABLE public.territory_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_territory_history ON public.territory_history FOR ALL USING (false) WITH CHECK (false);

-- Index for fast lookups
CREATE INDEX idx_territory_history_territory ON public.territory_history (territory_id, created_at DESC);
CREATE INDEX idx_territory_history_clan ON public.territory_history (clan_id, created_at DESC);

-- Update claim_territory to log history
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
  _clan_record record;
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
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can claim territories');
  END IF;

  SELECT count(*) INTO _existing_territory_count
  FROM territories WHERE owning_clan_id = _membership.clan_id;
  IF _existing_territory_count >= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your clan already owns a territory. Release it first or wait for future war system.');
  END IF;

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

  IF _player_x IS NOT NULL AND _player_z IS NOT NULL THEN
    _distance := sqrt(power(_player_x - _territory.center_x, 2) + power(_player_z - _territory.center_z, 2));
    IF _distance > _territory.radius + 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Too far from territory center');
    END IF;
  END IF;

  -- Get clan info for history
  SELECT * INTO _clan_record FROM clans WHERE id = _membership.clan_id;

  UPDATE territories
  SET owning_clan_id = _membership.clan_id, claimed_at = now(), updated_at = now()
  WHERE id = _territory_id;

  -- Log history
  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_territory_id, _territory.name, _membership.clan_id, _clan_record.name, _clan_record.color::text, 'claimed', _clean_wallet);

  RETURN jsonb_build_object('success', true, 'territory_id', _territory_id);
END;
$$;

-- Update release_territory to log history
CREATE OR REPLACE FUNCTION public.release_territory(
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
  _clan_record record;
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
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can release territories');
  END IF;

  SELECT * INTO _territory FROM territories WHERE id = _territory_id FOR UPDATE;
  IF _territory.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory not found');
  END IF;
  IF _territory.owning_clan_id IS NULL OR _territory.owning_clan_id <> _membership.clan_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your clan does not own this territory');
  END IF;

  SELECT * INTO _clan_record FROM clans WHERE id = _membership.clan_id;

  UPDATE territories
  SET owning_clan_id = NULL, claimed_at = NULL, updated_at = now()
  WHERE id = _territory_id;

  -- Log history
  INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
  VALUES (_territory_id, _territory.name, _membership.clan_id, _clan_record.name, _clan_record.color::text, 'released', _clean_wallet);

  RETURN jsonb_build_object('success', true, 'territory_id', _territory_id);
END;
$$;

-- Update leave_clan to log dissolved territory history
CREATE OR REPLACE FUNCTION public.leave_clan(_wallet_address text, _session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _membership record;
  _remaining integer;
  _clan_record record;
  _owned_territory record;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT * INTO _membership FROM clan_members WHERE wallet_address = _clean_wallet;
  IF _membership.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;

  SELECT * INTO _clan_record FROM clans WHERE id = _membership.clan_id;

  DELETE FROM clan_members WHERE id = _membership.id;
  UPDATE clans SET member_count = GREATEST(member_count - 1, 0), updated_at = now() WHERE id = _membership.clan_id;

  IF _membership.role = 'leader' THEN
    SELECT count(*) INTO _remaining FROM clan_members WHERE clan_id = _membership.clan_id;
    IF _remaining > 0 THEN
      UPDATE clan_members SET role = 'leader'
      WHERE id = (SELECT id FROM clan_members WHERE clan_id = _membership.clan_id ORDER BY joined_at ASC LIMIT 1);
      UPDATE clans SET leader_wallet = (SELECT wallet_address FROM clan_members WHERE clan_id = _membership.clan_id AND role = 'leader' LIMIT 1)
      WHERE id = _membership.clan_id;
    ELSE
      -- Log territory dissolution history before releasing
      FOR _owned_territory IN SELECT * FROM territories WHERE owning_clan_id = _membership.clan_id LOOP
        INSERT INTO territory_history (territory_id, territory_name, clan_id, clan_name, clan_color, event_type, actor_wallet)
        VALUES (_owned_territory.id, _owned_territory.name, _membership.clan_id, _clan_record.name, _clan_record.color::text, 'dissolved', _clean_wallet);
      END LOOP;

      UPDATE territories SET owning_clan_id = NULL, claimed_at = NULL, updated_at = now()
      WHERE owning_clan_id = _membership.clan_id;
      DELETE FROM clans WHERE id = _membership.clan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC to read territory history
CREATE OR REPLACE FUNCTION public.get_territory_history(_territory_id text DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', th.id,
      'territory_id', th.territory_id,
      'territory_name', th.territory_name,
      'clan_id', th.clan_id,
      'clan_name', th.clan_name,
      'clan_color', th.clan_color,
      'event_type', th.event_type,
      'created_at', th.created_at
    ) ORDER BY th.created_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT * FROM territory_history
    WHERE (_territory_id IS NULL OR territory_id = _territory_id)
    ORDER BY created_at DESC
    LIMIT LEAST(_limit, 200)
  ) th;
$$;
