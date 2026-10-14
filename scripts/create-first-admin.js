// Jednorazowy skrypt do założenia PIERWSZEGO konta admina — omija ręczne
// "Add user" + kopiowanie UID + wklejanie SQL w dashboardzie Supabase,
// czyli dokładnie to miejsce, gdzie najłatwiej o pomyłkę (zła wielkość
// liter w mailu, brak zaznaczonego "Auto Confirm User", zły wklejony
// UID). Robi dokładnie to samo co api/create-account.js — zakłada konto w
// Supabase Auth i dopisuje wiersz w `profiles` — tylko lokalnie, z
// Twojego komputera, kluczem service_role z .env. W przeciwieństwie do
// api/create-account.js działa też wtedy, gdy nie ma jeszcze ŻADNEGO
// admina (tamta funkcja wymaga, żeby wywołujący był już zalogowanym
// adminem, więc nie nadaje się na samo pierwsze konto).
//
// Użycie:
//   node scripts/create-first-admin.js <login> <haslo>
//
// Wymaga w .env (w tym samym folderze co package.json): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY — te same wartości, co ma mieć skonfigurowany
// backend na Vercelu (patrz README, sekcja "2. Skonfiguruj projekt
// lokalnie").
//
// Po założeniu logujesz się w aplikacji tym loginem i hasłem — kolejne
// konta dodajesz już normalnie przez ekran "Zarządzaj kontami", bez
// żadnych dalszych ręcznych kroków.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const EMAIL_DOMAIN = "gracze.local";
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

async function main() {
  const [usernameRaw, password] = process.argv.slice(2);
  const username = (usernameRaw || "").trim();
  if (!username || !password) {
    console.error("Użycie: node scripts/create-first-admin.js <login> <haslo>");
    process.exit(1);
  }
  if (password.length < 4) {
    console.error("Hasło musi mieć co najmniej 4 znaki.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — uzupełnij plik .env w folderze projektu (patrz README, sekcja 2)."
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existingError) {
    console.error(
      "Błąd sprawdzania istniejących kont — czy tabela `profiles` na pewno istnieje? " +
        "Uruchom najpierw CAŁY plik supabase/schema.sql w SQL Editorze. Szczegóły:",
      existingError.message
    );
    process.exit(1);
  }
  if (existing) {
    console.error(`Konto "${username}" już istnieje w tabeli profiles — nic nie robię.`);
    process.exit(1);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true, // konto ma działać od razu, bez potwierdzania nieistniejącego maila
    user_metadata: { username, role: "admin" },
  });
  if (createError) {
    console.error("Błąd zakładania konta w Supabase Auth:", createError.message);
    process.exit(1);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    role: "admin",
  });
  if (profileError) {
    // Nie zostawiaj konta Auth bez profilu — sprzątnij po nieudanym kroku.
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("Błąd zapisu profilu (cofnięto założone konto Auth):", profileError.message);
    process.exit(1);
  }

  console.log(`Gotowe. Konto admina "${username}" założone — zaloguj się w aplikacji tym loginem i hasłem.`);
}

main();
