
-- ============================================================
-- CLAN & TERRITORY SYSTEM — Phase 1 Foundation
-- ============================================================

-- Preset clan colors enum
CREATE TYPE public.clan_color AS ENUM (
  'crimson', 'azure', 'emerald', 'gold', 'violet',
  'silver', 'amber', 'teal', 'ivory', 'obsidian'
);

-- Territory war state (placeholder for future phases)
CREATE TYPE public.territory_war_state AS ENUM (
  'peaceful', 'contested', 'cooldown'
);

-- ========== CLANS TABLE ==========
CREATE TABLE public.clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color clan_color NOT NULL,
  leader_wallet text NOT NULL,
  member_count integer NOT NULL DEFAULT 1,
  max_members integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clan_name_length CHECK (char_length(trim(name)) BETWEEN 2 AND 24)
);

ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_direct_clans" ON public.clans FOR ALL TO public USING (false) WITH CHECK (false);

-- ========== CLAN MEMBERS TABLE ==========
CREATE TABLE public.clan_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  wallet_address text NOT NULL UNIQUE, -- one clan per wallet
  role text NOT NULL DEFAULT 'member', -- 'leader' or 'member'
  joined_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_direct_clan_members" ON public.clan_members FOR ALL TO public USING (false) WITH CHECK (false);

-- ========== TERRITORIES TABLE ==========
CREATE TABLE public.territories (
  id text PRIMARY KEY, -- matches region id e.g. 'thornwall'
  name text NOT NULL,
  region_id text NOT NULL,
  center_x double precision NOT NULL DEFAULT 0,
  center_z double precision NOT NULL DEFAULT 0,
  radius double precision NOT NULL DEFAULT 80,
  owning_clan_id uuid REFERENCES public.clans(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  war_state territory_war_state NOT NULL DEFAULT 'peaceful',
  war_cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
-- Territories are read-only publicly (everyone can see ownership)
CREATE POLICY "anyone_can_read_territories" ON public.territories FOR SELECT TO public USING (true);
-- No direct mutation
CREATE POLICY "deny_direct_mutation_territories" ON public.territories FOR INSERT TO public WITH CHECK (false);
CREATE POLICY "deny_direct_update_territories" ON public.territories FOR UPDATE TO public USING (false);
CREATE POLICY "deny_direct_delete_territories" ON public.territories FOR DELETE TO public USING (false);

-- Seed the 5 claimable territories (outer kingdoms) as unclaimed
INSERT INTO public.territories (id, name, region_id, center_x, center_z, radius) VALUES
  ('thornwall', 'Thornwall Reaches', 'thornwall', -500, -450, 90),
  ('rivermoor', 'Rivermoor Wetlands', 'rivermoor', 450, 350, 85),
  ('stonepeak', 'Stonepeak Highlands', 'stonepeak', -400, 500, 80),
  ('darkhollow', 'Darkhollow Wastes', 'darkhollow', 550, -400, 80),
  ('goldenvale', 'Goldenvale Plains', 'goldenvale', -550, 100, 90);

-- ========== RPC: CREATE CLAN ==========
CREATE OR REPLACE FUNCTION public.create_clan(
  _wallet_address text,
  _session_token text,
  _clan_name text,
  _clan_color text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _clean_name text;
  _color clan_color;
  _clan_id uuid;
  _existing_clan uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Check player not already in a clan
  SELECT clan_id INTO _existing_clan FROM clan_members WHERE wallet_address = _clean_wallet;
  IF _existing_clan IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already in a clan');
  END IF;

  -- Validate name
  _clean_name := trim(_clan_name);
  IF char_length(_clean_name) < 2 OR char_length(_clean_name) > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clan name must be 2-24 characters');
  END IF;
  IF _clean_name !~ '^[A-Za-z0-9 _\-]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clan name: letters, numbers, spaces, hyphens, underscores only');
  END IF;
  -- Reserved name check
  IF lower(_clean_name) IN ('admin', 'system', 'moderator', 'mod', 'staff', 'official', 'trencheria', 'trencheri', 'developer', 'dev', 'support', 'server', 'neutral', 'unclaimed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'That clan name is reserved');
  END IF;
  -- Duplicate check
  IF EXISTS (SELECT 1 FROM clans WHERE lower(name) = lower(_clean_name)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clan name already taken');
  END IF;

  -- Validate color
  BEGIN
    _color := _clan_color::clan_color;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid clan color');
  END;

  -- Create clan
  INSERT INTO clans (name, color, leader_wallet)
  VALUES (_clean_name, _color, _clean_wallet)
  RETURNING id INTO _clan_id;

  -- Add leader as member
  INSERT INTO clan_members (clan_id, wallet_address, role)
  VALUES (_clan_id, _clean_wallet, 'leader');

  RETURN jsonb_build_object('success', true, 'clan_id', _clan_id, 'name', _clean_name, 'color', _color::text);
END;
$$;

-- ========== RPC: JOIN CLAN ==========
CREATE OR REPLACE FUNCTION public.join_clan(
  _wallet_address text,
  _session_token text,
  _clan_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _existing uuid;
  _clan record;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Check not already in a clan
  SELECT clan_id INTO _existing FROM clan_members WHERE wallet_address = _clean_wallet;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already in a clan');
  END IF;

  -- Get clan info
  SELECT * INTO _clan FROM clans WHERE id = _clan_id;
  IF _clan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clan not found');
  END IF;
  IF _clan.member_count >= _clan.max_members THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clan is full');
  END IF;

  -- Add member
  INSERT INTO clan_members (clan_id, wallet_address, role)
  VALUES (_clan_id, _clean_wallet, 'member');

  UPDATE clans SET member_count = member_count + 1, updated_at = now() WHERE id = _clan_id;

  RETURN jsonb_build_object('success', true, 'clan_id', _clan_id, 'clan_name', _clan.name);
END;
$$;

-- ========== RPC: LEAVE CLAN ==========
CREATE OR REPLACE FUNCTION public.leave_clan(
  _wallet_address text,
  _session_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _membership record;
  _remaining integer;
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

  -- Remove member
  DELETE FROM clan_members WHERE id = _membership.id;
  UPDATE clans SET member_count = GREATEST(member_count - 1, 0), updated_at = now() WHERE id = _membership.clan_id;

  -- If leader left, promote next member or dissolve
  IF _membership.role = 'leader' THEN
    SELECT count(*) INTO _remaining FROM clan_members WHERE clan_id = _membership.clan_id;
    IF _remaining > 0 THEN
      -- Promote oldest member
      UPDATE clan_members SET role = 'leader'
      WHERE id = (SELECT id FROM clan_members WHERE clan_id = _membership.clan_id ORDER BY joined_at ASC LIMIT 1);
      UPDATE clans SET leader_wallet = (SELECT wallet_address FROM clan_members WHERE clan_id = _membership.clan_id AND role = 'leader' LIMIT 1)
      WHERE id = _membership.clan_id;
    ELSE
      -- Release territories owned by this clan
      UPDATE territories SET owning_clan_id = NULL, claimed_at = NULL, updated_at = now()
      WHERE owning_clan_id = _membership.clan_id;
      -- Dissolve clan
      DELETE FROM clans WHERE id = _membership.clan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ========== RPC: CLAIM TERRITORY ==========
CREATE OR REPLACE FUNCTION public.claim_territory(
  _wallet_address text,
  _session_token text,
  _territory_id text,
  _player_x double precision DEFAULT NULL,
  _player_z double precision DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _membership record;
  _territory record;
  _distance double precision;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;
  IF NOT verify_wallet_session(_clean_wallet, _session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  -- Must be a clan leader
  SELECT cm.*, c.name as clan_name, c.color as clan_color
  INTO _membership
  FROM clan_members cm
  JOIN clans c ON c.id = cm.clan_id
  WHERE cm.wallet_address = _clean_wallet;

  IF _membership.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;
  IF _membership.role <> 'leader' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only clan leaders can claim territories');
  END IF;

  -- Get territory
  SELECT * INTO _territory FROM territories WHERE id = _territory_id FOR UPDATE;
  IF _territory.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory not found');
  END IF;
  IF _territory.owning_clan_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory already claimed');
  END IF;
  IF _territory.war_state <> 'peaceful' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Territory is in war state');
  END IF;

  -- Proximity check: must be within territory radius + buffer
  IF _player_x IS NOT NULL AND _player_z IS NOT NULL THEN
    _distance := sqrt(power(_player_x - _territory.center_x, 2) + power(_player_z - _territory.center_z, 2));
    IF _distance > _territory.radius + 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Too far from territory to claim');
    END IF;
  END IF;

  -- Claim it
  UPDATE territories
  SET owning_clan_id = _membership.clan_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _territory_id;

  RETURN jsonb_build_object('success', true, 'territory', _territory_id, 'clan', _membership.clan_name);
END;
$$;

-- ========== RPC: GET CLANS LIST ==========
CREATE OR REPLACE FUNCTION public.get_clans(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'color', c.color::text,
      'leader_wallet', c.leader_wallet,
      'member_count', c.member_count,
      'max_members', c.max_members,
      'created_at', c.created_at
    ) ORDER BY c.member_count DESC
  ), '[]'::jsonb)
  FROM (SELECT * FROM clans ORDER BY member_count DESC LIMIT LEAST(_limit, 100)) c;
$$;

-- ========== RPC: GET MY CLAN ==========
CREATE OR REPLACE FUNCTION public.get_my_clan(_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _result jsonb;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'clan_id', c.id,
    'clan_name', c.name,
    'clan_color', c.color::text,
    'role', cm.role,
    'member_count', c.member_count,
    'max_members', c.max_members,
    'leader_wallet', c.leader_wallet,
    'joined_at', cm.joined_at
  ) INTO _result
  FROM clan_members cm
  JOIN clans c ON c.id = cm.clan_id
  WHERE cm.wallet_address = _clean_wallet;

  RETURN _result;
END;
$$;

-- ========== RPC: GET TERRITORIES ==========
CREATE OR REPLACE FUNCTION public.get_territories()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'center_x', t.center_x,
      'center_z', t.center_z,
      'radius', t.radius,
      'owning_clan_id', t.owning_clan_id,
      'owning_clan_name', c.name,
      'owning_clan_color', c.color::text,
      'claimed_at', t.claimed_at,
      'war_state', t.war_state::text
    )
  ), '[]'::jsonb)
  FROM territories t
  LEFT JOIN clans c ON c.id = t.owning_clan_id;
$$;
