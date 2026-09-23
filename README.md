# Ranking klubowy — wersja z Supabase

Aplikacja webowa do zarządzania punktami graczy (Live / Club GG), z danymi
współdzielonymi na żywo między urządzeniami.

## Poprawki (jeśli wracasz do wcześniej wdrożonego projektu)

Ta wersja naprawia 4 błędy znalezione w testach: cofanie działające tylko
jeden krok wstecz, podwójny zapis do bazy przy cofaniu w trybie deweloperskim,
interfejs zależny w 100% od Supabase Realtime (akcje "wisiały" bez żadnego
komunikatu, gdy Realtime nie działał) i ciche ignorowanie błędów zapisu
(import CSV zgłaszał sukces nawet gdy wiersz nie zapisał się w bazie).

**Jeśli masz już działający projekt Supabase** założony starszą wersją tego
repo, dolicz też migrację bazy opisaną na górze `supabase/schema.sql` —
zmienia unikalność nicku z rozróżniającej wielkość liter na nierozróżniającą.

## 1. Załóż projekt w Supabase

1. Wejdź na [supabase.com](https://supabase.com) → **New project** (darmowy plan wystarczy).
2. Poczekaj aż projekt się utworzy (ok. minuta).
3. Otwórz **SQL Editor** → **New query**, wklej całą zawartość pliku
   `supabase/schema.sql` z tego folderu i kliknij **Run**.
   To tworzy tabele `players` i `point_events` oraz włącza realtime sync.
4. Wejdź w **Project Settings → API** i skopiuj:
   - `Project URL`
   - `anon public` key

## 2. Skonfiguruj projekt lokalnie

```bash
cp .env.example .env
```

Otwórz `.env` i wklej swoje dane:

```
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=twoj-anon-key
VITE_ORG_PASSWORD=wybierz-swoje-haslo
```

Zainstaluj zależności i uruchom lokalnie:

```bash
npm install
npm run dev
```

Aplikacja wystartuje pod `http://localhost:5173`.

## 3. Wrzuć na GitHub i wdróż na Vercel

1. Utwórz nowe repozytorium na GitHubie, wypchnij do niego ten folder.
2. Wejdź na [vercel.com](https://vercel.com) → **Add New → Project** → wybierz repo.
3. W ustawieniach projektu (**Environment Variables**) dodaj te same trzy
   zmienne co w `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_ORG_PASSWORD`).
4. Kliknij **Deploy**. Po chwili dostaniesz publiczny adres
   (`https://twoja-nazwa.vercel.app`), który otwierasz na dowolnym urządzeniu.

Każda zmiana punktów synchronizuje się na żywo między wszystkimi otwartymi
urządzeniami (Supabase Realtime).

## Ważna uwaga o bezpieczeństwie

Hasło organizatora (`VITE_ORG_PASSWORD`) chroni tylko **ekran logowania** —
to zabezpieczenie po stronie interfejsu, nie bazy danych. Klucz `anon key`
używany przez aplikację jest z natury publiczny (trafia do przeglądarki) i
przy obecnych politykach RLS w `schema.sql` każdy, kto by go pozyskał,
mógłby odpytać bazę bezpośrednio, z pominięciem hasła.

Dla prywatnego linku, który znasz Ty i znajomi z klubu, to rozsądny
kompromis. Gdybyś chciał w przyszłości mocniejszej ochrony (np. osobne
konta dla organizatorów), można to dobudować przez Supabase Auth — daj znać.

## Czego nie ma w tej wersji

- Historia i przycisk "Cofnij" działają, ale cofanie dotyczy tylko zmian
  punktowych (dodaj/odejmij) — nie cofa dodania ani usunięcia gracza.
- Brak osobnych kont per organizator — jedno wspólne hasło.
