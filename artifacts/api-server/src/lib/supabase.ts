import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const anonKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL is required");
}

if (!anonKey) {
  throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is required");
}

// Use service role key if available (server-side), otherwise fall back to anon key
const key = serviceRoleKey || anonKey;

export const supabase = createClient(supabaseUrl, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const supabaseUrl_ = supabaseUrl;
export const supabaseAnonKey = anonKey;
