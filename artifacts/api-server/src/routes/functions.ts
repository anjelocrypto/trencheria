/**
 * Supabase Edge Function proxy — forwards whitelisted frontend calls to Supabase server-side.
 * POST /api/functions/:name  { body: {...} }
 * This keeps Supabase credentials off the client.
 */
import { Router } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// Allowlist of edge functions callable by the frontend.
const ALLOWED_FUNCTIONS = new Set([
  "verify-wallet",
]);

router.post("/functions/:name", async (req, res) => {
  const { name } = req.params;

  if (!ALLOWED_FUNCTIONS.has(name)) {
    req.log.warn({ name }, "Edge function not in allowlist");
    return res.status(403).json({ error: "Function not allowed" });
  }

  const body = req.body?.body ?? req.body ?? {};

  try {
    const { data, error } = await supabase.functions.invoke(name, { body });

    if (error) {
      req.log.warn({ name, error: error.message }, "Supabase function error");
      return res.status(400).json({ error: error.message });
    }

    return res.json({ data });
  } catch (err: any) {
    req.log.error({ name, err }, "Unexpected function error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
