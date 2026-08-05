import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eatpkiztlhkpjcvfxfzk.supabase.co";

const supabaseKey = "sb_publishable_Vjtm2uzM62IjSTRaLEfi5Q_0nMX3zDr";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);