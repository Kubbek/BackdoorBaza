import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// `createClient` throws synchronously if either value is missing, which
// used to crash the whole app before React got a chance to render anything
// — a blank white page with no on-screen explanation, just a console error.
// Deploys commonly hit this: env vars added on Vercel *after* the first
// build don't apply until you trigger a new deploy (Vite bakes VITE_* vars
// in at build time, not at runtime). We now catch it and let App.jsx show
// a readable message instead of a blank page.
export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Brakuje VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Jeśli wdrażasz na Vercel: Settings → Environment Variables, dodaj obie zmienne, a potem zrób nowy build ręcznie — Deployments → „⋯” przy najnowszym wpisie → Redeploy (samo dodanie zmiennych nie przebudowuje już wdrożonej wersji)."
    : null;

export const supabase = supabaseConfigError ? null : createClient(supabaseUrl, supabaseAnonKey);
