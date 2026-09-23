import { useState, useRef, useEffect, useCallback } from "react";
import { supabase, supabaseConfigError } from "./supabaseClient";

const ACCENT = "#22d3ee";
const ORG_PASSWORD = import.meta.env.VITE_ORG_PASSWORD || "poker2026";

const CATS = {
  live: {
    label: "Turnieje live", short: "Live", color: "#22d3ee",
    tile: "linear-gradient(150deg,rgba(34,211,238,.16),rgba(34,211,238,.03))",
    glow: "rgba(34,211,238,.7)",
    dot: "linear-gradient(140deg,#67e8f9,#22d3ee)",
  },
  clubgg: {
    label: "Club GG", short: "Club GG", color: "#818cf8",
    tile: "linear-gradient(150deg,rgba(99,102,241,.20),rgba(99,102,241,.04))",
    glow: "rgba(99,102,241,.7)",
    dot: "linear-gradient(140deg,#a5b4fc,#4f46e5)",
  },
};

const THEMES = {
  dark: {
    pageBg: "#04060a",
    glow1: "radial-gradient(ellipse at center,rgba(20,160,170,.35),rgba(4,6,10,0) 68%)",
    glow2: "radial-gradient(ellipse at center,rgba(50,60,240,.42),rgba(4,6,10,0) 70%)",
    glow3: "radial-gradient(ellipse at center,rgba(0,120,200,.22),rgba(4,6,10,0) 72%)",
    cardBg: "linear-gradient(158deg,rgba(255,255,255,.075),rgba(255,255,255,.018) 46%,rgba(120,140,255,.05))",
    cardBorder: "rgba(255,255,255,.10)",
    cardShadow: "0 50px 140px -50px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.07)",
    text: "#dbe1ea", textStrong: "#ffffff", muted: "rgba(219,225,234,.55)", mutedFaint: "rgba(219,225,234,.35)",
    divider: "linear-gradient(90deg,rgba(255,255,255,.16),rgba(255,255,255,0))", divider2: "rgba(255,255,255,.08)",
    inputBg: "rgba(6,10,18,.6)", inputBorder: "rgba(255,255,255,.10)",
    ghostBorder: "rgba(255,255,255,.14)", ghostBorderHover: "rgba(255,255,255,.34)",
    panelBg: "linear-gradient(160deg,rgba(255,255,255,.055),rgba(255,255,255,.012))", panelBorder: "rgba(255,255,255,.10)",
    historyBg: "rgba(6,10,18,.5)", historyBorder: "rgba(255,255,255,.07)",
    heatHue: 205, heatSatBase: 22, heatSatSpan: 62, heatLightBase: 10, heatLightSpan: 16, heatAlpha: 1,
  },
  light: {
    pageBg: "#f4f5f8",
    glow1: "radial-gradient(ellipse at center,rgba(34,211,238,.12),rgba(244,245,248,0) 68%)",
    glow2: "radial-gradient(ellipse at center,rgba(99,102,241,.12),rgba(244,245,248,0) 70%)",
    glow3: "radial-gradient(ellipse at center,rgba(56,189,248,.08),rgba(244,245,248,0) 72%)",
    cardBg: "linear-gradient(158deg,rgba(255,255,255,.9),rgba(255,255,255,.8) 46%,rgba(120,140,255,.04))",
    cardBorder: "rgba(16,19,26,.07)",
    cardShadow: "0 40px 100px -50px rgba(30,40,80,.18),inset 0 1px 0 rgba(255,255,255,.6)",
    text: "#2a2f3a", textStrong: "#0e1117", muted: "rgba(16,19,26,.55)", mutedFaint: "rgba(16,19,26,.4)",
    divider: "linear-gradient(90deg,rgba(16,19,26,.14),rgba(16,19,26,0))", divider2: "rgba(16,19,26,.08)",
    inputBg: "rgba(255,255,255,.85)", inputBorder: "rgba(16,19,26,.12)",
    ghostBorder: "rgba(16,19,26,.14)", ghostBorderHover: "rgba(16,19,26,.34)",
    panelBg: "linear-gradient(160deg,rgba(255,255,255,.9),rgba(255,255,255,.55))", panelBorder: "rgba(16,19,26,.10)",
    historyBg: "rgba(255,255,255,.6)", historyBorder: "rgba(16,19,26,.07)",
    heatHue: 210, heatSatBase: 18, heatSatSpan: 38, heatLightBase: 96, heatLightSpan: -16, heatAlpha: 1,
  },
};

const FONT = "Manrope, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function heatColor(ratio, t) {
  const sat = t.heatSatBase + ratio * t.heatSatSpan;
  const light = t.heatLightBase + ratio * t.heatLightSpan;
  return `hsla(${t.heatHue},${sat.toFixed(0)}%,${light.toFixed(0)}%,${t.heatAlpha})`;
}

function rowFromDb(r) {
  return {
    id: r.id,
    nick: r.nick,
    live: r.live,
    clubgg: r.clubgg,
    lastChange: r.last_change ? new Date(r.last_change).getTime() : 0,
  };
}

function resolveAmount(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function eventFromDb(e) {
  return {
    id: e.id,
    playerId: e.player_id,
    category: e.category,
    delta: e.delta,
    ts: new Date(e.created_at).getTime(),
  };
}

// Postgres unique_violation — used to show a friendly message instead of the
// raw driver error, and to catch the case where two clients race to insert
// the same nick (or a nick differing only by case, see schema.sql's
// case-insensitive index) at nearly the same time.
function isDuplicateNickError(error) {
  return error?.code === "23505";
}

// A naive `line.split(",")` breaks on a nick like `"Jan, Kowalski"` (a
// comma inside a properly CSV-quoted field) — it silently chops the value
// instead of erroring, so a bad nick and zeroed points slip in as if the
// import succeeded. These two helpers implement just enough of the CSV
// quoting rule (RFC 4180) to round-trip nicks containing commas or quotes.
function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function Divider({ t }) {
  return <div style={{ height: 1, background: t.divider }} />;
}

function ThemeToggle({ theme, onToggle, t }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Zmień motyw"
      style={{
        position: "absolute", top: 22, right: 24, width: 34, height: 34, borderRadius: 10,
        border: `1px solid ${hover ? t.ghostBorderHover : t.ghostBorder}`, background: "transparent",
        color: hover ? t.textStrong : t.mutedFaint, fontSize: 15, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}

function GradientButton({ children, onClick, style, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none", borderRadius: 12, fontFamily: FONT, fontWeight: 800, color: "#04060a",
        cursor: disabled ? "default" : "pointer",
        background: disabled ? "rgba(120,130,150,.4)" : "linear-gradient(96deg,#22d3ee,#4f46e5)",
        boxShadow: disabled ? "none" : "0 14px 40px -14px rgba(60,120,255,.9)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, t, dangerHover, style, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "transparent", fontFamily: FONT, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        border: `1px solid ${hover && !disabled ? (dangerHover ? "rgba(255,107,107,.6)" : t.ghostBorderHover) : t.ghostBorder}`,
        color: hover && !disabled ? (dangerHover ? "#ff8f8f" : t.textStrong) : t.muted,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Segmented({ options, value, onChange, t }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: t.inputBg, border: `1px solid ${t.cardBorder}` }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1, borderRadius: 9, padding: "9px 6px", fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${active ? t.ghostBorderHover : "transparent"}`,
              background: active ? "linear-gradient(150deg,rgba(255,255,255,.14),rgba(255,255,255,.05))" : "transparent",
              color: active ? t.textStrong : t.muted,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PlayerPanel({ player, category, events, amount, setAmount, onAdd, onRemove, onDelete, busy, t }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const match = confirmValue.trim() === player.nick;
  const history = events
    .filter((e) => e.playerId === player.id && e.category === category)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      time: new Date(e.ts).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      label: (e.delta >= 0 ? "+" : "") + e.delta,
      color: e.delta >= 0 ? "#4ade80" : "#ff8f8f",
    }));

  return (
    <div style={{ borderRadius: 18, padding: 16, background: t.panelBg, border: `1px solid ${t.panelBorder}`, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
      <div style={{ display: "flex", gap: 9 }}>
        <button
          onClick={onRemove}
          disabled={busy}
          style={{ flex: 1, background: "rgba(255,107,107,.08)", border: "1px solid rgba(255,107,107,.45)", color: "#ff8f8f", borderRadius: 10, padding: "11px 0", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
        >
          −
        </button>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => { if (amount.trim() === "") setAmount("1"); }}
          inputMode="numeric"
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 10, color: t.textStrong, fontSize: 18, fontWeight: 800, textAlign: "center", padding: "11px 4px", fontFamily: MONO }}
        />
        <GradientButton onClick={onAdd} disabled={busy} style={{ flex: 1, padding: "11px 0", fontSize: 15 }}>+</GradientButton>
      </div>

      <div style={{ borderRadius: 12, padding: "12px 14px", background: t.historyBg, border: `1px solid ${t.historyBorder}` }}>
        <p style={{ margin: "0 0 9px", fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Historia</p>
        {history.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Brak zmian w tej kategorii.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: t.muted, fontFamily: MONO }}>{h.time}</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, color: h.color }}>{h.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!confirmOpen ? (
        <GhostButton onClick={() => setConfirmOpen(true)} t={t} dangerHover style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
          Usuń gracza
        </GhostButton>
      ) : (
        <div style={{ borderRadius: 12, padding: "12px 14px", background: "rgba(255,107,107,.06)", border: "1px solid rgba(255,107,107,.28)" }}>
          <p style={{ margin: "0 0 9px", fontSize: 11.5, color: t.text }}>
            Wpisz <span style={{ fontWeight: 800, color: t.textStrong }}>{player.nick}</span>, aby potwierdzić usunięcie.
          </p>
          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && match && onDelete()}
              placeholder={player.nick}
              style={{ flex: 1, minWidth: 0, background: t.inputBg, border: `1px solid ${match ? "rgba(74,222,128,.6)" : t.inputBorder}`, borderRadius: 9, color: t.textStrong, fontSize: 12, padding: "9px 11px", fontFamily: "inherit" }}
            />
            <button
              onClick={() => match && onDelete()}
              style={{ border: "none", borderRadius: 9, padding: "0 14px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: match ? "pointer" : "default", color: match ? "#2a0f0a" : t.mutedFaint, background: match ? "#ff6b6b" : "rgba(255,255,255,.08)" }}
            >
              Usuń
            </button>
            <button
              onClick={() => { setConfirmOpen(false); setConfirmValue(""); }}
              style={{ background: "transparent", border: `1px solid ${t.ghostBorder}`, color: t.muted, borderRadius: 9, padding: "0 14px", fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [category, setCategory] = useState(null);

  const [players, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [mutationError, setMutationError] = useState("");
  const [undoing, setUndoing] = useState(false);

  const [query, setQuery] = useState("");
  const [addError, setAddError] = useState("");
  const [sortBy, setSortBy] = useState("points");
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  // Kept as a string while editing so the field can be cleared and retyped
  // (e.g. "100" -> "300") — see `resolveAmount` for where it becomes a number.
  const [amount, setAmount] = useState("10");
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [importMsg, setImportMsg] = useState("");
  const csvMenuRef = useRef(null);
  const fileInputRef = useRef(null);

  const t = THEMES[theme];

  // ---- initial fetch + realtime subscriptions ----
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: playerRows, error: pErr }, { data: eventRows, error: eErr }] = await Promise.all([
        supabase.from("players").select("*").order("nick"),
        supabase.from("point_events").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (cancelled) return;
      if (pErr || eErr) {
        setLoadError((pErr || eErr).message);
      } else {
        setPlayers(playerRows.map(rowFromDb));
        setEvents(eventRows.map(eventFromDb));
      }
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("poker-ranking-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (payload) => {
        setPlayers((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((p) => p.id !== payload.old.id);
          const row = rowFromDb(payload.new);
          const exists = prev.some((p) => p.id === row.id);
          return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_events" }, (payload) => {
        const row = eventFromDb(payload.new);
        setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // The initial load only fetches the 500 most recent point_events across
  // the WHOLE club (see below), so once a club has racked up more history
  // than that, a player's own "Historia" panel could look empty even
  // though older events for them still exist — they just fell outside that
  // global window. Fetching this player's own latest events directly
  // whenever their panel opens keeps it accurate regardless of club size.
  useEffect(() => {
    if (!supabase || !selectedId || !category) return;
    let cancelled = false;
    supabase
      .from("point_events")
      .select("*")
      .eq("player_id", selectedId)
      .eq("category", category)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setEvents((prev) => {
          const merged = [...prev];
          for (const row of data) {
            const ev = eventFromDb(row);
            if (!merged.some((e) => e.id === ev.id)) merged.push(ev);
          }
          return merged;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, category]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (csvMenuOpen && csvMenuRef.current && !csvMenuRef.current.contains(e.target)) {
        setCsvMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [csvMenuOpen]);

  const pushUndo = useCallback((entry) => {
    setUndoStack((prev) => [...prev.slice(-19), entry]);
  }, []);

  // ---- point mutations ----
  // `recordUndo` is false when this call is itself reverting a previous
  // action (see `undo` below) — otherwise every undo would push a fresh
  // undo entry onto the stack, turning "Cofnij" into a toggle between the
  // last two states instead of walking back through history.
  const apply = async (player, delta, { recordUndo = true } = {}) => {
    setBusyId(player.id);
    const cat = category;
    // Atomic server-side increment via the `apply_points` SQL function
    // (supabase/schema.sql) — NOT `player[cat] + delta` computed here and
    // written back, which would let two near-simultaneous writes for the
    // same player silently overwrite each other.
    const { data: playerRow, error } = await supabase.rpc("apply_points", {
      p_player_id: player.id,
      p_category: cat,
      p_delta: delta,
    });
    if (error) {
      setMutationError(`Nie udało się zapisać zmiany punktów: ${error.message}`);
      setBusyId(null);
      return;
    }
    setMutationError("");
    setPlayers((prev) => prev.map((p) => (p.id === playerRow.id ? rowFromDb(playerRow) : p)));

    const { data: eventRow, error: eventError } = await supabase
      .from("point_events")
      .insert({ player_id: player.id, category: cat, delta })
      .select()
      .single();
    if (eventError) {
      setMutationError(`Punkty zapisane, ale historia zmian nie zapisała się: ${eventError.message}`);
    } else {
      setEvents((prev) => [eventFromDb(eventRow), ...prev]);
      if (recordUndo) pushUndo({ kind: "points", playerId: player.id, category: cat, delta: -delta });
    }
    setBusyId(null);
  };

  const undo = async () => {
    if (!undoStack.length || undoing) return;
    setUndoing(true);
    const entry = undoStack[undoStack.length - 1];
    // Pure pop, no side effects here — safe even if React StrictMode
    // double-invokes this updater in development.
    setUndoStack((prev) => prev.slice(0, -1));
    if (entry.kind === "points") {
      const p = players.find((pl) => pl.id === entry.playerId);
      if (p) {
        setMutationError("");
        await apply(p, entry.delta, { recordUndo: false });
      } else {
        setMutationError("Nie można cofnąć — ten gracz został od tamtej pory usunięty.");
      }
    }
    setUndoing(false);
  };

  const submitLogin = () => {
    if (password === ORG_PASSWORD) { setUnlocked(true); setLoginError(""); }
    else setLoginError("Błędne hasło. Spróbuj ponownie.");
  };

  const addPlayerNow = async () => {
    const nick = query.trim();
    if (!nick) return;
    const exists = players.some((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (exists) { setAddError("Taki nick już istnieje."); return; }
    const { data, error } = await supabase.from("players").insert({ nick, live: 0, clubgg: 0 }).select().single();
    if (error) {
      setAddError(isDuplicateNickError(error) ? "Taki nick już istnieje." : error.message);
      return;
    }
    setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, rowFromDb(data)]));
    setQuery("");
    setAddError("");
  };

  const removePlayer = async (id) => {
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      setMutationError(`Nie udało się usunąć gracza: ${error.message}`);
      return;
    }
    setMutationError("");
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
  };

  const exportCsv = () => {
    const rows = [...players].sort((a, b) => a.nick.localeCompare(b.nick, "pl")).map((p) => `${csvField(p.nick)},${p[category]}`);
    const csv = [`nick,${category}`, ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `punkty_${category}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCsvMenuOpen(false);
  };

  const importClick = () => {
    setCsvMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const onFileChosen = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const cat = category;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length && /nick/i.test(lines[0])) lines.shift();

    let updated = 0, added = 0, failed = 0;
    const knownNicks = new Map(players.map((p) => [p.nick.toLowerCase(), p]));
    for (const line of lines) {
      const [rawNick, rawVal] = parseCsvLine(line);
      if (!rawNick) continue;
      const nick = rawNick.trim();
      const val = Math.max(0, Number((rawVal || "0").trim()) || 0);
      const existing = knownNicks.get(nick.toLowerCase());
      if (existing) {
        const { data, error } = await supabase
          .from("players")
          .update({ [cat]: val, last_change: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) { failed++; continue; }
        setPlayers((prev) => prev.map((p) => (p.id === data.id ? rowFromDb(data) : p)));
        knownNicks.set(nick.toLowerCase(), rowFromDb(data));
        updated++;
      } else {
        const { data, error } = await supabase
          .from("players")
          .insert({ nick, live: 0, clubgg: 0, [cat]: val })
          .select()
          .single();
        if (error) { failed++; continue; }
        setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, rowFromDb(data)]));
        knownNicks.set(nick.toLowerCase(), rowFromDb(data));
        added++;
      }
    }
    setImportMsg(
      failed
        ? `Zaimportowano: ${updated} zaktualizowanych, ${added} nowych, ${failed} nieudanych.`
        : `Zaimportowano: ${updated} zaktualizowanych, ${added} nowych.`
    );
    e.target.value = "";
  };

  const meta = category ? CATS[category] : null;
  const q = query.trim().toLowerCase();
  const maxPts = category ? Math.max(1, ...players.map((p) => p[category])) : 1;
  const rows = category
    ? players
        .filter((p) => p.nick.toLowerCase().includes(q))
        .sort((a, b) => {
          if (sortBy === "alpha") return a.nick.localeCompare(b.nick, "pl");
          if (sortBy === "recent") return b.lastChange - a.lastChange;
          return b[category] - a[category];
        })
    : [];
  const canAddQuery = query.trim().length > 0 && rows.length === 0;
  const selectedPlayer = players.find((p) => p.id === selectedId);
  const total = category ? players.reduce((n, p) => n + p[category], 0) : 0;

  const sortOptions = [
    { id: "alpha", label: "A–Z" }, { id: "recent", label: "Ostatnie" }, { id: "points", label: "Punkty" },
  ];
  const viewOptions = [
    { id: "list", label: "Lista" }, { id: "grid", label: "Siatka" },
  ];

  if (supabaseConfigError) {
    return (
      <div style={{ position: "relative", minHeight: "100vh", boxSizing: "border-box", padding: "44px 24px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: t.text, background: t.pageBg }}>
        <div style={{ width: "100%", maxWidth: 520, borderRadius: 20, padding: 24, background: t.cardBg, border: "1px solid rgba(255,107,107,.35)", boxShadow: t.cardShadow, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#ff6b6b" }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: t.textStrong }}>Brak konfiguracji Supabase</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: t.text }}>{supabaseConfigError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", boxSizing: "border-box", padding: "44px 24px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: t.text, background: t.pageBg, overflow: "hidden", transition: "background .25s" }}>
      <style>{`@keyframes dcGlow{0%,100%{opacity:.55}50%{opacity:.85}}`}</style>
      <div style={{ position: "absolute", top: -220, left: "50%", transform: "translateX(-50%)", width: 900, height: 520, background: t.glow1, filter: "blur(10px)", animation: "dcGlow 9s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -260, right: -120, width: 820, height: 620, background: t.glow2, filter: "blur(14px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -180, left: -140, width: 620, height: 480, background: t.glow3, filter: "blur(14px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
        {unlocked && category && (
          <span style={{ display: "block", textAlign: "center", fontSize: 52, fontWeight: 800, letterSpacing: -0.02, textTransform: "uppercase", color: meta.color, textShadow: `0 0 24px ${meta.glow}` }}>
            {meta.short}
          </span>
        )}

        <div style={{ position: "relative", width: "100%", boxSizing: "border-box", borderRadius: 26, padding: "28px 28px 22px", background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: t.cardShadow, display: "flex", flexDirection: "column", gap: 18 }}>
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} t={t} />

          {!unlocked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "linear-gradient(140deg,#22d3ee,#4f46e5)", boxShadow: "0 0 14px rgba(56,189,248,.8)" }} />
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.01, color: t.textStrong }}>Panel organizatora</span>
              </div>
              <Divider t={t} />
              <p style={{ margin: 0, fontSize: 12.5, color: t.muted }}>Wpisz hasło, żeby zarządzać punktami.</p>
              <input
                type="password" value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submitLogin()}
                placeholder="hasło"
                style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.textStrong, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit" }}
              />
              {loginError && <p style={{ margin: 0, fontSize: 11.5, color: "#ff7a7a" }}>{loginError}</p>}
              <GradientButton onClick={submitLogin} style={{ width: "100%", padding: "13px 0", fontSize: 13.5 }}>Wejdź</GradientButton>
            </div>
          )}

          {unlocked && !category && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 40 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>Wybierz listę</span>
                {loading && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.08, textTransform: "uppercase", color: t.mutedFaint }}>Ładowanie…</span>}
              </div>
              <Divider t={t} />
              {loadError && <p style={{ margin: 0, fontSize: 12, color: "#ff7a7a" }}>Błąd połączenia z bazą: {loadError}</p>}
              <p style={{ margin: 0, fontSize: 12.5, color: t.muted }}>Wybierz kategorię punktów do edycji.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {Object.entries(CATS).map(([key, c]) => {
                  const cnt = players.length;
                  const tot = players.reduce((n, p) => n + p[key], 0);
                  return (
                    <button
                      key={key}
                      onClick={() => { setCategory(key); setSelectedId(null); }}
                      style={{ position: "relative", overflow: "hidden", height: 132, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 16, border: `1px solid ${t.cardBorder}`, background: c.tile, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: c.dot, boxShadow: `0 0 16px ${c.glow}` }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>{c.label}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{tot} pkt · {cnt} graczy</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {unlocked && category && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 40 }}>
                <GhostButton onClick={() => { setCategory(null); setSelectedId(null); setQuery(""); }} t={t} style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", gap: 6, border: "1px solid transparent", fontSize: 12, fontWeight: 700, padding: "0 4px" }}>
                  <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1 }}>←</span><span>Kategorie</span>
                </GhostButton>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 11, color: t.mutedFaint }}>{players.length} graczy</span>
                  <GhostButton onClick={undo} t={t} disabled={undoStack.length === 0 || undoing} style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "0 11px" }}>
                    <span style={{ width: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1 }}>↺</span><span>Cofnij</span>
                  </GhostButton>
                  <div style={{ position: "relative" }} ref={csvMenuRef}>
                    <GhostButton onClick={() => setCsvMenuOpen(!csvMenuOpen)} t={t} style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "0 11px" }}>
                      <span>CSV</span><span style={{ width: 10, height: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, lineHeight: 1 }}>▾</span>
                    </GhostButton>
                    {csvMenuOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 10, display: "flex", flexDirection: "column", gap: 2, padding: 6, borderRadius: 10, background: t.panelBg, border: `1px solid ${t.panelBorder}`, boxShadow: "0 20px 50px -20px rgba(0,0,0,.5)", minWidth: 130 }}>
                        <button onClick={exportCsv} style={{ textAlign: "left", background: "transparent", border: "none", color: t.text, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}>Eksportuj CSV</button>
                        <button onClick={importClick} style={{ textAlign: "left", background: "transparent", border: "none", color: t.text, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}>Importuj CSV</button>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} accept=".csv" onChange={onFileChosen} style={{ display: "none" }} />
                  </div>
                </div>
              </div>

              {mutationError && <p style={{ margin: "-6px 0 0", fontSize: 11.5, color: "#ff7a7a" }}>{mutationError}</p>}
              {importMsg && <p style={{ margin: "-6px 0 0", textAlign: "right", fontSize: 11, color: t.muted }}>{importMsg}</p>}
              <Divider t={t} />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 210, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setAddError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && canAddQuery) addPlayerNow(); }}
                    placeholder="Szukaj gracza…"
                    style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${addError ? "rgba(255,122,122,.6)" : t.inputBorder}`, borderRadius: 11, color: t.textStrong, fontSize: 12.5, padding: "11px 13px", fontFamily: "inherit" }}
                  />
                  {addError && <p style={{ margin: 0, fontSize: 11, color: "#ff7a7a" }}>{addError}</p>}
                </div>
                {canAddQuery && (
                  <GradientButton onClick={addPlayerNow} style={{ padding: "0 16px", fontSize: 12.5 }}>
                    + Dodaj „{query}"
                  </GradientButton>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 210 }}>
                  <Segmented options={sortOptions} value={sortBy} onChange={setSortBy} t={t} />
                </div>
                <div style={{ width: 170 }}>
                  <Segmented options={viewOptions} value={view} onChange={setView} t={t} />
                </div>
              </div>

              {view === "list" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {rows.map((p, i) => {
                    const ratio = p[category] / maxPts;
                    const active = selectedId === p.id;
                    return (
                      <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <button
                          onClick={() => setSelectedId(active ? null : p.id)}
                          style={{
                            position: "relative", overflow: "hidden", width: "100%", textAlign: "left", cursor: "pointer",
                            borderRadius: 12, padding: "13px 15px", fontFamily: "inherit",
                            background: heatColor(ratio, t), border: `1px solid ${active ? ACCENT : t.cardBorder}`,
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                          }}
                        >
                          <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: t.mutedFaint, minWidth: 20, textAlign: "right" }}>{i + 1}</span>
                            <span style={{ fontSize: 14.5, fontWeight: 700, color: t.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nick}</span>
                          </span>
                          <span style={{ position: "relative", fontFamily: MONO, fontSize: 19, fontWeight: 800, color: t.textStrong }}>{p[category]}</span>
                        </button>
                        {active && (
                          <PlayerPanel
                            player={p} category={category} events={events} amount={amount} setAmount={setAmount}
                            onAdd={() => apply(p, resolveAmount(amount))} onRemove={() => apply(p, -resolveAmount(amount))} onDelete={() => removePlayer(p.id)}
                            busy={busyId === p.id} t={t}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {view === "grid" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 9 }}>
                  {rows.map((p) => {
                    const ratio = p[category] / maxPts;
                    const active = selectedId === p.id;
                    return (
                      <div key={p.id} style={{ display: "contents" }}>
                        <button
                          onClick={() => setSelectedId(active ? null : p.id)}
                          style={{
                            position: "relative", overflow: "hidden", textAlign: "left", cursor: "pointer",
                            borderRadius: 14, padding: 13, minHeight: 84, fontFamily: "inherit",
                            background: heatColor(ratio, t), border: `1px solid ${active ? ACCENT : t.cardBorder}`,
                            display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10,
                          }}
                        >
                          <span style={{ position: "relative", fontSize: 13, fontWeight: 700, color: t.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nick}</span>
                          <span style={{ position: "relative", fontFamily: MONO, fontSize: 19, fontWeight: 700, color: t.textStrong }}>{p[category]}</span>
                        </button>
                        {active && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <PlayerPanel
                              player={p} category={category} events={events} amount={amount} setAmount={setAmount}
                              onAdd={() => apply(p, resolveAmount(amount))} onRemove={() => apply(p, -resolveAmount(amount))} onDelete={() => removePlayer(p.id)}
                              busy={busyId === p.id} t={t}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!loading && rows.length === 0 && <p style={{ margin: "4px 0", textAlign: "center", fontSize: 12, color: t.muted }}>Brak graczy pasujących do wyszukiwania.</p>}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: `1px solid ${t.divider2}`, fontFamily: MONO, fontSize: 11, color: t.mutedFaint }}>
                <span>{players.length} graczy · {total} pkt w {meta.short}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
