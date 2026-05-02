
-- Player coin balances
CREATE TABLE public.player_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  trencheri_balance integer NOT NULL DEFAULT 0,
  total_coins_collected integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_balances ENABLE ROW LEVEL SECURITY;

-- Deny all direct access (use RPCs only)
CREATE POLICY "deny_all_direct_balances" ON public.player_balances
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Public read for leaderboard/display
CREATE POLICY "public_read_balances" ON public.player_balances
  FOR SELECT TO public USING (true);

-- Coin claim log to prevent duplicate claims
CREATE TABLE public.coin_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  coin_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_direct_claims" ON public.coin_claims
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Unique constraint: one claim per coin per wallet
CREATE UNIQUE INDEX idx_coin_claims_unique ON public.coin_claims (coin_id);

-- Cleanup old claims (coins despawn, so old claims are irrelevant)
-- We'll use coin_id format: "coin_{timestamp}_{index}" so we can purge old ones

-- RPC: Claim a coin (server-validated)
CREATE OR REPLACE FUNCTION public.claim_trencheri_coin(
  _wallet_address text,
  _coin_id text,
  _amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean_wallet text;
  _new_balance integer;
BEGIN
  _clean_wallet := trim(coalesce(_wallet_address, ''));
  
  -- Validate wallet format
  IF _clean_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet');
  END IF;

  -- Validate amount
  IF _amount < 1 OR _amount > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Check account exists
  IF NOT EXISTS (SELECT 1 FROM public.player_accounts WHERE wallet_address = _clean_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account');
  END IF;

  -- Try to insert claim (unique on coin_id prevents double-claim)
  BEGIN
    INSERT INTO public.coin_claims (wallet_address, coin_id)
    VALUES (_clean_wallet, _coin_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END;

  -- Upsert balance
  INSERT INTO public.player_balances (wallet_address, trencheri_balance, total_coins_collected)
  VALUES (_clean_wallet, _amount, _amount)
  ON CONFLICT (wallet_address)
  DO UPDATE SET
    trencheri_balance = player_balances.trencheri_balance + _amount,
    total_coins_collected = player_balances.total_coins_collected + _amount,
    updated_at = now();

  SELECT trencheri_balance INTO _new_balance
  FROM public.player_balances
  WHERE wallet_address = _clean_wallet;

  RETURN jsonb_build_object('success', true, 'balance', _new_balance);
END;
$$;

-- RPC: Get balance
CREATE OR REPLACE FUNCTION public.get_trencheri_balance(_wallet_address text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT trencheri_balance FROM public.player_balances WHERE wallet_address = trim(_wallet_address)),
    0
  );
$$;

-- Cleanup old coin claims (run periodically or on demand)
CREATE OR REPLACE FUNCTION public.cleanup_old_coin_claims()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.coin_claims WHERE claimed_at < now() - interval '1 hour';
END;
$$;
