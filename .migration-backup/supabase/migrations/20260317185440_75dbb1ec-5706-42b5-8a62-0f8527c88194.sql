
-- Player progression persistence table
CREATE TABLE public.player_progression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  enemies_killed integer NOT NULL DEFAULT 0,
  structures_built integer NOT NULL DEFAULT 0,
  total_wood_gathered integer NOT NULL DEFAULT 0,
  total_stone_gathered integer NOT NULL DEFAULT 0,
  tier integer NOT NULL DEFAULT 1,
  areas_secured text[] NOT NULL DEFAULT '{}',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: deny direct access, use RPCs only
ALTER TABLE public.player_progression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_direct_progression" ON public.player_progression
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Allow public read for leaderboard
CREATE POLICY "public_read_progression" ON public.player_progression
  FOR SELECT TO public USING (true);

-- Save progression RPC
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
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  -- Verify account exists
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  INSERT INTO public.player_progression (
    wallet_address, enemies_killed, structures_built,
    total_wood_gathered, total_stone_gathered, tier, areas_secured
  )
  VALUES (
    _clean_wallet, _enemies_killed, _structures_built,
    _total_wood_gathered, _total_stone_gathered, _tier, _areas_secured
  )
  ON CONFLICT (wallet_address)
  DO UPDATE SET
    enemies_killed = GREATEST(player_progression.enemies_killed, EXCLUDED.enemies_killed),
    structures_built = GREATEST(player_progression.structures_built, EXCLUDED.structures_built),
    total_wood_gathered = GREATEST(player_progression.total_wood_gathered, EXCLUDED.total_wood_gathered),
    total_stone_gathered = GREATEST(player_progression.total_stone_gathered, EXCLUDED.total_stone_gathered),
    tier = GREATEST(player_progression.tier, EXCLUDED.tier),
    areas_secured = EXCLUDED.areas_secured,
    updated_at = now();
END;
$$;

-- Load progression RPC
CREATE OR REPLACE FUNCTION public.load_player_progression(_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _row public.player_progression;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT * INTO _row FROM public.player_progression WHERE wallet_address = _clean_wallet;
  
  IF _row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'enemies_killed', _row.enemies_killed,
    'structures_built', _row.structures_built,
    'total_wood_gathered', _row.total_wood_gathered,
    'total_stone_gathered', _row.total_stone_gathered,
    'tier', _row.tier,
    'areas_secured', _row.areas_secured
  );
END;
$$;

-- Leaderboard RPC — top players by total score
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit integer DEFAULT 20)
RETURNS TABLE(
  display_name text,
  community_name text,
  character_type text,
  enemies_killed integer,
  structures_built integer,
  total_wood_gathered integer,
  total_stone_gathered integer,
  tier integer,
  total_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pa.display_name,
    pa.community_name,
    pa.character_type,
    pp.enemies_killed,
    pp.structures_built,
    pp.total_wood_gathered,
    pp.total_stone_gathered,
    pp.tier,
    (pp.enemies_killed * 10 + pp.structures_built * 5 + pp.total_wood_gathered + pp.total_stone_gathered) as total_score
  FROM public.player_progression pp
  JOIN public.player_accounts pa ON pa.wallet_address = pp.wallet_address
  ORDER BY total_score DESC
  LIMIT LEAST(_limit, 100);
$$;
