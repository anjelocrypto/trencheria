
-- Fix areas_secured to merge (union) instead of overwrite
CREATE OR REPLACE FUNCTION public.save_player_progression(
  _wallet_address text,
  _enemies_killed integer,
  _structures_built integer,
  _total_wood_gathered integer,
  _total_stone_gathered integer,
  _tier integer,
  _areas_secured text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _merged_areas text[];
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- Merge areas: union of existing + new
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(pp.areas_secured, '{}') || COALESCE(_areas_secured, '{}')
    )
    FROM (SELECT areas_secured FROM public.player_progression WHERE wallet_address = _clean_wallet) pp
  ) INTO _merged_areas;
  
  -- If no existing row, just use the input
  IF _merged_areas IS NULL THEN
    _merged_areas := COALESCE(_areas_secured, '{}');
  END IF;

  INSERT INTO public.player_progression (
    wallet_address, enemies_killed, structures_built,
    total_wood_gathered, total_stone_gathered, tier, areas_secured
  )
  VALUES (
    _clean_wallet, _enemies_killed, _structures_built,
    _total_wood_gathered, _total_stone_gathered, _tier, _merged_areas
  )
  ON CONFLICT (wallet_address)
  DO UPDATE SET
    enemies_killed = GREATEST(player_progression.enemies_killed, EXCLUDED.enemies_killed),
    structures_built = GREATEST(player_progression.structures_built, EXCLUDED.structures_built),
    total_wood_gathered = GREATEST(player_progression.total_wood_gathered, EXCLUDED.total_wood_gathered),
    total_stone_gathered = GREATEST(player_progression.total_stone_gathered, EXCLUDED.total_stone_gathered),
    tier = GREATEST(player_progression.tier, EXCLUDED.tier),
    areas_secured = _merged_areas,
    updated_at = now();
END;
$$;
