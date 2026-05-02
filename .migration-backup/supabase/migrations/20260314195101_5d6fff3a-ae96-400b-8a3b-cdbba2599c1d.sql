
-- Fix search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Fix search_path on is_valid_character_type
CREATE OR REPLACE FUNCTION public.is_valid_character_type(_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _type IN ('goblin', 'soldier')
$$;

-- Add explicit deny-all RLS policy to silence "RLS enabled no policy" warning
-- Direct table access is already revoked; this is belt-and-suspenders
CREATE POLICY "deny_all_direct_access" ON public.player_accounts
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
