// Shared helper for the account-management serverless functions (create-
// account.js, delete-account.js). Uses the SERVICE ROLE KEY — this file
// must never be imported from client-side code (src/), only from api/.
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w zmiennych środowiskowych backendu (ustaw je w Vercel, bez prefiksu VITE_)."
    );
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Sprawdza token dostępu przesłany przez klienta (nagłówek Authorization:
// Bearer <token>, z supabase.auth.getSession() po stronie przeglądarki) i
// potwierdza, że należy do zalogowanego konta z rolą 'admin'. Bez tego
// każdy, kto zna adres tej funkcji, mógłby zakładać/usuwać konta.
export async function requireAdmin(admin, authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Brak tokenu uwierzytelniającego." };

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { error: "Nieprawidłowy lub wygasły token." };

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile || profile.role !== "admin") {
    return { error: "Tylko admin może wykonać tę operację." };
  }
  return { user: userData.user };
}
