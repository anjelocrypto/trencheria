
CREATE OR REPLACE FUNCTION public.update_wallet_profile(
  _wallet_address text,
  _display_name text DEFAULT NULL::text,
  _community_name text DEFAULT NULL::text,
  _character_type text DEFAULT NULL::text,
  _session_token text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _clean_wallet text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT id INTO _account_id
  FROM public.player_accounts
  WHERE wallet_address = _clean_wallet;

  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  -- CHARACTER TYPE IS PERMANENTLY LOCKED TO FACTION
  IF _character_type IS NOT NULL THEN
    RAISE EXCEPTION 'Character type is locked. Faction identity is permanent.';
  END IF;

  -- SESSION VALIDATION (optional for backward compat but recommended)
  IF _session_token IS NOT NULL AND _session_token <> '' THEN
    IF NOT public.verify_wallet_session(_clean_wallet, _session_token) THEN
      RAISE EXCEPTION 'Invalid session';
    END IF;
  END IF;

  UPDATE public.player_accounts
  SET
    display_name = COALESCE(
      nullif(left(trim(coalesce(_display_name, '')), 20), ''),
      display_name
    ),
    community_name = CASE
      WHEN _community_name IS NOT NULL
        THEN nullif(left(trim(_community_name), 30), '')
      ELSE community_name
    END
  WHERE id = _account_id;
END;
$function$;

-- Also drop the old 4-arg overload that doesn't have session token
DROP FUNCTION IF EXISTS public.update_wallet_profile(text, text, text, text);
