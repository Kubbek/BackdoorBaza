-- Uruchom to w Supabase: Project → SQL Editor → New query → wklej i "Run".
--
-- WAŻNA ZMIANA (Runda 10): konta przeniesione na prawdziwy Supabase Auth.
--
-- Jeśli wracasz do projektu założonego STARSZĄ wersją tego pliku (miał
-- własną tabelę `accounts` z hasłami), ta wersja ją usuwa i zastępuje
-- tabelą `profiles` powiązaną z wbudowanym Supabase Auth. To NIE jest
-- migracja "dopisz kilka kolumn" — przeczytaj README (sekcja "Prywatna
-- baza — Supabase Auth"), zanim uruchomisz ten plik na działającym
-- projekcie: musisz ręcznie założyć konta w Supabase Auth i skonfigurować
-- zmienne środowiskowe backendu, inaczej NIKT się nie zaloguje.
--
-- Migracje, jeśli wracasz do projektu sprzed Rundy 10 (uruchamiasz cały
-- plik od nowa i tak jest bezpiecznie — poniższe linie są tu tylko jako
-- ściągawka, co dokładnie się zmienia):
--
--   drop table if exists accounts cascade;
--   drop function if exists account_login(text, text);
--   drop function if exists account_list();
--   drop function if exists account_create(text, text, text);
--   drop function if exists account_delete(uuid);
--   drop policy if exists "public read players" on players;
--   drop policy if exists "public insert players" on players;
--   drop policy if exists "public update players" on players;
--   drop policy if exists "public delete players" on players;
--   drop policy if exists "public read events" on point_events;
--   drop policy if exists "public insert events" on point_events;
--
-- (poniższy CREATE TABLE/CREATE POLICY dokłada resztę — patrz cała sekcja
-- "Profile i uprawnienia" niżej.)
--
-- Runda 11: komentarze do zmian punktowych — jedna nowa kolumna, dolicz ją
-- jeśli wracasz do projektu sprzed tej rundy (i wklej na nowo funkcję
-- `player_public_view` niżej, żeby link dla gracza też pokazywał komentarze):
--
--   alter table point_events add column if not exists comment text;
--
-- Runda 12: nowa, niezależna kategoria "Bilety" (osobna pula punktów, NIE
-- to samo co Live) plus przebudowa nawigacji na 2 sekcje po zalogowaniu
-- (Bilety / Klub, Klub za dodatkowym hasłem, z 3 podkategoriami Live/Club
-- GG/Bar w środku — patrz README, sekcja "Sekcje i kategorie"). Migracja:
--
--   alter table players add column if not exists bilety integer not null default 0;
--   alter table players add column if not exists bilety_limit integer;
--   alter table point_events drop constraint if exists point_events_category_check;
--   alter table point_events add constraint point_events_category_check
--     check (category in ('live', 'clubgg', 'bar', 'bilety'));
--
-- (i wklej na nowo funkcje `apply_points` oraz `player_public_view` niżej —
-- obie zaktualizowane o obsługę kategorii "bilety".)
--
-- Runda 13: komentarz do zmiany punktowej dopisuje się teraz PO fakcie,
-- klikając wpis w historii (a nie przy samym +/−) — wymaga uprawnienia
-- UPDATE na `point_events`, którego RLS wcześniej w ogóle nie dawało:
--
--   create policy "authenticated update events" on point_events for update
--     using (auth.role() = 'authenticated')
--     with check (auth.role() = 'authenticated');

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  nick text not null,
  live integer not null default 0,
  clubgg integer not null default 0,
  bar integer not null default 0,
  bilety integer not null default 0,
  live_limit integer,
  clubgg_limit integer,
  bar_limit integer,
  bilety_limit integer,
  last_change timestamptz,
  created_at timestamptz not null default now()
);

-- Istniejąca tabela sprzed kategorii "Bar"? Ta linia dokłada kolumnę bez
-- ruszania reszty danych (create table if not exists powyżej jej nie doda).
alter table players add column if not exists bar integer not null default 0;

-- Istniejąca tabela sprzed kategorii "Bilety" (osobnej puli punktów, patrz
-- Runda 12)? Ta linia dokłada kolumnę bez ruszania reszty danych.
alter table players add column if not exists bilety integer not null default 0;

-- Istniejąca tabela sprzed limitów minusowych punktów? Te cztery linie
-- dokładają kolumny (NULL = brak limitu) bez ruszania reszty danych.
alter table players add column if not exists live_limit integer;
alter table players add column if not exists clubgg_limit integer;
alter table players add column if not exists bar_limit integer;
alter table players add column if not exists bilety_limit integer;

-- Case-insensitive unique nick: a plain `unique` on `nick` only blocks exact
-- duplicates ("Kuba" and "kuba" would both be accepted), but the app treats
-- nicks as the same regardless of case. This index makes the database the
-- real source of truth for that rule instead of relying only on the
-- (racy, single-tab) check in the client.
create unique index if not exists players_nick_lower_idx on players (lower(nick));

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  category text not null check (category in ('live', 'clubgg', 'bar', 'bilety')),
  delta integer not null,
  created_by text,
  comment text,
  created_at timestamptz not null default now()
);

-- Istniejąca tabela sprzed kategorii "Bar"/"Bilety"? To pozwala jej też na
-- obie (create table if not exists powyżej nie zmieni już istniejącego ograniczenia).
alter table point_events drop constraint if exists point_events_category_check;
alter table point_events add constraint point_events_category_check
  check (category in ('live', 'clubgg', 'bar', 'bilety'));

-- Istniejąca tabela sprzed kont? Ta linia dokłada kolumnę bez ruszania
-- reszty danych — starsze zdarzenia po prostu nie będą miały autora.
alter table point_events add column if not exists created_by text;

-- Istniejąca tabela sprzed komentarzy do zmian punktowych? Ta linia
-- dokłada kolumnę bez ruszania reszty danych — starsze zdarzenia po
-- prostu nie będą miały komentarza (NULL).
alter table point_events add column if not exists comment text;

create index if not exists point_events_player_idx on point_events(player_id, category, created_at desc);

-- Atomowa zmiana punktów: liczy `live`/`clubgg`/`bar` PO STRONIE BAZY
-- (live + p_delta), a nie na podstawie wartości wczytanej wcześniej do
-- przeglądarki. Bez tego dwa prawie-jednoczesne zapisy dla tego samego
-- gracza (np. dwóch organizatorów klikających w tym samym momencie z dwóch
-- urządzeń) mogą się nawzajem nadpisać i jedna ze zmian punktowych po
-- prostu znika bez śladu.
--
-- Celowo BEZ "security definer" — ma działać z uprawnieniami WOŁAJĄCEGO,
-- więc respektuje polityki RLS niżej (tylko zalogowani mogą zmieniać punkty).
--
-- `select ... for update` blokuje wiersz gracza na czas transakcji, żeby
-- sprawdzenie limitu i sam zapis widziały tę samą, aktualną wartość — bez
-- tego dwa równoczesne zapisy mogłyby obie przejść sprawdzenie limitu na
-- starej wartości i razem zepchnąć punkty głębiej niż limit dopuszcza.
-- Gdy limit zostałby przekroczony, funkcja zgłasza wyjątek w formacie
-- 'limit_exceeded:<limit>', który aplikacja rozpoznaje i pokazuje jako
-- czytelny komunikat, nie zapisując żadnej zmiany.
create or replace function apply_points(p_player_id uuid, p_category text, p_delta integer)
returns players
language plpgsql
as $$
declare
  result players;
  cur_val integer;
  cur_limit integer;
  new_val integer;
begin
  if p_category not in ('live', 'clubgg', 'bar', 'bilety') then
    raise exception 'invalid category: %', p_category;
  end if;

  if p_category = 'live' then
    select live, live_limit into cur_val, cur_limit from players where id = p_player_id for update;
  elsif p_category = 'clubgg' then
    select clubgg, clubgg_limit into cur_val, cur_limit from players where id = p_player_id for update;
  elsif p_category = 'bar' then
    select bar, bar_limit into cur_val, cur_limit from players where id = p_player_id for update;
  else
    select bilety, bilety_limit into cur_val, cur_limit from players where id = p_player_id for update;
  end if;

  if cur_val is null then
    raise exception 'player not found: %', p_player_id;
  end if;

  -- Punkty mogą schodzić poniżej zera (np. gracz "na kresce") — stąd brak
  -- greatest(0, ...) tutaj. Jedyna granica to opcjonalny limit gracza.
  new_val := cur_val + p_delta;
  if cur_limit is not null and new_val < -cur_limit then
    raise exception 'limit_exceeded:%', cur_limit;
  end if;

  if p_category = 'live' then
    update players set live = new_val, last_change = now()
      where id = p_player_id returning * into result;
  elsif p_category = 'clubgg' then
    update players set clubgg = new_val, last_change = now()
      where id = p_player_id returning * into result;
  elsif p_category = 'bar' then
    update players set bar = new_val, last_change = now()
      where id = p_player_id returning * into result;
  else
    update players set bilety = new_val, last_change = now()
      where id = p_player_id returning * into result;
  end if;
  return result;
end;
$$;

grant execute on function apply_points(uuid, text, integer) to authenticated;

-- ===== Profile i uprawnienia (Supabase Auth) =====
--
-- Logowanie NIE jest już własną tabelą haseł — to prawdziwy Supabase Auth
-- (`auth.users`, wbudowany w każdy projekt). Ponieważ Auth wymaga adresu
-- e-mail, a organizatorzy logują się samym loginem, aplikacja po cichu
-- zamienia login na fikcyjny adres w rodzaju `kuba@gracze.local` — nikt
-- tam nic nie wysyła, to tylko techniczny wymóg Supabase, użytkownik tego
-- nie widzi (patrz `usernameToEmail` w src/App.jsx).
--
-- `profiles` trzyma to, czego `auth.users` nie ma z definicji: widoczny
-- login i rolę (admin/zwykłe). Wiersz w tej tabeli zakłada WYŁĄCZNIE
-- backend (funkcje w folderze api/, kluczem service_role, który omija
-- RLS) — dlatego nie ma tu żadnej polityki insert/update/delete: zwykły
-- klient (nawet zalogowany) nie może sam sobie zmienić roli na admina.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

alter table profiles enable row level security;

-- Każdy zalogowany widzi WSZYSTKIE profile (żeby ekran "Zarządzaj kontami"
-- mógł wyświetlić listę, i żeby każdy mógł sprawdzić własną rolę po
-- zalogowaniu) — ale nikt poza backendem (service_role) nie może przez API
-- nic w tej tabeli zmienić, bo nie ma polityk insert/update/delete.
create policy "authenticated read profiles" on profiles for select
  using (auth.role() = 'authenticated');

-- Row Level Security na graczach i zdarzeniach — TERAZ wymaga prawdziwego
-- zalogowania (auth.role() = 'authenticated'), nie samego posiadania
-- klucza anon. To właśnie zamyka bazę: ktoś z samym kluczem anon (czyli
-- każdy, kto otworzy stronę) nie odpyta już `players`/`point_events`
-- bezpośrednio przez REST — musi się najpierw zalogować prawdziwym kontem.
alter table players enable row level security;
alter table point_events enable row level security;

drop policy if exists "public read players" on players;
drop policy if exists "public insert players" on players;
drop policy if exists "public update players" on players;
drop policy if exists "public delete players" on players;
drop policy if exists "public read events" on point_events;
drop policy if exists "public insert events" on point_events;

create policy "authenticated read players" on players for select
  using (auth.role() = 'authenticated');
create policy "authenticated insert players" on players for insert
  with check (auth.role() = 'authenticated');
create policy "authenticated update players" on players for update
  using (auth.role() = 'authenticated');
create policy "authenticated delete players" on players for delete
  using (auth.role() = 'authenticated');

create policy "authenticated read events" on point_events for select
  using (auth.role() = 'authenticated');
create policy "authenticated insert events" on point_events for insert
  with check (auth.role() = 'authenticated');
-- Update potrzebny do dopisywania komentarza do już istniejącego wpisu w
-- historii (Runda 13) — sam delta/kategoria/gracz nie są edytowalne, o to
-- dba wyłącznie klient (aktualizuje wyłącznie kolumnę `comment`).
create policy "authenticated update events" on point_events for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Jeśli wracasz do starszego projektu, usuń starą tabelę kont — patrz
-- ściągawka na górze pliku. Nowe (puste jeszcze) konto zakładasz przez
-- backend, patrz README, sekcja "Pierwsze logowanie".
drop table if exists accounts cascade;

-- ===== Link dla gracza =====
--
-- Jedyny celowy wyłom w powyższym murze: link "Link dla gracza" (patrz
-- przycisk w panelu gracza) ma działać BEZ logowania, dla osoby bez
-- konta. Ta funkcja (security definer, więc omija RLS) zwraca WYŁĄCZNIE
-- dane jednego, konkretnego gracza po jego id — nigdy całą tabelę — więc
-- reszta bazy zostaje zamknięta, a ten link i tak działa.
--
-- (Ponieważ dostęp anonimowy nie może już subskrybować Realtime na
-- zamkniętych tabelach, widok gracza pod tym linkiem odświeża się przez
-- okresowe dopytywanie tej funkcji, a nie na żywo — patrz PlayerView
-- w src/App.jsx.)
create or replace function player_public_view(p_player_id uuid)
returns table(
  id uuid, nick text,
  live integer, clubgg integer, bar integer, bilety integer,
  live_limit integer, clubgg_limit integer, bar_limit integer, bilety_limit integer,
  events json
)
language sql
security definer
set search_path = public
as $$
  select
    p.id, p.nick, p.live, p.clubgg, p.bar, p.bilety,
    p.live_limit, p.clubgg_limit, p.bar_limit, p.bilety_limit,
    (
      select coalesce(json_agg(e), '[]'::json) from (
        select id, category, delta, created_by, comment, created_at
        from point_events
        where player_id = p.id
        order by created_at desc
        limit 100
      ) e
    ) as events
  from players p
  where p.id = p_player_id;
$$;
grant execute on function player_public_view(uuid) to anon, authenticated;

-- Realtime — żeby zmiany na jednym urządzeniu pojawiały się na innych bez
-- odświeżania (tylko dla ZALOGOWANYCH klientów, bo Realtime respektuje te
-- same polityki RLS co zwykłe zapytania).
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table point_events;
