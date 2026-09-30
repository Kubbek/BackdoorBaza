import { supabaseAdmin, requireAdmin } from "./_supabaseAdmin.js";

// Supabase Auth wymaga adresu e-mail — organizatorzy logują się samym
// loginem, więc login jest po cichu zamieniany na fikcyjny adres pod tą
// domeną (nikt tam nic nie wysyła). Musi być identyczne jak
// usernameToEmail w src/App.jsx, inaczej logowanie się rozjedzie.
const EMAIL_DOMAIN = "gracze.local";
function usernameToEmail(username) {
  return `${username}@${EMAIL_DOMAIN}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  const { error: authError } = await requireAdmin(admin, req.headers.authorization);
  if (authError) {
    res.status(403).json({ error: authError });
    return;
  }

  const { username, password, role } = req.body || {};
  const cleanUsername = (username || "").trim();
  if (!cleanUsername) {
    res.status(400).json({ error: "Podaj nazwę konta." });
    return;
  }
  if (!password || password.length < 4) {
    res.status(400).json({ error: "Hasło musi mieć co najmniej 4 znaki." });
    return;
  }
  if (role !== "admin" && role !== "member") {
    res.status(400).json({ error: "Nieprawidłowa rola." });
    return;
  }

  const { data: existing } = await admin.from("profiles").select("id").ilike("username", cleanUsername).maybeSingle();
  if (existing) {
    res.status(409).json({ error: "Konto o takiej nazwie już istnieje." });
    return;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(cleanUsername.toLowerCase()),
    password,
    email_confirm: true, // konto ma działać od razu — nie ma prawdziwej skrzynki, więc nikt nie potwierdzi maila
    user_metadata: { username: cleanUsername, role },
  });
  if (createError) {
    res.status(400).json({ error: createError.message });
    return;
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username: cleanUsername,
    role,
  });
  if (profileError) {
    // Nie zostawiaj konta Auth bez profilu — sprzątnij po nieudanym kroku.
    await admin.auth.admin.deleteUser(created.user.id);
    res.status(400).json({ error: profileError.message });
    return;
  }

  res.status(200).json({ id: created.user.id, username: cleanUsername, role });
}
