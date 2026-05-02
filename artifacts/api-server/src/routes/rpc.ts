/**
 * Supabase RPC proxy — forwards whitelisted frontend RPC calls to Supabase server-side.
 * POST /api/rpc/:procedure  { ...params }
 * This keeps Supabase credentials off the client.
 *
 * Only explicitly listed procedures can be called. The session_token param
 * from the request body is passed through to RPC calls that require auth.
 */
import { Router } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// Allowlist of procedures callable by the frontend.
// Mutating procedures that require a session token are prefixed with "auth:".
const ALLOWED_PROCEDURES = new Set([
  // Read-only / public
  "get_leaderboard",
  "get_clans",
  "get_territories",
  "get_active_challenges",
  "get_war_kills",
  "get_recent_war_kills",
  "get_territory_history",
  "get_active_coins",
  "get_clan_members",
  // Authenticated — require _session_token in params
  "create_wallet_account",
  "login_wallet_account",
  "update_wallet_last_position",
  "update_wallet_profile",
  "get_my_clan",
  "get_trencheri_balance",
  "save_player_progression",
  "load_player_progression",
  "issue_trencheri_coins",
  "claim_trencheri_coin",
  "register_with_faction",
  "report_pvp_death",
  "transition_war_states",
  "validate_chat",
  "resolve_war",
  "check_admin_status",
]);

router.post("/rpc/:procedure", async (req, res) => {
  const { procedure } = req.params;

  if (!ALLOWED_PROCEDURES.has(procedure)) {
    req.log.warn({ procedure }, "RPC procedure not in allowlist");
    return res.status(403).json({ error: "Procedure not allowed" });
  }

  const params = req.body ?? {};

  try {
    // @ts-ignore — RPC procedure name is dynamic
    const { data, error } = await supabase.rpc(procedure, params);

    if (error) {
      req.log.warn({ procedure, error: error.message }, "Supabase RPC error");
      return res.status(400).json({ error: error.message, code: error.code });
    }

    return res.json({ data });
  } catch (err: any) {
    req.log.error({ procedure, err }, "Unexpected RPC error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
