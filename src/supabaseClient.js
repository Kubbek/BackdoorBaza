import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Brakuje VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — sprawdź plik .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
