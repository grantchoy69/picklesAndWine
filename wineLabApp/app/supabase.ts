import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kxxkckavmfddgznjybqr.supabase.co";
const supabasePublishableKey =
  "sb_publishable_zI01H7SAAGS19EH8mFpNkA_jimWGwLq";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
