
CREATE OR REPLACE FUNCTION public.get_recent_war_kills(_challenge_id uuid, _limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      wk.id,
      wk.killer_wallet,
      wk.victim_wallet,
      wk.killer_clan_id,
      wk.victim_clan_id,
      wk.created_at,
      coalesce(pk.display_name, 'Unknown') AS killer_name,
      coalesce(pv.display_name, 'Unknown') AS victim_name,
      coalesce(ck.color::text, 'crimson') AS killer_clan_color,
      coalesce(cv.color::text, 'crimson') AS victim_clan_color
    FROM war_kills wk
    LEFT JOIN player_accounts pk ON pk.wallet_address = wk.killer_wallet
    LEFT JOIN player_accounts pv ON pv.wallet_address = wk.victim_wallet
    LEFT JOIN clans ck ON ck.id = wk.killer_clan_id
    LEFT JOIN clans cv ON cv.id = wk.victim_clan_id
    WHERE wk.challenge_id = _challenge_id
    ORDER BY wk.created_at DESC
    LIMIT LEAST(_limit, 20)
  ) sub;
$$;
