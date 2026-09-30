# Ranking klubowy — wersja z Supabase

Aplikacja webowa do zarządzania punktami graczy (Live / Klub / Bar), z
danymi współdzielonymi na żywo między urządzeniami.

## Dostęp — konta

Logowanie to prawdziwy **Supabase Auth** (nie własna tabela haseł) — każdy
loguje się swoim loginem i hasłem (ekran "Zaloguj się"). Są dwie role:

- **Admin** — pełny dostęp do wszystkich 3 kategorii (Live/Klub/Bar) **i**
  do ekranu "Zarządzaj kontami" (dodawanie/usuwanie kont, patrz niżej).
- **Zwykłe** — taki sam dostęp do wszystkich 3 kategorii, ale bez
  zarządzania kontami.

Każda zmiana punktów zapisuje, KTO ją wprowadził — nazwa konta pojawia się
w historii gracza obok czasu zmiany (np. `28.09, 23:12 · kuba`).

Zalogowanie **przetrwa odświeżenie strony** (Supabase Auth zapamiętuje
sesję) — w odróżnieniu od poprzednich wersji nie trzeba się logować od
nowa za każdym razem.

### Pierwsze logowanie — załóż konto admina

Świeżo założony projekt Supabase nie ma jeszcze żadnego konta — nie masz
się jak zalogować, a stąd nie da się jeszcze użyć ekranu "Zarządzaj
kontami" (wymaga zalogowanego admina). Pierwsze konto zakładasz ręcznie,
raz, przez dashboard:

1. Supabase → **Authentication → Users → Add user**. Jako e-mail wpisz
   `admin@gracze.local` (albo inny login + `@gracze.local` — to fikcyjny
   adres, aplikacja loguje się samym loginem, nie prawdziwym mailem), ustaw
   hasło, zaznacz **Auto Confirm User**. Zapisz i skopiuj **UID** nowego
   użytkownika (widoczny na liście/w szczegółach).
2. Supabase → **SQL Editor** → nowe zapytanie:
   ```sql
   insert into profiles (id, username, role)
   values ('WKLEJ-TU-UID', 'admin', 'admin');
   ```
   (podmień `'admin'` na login, jakiego chcesz używać, i wklej UID z kroku 1).
3. Zaloguj się w aplikacji tym loginem i hasłem. Z tego konta dodasz
   kolejne (dla siebie i innych organizatorów) wygodnie przez "Zarządzaj
   kontami" — kolejne konta NIE wymagają już ręcznego babrania się w
   dashboardzie.

Krok 3 wymaga, żeby backend (patrz "3. Wrzuć na GitHub i wdróż na Vercel" niżej) miał
skonfigurowany `SUPABASE_SERVICE_ROLE_KEY` — bez tego "Zarządzaj kontami"
będzie zwracać błąd przy próbie dodania/usunięcia konta.

## Link dla gracza

W panelu gracza (po kliknięciu w niego na liście) jest przycisk **"Link dla
gracza"** — pokazuje i kopiuje adres, który możesz wysłać graczowi (np. na
WhatsAppie). Pod tym linkiem gracz widzi, bez logowania:

- swoje punkty w każdej kategorii (Live/Klub/Bar),
- swój limit minusowych punktów w każdej kategorii, jeśli jest ustawiony,
- historię swoich zmian (kto, kiedy, ile, i ewentualny komentarz od
  organizatora) — tylko do odczytu, bez żadnych przycisków do edycji.

Widok odświeża się automatycznie co ok. 20 sekund (nie w pełni na żywo —
anonimowy dostęp nie może już subskrybować Realtime na zamkniętej bazie,
patrz sekcja o bezpieczeństwie niżej), więc gracz zobaczy zmianę punktów
wkrótce po tym, jak organizator ją wprowadzi, bez ręcznego odświeżania.
Link nie wygasa i nie wymaga hasła — nie udostępniaj go publicznie, tylko
bezpośrednio danemu graczowi.

## Poprawki (jeśli wracasz do wcześniej wdrożonego projektu)

**Runda 1** — 4 błędy: cofanie działające tylko jeden krok wstecz, podwójny
zapis do bazy przy cofaniu w trybie deweloperskim, interfejs zależny w 100%
od Supabase Realtime (akcje "wisiały" bez żadnego komunikatu, gdy Realtime
nie działał), ciche ignorowanie błędów zapisu (import CSV zgłaszał sukces
nawet gdy wiersz nie zapisał się w bazie), a także pole ilości punktów
niepozwalające się wyczyścić podczas wpisywania nowej wartości i brak
czytelnego ekranu błędu, gdy brakuje zmiennych środowiskowych.

**Runda 2** — 5 kolejnych: punkty liczone są teraz atomowo po stronie bazy
(funkcja `apply_points` w `schema.sql`) zamiast w przeglądarce — wcześniej
dwa prawie-jednoczesne zapisy dla tego samego gracza (np. z dwóch urządzeń)
mogły się nawzajem nadpisać i jedna zmiana punktowa po prostu znikała; CSV
poprawnie obsługuje teraz nicki z przecinkiem/cudzysłowem; Enter w polu
"Szukaj gracza…" dodaje gracza tak jak klik w "+ Dodaj"; panel gracza
dociąga jego historię bezpośrednio z bazy, więc nie znika po przekroczeniu
500 zapisanych zmian w całym klubie; przycisk "Cofnij" blokuje się na czas
trwania cofania i mówi wprost, gdy nie ma czego cofnąć (bo gracz został
usunięty).

**Runda 3** — punkty mogą teraz schodzić poniżej zera (np. gracz "na
kresce") zamiast zatrzymywać się na 0. Mapa cieplna wierszy dopasowuje się
do faktycznego zakresu punktów w danej kategorii (od najniższej do
najwyższej wartości), więc dalej czytelnie pokazuje, kto jest wysoko, a kto
nisko, nawet gdy ktoś jest na minusie.

**Runda 4** — zmiana struktury kategorii: "Club GG" → "Klub", nowa trzecia
kategoria "Bar". Wymaga migracji bazy (nowa kolumna `bar`, rozszerzone
ograniczenie kategorii w `point_events`, zaktualizowana funkcja
`apply_points`) — patrz `supabase/schema.sql`.

**Runda 5** — usunięty ogólny ekran logowania administratora. Pierwszy
ekran to teraz dwa niezależne kafelki-drzwi, "Bilety" i "Klub", każdy z
własnym hasłem (patrz sekcja "Dostęp" wyżej) — "Bilety" prowadzi wprost do
kategorii Live, "Klub" do wyboru 3 kategorii (Live/Klub/Bar).

**Runda 6** — usunięty przycisk "Cofnij" (wraz z całą obsługującą go
logiką) — zmiany punktowe nie da się już cofnąć jednym kliknięciem; historia
zmian w panelu gracza nadal jest widoczna, tylko bez akcji cofania.

**Runda 7** — przy każdym graczu doszedł przycisk "Edytuj" (zmiana nicku
oraz opcjonalny limit minusowych punktów per kategoria). Wpisanie liczby N w
polu limitu ustawia dolną granicę punktów tego gracza w bieżącej kategorii
na `-N` — próba przekroczenia jej (dodaj/odejmij, "+"/"−") jest blokowana z
czytelnym komunikatem, zarówno od razu w interfejsie, jak i atomowo w bazie
(rozszerzona funkcja `apply_points`), więc dwa równoczesne urządzenia nie
mogą wspólnie zepchnąć gracza poniżej jego limitu. Limit, jeśli ustawiony,
pokazuje się w nawiasie obok punktów gracza (np. `-320 (-500)`). Wymaga
migracji bazy (nowe kolumny `live_limit`/`clubgg_limit`/`bar_limit` i
zaktualizowana funkcja `apply_points`) — patrz `supabase/schema.sql`.

**Runda 8** — usunięte wspólne hasła "Bilety"/"Klub", zastąpione kontami
(patrz sekcja "Dostęp" wyżej): własny login/hasło per osoba, dwie role
(Admin/Zwykłe), zarządzanie kontami dla Admina, i — co było głównym celem
tej zmiany — każda zmiana punktowa zapisuje, kto ją wprowadził, widoczne w
historii gracza. Usunięty też tryb jasny/ciemny (przełącznik w rogu karty),
podpisy pod nagłówkami ekranów i kolorowe kwadraciki na kafelkach — czystszy
interfejs. Wymaga migracji bazy (nowa tabela `accounts`, kolumna
`created_by` w `point_events`, 4 nowe funkcje RPC) — patrz
`supabase/schema.sql`, w tym instrukcja założenia pierwszego konta admina.

**Runda 9** — w panelu gracza doszedł przycisk "Link dla gracza" (patrz
sekcja "Link dla gracza" wyżej) — generuje link do widoku tylko-do-odczytu
tego jednego gracza (punkty w każdej kategorii, limit, historia zmian), bez
logowania, aktualizujący się na żywo. Nie wymaga migracji bazy — link
wykorzystuje istniejące już id gracza jako identyfikator.

**Runda 10** — konta przeniesione na prawdziwy **Supabase Auth** (patrz
sekcja "Dostęp" wyżej) — to największa zmiana w tym projekcie. Dotychczas
hasła/role siedziały we własnej tabeli, a `players`/`point_events` były
otwarte dla każdego, kto ma klucz `anon` (publiczny, trafia do
przeglądarki) — wystarczyło znać adres API, żeby odpytać całą bazę z
pominięciem logowania. Teraz te tabele wymagają prawdziwej zalogowanej
sesji, a zakładanie/usuwanie kont idzie przez mały backend (folder `api/`,
funkcje serverless na Vercelu) używający `service_role` key — przeglądarka
nigdy go nie widzi. Efekty uboczne tej zmiany: logowanie przetrwa teraz
odświeżenie strony (plus), a "Link dla gracza" stracił żywą aktualizację na
rzecz odświeżania co ~20s (minus — Realtime, jak RLS, wymaga zalogowanej
sesji, więc anonimowy link nie może już z niego korzystać). Wymaga
migracji bazy (nowa tabela `profiles`, zamknięte RLS, nowa funkcja
`player_public_view`, usunięta stara tabela `accounts`) — patrz
`supabase/schema.sql` — **i** ręcznej konfiguracji: nowe zmienne
środowiskowe backendu i założenie pierwszego konta admina przez dashboard
Supabase (patrz sekcje "Dostęp" i "3. Wrzuć na GitHub i wdróż na Vercel").

**Runda 11** — do każdej zmiany punktowej (+/−) można teraz dopisać
opcjonalny komentarz (np. "wygrana w turnieju", "kaucja za krzesło") — pole
tekstowe pod przyciskami +/− w panelu gracza. Komentarz pokazuje się w
historii pod wpisem, razem z tym, KTO wprowadził zmianę (to działało już
od Rundy 8) — widać więc kto, kiedy, ile i dlaczego. Widoczne też na
"Linku dla gracza". Wymaga migracji bazy (nowa kolumna `comment` w
`point_events`, zaktualizowana funkcja `player_public_view`) — patrz
`supabase/schema.sql`.

**Runda 12** — nawigacja po zalogowaniu ma teraz dwa poziomy. Ekran
startowy pokazuje 2 sekcje: **Bilety** (osobna, niezależna pula punktów —
własna kategoria w bazie, nie dzieli danych z żadną kategorią Klubu) i
**Klub**, zabezpieczony dodatkowym hasłem `B@ckdoor2026` (albo swoim, patrz
niżej) — hasło to tylko lokalna blokada UI na poziomie przeglądarki, NIE
zastępuje logowania Supabase Auth i nie chroni danych na poziomie bazy
(nadal chroni je RLS z Rundy 10). Po wejściu do Klubu widać 3
podkategorie: **Live**, **Club GG**, **Bar** — dokładnie jak wcześniej,
tylko teraz jeden poziom głębiej. Każda z 5 sekcji/kategorii (Bilety, Klub,
Live, Club GG, Bar) ma inny kolor przewodni (kafelki, nagłówek, akcenty),
więc od razu widać, gdzie się jest. Hasło do Klubu można zmienić zmienną
środowiskową `VITE_KLUB_PASSWORD` (domyślnie `B@ckdoor2026`). Wymaga
migracji bazy (nowa kolumna `bilety`/`bilety_limit` w `players`, `bilety`
dodane do `check` na kategorię w `point_events`, zaktualizowana funkcja
`apply_points` i `player_public_view`) — patrz `supabase/schema.sql`.

**Runda 13** — komentarz do zmiany punktowej dopisuje się teraz **po
fakcie**, klikając konkretny wpis w historii gracza (zamiast pola tekstowego
obok przycisków +/−, które dodawało komentarz z góry, przed samą zmianą).
Kliknięcie wpisu otwiera mały edytor pod nim — działa też do EDYCJI już
zapisanego komentarza (klik ponownie na ten sam wpis), nie tylko dodania
nowego. Zapisany komentarz pokazuje się w tej samej linii co reszta wpisu,
pomiędzy tym, kto wprowadził zmianę, a jej sumą (np.
`29.09, 21:26 · admin  „wygrana w turnieju"  +50`). Wymaga migracji bazy — RLS na `point_events` w ogóle nie miało
polityki UPDATE (dawało tylko odczyt i insert), więc dopisywanie komentarza
po fakcie wymaga nowej polityki:

```sql
create policy "authenticated update events" on point_events for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

patrz `supabase/schema.sql`.

**Runda 14** — usunięty przycisk sortowania „Punkty" (obok listy graczy
zostały tylko „A–Z" i „Ostatnie") — w jego miejsce, jako osobny przycisk
pomiędzy „Ostatnie" a „Lista", doszedł nowy przycisk **„Historia"**,
pokazujący wszystkie ostatnie zmiany punktowe w danej kategorii, dla
wszystkich graczy naraz — nie tylko dla jednego, akurat otwartego gracza
(to nadal robi osobna Historia w panelu gracza). Nie wymaga migracji bazy.

**Runda 15** — przypomnienie o eksporcie CSV. Jeśli w danej kategorii były
jakiekolwiek zmiany punktowe, a plik CSV nie został pobrany (na tym
urządzeniu/przeglądarce) w ciągu ostatnich 24h — albo nigdy — nad listą
graczy pojawia się pomarańczowy pasek z przyciskiem „Eksportuj teraz".
Znika od razu po eksporcie i wraca dopiero po kolejnych 24h bez pobrania.
To czysto lokalna podpowiedź (localStorage), nie synchronizuje się między
urządzeniami/organizatorami — każda przeglądarka pilnuje swojego
przypomnienia osobno. Nie wymaga migracji bazy.

**Runda 16** — tło ekranu kategorii (rozmyte plamy światła za kartą) teraz
dostraja się do koloru aktualnie otwartej kategorii (np. turkusowe dla
Live, fioletowo-indygo dla Club GG, bursztynowe dla Bar, zielone dla
Bilety) — te same trzy warstwy co wcześniej, tylko przefarbowane, więc od
razu widać po samym tle, w której kategorii jesteś, jeszcze zanim
spojrzysz na nagłówek. Nagłówek kategorii (np. „LIVE") jest też większy
(68px zamiast 52px), pozostaje wycentrowany nad kartą, w tej samej
szerokości co ona. Dodatkowo nazwy w obu menu wyboru (ekran „Wybierz
sekcję" — Bilety/Klub, i ekran „Wybierz listę" — Live/Club GG/Bar w
środku Klubu) są teraz większe i wycentrowane na środku każdego kafelka
(wcześniej były małe i przyklejone do dolnego-lewego rogu). Nie wymaga
migracji bazy.

**Jeśli masz już działający projekt Supabase** założony starszą wersją tego
repo, dolicz migracje opisane na górze `supabase/schema.sql` — zmiana
unikalności nicku na nierozróżniającą wielkość liter i (ważne!) funkcję
`apply_points`, bez której punkty nadal będą liczone niebezpiecznie po
stronie przeglądarki. **Jeśli wracasz konkretnie z wersji sprzed Rundy 10**
(miałeś stare konta z tabelą `accounts`), przeczytaj też sekcję "Dostęp"
— trzeba założyć konta na nowo w Supabase Auth, stare hasła nie przejdą.

## 1. Załóż projekt w Supabase

1. Wejdź na [supabase.com](https://supabase.com) → **New project** (darmowy plan wystarczy).
2. Poczekaj aż projekt się utworzy (ok. minuta).
3. Otwórz **SQL Editor** → **New query**, wklej całą zawartość pliku
   `supabase/schema.sql` z tego folderu i kliknij **Run**.
   To tworzy tabele `players`/`point_events`/`profiles`, zamyka RLS za
   logowaniem i włącza realtime sync.
4. **Authentication → Providers** — upewnij się, że **Email** jest
   włączony (domyślnie jest). Nie musisz nic dodatkowo konfigurować —
   konta zakłada się z `email_confirm: true`, więc nie czekają na
   potwierdzenie mailowe (i tak nie ma prawdziwej skrzynki pod
   `@gracze.local`).
5. Wejdź w **Project Settings → API** i skopiuj TRZY wartości:
   - `Project URL`
   - `anon public` key
   - `service_role` key — **SEKRETNY**, nigdy nie trafia do przeglądarki
     ani do Gita; potrzebny tylko backendowi (patrz krok 3 niżej).

## 2. Skonfiguruj projekt lokalnie

```bash
cp .env.example .env
```

Otwórz `.env` i wklej swoje dane:

```
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=twoj-anon-key
SUPABASE_URL=https://twoj-projekt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=twoj-service-role-key
```

(Tak, `VITE_SUPABASE_URL` i `SUPABASE_URL` to ten sam adres pod dwiema
nazwami — pierwsza trafia do przeglądarki, druga zostaje tylko po stronie
backendu. To rozróżnienie jest celowe, nie literówka.)

Zainstaluj zależności i uruchom lokalnie:

```bash
npm install
npm run dev
```

Aplikacja wystartuje pod `http://localhost:5173`. To wystarczy do
logowania, punktów, historii — WSZYSTKIEGO poza ekranem "Zarządzaj
kontami" (dodawanie/usuwanie kont), bo ten korzysta z folderu `api/`
(funkcje serverless), których zwykły `vite dev` nie uruchamia. Żeby
przetestować lokalnie też to, zainstaluj `npm i -g vercel` i uruchamiaj
`vercel dev` zamiast `npm run dev` — wtedy `api/*.js` też działa.

## 3. Wrzuć na GitHub i wdróż na Vercel

1. Utwórz nowe repozytorium na GitHubie, wypchnij do niego ten folder
   (folder `api/` jedzie razem z resztą — Vercel wykrywa go automatycznie
   jako funkcje serverless, nic dodatkowo nie trzeba konfigurować).
2. Wejdź na [vercel.com](https://vercel.com) → **Add New → Project** → wybierz repo.
3. W ustawieniach projektu (**Environment Variables**) dodaj WSZYSTKIE
   cztery zmienne co w `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Bez ostatnich dwóch
   aplikacja i tak zadziała, ale "Zarządzaj kontami" będzie zgłaszać błąd
   przy próbie dodania/usunięcia konta.
4. Kliknij **Deploy**. Po chwili dostaniesz publiczny adres
   (`https://twoja-nazwa.vercel.app`), który otwierasz na dowolnym urządzeniu.

Każda zmiana punktów synchronizuje się na żywo między wszystkimi otwartymi
urządzeniami (Supabase Realtime) — dla zalogowanych organizatorów. "Link
dla gracza" (patrz sekcja wyżej) odświeża się co ~20s zamiast na żywo.

## Ważna uwaga o bezpieczeństwie

Od Rundy 10 to prawdziwy **Supabase Auth**, nie własna tabela haseł —
Postgres faktycznie wie, kto jest zalogowany, i polityki RLS na
`players`/`point_events` tego wymagają (`auth.role() = 'authenticated'`).
Innymi słowy: ktoś, kto ma tylko Twój `anon key` (publiczny klucz, trafia
do przeglądarki — sam w sobie zawsze był i będzie widoczny), **nie odpyta
już bazy bezpośrednio przez REST API** bez wcześniejszego zalogowania się
prawdziwym kontem. To realnie zamyka lukę opisaną w poprzednich rundach.

Kilka rzeczy, o których warto wiedzieć:

- **Hasła** trzyma i hashuje sam Supabase Auth (nie mamy do nich dostępu,
  nie przechowujemy ich nigdzie sami).
- **Tworzenie/usuwanie kont** idzie przez backend (folder `api/`) kluczem
  `service_role` — ten klucz ma pełny dostęp do wszystkiego z pominięciem
  RLS, więc MUSI zostać na serwerze (zmienna `SUPABASE_SERVICE_ROLE_KEY`
  bez prefiksu `VITE_`) i nigdy nie trafić do kodu przeglądarki ani do
  Gita. Backend sam sprawdza, czy wołający jest zalogowanym adminem, zanim
  cokolwiek zrobi (patrz `api/_supabaseAdmin.js`) — więc mimo że
  `/api/create-account` jest technicznie publicznym adresem URL, zwykły
  gość (albo zalogowany, ale nie-admin) dostanie odmowę.
- **Login to nie prawdziwy e-mail.** Organizatorzy logują się samym
  loginem — aplikacja po cichu doczepia `@gracze.local`, żeby spełnić
  wymóg Supabase Auth (potrzebuje adresu e-mail). Nikt tam nic nie
  wysyła, to czysto techniczny szczegół, niewidoczny w interfejsie.
- **Rola (Admin/Zwykłe)** siedzi w tabeli `profiles`, do której zwykły
  zalogowany klient może tylko czytać (żeby zobaczyć listę kont i własną
  rolę) — nie może sam sobie zmienić roli ani dopisać wiersza; to też
  robi wyłącznie backend.

**Link dla gracza** to jedyny celowy wyłom w tym murze — ma działać bez
logowania, dla osoby bez konta. Zamiast otwierać całą bazę, korzysta z
jednej wąskiej funkcji (`player_public_view`), która zwraca WYŁĄCZNIE
dane jednego, konkretnego gracza po jego id (losowym, nieodgadywalnym
UUID-zie) — nigdy całą tabelę. Kto dostanie taki link, zobaczy dane tego
jednego gracza bez logowania — traktuj go jak coś, co wysyłasz
bezpośrednio zainteresowanej osobie, nie jak publiczny URL.

## Czego nie ma w tej wersji

- Nie da się cofnąć zmiany punktowej jednym kliknięciem — historia w
  panelu gracza jest tylko do podglądu.
- Brak samoobsługowego resetu hasła — hasło konta może zmienić tylko admin,
  usuwając je i zakładając od nowa (edycja hasła istniejącego konta nie jest
  jeszcze wspierana; wymagałoby to kolejnej funkcji w `api/`).
- "Link dla gracza" pokazuje zmiany z opóźnieniem do ~20 sekund (odpytywanie
  zamiast Realtime) — patrz sekcja o bezpieczeństwie, czemu.
