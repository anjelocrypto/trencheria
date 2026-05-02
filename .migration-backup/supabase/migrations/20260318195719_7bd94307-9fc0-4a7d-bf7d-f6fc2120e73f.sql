
-- ============================================================
-- FIXED FACTION MIGRATION
-- Converts free-clan system to 7 permanent factions
-- ============================================================

-- 1. Add faction_id to player_accounts (permanent, nullable initially for migration)
ALTER TABLE public.player_accounts ADD COLUMN IF NOT EXISTS faction_id uuid;

-- 2. Insert 7 fixed factions into clans table with stable UUIDs
-- Using deterministic UUIDs for each faction
INSERT INTO public.clans (id, name, color, leader_wallet, member_count, max_members)
VALUES 
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Octopus', 'teal', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'NemoClaw', 'crimson', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Goblins', 'emerald', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'Soldiers', 'azure', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'ChillGuys', 'amber', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'Yetis', 'silver', '__system__', 0, 999999),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'Dogs', 'gold', '__system__', 0, 999999)
ON CONFLICT (id) DO NOTHING;

-- 3. Update is_valid_character_type to include yeti and dog
CREATE OR REPLACE FUNCTION public.is_valid_character_type(_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT _type IN ('goblin', 'soldier', 'octopus', 'nemoclaw', 'chillhouse', 'yeti', 'dog')
$$;

-- 4. Add 2 new territories for Yetis and Dogs kingdoms
-- Frostmere -> Yetis Kingdom, Blackthorn -> Dogs Kingdom
-- Using existing region centers for the 2 new kingdoms
INSERT INTO public.territories (id, name, region_id, center_x, center_z, radius)
VALUES 
  ('frostmere', 'Yetis Kingdom', 'frostmere', 160, 200, 80),
  ('blackthorn', 'Dogs Kingdom', 'blackthorn', 190, -160, 80)
ON CONFLICT (id) DO NOTHING;

-- 5. Update existing territory names to faction kingdom names
UPDATE public.territories SET name = 'Octopus Kingdom' WHERE id = 'rivermoor';
UPDATE public.territories SET name = 'NemoClaw Kingdom' WHERE id = 'darkhollow';
UPDATE public.territories SET name = 'Goblins Kingdom' WHERE id = 'thornwall';
UPDATE public.territories SET name = 'Soldiers Kingdom' WHERE id = 'stonepeak';
UPDATE public.territories SET name = 'ChillGuys Kingdom' WHERE id = 'goldenvale';

-- 6. Assign fixed faction ownership to their home territories
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000001'::uuid, claimed_at = now() WHERE id = 'rivermoor';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000002'::uuid, claimed_at = now() WHERE id = 'darkhollow';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000003'::uuid, claimed_at = now() WHERE id = 'thornwall';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000004'::uuid, claimed_at = now() WHERE id = 'stonepeak';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000005'::uuid, claimed_at = now() WHERE id = 'goldenvale';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000006'::uuid, claimed_at = now() WHERE id = 'frostmere';
UPDATE public.territories SET owning_clan_id = '00000000-0000-0000-0000-000000000007'::uuid, claimed_at = now() WHERE id = 'blackthorn';

-- 7. Create RPC to register with faction (replaces create_wallet_account + join_clan)
CREATE OR REPLACE FUNCTION public.register_with_faction(
  _wallet_address text,
  _display_name text DEFAULT 'Knight',
  _community_name text DEFAULT NULL,
  _faction_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _clean_name text;
  _clean_community text;
  _account_id uuid;
  _faction_row record;
  _char_type text;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  _clean_name := left(trim(coalesce(_display_name, '')), 20);
  _clean_community := nullif(left(trim(coalesce(_community_name, '')), 30), '');

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet address');
  END IF;

  IF _clean_name = '' THEN _clean_name := 'Knight'; END IF;

  -- Validate faction exists and is one of the 7 fixed factions
  IF _faction_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Faction selection required');
  END IF;

  SELECT * INTO _faction_row FROM public.clans WHERE id = _faction_id AND leader_wallet = '__system__';
  IF _faction_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid faction');
  END IF;

  -- Map faction to character type
  _char_type := CASE _faction_row.name
    WHEN 'Octopus' THEN 'octopus'
    WHEN 'NemoClaw' THEN 'nemoclaw'
    WHEN 'Goblins' THEN 'goblin'
    WHEN 'Soldiers' THEN 'soldier'
    WHEN 'ChillGuys' THEN 'chillhouse'
    WHEN 'Yetis' THEN 'yeti'
    WHEN 'Dogs' THEN 'dog'
    ELSE 'goblin'
  END;

  -- Check existing account
  SELECT id INTO _account_id FROM public.player_accounts WHERE wallet_address = _clean_wallet;
  IF _account_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account already exists for this wallet. Use login instead.');
  END IF;

  -- Create account with faction
  INSERT INTO public.player_accounts (wallet_address, display_name, community_name, character_type, faction_id)
  VALUES (_clean_wallet, _clean_name, _clean_community, _char_type, _faction_id)
  RETURNING id INTO _account_id;

  -- Add to clan_members
  INSERT INTO public.clan_members (clan_id, wallet_address, role)
  VALUES (_faction_id, _clean_wallet, 'member')
  ON CONFLICT DO NOTHING;

  -- Update member count
  UPDATE public.clans SET member_count = (
    SELECT count(*) FROM public.clan_members WHERE clan_id = _faction_id
  ) WHERE id = _faction_id;

  RETURN jsonb_build_object(
    'success', true,
    'account_id', _account_id,
    'faction_id', _faction_id,
    'faction_name', _faction_row.name,
    'character_type', _char_type
  );
END;
$$;

-- 8. Update login to return faction info
CREATE OR REPLACE FUNCTION public.login_wallet_account(_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _account record;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT
    pa.id, pa.wallet_address, pa.display_name, pa.community_name,
    pa.character_type, pa.last_position_x, pa.last_position_y, pa.last_position_z,
    pa.created_at, pa.faction_id,
    c.name as faction_name, c.color as faction_color
  INTO _account
  FROM public.player_accounts pa
  LEFT JOIN public.clans c ON c.id = pa.faction_id
  WHERE pa.wallet_address = _clean_wallet;

  IF _account.id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  UPDATE public.player_accounts SET last_login_at = now() WHERE id = _account.id;

  RETURN jsonb_build_object(
    'id', _account.id,
    'wallet_address', _account.wallet_address,
    'display_name', _account.display_name,
    'community_name', _account.community_name,
    'character_type', _account.character_type,
    'last_position_x', _account.last_position_x,
    'last_position_y', _account.last_position_y,
    'last_position_z', _account.last_position_z,
    'created_at', _account.created_at,
    'faction_id', _account.faction_id,
    'faction_name', _account.faction_name,
    'faction_color', _account.faction_color
  );
END;
$$;

-- 9. Update get_my_clan to work with faction system
-- (it already works since factions ARE clans, just ensure it returns for faction members)

-- 10. Disable create_clan for non-system users
CREATE OR REPLACE FUNCTION public.create_clan(
  _wallet_address text,
  _session_token text,
  _clan_name text,
  _clan_color text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object('success', false, 'error', 'Custom clan creation is disabled. Choose a faction during registration.');
END;
$$;

-- 11. Disable join_clan for arbitrary joining
CREATE OR REPLACE FUNCTION public.join_clan(
  _wallet_address text,
  _session_token text,
  _clan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object('success', false, 'error', 'Free clan joining is disabled. Faction is assigned during registration.');
END;
$$;

-- 12. Disable leave_clan
CREATE OR REPLACE FUNCTION public.leave_clan(
  _wallet_address text,
  _session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object('success', false, 'error', 'Faction membership is permanent.');
END;
$$;

-- 13. Migrate existing accounts: set faction_id based on their clan_members entry
-- If they have a clan membership, map it to nearest faction
UPDATE public.player_accounts pa
SET faction_id = cm.clan_id
FROM public.clan_members cm
WHERE cm.wallet_address = pa.wallet_address
  AND pa.faction_id IS NULL
  AND cm.clan_id IN (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000005'::uuid,
    '00000000-0000-0000-0000-000000000006'::uuid,
    '00000000-0000-0000-0000-000000000007'::uuid
  );
