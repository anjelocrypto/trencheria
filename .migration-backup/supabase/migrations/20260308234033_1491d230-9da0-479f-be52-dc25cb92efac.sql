DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_stale_rooms'
      AND p.pronargs = 0
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.cleanup_stale_rooms() FROM anon, authenticated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'refresh_game_room_state'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.refresh_game_room_state(uuid) FROM anon, authenticated;
  END IF;
END
$$;