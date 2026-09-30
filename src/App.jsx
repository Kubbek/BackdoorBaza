import { useState, useRef, useEffect } from "react";
import { supabase, supabaseConfigError } from "./supabaseClient";

const ACCENT = "#22d3ee";

// Supabase Auth wymaga adresu e-mail — organizatorzy logują się samym
// loginem, więc login jest po cichu zamieniany na fikcyjny adres pod tą
// domeną (nikt tam nic nie wysyła, to tylko techniczny wymóg Auth). Musi
// być identyczne jak w api/create-account.js, inaczej logowanie się rozjedzie.
const EMAIL_DOMAIN = "gracze.local";
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

// Po zalogowaniu są 2 sekcje: "Bilety" (własna, niezależna pula punktów —
// wchodzi się wprost, bez dodatkowego hasła) i "Klub" (dodatkowe hasło,
// patrz KLUB_PASSWORD niżej), a wewnątrz Klubu 3 podkategorie punktowe
// (Live/Club GG/Bar). Każda ma osobny schemat kolorystyczny, żeby zawsze
// było widać, w której sekcji/kategorii się jest — patrz README, sekcja
// "Sekcje i kategorie".
const KLUB_PASSWORD = import.meta.env.VITE_KLUB_PASSWORD || "B@ckdoor2026";

const SECTIONS = {
  bilety: {
    label: "Bilety", short: "Bilety", color: "#34d399",
    tile: "linear-gradient(150deg,rgba(52,211,153,.18),rgba(52,211,153,.03))",
    glow: "rgba(52,211,153,.7)",
  },
  klub: {
    label: "Klub", color: "#a855f7",
    tile: "linear-gradient(150deg,rgba(168,85,247,.18),rgba(168,85,247,.03))",
    glow: "rgba(168,85,247,.7)",
  },
};

// Kategorie punktów. "bilety" to sekcja sama w sobie (patrz SECTIONS) —
// wchodzi się w nią wprost, bez podkategorii — dlatego ma tu ten sam
// schemat kolorystyczny co SECTIONS.bilety. "live"/"clubgg"/"bar" to 3
// podkategorie widoczne dopiero wewnątrz Klubu.
const CATS = {
  bilety: SECTIONS.bilety,
  live: {
    label: "Live", short: "Live", color: "#22d3ee",
    tile: "linear-gradient(150deg,rgba(34,211,238,.16),rgba(34,211,238,.03))",
    glow: "rgba(34,211,238,.7)",
  },
  clubgg: {
    label: "Club GG", short: "Club GG", color: "#818cf8",
    tile: "linear-gradient(150deg,rgba(99,102,241,.20),rgba(99,102,241,.04))",
    glow: "rgba(99,102,241,.7)",
  },
  bar: {
    label: "Bar", short: "Bar", color: "#f59e0b",
    tile: "linear-gradient(150deg,rgba(245,158,11,.18),rgba(245,158,11,.03))",
    glow: "rgba(245,158,11,.7)",
  },
};
// Podkategorie widoczne wyłącznie wewnątrz Klubu (czyli CATS bez "bilety").
const KLUB_CATS = Object.fromEntries(Object.entries(CATS).filter(([key]) => key !== "bilety"));

// Tło ekranu kategorii (te trzy rozmyte plamy światła za kartą) dostraja
// się do koloru aktualnej kategorii, żeby od razu było widać, w której
// jesteś — te same trzy warstwy co domyślne THEME.glow1/2/3, tylko
// przefarbowane na kolor z CATS zamiast na stały, neutralny odcień.
function hexToRgbTriplet(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function categoryGlows(hex) {
  const rgb = hexToRgbTriplet(hex);
  return {
    glow1: `radial-gradient(ellipse at center,rgba(${rgb},.38),rgba(4,6,10,0) 68%)`,
    glow2: `radial-gradient(ellipse at center,rgba(${rgb},.30),rgba(4,6,10,0) 70%)`,
    glow3: `radial-gradient(ellipse at center,rgba(${rgb},.18),rgba(4,6,10,0) 72%)`,
  };
}

const THEME = {
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
};

const FONT = "Manrope, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function heatColor(ratio, t) {
  const sat = t.heatSatBase + ratio * t.heatSatSpan;
  const light = t.heatLightBase + ratio * t.heatLightSpan;
  return `hsla(${t.heatHue},${sat.toFixed(0)}%,${light.toFixed(0)}%,${t.heatAlpha})`;
}

// Mapa: nazwa kategorii w JS (klucz w `players`, np. p.liveLimit) -> nazwa
// kolumny w Postgresie (snake_case, np. live_limit).
const DB_LIMIT_COLUMN = { live: "live_limit", clubgg: "clubgg_limit", bar: "bar_limit", bilety: "bilety_limit" };

function rowFromDb(r) {
  return {
    id: r.id,
    nick: r.nick,
    live: r.live,
    clubgg: r.clubgg,
    bar: r.bar,
    bilety: r.bilety,
    liveLimit: r.live_limit,
    clubggLimit: r.clubgg_limit,
    barLimit: r.bar_limit,
    biletyLimit: r.bilety_limit,
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
    createdBy: e.created_by || null,
    comment: e.comment || null,
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

function ConfigErrorScreen({ t }) {
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

function PlayerPanel({ player, category, events, amount, setAmount, onAdd, onRemove, onDelete, onEditSave, onCommentSave, busy, t }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editNick, setEditNick] = useState(player.nick);
  const [editLimit, setEditLimit] = useState(player[category + "Limit"] != null ? String(player[category + "Limit"]) : "");
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Komentarz dopisuje się PO fakcie, klikając konkretny wpis w historii —
  // stąd edytowany jest zawsze najwyżej jeden wpis naraz, po jego id.
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const match = confirmValue.trim() === player.nick;
  // Gracz.id jest już losowym UUID-em nadawanym przez Postgres — wystarczająco
  // nieodgadywalnym, żeby użyć go wprost jako identyfikatora w linku, bez
  // dodawania osobnej kolumny "tokenu" w bazie.
  const shareUrl = `${window.location.origin}${window.location.pathname}?gracz=${player.id}`;

  const openEdit = () => {
    setEditNick(player.nick);
    setEditLimit(player[category + "Limit"] != null ? String(player[category + "Limit"]) : "");
    setEditError("");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const nick = editNick.trim();
    if (!nick) { setEditError("Nick nie może być pusty."); return; }
    const limitRaw = editLimit.trim();
    const limit = limitRaw === "" ? null : Math.max(0, parseInt(limitRaw, 10) || 0);
    setEditBusy(true);
    const { error } = await onEditSave(nick, limit);
    setEditBusy(false);
    if (error) { setEditError(error); return; }
    setEditOpen(false);
  };
  const history = events
    .filter((e) => e.playerId === player.id && e.category === category)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      time: new Date(e.ts).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      label: (e.delta >= 0 ? "+" : "") + e.delta,
      color: e.delta >= 0 ? "#4ade80" : "#ff8f8f",
      createdBy: e.createdBy,
      comment: e.comment,
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
        <p style={{ margin: "0 0 9px", fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>
          Historia <span style={{ textTransform: "none", fontWeight: 600 }}>— kliknij wpis, żeby dodać komentarz</span>
        </p>
        {history.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Brak zmian w tej kategorii.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h) => {
              const isEditing = editingCommentId === h.id;
              return (
                <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    onClick={() => {
                      if (isEditing) { setEditingCommentId(null); return; }
                      setEditingCommentId(h.id);
                      setCommentDraft(h.comment || "");
                      setCommentError("");
                    }}
                    style={{ display: "flex", alignItems: "center", fontSize: 11.5, gap: 8, background: isEditing ? t.inputBg : "transparent", border: "none", borderRadius: 8, padding: "4px 6px", margin: "-4px -6px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
                  >
                    <span style={{ color: t.muted, fontFamily: MONO, flexShrink: 0 }}>
                      {h.time}{h.createdBy ? ` · ${h.createdBy}` : ""}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic", color: t.muted }}>
                      {!isEditing && h.comment ? `„${h.comment}"` : ""}
                    </span>
                    <span style={{ fontFamily: MONO, fontWeight: 700, color: h.color, flexShrink: 0 }}>{h.label}</span>
                  </button>
                  {isEditing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        autoFocus
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Komentarz do tej zmiany (opcjonalnie)…"
                        style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.textStrong, fontSize: 12.5, padding: "8px 10px", fontFamily: "inherit" }}
                      />
                      {commentError && <span style={{ fontSize: 11, color: "#ff8f8f" }}>{commentError}</span>}
                      <div style={{ display: "flex", gap: 7 }}>
                        <GhostButton
                          onClick={() => setEditingCommentId(null)}
                          t={t}
                          style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "6px 11px" }}
                        >
                          Anuluj
                        </GhostButton>
                        <GradientButton
                          onClick={async () => {
                            setCommentBusy(true);
                            const { error } = await onCommentSave(h.id, commentDraft);
                            setCommentBusy(false);
                            if (error) { setCommentError(error); return; }
                            setEditingCommentId(null);
                          }}
                          disabled={commentBusy}
                          style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "6px 13px" }}
                        >
                          Zapisz
                        </GradientButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!editOpen && !confirmOpen && !linkOpen && (
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <GhostButton onClick={openEdit} t={t} style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
            Edytuj
          </GhostButton>
          <GhostButton onClick={() => { setLinkOpen(true); setLinkCopied(false); }} t={t} style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
            Link dla gracza
          </GhostButton>
          <GhostButton onClick={() => setConfirmOpen(true)} t={t} dangerHover style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
            Usuń gracza
          </GhostButton>
        </div>
      )}

      {linkOpen && (
        <div style={{ borderRadius: 12, padding: "12px 14px", background: t.historyBg, border: `1px solid ${t.historyBorder}`, display: "flex", flexDirection: "column", gap: 9 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: t.text }}>
            Ten link pokazuje tylko punkty, limity i historię gracza <span style={{ fontWeight: 800, color: t.textStrong }}>{player.nick}</span> — bez logowania i bez danych innych graczy.
          </p>
          <div style={{ display: "flex", gap: 7 }}>
            <input
              readOnly value={shareUrl}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, minWidth: 0, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, color: t.textStrong, fontSize: 11, padding: "9px 11px", fontFamily: MONO }}
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }}
              style={{ border: "none", borderRadius: 9, padding: "0 14px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", color: "#04060a", background: "linear-gradient(96deg,#22d3ee,#4f46e5)", whiteSpace: "nowrap" }}
            >
              {linkCopied ? "Skopiowano" : "Kopiuj"}
            </button>
            <button
              onClick={() => setLinkOpen(false)}
              style={{ background: "transparent", border: `1px solid ${t.ghostBorder}`, color: t.muted, borderRadius: 9, padding: "0 14px", fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}
            >
              Zamknij
            </button>
          </div>
        </div>
      )}

      {editOpen && (
        <div style={{ borderRadius: 12, padding: "12px 14px", background: t.historyBg, border: `1px solid ${t.historyBorder}`, display: "flex", flexDirection: "column", gap: 9 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Nick</span>
            <input
              value={editNick}
              onChange={(e) => setEditNick(e.target.value)}
              style={{ boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, color: t.textStrong, fontSize: 12.5, padding: "9px 11px", fontFamily: "inherit" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Limit minusowych punktów (ta kategoria)</span>
            <input
              value={editLimit}
              onChange={(e) => setEditLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Brak limitu"
              inputMode="numeric"
              style={{ boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, color: t.textStrong, fontSize: 12.5, padding: "9px 11px", fontFamily: "inherit" }}
            />
          </label>
          {editError && <p style={{ margin: 0, fontSize: 11, color: "#ff7a7a" }}>{editError}</p>}
          <div style={{ display: "flex", gap: 7 }}>
            <GradientButton onClick={saveEdit} disabled={editBusy} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>Zapisz</GradientButton>
            <GhostButton onClick={() => setEditOpen(false)} t={t} disabled={editBusy} style={{ flex: 1, justifyContent: "center", padding: "9px 0", fontSize: 12 }}>Anuluj</GhostButton>
          </div>
        </div>
      )}

      {confirmOpen && (
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

function OrganizerApp() {
  // `account`: zalogowane konto tej sesji — null (jeszcze niezalogowany)
  // albo { id, username, role } po udanym logowaniu. Logowanie to teraz
  // prawdziwy Supabase Auth (supabase.auth.signInWithPassword) — `id` to
  // id z auth.users, `username`/`role` dociągane osobno z tabeli `profiles`
  // (patrz supabase/schema.sql, sekcja "Profile i uprawnienia").
  const [account, setAccount] = useState(null);
  // Czy trwa jeszcze sprawdzanie, czy przeglądarka ma już zapisaną sesję
  // (Supabase Auth persystuje logowanie między odświeżeniami strony —
  // inaczej niż poprzednia wersja, tu NIE trzeba się logować od nowa po F5).
  const [authChecking, setAuthChecking] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  // `section`: który z 2 górnych kafelków wybrano po zalogowaniu — null
  // (jeszcze żaden), "bilety" (wchodzi się wprost) albo "klub" (dopiero po
  // podaniu dodatkowego hasła, patrz KLUB_PASSWORD). `category` to dopiero
  // konkretna kategoria punktów: dla "bilety" ustawiana automatycznie na
  // "bilety", dla "klub" wybierana z 3 kafelków (Live/Club GG/Bar).
  const [section, setSection] = useState(null);
  const [klubUnlocked, setKlubUnlocked] = useState(false);
  const [pendingKlub, setPendingKlub] = useState(false);
  const [klubPassword, setKlubPassword] = useState("");
  const [klubPasswordError, setKlubPasswordError] = useState("");
  const [category, setCategory] = useState(null);

  const [managingAccounts, setManagingAccounts] = useState(false);
  const [accountsList, setAccountsList] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsLoadError, setAccountsLoadError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [newAccountError, setNewAccountError] = useState("");
  const [newAccountBusy, setNewAccountBusy] = useState(false);
  const [deleteAccountBusyId, setDeleteAccountBusyId] = useState(null);

  const [players, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [mutationError, setMutationError] = useState("");

  const [query, setQuery] = useState("");
  const [addError, setAddError] = useState("");
  const [sortBy, setSortBy] = useState("alpha");
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  // Kept as a string while editing so the field can be cleared and retyped
  // (e.g. "100" -> "300") — see `resolveAmount` for where it becomes a number.
  const [amount, setAmount] = useState("10");
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);
  // Bumped after every CSV export purely to force a re-render — the export
  // reminder below reads its timestamp straight from localStorage rather
  // than from React state, so without this the banner wouldn't disappear
  // until some unrelated state change happened to re-render the component.
  const [csvExportTick, setCsvExportTick] = useState(0);
  const [importMsg, setImportMsg] = useState("");
  const csvMenuRef = useRef(null);
  const fileInputRef = useRef(null);

  const t = THEME;

  // ---- odtworzenie sesji zapisanej przez Supabase Auth (jeśli jest) ----
  useEffect(() => {
    if (!supabase) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data?.session?.user;
      if (!user) {
        if (!cancelled) setAuthChecking(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
      if (cancelled) return;
      if (profile) setAccount({ id: user.id, username: profile.username, role: profile.role });
      setAuthChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- initial fetch + realtime subscriptions (dopiero PO zalogowaniu —
  // RLS w schema.sql wymaga teraz prawdziwej sesji, więc zapytania i
  // subskrypcja Realtime dla niezalogowanego i tak nic by nie zwróciły) ----
  useEffect(() => {
    if (!supabase || !account) return;
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
  }, [account]);

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

  // ---- point mutations ----
  const apply = async (player, delta) => {
    const cat = category;
    const limit = player[cat + "Limit"];
    // Fast client-side check against the currently displayed value, purely
    // for instant feedback — the real guard is the atomic check inside
    // `apply_points` below, which sees the up-to-date row even if this
    // client's cached `player` is stale (e.g. another device just moved it).
    if (limit != null && player[cat] + delta < -limit) {
      setMutationError(`Limit gracza „${player.nick}" to -${limit} pkt w tej kategorii — ta zmiana by go przekroczyła.`);
      return;
    }
    setBusyId(player.id);
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
      const limitMatch = /^limit_exceeded:(-?\d+)$/.exec(error.message || "");
      if (limitMatch) {
        setMutationError(`Limit gracza „${player.nick}" to -${limitMatch[1]} pkt w tej kategorii — ta zmiana by go przekroczyła.`);
      } else {
        setMutationError(`Nie udało się zapisać zmiany punktów: ${error.message}`);
      }
      setBusyId(null);
      return;
    }
    setMutationError("");
    setPlayers((prev) => prev.map((p) => (p.id === playerRow.id ? rowFromDb(playerRow) : p)));

    const { data: eventRow, error: eventError } = await supabase
      .from("point_events")
      .insert({ player_id: player.id, category: cat, delta, created_by: account?.username || null })
      .select()
      .single();
    if (eventError) {
      setMutationError(`Punkty zapisane, ale historia zmian nie zapisała się: ${eventError.message}`);
    } else {
      setEvents((prev) => [eventFromDb(eventRow), ...prev]);
    }
    setBusyId(null);
  };

  // Komentarz dopisuje się PO fakcie — klikając wpis w historii, nie przy
  // samym +/−, więc jest to osobna, dowolnie odroczona mutacja jednego już
  // istniejącego wiersza `point_events` (tylko kolumna `comment`).
  const saveComment = async (eventId, comment) => {
    const trimmed = comment?.trim() || null;
    const { data, error } = await supabase
      .from("point_events")
      .update({ comment: trimmed })
      .eq("id", eventId)
      .select()
      .single();
    if (error) return { error: error.message };
    setEvents((prev) => prev.map((e) => (e.id === eventId ? eventFromDb(data) : e)));
    return {};
  };

  const submitLogin = async () => {
    const username = loginUsername.trim();
    if (!username || !loginPassword) return;
    setLoginBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: loginPassword,
    });
    if (error || !data?.user) {
      setLoginBusy(false);
      setLoginError("Błędny login lub hasło.");
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username, role")
      .eq("id", data.user.id)
      .single();
    setLoginBusy(false);
    if (profileError || !profile) {
      setLoginError("Zalogowano, ale nie znaleziono profilu konta — skontaktuj się z adminem.");
      await supabase.auth.signOut();
      return;
    }
    setAccount({ id: data.user.id, username: profile.username, role: profile.role });
    setLoginPassword("");
    setLoginError("");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setAccount(null);
    setSection(null);
    setKlubUnlocked(false);
    setPendingKlub(false);
    setKlubPassword("");
    setKlubPasswordError("");
    setCategory(null);
    setSelectedId(null);
    setQuery("");
    setManagingAccounts(false);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError("");
    setPlayers([]);
    setEvents([]);
  };

  // ---- nawigacja: 2 sekcje (Bilety/Klub) -> (dla Klubu) 3 podkategorie ----
  const openSection = (key) => {
    if (key === "bilety") {
      setSection("bilety");
      setSelectedId(null);
      setCategory("bilety");
      return;
    }
    // "klub" — za dodatkowym hasłem, ale tylko raz na sesję (nie trzeba go
    // wpisywać ponownie przy każdym wejściu, dopóki się nie wyloguje).
    if (klubUnlocked) {
      setSection("klub");
      setSelectedId(null);
      setCategory(null);
    } else {
      setPendingKlub(true);
      setKlubPassword("");
      setKlubPasswordError("");
    }
  };

  const submitKlubPassword = () => {
    if (klubPassword !== KLUB_PASSWORD) {
      setKlubPasswordError("Błędne hasło. Spróbuj ponownie.");
      return;
    }
    setKlubUnlocked(true);
    setPendingKlub(false);
    setKlubPassword("");
    setKlubPasswordError("");
    setSection("klub");
    setSelectedId(null);
    setCategory(null);
  };

  const cancelKlubPassword = () => {
    setPendingKlub(false);
    setKlubPassword("");
    setKlubPasswordError("");
  };

  const pickCategory = (key) => {
    setSelectedId(null);
    setCategory(key);
  };

  // Z listy graczy (wewnątrz kategorii) — dla Bilet wraca prosto do 2
  // kafelków sekcji (Bilety nie ma podkategorii), dla Klubu do jego 3
  // kafelków podkategorii.
  const backFromCategory = () => {
    setSelectedId(null);
    setQuery("");
    if (section === "bilety") {
      setCategory(null);
      setSection(null);
    } else {
      setCategory(null);
    }
  };

  // Z 3 kafelków podkategorii Klubu z powrotem do 2 kafelków sekcji (bez
  // ponownego pytania o hasło Klubu w tej samej sesji).
  const backToSections = () => {
    setSection(null);
    setCategory(null);
    setSelectedId(null);
    setQuery("");
  };

  // ---- zarządzanie kontami (tylko dla roli 'admin') ----
  // Tworzenie/usuwanie kont idzie przez backend (api/create-account.js,
  // api/delete-account.js) — z samej przeglądarki nie da się bezpiecznie
  // zakładać/kasować kont innych ludzi w prawdziwym Supabase Auth (do tego
  // trzeba service_role key, którego przeglądarka nigdy nie powinna znać).
  // Odczyt listy kont (profiles) zostaje zwykłym zapytaniem — na to RLS
  // pozwala każdemu zalogowanemu.
  const openAccountsScreen = async () => {
    setManagingAccounts(true);
    setAccountsLoading(true);
    setAccountsLoadError("");
    const { data, error } = await supabase.from("profiles").select("id, username, role, created_at").order("username");
    setAccountsLoading(false);
    if (error) {
      setAccountsLoadError(`Nie udało się wczytać listy kont: ${error.message}`);
      return;
    }
    setAccountsList(data || []);
  };

  const closeAccountsScreen = () => {
    setManagingAccounts(false);
    setNewUsername("");
    setNewPassword("");
    setNewRole("member");
    setNewAccountError("");
  };

  const callAccountApi = async (path, body) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "Operacja się nie powiodła.");
    return result;
  };

  const createAccount = async () => {
    const username = newUsername.trim();
    if (!username) { setNewAccountError("Podaj nazwę konta."); return; }
    if (newPassword.length < 4) { setNewAccountError("Hasło musi mieć co najmniej 4 znaki."); return; }
    setNewAccountBusy(true);
    let row;
    try {
      row = await callAccountApi("/api/create-account", { username, password: newPassword, role: newRole });
    } catch (e) {
      setNewAccountBusy(false);
      setNewAccountError(e.message);
      return;
    }
    setNewAccountBusy(false);
    setAccountsList((prev) => [...prev, row].sort((a, b) => a.username.localeCompare(b.username, "pl")));
    setNewUsername("");
    setNewPassword("");
    setNewRole("member");
    setNewAccountError("");
  };

  const deleteAccount = async (id) => {
    setDeleteAccountBusyId(id);
    try {
      await callAccountApi("/api/delete-account", { id });
    } catch (e) {
      setDeleteAccountBusyId(null);
      setAccountsLoadError(e.message);
      return;
    }
    setDeleteAccountBusyId(null);
    setAccountsList((prev) => prev.filter((a) => a.id !== id));
  };

  const addPlayerNow = async () => {
    const nick = query.trim();
    if (!nick) return;
    const exists = players.some((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (exists) { setAddError("Taki nick już istnieje."); return; }
    const { data, error } = await supabase.from("players").insert({ nick, live: 0, clubgg: 0, bar: 0, bilety: 0 }).select().single();
    if (error) {
      setAddError(isDuplicateNickError(error) ? "Taki nick już istnieje." : error.message);
      return;
    }
    setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, rowFromDb(data)]));
    setQuery("");
    setAddError("");
  };

  // Nick change + per-category negative-points limit, edited together from
  // the "Edytuj" popup. `limit` is the positive number the organizer typed
  // (or null for "no limit") — it's stored as-is and `apply_points` treats
  // it as the floor `-limit` for that category.
  const updatePlayerMeta = async (player, { nick, limit }) => {
    const cat = category;
    const dup = players.some((p) => p.id !== player.id && p.nick.toLowerCase() === nick.toLowerCase());
    if (dup) return { error: "Taki nick już istnieje." };
    const { data, error } = await supabase
      .from("players")
      .update({ nick, [DB_LIMIT_COLUMN[cat]]: limit })
      .eq("id", player.id)
      .select()
      .single();
    if (error) return { error: isDuplicateNickError(error) ? "Taki nick już istnieje." : error.message };
    setPlayers((prev) => prev.map((p) => (p.id === data.id ? rowFromDb(data) : p)));
    return { error: null };
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
    localStorage.setItem(`csv-last-export-${category}`, String(Date.now()));
    setCsvExportTick((n) => n + 1);
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
      const val = Number((rawVal || "0").trim()) || 0;
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
          .insert({ nick, live: 0, clubgg: 0, bar: 0, bilety: 0, [cat]: val })
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
  // minPts stays 0 as long as nobody is in the red, so the heat map looks
  // exactly like before for the common all-positive case; once someone has
  // negative points, the scale stretches down to them instead of clipping.
  const minPts = category ? Math.min(0, ...players.map((p) => p[category])) : 0;
  const maxPts = category ? Math.max(1, ...players.map((p) => p[category])) : 1;
  const ptsRange = maxPts - minPts;
  const heatRatio = (pts) => (ptsRange === 0 ? 0 : (pts - minPts) / ptsRange);
  const rows = category
    ? players
        .filter((p) => p.nick.toLowerCase().includes(q))
        .sort((a, b) => {
          if (sortBy === "recent") return b.lastChange - a.lastChange;
          return a.nick.localeCompare(b.nick, "pl");
        })
    : [];
  const canAddQuery = query.trim().length > 0 && rows.length === 0;
  const selectedPlayer = players.find((p) => p.id === selectedId);
  const total = category ? players.reduce((n, p) => n + p[category], 0) : 0;

  // "Historia" (osobny przycisk, patrz render niżej) pokazuje wszystkie
  // ostatnie zmiany punktowe w tej kategorii, dla wszystkich graczy naraz —
  // nie tylko dla jednego, otwartego akurat gracza (to robi już Historia w
  // PlayerPanel).
  const categoryHistory = category
    ? events
        .filter((e) => e.category === category)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 50)
        .map((e) => ({
          ...e,
          nick: players.find((p) => p.id === e.playerId)?.nick || "(usunięty gracz)",
          time: new Date(e.ts).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          label: (e.delta >= 0 ? "+" : "") + e.delta,
          color: e.delta >= 0 ? "#4ade80" : "#ff8f8f",
        }))
    : [];

  // Przypomnienie o eksporcie CSV — czysto lokalne (localStorage, per
  // kategoria i przeglądarka), bo to tylko wygodna podpowiedź dla
  // organizatora, nie funkcja bezpieczeństwa/synchronizacji. Pokazuje się,
  // gdy w tej kategorii W OGÓLE były jakieś zmiany punktowe, a plik CSV nie
  // został pobrany (na tym urządzeniu) w ciągu ostatnich 24h — albo nigdy.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const lastCsvExportAt = category ? Number(localStorage.getItem(`csv-last-export-${category}`)) || null : null;
  const categoryHasEvents = category ? events.some((e) => e.category === category) : false;
  const csvReminderNeeded = category && categoryHasEvents && (!lastCsvExportAt || Date.now() - lastCsvExportAt > DAY_MS);

  const sortOptions = [
    { id: "alpha", label: "A–Z" }, { id: "recent", label: "Ostatnie" },
  ];
  const viewOptions = [
    { id: "list", label: "Lista" }, { id: "grid", label: "Siatka" },
  ];

  // Tło pod kartą dostraja się do koloru aktualnie otwartej kategorii (Live/
  // Club GG/Bar/Bilety); poza kategorią (logowanie, wybór sekcji, itd.)
  // zostaje domyślny, neutralny odcień z THEME.
  const glows = category ? categoryGlows(meta.color) : { glow1: t.glow1, glow2: t.glow2, glow3: t.glow3 };

  return (
    <div style={{ position: "relative", minHeight: "100vh", boxSizing: "border-box", padding: "44px 24px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: t.text, background: t.pageBg, overflow: "hidden" }}>
      <style>{`@keyframes dcGlow{0%,100%{opacity:.55}50%{opacity:.85}}`}</style>
      <div style={{ position: "absolute", top: -220, left: "50%", transform: "translateX(-50%)", width: 900, height: 520, background: glows.glow1, filter: "blur(10px)", animation: "dcGlow 9s ease-in-out infinite", transition: "background .6s ease", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -260, right: -120, width: 820, height: 620, background: glows.glow2, filter: "blur(14px)", transition: "background .6s ease", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -180, left: -140, width: 620, height: 480, background: glows.glow3, filter: "blur(14px)", transition: "background .6s ease", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
        {account && category && (
          <span style={{ display: "block", textAlign: "center", fontSize: 68, fontWeight: 800, letterSpacing: -0.02, textTransform: "uppercase", color: meta.color, textShadow: `0 0 28px ${meta.glow}` }}>
            {meta.short}
          </span>
        )}

        <div style={{ position: "relative", width: "100%", boxSizing: "border-box", borderRadius: 26, padding: "28px 28px 22px", background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: t.cardShadow, display: "flex", flexDirection: "column", gap: 18 }}>
          {!account && !managingAccounts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>Zaloguj się</span>
                {(authChecking || loading) && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.08, textTransform: "uppercase", color: t.mutedFaint }}>Ładowanie…</span>}
              </div>
              <Divider t={t} />
              {loadError && <p style={{ margin: 0, fontSize: 12, color: "#ff7a7a" }}>Błąd połączenia z bazą: {loadError}</p>}
              {authChecking ? (
                <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Sprawdzanie zapisanej sesji…</p>
              ) : (
                <>
                  <input
                    value={loginUsername} autoFocus
                    onChange={(e) => { setLoginUsername(e.target.value); setLoginError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitLogin()}
                    placeholder="login"
                    style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.textStrong, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit" }}
                  />
                  <input
                    type="password" value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitLogin()}
                    placeholder="hasło"
                    style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.textStrong, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit" }}
                  />
                  {loginError && <p style={{ margin: 0, fontSize: 11.5, color: "#ff7a7a" }}>{loginError}</p>}
                  <GradientButton onClick={submitLogin} disabled={loginBusy} style={{ padding: "13px 0", fontSize: 13.5 }}>
                    {loginBusy ? "Logowanie…" : "Zaloguj"}
                  </GradientButton>
                </>
              )}
            </div>
          )}

          {account && !section && !category && !managingAccounts && !pendingKlub && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>Wybierz sekcję</span>
                {loading && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.08, textTransform: "uppercase", color: t.mutedFaint }}>Ładowanie…</span>}
              </div>
              <Divider t={t} />
              {loadError && <p style={{ margin: 0, fontSize: 12, color: "#ff7a7a" }}>Błąd połączenia z bazą: {loadError}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {Object.entries(SECTIONS).map(([key, s]) => {
                  const cnt = players.length;
                  const tot = key === "bilety" ? players.reduce((n, p) => n + p.bilety, 0) : null;
                  return (
                    <button
                      key={key}
                      onClick={() => openSection(key)}
                      style={{ position: "relative", overflow: "hidden", height: 132, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", textAlign: "center", padding: 16, border: `1px solid ${t.cardBorder}`, background: s.tile, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      <span style={{ fontSize: 24, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01, textTransform: "uppercase" }}>{s.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>
                        {tot !== null ? `${tot} pkt · ${cnt} graczy` : "hasło wymagane"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: t.mutedFaint }}>
                  Zalogowano jako <b style={{ color: t.text }}>{account.username}</b>{account.role === "admin" ? " (admin)" : ""}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {account.role === "admin" && (
                    <GhostButton onClick={openAccountsScreen} t={t} style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
                      Zarządzaj kontami
                    </GhostButton>
                  )}
                  <GhostButton onClick={logout} t={t} dangerHover style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
                    Wyloguj
                  </GhostButton>
                </div>
              </div>
            </div>
          )}

          {account && pendingKlub && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.01, color: t.textStrong }}>{SECTIONS.klub.label}</span>
              <Divider t={t} />
              <input
                type="password" value={klubPassword} autoFocus
                onChange={(e) => { setKlubPassword(e.target.value); setKlubPasswordError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submitKlubPassword()}
                placeholder="hasło"
                style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.textStrong, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit" }}
              />
              {klubPasswordError && <p style={{ margin: 0, fontSize: 11.5, color: "#ff7a7a" }}>{klubPasswordError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <GhostButton onClick={cancelKlubPassword} t={t} style={{ flex: 1, justifyContent: "center", padding: "13px 0", fontSize: 13.5 }}>
                  Anuluj
                </GhostButton>
                <GradientButton onClick={submitKlubPassword} style={{ flex: 2, padding: "13px 0", fontSize: 13.5 }}>Wejdź</GradientButton>
              </div>
            </div>
          )}

          {account && section === "klub" && !category && !managingAccounts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>Wybierz listę</span>
                {loading && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.08, textTransform: "uppercase", color: t.mutedFaint }}>Ładowanie…</span>}
              </div>
              <Divider t={t} />
              {loadError && <p style={{ margin: 0, fontSize: 12, color: "#ff7a7a" }}>Błąd połączenia z bazą: {loadError}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {Object.entries(KLUB_CATS).map(([key, c]) => {
                  const cnt = players.length;
                  const tot = players.reduce((n, p) => n + p[key], 0);
                  return (
                    <button
                      key={key}
                      onClick={() => pickCategory(key)}
                      style={{ position: "relative", overflow: "hidden", height: 132, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", textAlign: "center", padding: 16, border: `1px solid ${t.cardBorder}`, background: c.tile, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      <span style={{ fontSize: 22, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01, textTransform: "uppercase" }}>{c.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{tot} pkt · {cnt} graczy</span>
                    </button>
                  );
                })}
              </div>
              <GhostButton onClick={backToSections} t={t} style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "7px 12px" }}>
                ← Zmień sekcję
              </GhostButton>
            </div>
          )}

          {account && managingAccounts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <GhostButton onClick={closeAccountsScreen} t={t} style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", gap: 6, border: "1px solid transparent", fontSize: 12, fontWeight: 700, padding: "0 4px" }}>
                  <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1 }}>←</span><span>Sekcje</span>
                </GhostButton>
                <span style={{ fontFamily: MONO, fontSize: 11, color: t.mutedFaint }}>{accountsList.length} kont</span>
              </div>
              <Divider t={t} />
              {accountsLoadError && <p style={{ margin: 0, fontSize: 12, color: "#ff7a7a" }}>{accountsLoadError}</p>}

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {accountsLoading && <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Ładowanie…</p>}
                {!accountsLoading && accountsList.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: "11px 14px", background: t.inputBg, border: `1px solid ${t.cardBorder}` }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: t.textStrong }}>{a.username}</span>
                      <span style={{ fontSize: 10.5, color: t.mutedFaint, fontFamily: MONO, textTransform: "uppercase" }}>{a.role === "admin" ? "Admin" : "Zwykłe"}</span>
                    </span>
                    <button
                      onClick={() => deleteAccount(a.id)}
                      disabled={deleteAccountBusyId === a.id || a.id === account.id}
                      title={a.id === account.id ? "Nie możesz usunąć własnego konta" : "Usuń konto"}
                      style={{
                        border: "1px solid rgba(255,107,107,.45)", background: "rgba(255,107,107,.08)", color: "#ff8f8f",
                        borderRadius: 8, padding: "6px 11px", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                        cursor: (deleteAccountBusyId === a.id || a.id === account.id) ? "default" : "pointer",
                        opacity: (deleteAccountBusyId === a.id || a.id === account.id) ? 0.45 : 1,
                      }}
                    >
                      Usuń
                    </button>
                  </div>
                ))}
                {!accountsLoading && accountsList.length === 0 && <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Brak kont.</p>}
              </div>

              <Divider t={t} />
              <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Dodaj konto</p>
              <input
                value={newUsername}
                onChange={(e) => { setNewUsername(e.target.value); setNewAccountError(""); }}
                placeholder="login"
                style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 11, color: t.textStrong, fontSize: 12.5, padding: "11px 13px", fontFamily: "inherit" }}
              />
              <input
                type="password" value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setNewAccountError(""); }}
                placeholder="hasło (min. 4 znaki)"
                style={{ width: "100%", boxSizing: "border-box", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 11, color: t.textStrong, fontSize: 12.5, padding: "11px 13px", fontFamily: "inherit" }}
              />
              <Segmented options={[{ id: "member", label: "Zwykłe" }, { id: "admin", label: "Admin" }]} value={newRole} onChange={setNewRole} t={t} />
              {newAccountError && <p style={{ margin: 0, fontSize: 11, color: "#ff7a7a" }}>{newAccountError}</p>}
              <GradientButton onClick={createAccount} disabled={newAccountBusy} style={{ padding: "12px 0", fontSize: 13 }}>
                {newAccountBusy ? "Dodawanie…" : "Dodaj konto"}
              </GradientButton>
            </div>
          )}

          {account && category && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <GhostButton onClick={backFromCategory} t={t} style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", gap: 6, border: "1px solid transparent", fontSize: 12, fontWeight: 700, padding: "0 4px" }}>
                  <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1 }}>←</span><span>{section === "klub" ? "Kategorie" : "Sekcje"}</span>
                </GhostButton>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ boxSizing: "border-box", height: 32, display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 11, color: t.mutedFaint }}>{players.length} graczy</span>
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
              {csvReminderNeeded && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderRadius: 10, padding: "8px 12px", background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.4)" }}>
                  <span style={{ fontSize: 11.5, color: "#f5a623" }}>
                    Plik CSV z {meta.short} nie był pobrany od ponad 24h, a były zmiany punktów.
                  </span>
                  <GhostButton onClick={exportCsv} t={t} style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "6px 11px", flexShrink: 0 }}>
                    Eksportuj teraz
                  </GhostButton>
                </div>
              )}
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
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Segmented options={sortOptions} value={sortBy} onChange={setSortBy} t={t} />
                </div>
                <button
                  onClick={() => setView(view === "history" ? "list" : "history")}
                  style={{
                    borderRadius: 12, padding: "0 15px", fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                    border: `1px solid ${view === "history" ? t.ghostBorderHover : t.cardBorder}`,
                    background: view === "history" ? "linear-gradient(150deg,rgba(255,255,255,.14),rgba(255,255,255,.05))" : t.inputBg,
                    color: view === "history" ? t.textStrong : t.muted,
                  }}
                >
                  Historia
                </button>
                <div style={{ width: 170 }}>
                  <Segmented options={viewOptions} value={view} onChange={setView} t={t} />
                </div>
              </div>

              {view === "list" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {rows.map((p, i) => {
                    const ratio = heatRatio(p[category]);
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
                          <span style={{ position: "relative", fontFamily: MONO, fontSize: 19, fontWeight: 800, color: t.textStrong }}>
                            {p[category]}
                            {p[category + "Limit"] != null && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: t.mutedFaint, marginLeft: 4 }}>(-{p[category + "Limit"]})</span>
                            )}
                          </span>
                        </button>
                        {active && (
                          <PlayerPanel
                            player={p} category={category} events={events} amount={amount} setAmount={setAmount}
                            onAdd={() => apply(p, resolveAmount(amount))} onRemove={() => apply(p, -resolveAmount(amount))} onDelete={() => removePlayer(p.id)}
                            onEditSave={(nick, limit) => updatePlayerMeta(p, { nick, limit })}
                            onCommentSave={saveComment}
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
                    const ratio = heatRatio(p[category]);
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
                          <span style={{ position: "relative", fontFamily: MONO, fontSize: 19, fontWeight: 700, color: t.textStrong }}>
                            {p[category]}
                            {p[category + "Limit"] != null && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: t.mutedFaint, marginLeft: 4 }}>(-{p[category + "Limit"]})</span>
                            )}
                          </span>
                        </button>
                        {active && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <PlayerPanel
                              player={p} category={category} events={events} amount={amount} setAmount={setAmount}
                              onAdd={() => apply(p, resolveAmount(amount))} onRemove={() => apply(p, -resolveAmount(amount))} onDelete={() => removePlayer(p.id)}
                              onEditSave={(nick, limit) => updatePlayerMeta(p, { nick, limit })}
                              onCommentSave={saveComment}
                              busy={busyId === p.id} t={t}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {view === "history" && (
                <div style={{ borderRadius: 12, padding: "12px 14px", background: t.historyBg, border: `1px solid ${t.historyBorder}` }}>
                  <p style={{ margin: "0 0 9px", fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>
                    Ostatnie zmiany w {meta.short}
                  </p>
                  {categoryHistory.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Brak zmian w tej kategorii.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {categoryHistory.map((h) => (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", fontSize: 11.5, gap: 8 }}>
                          <span style={{ color: t.muted, fontFamily: MONO, flexShrink: 0 }}>
                            {h.time}{h.createdBy ? ` · ${h.createdBy}` : ""}
                          </span>
                          <span style={{ fontWeight: 700, color: t.textStrong, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                            {h.nick}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic", color: t.muted }}>
                            {h.comment ? `„${h.comment}"` : ""}
                          </span>
                          <span style={{ fontFamily: MONO, fontWeight: 700, color: h.color, flexShrink: 0 }}>{h.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view !== "history" && !loading && rows.length === 0 && <p style={{ margin: "4px 0", textAlign: "center", fontSize: 12, color: t.muted }}>Brak graczy pasujących do wyszukiwania.</p>}

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

// Widok gracza pod linkiem "Link dla gracza" (patrz PlayerPanel) — celowo
// osobny, samodzielny komponent zamiast trybu wewnątrz OrganizerApp: dzięki
// temu w ogóle nie pobiera listy WSZYSTKICH graczy/zdarzeń (to, co robi
// OrganizerApp przy starcie), tylko wiersz tego jednego gracza i jego własne
// zdarzenia — więc nikt patrzący na ten link (ani przez devtools) nie widzi
// danych innych graczy. Bez logowania — link ma działać dla osoby bez konta.
function PlayerView({ playerId }) {
  const t = THEME;
  const [player, setPlayer] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    // Jedyna droga do danych gracza bez logowania — funkcja `player_public_view`
    // (security definer w schema.sql), bo `players`/`point_events` są od
    // Rundy 10 zamknięte za RLS wymagającym prawdziwej sesji. Zwraca
    // WYŁĄCZNIE tego jednego gracza (nigdy całą tabelę) razem z jego
    // zdarzeniami w jednym wywołaniu.
    async function load(showSpinner) {
      if (showSpinner) setLoading(true);
      const { data, error } = await supabase.rpc("player_public_view", { p_player_id: playerId });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setNotFound(true);
      } else {
        setPlayer(rowFromDb(row));
        setEvents((row.events || []).map(eventFromDb));
        setNotFound(false);
      }
      if (showSpinner) setLoading(false);
    }
    load(true);

    // Dostęp anonimowy nie może już subskrybować Realtime na zamkniętych
    // tabelach (Realtime respektuje te same polityki RLS co zwykłe
    // zapytania) — ten widok odświeża się więc okresowym dopytywaniem
    // zamiast na żywo. 20s to rozsądny kompromis między "prawie na żywo"
    // a niepotrzebnym obciążaniem bazy zapytaniami z otwartego linku.
    const interval = setInterval(() => load(false), 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerId]);

  return (
    <div style={{ position: "relative", minHeight: "100vh", boxSizing: "border-box", padding: "44px 24px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: t.text, background: t.pageBg, overflow: "hidden" }}>
      <style>{`@keyframes dcGlow{0%,100%{opacity:.55}50%{opacity:.85}}`}</style>
      <div style={{ position: "absolute", top: -220, left: "50%", transform: "translateX(-50%)", width: 900, height: 520, background: t.glow1, filter: "blur(10px)", animation: "dcGlow 9s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -260, right: -120, width: 820, height: 620, background: t.glow2, filter: "blur(14px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -180, left: -140, width: 620, height: 480, background: t.glow3, filter: "blur(14px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 480, boxSizing: "border-box", borderRadius: 26, padding: "28px 28px 22px", background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: t.cardShadow, display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Widok gracza · tylko do odczytu</span>

        {loading && <p style={{ margin: 0, fontSize: 13, color: t.muted }}>Ładowanie…</p>}
        {!loading && notFound && (
          <p style={{ margin: 0, fontSize: 13, color: "#ff7a7a" }}>Nie znaleziono gracza. Link mógł wygasnąć albo gracz został usunięty.</p>
        )}
        {!loading && !notFound && player && (
          <>
            <span style={{ fontSize: 22, fontWeight: 800, color: t.textStrong, letterSpacing: -0.01 }}>{player.nick}</span>
            <Divider t={t} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {Object.entries(CATS).map(([key, c]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: "13px 15px", background: c.tile, border: `1px solid ${t.cardBorder}` }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: t.textStrong }}>{c.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: t.textStrong }}>
                    {player[key]}
                    {player[key + "Limit"] != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.mutedFaint, marginLeft: 4 }}>(-{player[key + "Limit"]})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <Divider t={t} />
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: 0.09, textTransform: "uppercase", color: t.mutedFaint }}>Historia zmian</p>
            {events.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: t.muted }}>Brak zmian.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                {events.map((e) => (
                  <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, gap: 8 }}>
                      <span style={{ color: t.muted, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {new Date(e.ts).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{CATS[e.category]?.short || e.category}
                        {e.createdBy ? ` · ${e.createdBy}` : ""}
                      </span>
                      <span style={{ fontFamily: MONO, fontWeight: 700, color: e.delta >= 0 ? "#4ade80" : "#ff8f8f", flexShrink: 0 }}>
                        {(e.delta >= 0 ? "+" : "") + e.delta}
                      </span>
                    </div>
                    {e.comment && (
                      <span style={{ fontSize: 11, color: t.muted, fontStyle: "italic", overflowWrap: "anywhere" }}>
                        „{e.comment}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const t = THEME;
  if (supabaseConfigError) return <ConfigErrorScreen t={t} />;
  const playerViewId = new URLSearchParams(window.location.search).get("gracz");
  if (playerViewId) return <PlayerView playerId={playerViewId} />;
  return <OrganizerApp />;
}
