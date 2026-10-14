import { supabaseAdmin } from "./_supabaseAdmin.js";

// Automatyczny, codzienny backup danych (Runda 18) — wywoływany przez
// Vercel Cron Jobs (patrz vercel.json), nie przez organizatora ani
// gracza. Zrzuca WSZYSTKIE tabele (players, point_events, profiles — bez
// haseł, których i tak nie ma w `profiles`, siedzą wyłącznie w
// auth.users, poza zasięgiem tego zrzutu) do jednego pliku JSON i wrzuca
// go do bucketu Supabase Storage o nazwie "backups" w TYM SAMYM
// projekcie — osobno od wbudowanych backupów/PITR Supabase, więc daje
// prawdziwą, niezależną kopię: widoczną i do pobrania ręcznie z
// dashboardu (Storage → backups), nawet gdyby coś się stało z samymi
// tabelami (np. omyłkowy DELETE/DROP).
//
// Bucket "backups" tworzy się sam przy pierwszym uruchomieniu, jeśli
// jeszcze nie istnieje — nic nie trzeba klikać ręcznie w dashboardzie.
//
// Stare kopie starsze niż BACKUP_RETENTION_DAYS są usuwane przy okazji
// każdego uruchomienia, żeby bucket nie rósł bez końca.
const BUCKET = "backups";
const BACKUP_RETENTION_DAYS = 30;

export default async function handler(req, res) {
  // Vercel Cron Jobs doklejają nagłówek Authorization: Bearer <CRON_SECRET>
  // (patrz zmienna środowiskowa CRON_SECRET) — bez tej weryfikacji każdy,
  // kto zna adres tej funkcji, mógłby ją odpalać ręcznie w nieskończoność.
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (got !== expectedSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  const [playersRes, eventsRes, profilesRes] = await Promise.all([
    admin.from("players").select("*"),
    admin.from("point_events").select("*"),
    admin.from("profiles").select("id, username, role, created_at"),
  ]);
  if (playersRes.error || eventsRes.error || profilesRes.error) {
    res.status(500).json({
      error: "Nie udało się odczytać danych do backupu.",
      details: playersRes.error?.message || eventsRes.error?.message || profilesRes.error?.message,
    });
    return;
  }

  const now = new Date();
  const payload = JSON.stringify(
    {
      exported_at: now.toISOString(),
      players: playersRes.data,
      point_events: eventsRes.data,
      profiles: profilesRes.data,
    },
    null,
    2
  );
  const filename = `backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;

  // Bucket prywatny (public: false) — pliki backupu pobiera się tylko
  // przez dashboard Supabase (zalogowany właściciel projektu), nie są
  // publicznie dostępne pod żadnym URL-em.
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filename, payload, { contentType: "application/json" });
  if (uploadError) {
    res.status(500).json({ error: "Nie udało się zapisać pliku backupu.", details: uploadError.message });
    return;
  }

  // Sprzątanie starych kopii — poza limit retencji.
  const { data: existingFiles } = await admin.storage.from(BUCKET).list();
  const cutoff = now.getTime() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = (existingFiles || [])
    .filter((f) => f.name.startsWith("backup-") && new Date(f.created_at || f.updated_at || 0).getTime() < cutoff)
    .map((f) => f.name);
  if (stale.length) {
    await admin.storage.from(BUCKET).remove(stale);
  }

  res.status(200).json({
    ok: true,
    filename,
    players: playersRes.data.length,
    point_events: eventsRes.data.length,
    removed_stale: stale.length,
  });
}
