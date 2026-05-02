
-- 1) updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2) character_type validation helper
CREATE OR REPLACE FUNCTION public.is_valid_character_type(_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _type IN ('goblin', 'soldier')
$$;

-- 3) player_accounts table
CREATE TABLE IF NOT EXISTS public.player_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Knight',
  community_name text,
  character_type text NOT NULL DEFAULT 'goblin',
  last_position_x double precision,
  last_position_y double precision,
  last_position_z double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT player_accounts_display_name_len_chk
    CHECK (char_length(display_name) BETWEEN 1 AND 20),

  CONSTRAINT player_accounts_community_name_len_chk
    CHECK (community_name IS NULL OR char_length(community_name) <= 30),

  CONSTRAINT player_accounts_wallet_address_format_chk
    CHECK (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),

  CONSTRAINT player_accounts_character_type_chk
    CHECK (public.is_valid_character_type(character_type))
);

-- Safety columns
ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS character_type text NOT NULL DEFAULT 'goblin';

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS last_position_x double precision;

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS last_position_y double precision;

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS last_position_z double precision;

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.player_accounts
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_accounts_character_type_chk'
  ) THEN
    ALTER TABLE public.player_accounts
      ADD CONSTRAINT player_accounts_character_type_chk
      CHECK (public.is_valid_character_type(character_type));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_accounts_display_name_len_chk'
  ) THEN
    ALTER TABLE public.player_accounts
      ADD CONSTRAINT player_accounts_display_name_len_chk
      CHECK (char_length(display_name) BETWEEN 1 AND 20);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_accounts_community_name_len_chk'
  ) THEN
    ALTER TABLE public.player_accounts
      ADD CONSTRAINT player_accounts_community_name_len_chk
      CHECK (community_name IS NULL OR char_length(community_name) <= 30);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_accounts_wallet_address_format_chk'
  ) THEN
    ALTER TABLE public.player_accounts
      ADD CONSTRAINT player_accounts_wallet_address_format_chk
      CHECK (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  END IF;
END
$$;

-- 4) RLS
ALTER TABLE public.player_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read player accounts" ON public.player_accounts;

REVOKE ALL ON TABLE public.player_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.player_accounts FROM anon;
REVOKE ALL ON TABLE public.player_accounts FROM authenticated;

-- 5) updated_at trigger
DROP TRIGGER IF EXISTS set_player_accounts_updated_at ON public.player_accounts;

CREATE TRIGGER set_player_accounts_updated_at
BEFORE UPDATE ON public.player_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 6) RPC: create_wallet_account
CREATE OR REPLACE FUNCTION public.create_wallet_account(
  _wallet_address text,
  _display_name text DEFAULT 'Knight',
  _community_name text DEFAULT NULL,
  _character_type text DEFAULT 'goblin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_wallet text;
  _clean_name text;
  _clean_community text;
  _clean_char text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  _clean_name := left(trim(coalesce(_display_name, '')), 20);
  _clean_community := nullif(left(trim(coalesce(_community_name, '')), 30), '');
  _clean_char := lower(trim(coalesce(_character_type, 'goblin')));

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  IF _clean_name = '' THEN
    _clean_name := 'Knight';
  END IF;

  IF NOT public.is_valid_character_type(_clean_char) THEN
    RAISE EXCEPTION 'Invalid character type: %', _clean_char;
  END IF;

  SELECT id
    INTO _account_id
  FROM public.player_accounts
  WHERE wallet_address = _clean_wallet;

  IF _account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Account already exists for this wallet';
  END IF;

  INSERT INTO public.player_accounts (
    wallet_address,
    display_name,
    community_name,
    character_type
  )
  VALUES (
    _clean_wallet,
    _clean_name,
    _clean_community,
    _clean_char
  )
  RETURNING id INTO _account_id;

  RETURN _account_id;
END;
$$;

-- 7) RPC: login_wallet_account
CREATE OR REPLACE FUNCTION public.login_wallet_account(
  _wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    id,
    wallet_address,
    display_name,
    community_name,
    character_type,
    last_position_x,
    last_position_y,
    last_position_z,
    created_at
  INTO _account
  FROM public.player_accounts
  WHERE wallet_address = _clean_wallet;

  IF _account.id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  UPDATE public.player_accounts
  SET last_login_at = now()
  WHERE id = _account.id;

  RETURN jsonb_build_object(
    'id', _account.id,
    'wallet_address', _account.wallet_address,
    'display_name', _account.display_name,
    'community_name', _account.community_name,
    'character_type', _account.character_type,
    'last_position_x', _account.last_position_x,
    'last_position_y', _account.last_position_y,
    'last_position_z', _account.last_position_z,
    'created_at', _account.created_at
  );
END;
$$;

-- 8) RPC: update_wallet_profile
CREATE OR REPLACE FUNCTION public.update_wallet_profile(
  _wallet_address text,
  _display_name text DEFAULT NULL,
  _community_name text DEFAULT NULL,
  _character_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_wallet text;
  _clean_char text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT id
    INTO _account_id
  FROM public.player_accounts
  WHERE wallet_address = _clean_wallet;

  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  IF _character_type IS NOT NULL THEN
    _clean_char := lower(trim(_character_type));
    IF NOT public.is_valid_character_type(_clean_char) THEN
      RAISE EXCEPTION 'Invalid character type: %', _clean_char;
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
    END,
    character_type = COALESCE(_clean_char, character_type)
  WHERE id = _account_id;
END;
$$;

-- 9) RPC: update_wallet_last_position
CREATE OR REPLACE FUNCTION public.update_wallet_last_position(
  _wallet_address text,
  _last_position_x double precision,
  _last_position_y double precision,
  _last_position_z double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_wallet text;
  _account_id uuid;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));

  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  SELECT id
    INTO _account_id
  FROM public.player_accounts
  WHERE wallet_address = _clean_wallet;

  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'No account found for this wallet';
  END IF;

  UPDATE public.player_accounts
  SET
    last_position_x = _last_position_x,
    last_position_y = _last_position_y,
    last_position_z = _last_position_z
  WHERE id = _account_id;
END;
$$;

-- 10) Explicit function permissions
REVOKE ALL ON FUNCTION public.create_wallet_account(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_wallet_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_wallet_profile(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_wallet_last_position(text, double precision, double precision, double precision) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_wallet_account(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_wallet_account(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_wallet_profile(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_wallet_last_position(text, double precision, double precision, double precision) TO anon, authenticated, service_role;
