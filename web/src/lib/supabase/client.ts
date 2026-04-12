import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiConfig } from "@/lib/api/types";

let cachedClient: SupabaseClient | null = null;
let cachedKey: string | null = null;

export async function createBrowserSupabaseClient(config: ApiConfig) {
  if (!config.supabase_url || !config.supabase_key) {
    throw new Error("Missing Supabase configuration");
  }

  const cacheKey = `${config.supabase_url}:${config.supabase_key}`;
  if (cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }

  const { createClient } = await import("@supabase/supabase-js");
  cachedClient = createClient(config.supabase_url, config.supabase_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedKey = cacheKey;
  return cachedClient;
}
