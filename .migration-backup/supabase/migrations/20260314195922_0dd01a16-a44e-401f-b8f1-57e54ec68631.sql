GRANT EXECUTE ON FUNCTION public.create_wallet_account(text, text, text, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.login_wallet_account(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.update_wallet_profile(text, text, text, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.update_wallet_last_position(text, double precision, double precision, double precision) TO supabase_read_only_user;