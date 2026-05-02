CREATE OR REPLACE FUNCTION public.is_valid_character_type(_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _type IN ('goblin', 'soldier', 'octopus', 'nemoclaw', 'chillhouse')
$$;