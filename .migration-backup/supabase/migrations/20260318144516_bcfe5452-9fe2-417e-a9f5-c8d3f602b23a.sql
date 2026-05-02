
-- Release territory RPC (leader-only)
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

  UPDATE territories
  SET owning_clan_id = NULL,
      claimed_at = NULL,
      updated_at = now()
  WHERE id = _territory_id;

  RETURN jsonb_build_object('success', true, 'territory_id', _territory_id);
END;
$$;

-- Get clan members RPC
CREATE OR REPLACE FUNCTION public.get_clan_members(_clan_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'wallet_address', cm.wallet_address,
      'role', cm.role,
      'joined_at', cm.joined_at,
      'display_name', coalesce(pa.display_name, 'Unknown'),
      'character_type', coalesce(pa.character_type, 'goblin')
    ) ORDER BY cm.joined_at ASC
  ), '[]'::jsonb)
  FROM clan_members cm
  LEFT JOIN player_accounts pa ON pa.wallet_address = cm.wallet_address
  WHERE cm.clan_id = _clan_id;
$$;
