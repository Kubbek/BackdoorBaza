import { supabaseAdmin, requireAdmin } from "./_supabaseAdmin.js";

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

  const { user, error: authError } = await requireAdmin(admin, req.headers.authorization);
  if (authError) {
    res.status(403).json({ error: authError });
    return;
  }

  const { id } = req.body || {};
  if (!id) {
    res.status(400).json({ error: "Brak id konta." });
    return;
  }
  if (id === user.id) {
    res.status(400).json({ error: "Nie możesz usunąć własnego konta." });
    return;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    res.status(400).json({ error: deleteError.message });
    return;
  }
  // Wiersz w `profiles` znika sam — ma "on delete cascade" na auth.users.
  res.status(200).json({ ok: true });
}
