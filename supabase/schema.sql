-- Uruchom to w Supabase: Project → SQL Editor → New query → wklej i "Run".
--
-- Masz już działający projekt Supabase założony starszą wersją tego pliku?
-- Zamiast uruchamiać ten plik od nowa (create table if not exists nic nie
-- zmieni w istniejących tabelach), wykonaj tylko te migracje:
--
--   alter table players drop constraint if exists players_nick_key;
--   create unique index if not exists players_nick_lower_idx on players (lower(nick));
--
-- (dalej w tym pliku, funkcja `apply_points` — wklej i uruchom też ją samą,
-- bezpiecznie nadpisuje poprzednią wersję dzięki "create or replace")
--
-- Pierwsza migracja zamienia unikalność nicku z rozróżniającej wielkość
-- liter (domyślne zachowanie "unique" w Postgresie) na taką, jakiej
-- faktycznie oczekuje aplikacja — "Kuba" i "kuba" to dla niej ten sam gracz.

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  nick text not null,
  live integer not null default 0,
  clubgg integer not null default 0,
  last_change timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive unique nick: a plain `unique` on `nick` only blocks exact
-- duplicates ("Kuba" and "kuba" would both be accepted), but the app treats
-- nicks as the same regardless of case. This index makes the database the
-- real source of truth for that rule instead of relying only on the
-- (racy, single-tab) check in the client.
create unique index if not exists players_nick_lower_idx on players (lower(nick));

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  category text not null check (category in ('live', 'clubgg')),
  delta integer not null,
  created_at timestamptz not null default now()
);

create index if not exists point_events_player_idx on point_events(player_id, category, created_at desc);

-- Atomowa zmiana punktów: liczy `live`/`clubgg` PO STRONIE BAZY (live + p_delta),
-- a nie na podstawie wartości wczytanej wcześniej do przeglądarki. Bez tego
-- dwa prawie-jednoczesne zapisy dla tego samego gracza (np. dwóch
-- organizatorów klikających w tym samym momencie z dwóch urządzeń) mogą się
-- nawzajem nadpisać i jedna ze zmian punktowych po prostu znika bez śladu.
create or replace function apply_points(p_player_id uuid, p_category text, p_delta integer)
returns players
language plpgsql
as $$
declare
  result players;
begin
  if p_category = 'live' then
    update players
      set live = greatest(0, live + p_delta),
          last_change = now()
      where id = p_player_id
      returning * into result;
  elsif p_category = 'clubgg' then
    update players
      set clubgg = greatest(0, clubgg + p_delta),
          last_change = now()
      where id = p_player_id
      returning * into result;
  else
    raise exception 'invalid category: %', p_category;
  end if;
  return result;
end;
$$;

grant execute on function apply_points(uuid, text, integer) to anon, authenticated;

-- Row Level Security — włączone, ale z otwartymi politykami: każdy, kto ma
-- Twój "anon key" (publiczny klucz z ustawień projektu), może czytać i pisać.
-- To wystarcza dla prywatnego linku udostępnianego znajomym z klubu.
-- Jeśli kiedyś będzie Ci potrzebna twardsza kontrola dostępu, zamień te
-- polityki na takie, które sprawdzają zalogowanego użytkownika (Supabase Auth).
alter table players enable row level security;
alter table point_events enable row level security;

create policy "public read players" on players for select using (true);
create policy "public insert players" on players for insert with check (true);
create policy "public update players" on players for update using (true);
create policy "public delete players" on players for delete using (true);

create policy "public read events" on point_events for select using (true);
create policy "public insert events" on point_events for insert with check (true);

-- Realtime — żeby zmiany na jednym urządzeniu pojawiały się na innych bez odświeżania
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table point_events;
