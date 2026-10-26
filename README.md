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

Od Rundy 26 aplikacja **zawsze wymaga logowania** — sesja nie jest
zapamiętywana, więc odświeżenie strony, nowa karta albo ponowne otwarcie
przeglądarki pokazuje ekran logowania od nowa.

### Pierwsze logowanie — załóż konto admina

Świeżo założony projekt Supabase nie ma jeszcze żadnego konta — nie masz
się jak zalogować, a stąd nie da się jeszcze użyć ekranu "Zarządzaj
kontami" (wymaga zalogowanego admina). Są dwa sposoby na założenie
pierwszego konta — **opcja A poniżej jest zalecana**, bo omija ręczne
klikanie w dashboardzie, gdzie najłatwiej o pomyłkę (zła wielkość liter w
mailu, zapomniane "Auto Confirm User", źle wklejony UID).

**Opcja A — skryptem (zalecane):**

1. Upewnij się, że masz uzupełniony plik `.env` (patrz "2. Skonfiguruj
   projekt lokalnie" niżej) — potrzebne `SUPABASE_URL` i
   `SUPABASE_SERVICE_ROLE_KEY` — oraz że **cały** plik `supabase/schema.sql`
   został już uruchomiony w SQL Editorze (ten skrypt zapisuje do tabeli
   `profiles`, więc musi ona już istnieć).
2. W folderze projektu, lokalnie (nie na Vercelu):
   ```bash
   npm install
   node scripts/create-first-admin.js admin admin123
   ```
   (podmień `admin admin123` na login i hasło, jakich chcesz używać —
   hasło minimum 4 znaki).
3. Zaloguj się w aplikacji tym loginem i hasłem.

**Opcja B — ręcznie przez dashboard:**

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
3. Zaloguj się w aplikacji tym loginem i hasłem.

Z tego pierwszego konta (obojętnie, którą opcją założonego) dodasz kolejne
— dla siebie i innych organizatorów — już normalnie przez ekran "Zarządzaj
kontami". To wymaga, żeby backend (patrz "3. Wrzuć na GitHub i wdróż na
Vercel" niżej) miał skonfigurowany `SUPABASE_SERVICE_ROLE_KEY` — bez tego
"Zarządzaj kontami" będzie zwracać błąd przy próbie dodania/usunięcia
konta.

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

**Runda 17** — nowy skrypt `scripts/create-first-admin.js` do zakładania
pierwszego konta admina (patrz "Pierwsze logowanie" wyżej, opcja A) —
robi lokalnie, jedną komendą, dokładnie to, co wcześniej trzeba było
klikać ręcznie w dashboardzie Supabase (założenie konta w Auth + wiersz w
`profiles`), więc nie da się już pomylić wielkości liter w mailu, zapomnieć
"Auto Confirm User" ani wkleić złego UID. Stary, ręczny sposób (opcja B)
wciąż działa i jest opisany jako zapasowy. Nie wymaga migracji bazy.

**Runda 18** — automatyczny, codzienny backup danych (patrz sekcja
"Automatyczny backup danych" wyżej) — nowa funkcja `api/backup-cron.js`
odpalana przez Vercel Cron Jobs, zapisuje pełny zrzut JSON (gracze,
historia zmian, konta) do prywatnego bucketu Supabase Storage, niezależnie
od wbudowanych backupów Supabase. Wymaga dodania zmiennej środowiskowej
`CRON_SECRET` w Vercelu (patrz `.env.example`) i wdrożenia tego
`vercel.json` razem z resztą kodu — poza tym nie wymaga migracji bazy.

**Runda 19** — nowa opcja importu w menu „CSV” przy liście graczy:
**„Importuj Trade Record”**. W odróżnieniu od zwykłego importu CSV (który
nadpisuje punkty wartością z pliku), ten wczytuje plik Excel wyeksportowany
z platformy klubu (zakładka „Trade Record”) i **dolicza** ujemne kwoty z
kolumny „Credits → Amount” do aktualnych punktów gracza dopasowanego po
nicku z kolumny „Member → Nickname” — dokładnie tak, jakby ktoś ręcznie
klikał „−” dla każdego wiersza z pliku. Jeden nick może wystąpić w pliku
wielokrotnie (kolejne odjęcia się sumują), dodatnie kwoty są pomijane
(import służy wyłącznie do masowych odjęć), a wiersze z nickiem
niepasującym do żadnego gracza w aplikacji są pomijane i zliczane w
podsumowaniu, nie dodają nowego gracza automatycznie. Każda zaimportowana
zmiana trafia do historii z komentarzem „Import Trade Record (data)” i
respektuje limit gracza, jeśli jest ustawiony. Import działa w kontekście
aktualnie otwartej kategorii (Live/Club GG/Bar/Bilety). Biblioteka do
czytania plików Excel (`xlsx`) ładuje się dopiero przy pierwszym użyciu
tej opcji (dynamic import), więc nie obciąża ani zwykłego ładowania
aplikacji, ani publicznego „Linku dla gracza”. Nie wymaga migracji bazy.

**Runda 20** — kategoria „Club GG" przemianowana na **„Club"** (sama nazwa
na ekranie, wewnętrzny klucz w bazie `clubgg` bez zmian — żadne dane
graczy się nie przestawiają). Dodatkowo import „Trade Record" (Runda 19)
pokazuje teraz **popup „Brak gracza"** po zakończeniu importu, jeśli w
pliku był choć jeden nick niepasujący do żadnego gracza w aplikacji —
wylistowane są w nim wszystkie brakujące nicki naraz (zamiast tylko liczby
w cichym podsumowaniu na dole ekranu, jak wcześniej). Nie wymaga migracji
bazy.

**Runda 21** — gracz może mieć **inny nick w każdej kategorii** (np. inna
nazwa na platformie Klubu niż w Bilety). Formularz "Edytuj" ma teraz dwa
przyciski zamiast jednego "Zapisz":
- **„Zapisz dla {kategoria}"** — zmienia nick TYLKO w aktualnie otwartej
  kategorii, reszta zostaje bez zmian.
- **„Zapisz dla wszystkich"** — ustawia nick bazowy (widoczny wszędzie
  tam, gdzie nie ma nadpisania) i czyści nadpisania we wszystkich 4
  kategoriach.

Nick wyświetlany na liście, w wyszukiwarce, sortowaniu, eksporcie/imporcie
CSV oraz w imporcie Trade Record to zawsze ten widoczny W TEJ kategorii —
import Trade Record dopasowuje więc wiersze po nicku z aktualnie otwartej
kategorii, nie po nicku bazowym. „Link dla gracza" pokazuje nick bazowy w
nagłówku, a przy kategoriach z nadpisanym nickiem dopisuje małym druczkiem
„jako {nick}". Wymaga migracji bazy (cztery nowe, opcjonalne kolumny
`live_nick`/`clubgg_nick`/`bar_nick`/`bilety_nick` w `players`,
zaktualizowana funkcja `player_public_view`) — patrz `supabase/schema.sql`.

**Runda 23** — nowa pozycja w menu CSV: **„Importuj raport klienta"**,
dostępna w KAŻDEJ sekcji/kategorii (Bilety, Live, Club, Bar). Czyta plik
.xls/.xlsx z eksportu listy klientów platformy Klubu (kolumny „Firma" i
„Saldo" — mogą być w dowolnym miejscu pliku, szukane po nazwie, nie po
numerze kolumny). Nick gracza to wartość z kolumny „Firma", a punkty w
aktualnie otwartej kategorii zostają NADPISANE wartością z kolumny
„Saldo" (zaokrągloną do liczby całkowitej — tak jak zwykły import CSV, a
NIE doliczane jak w imporcie Trade Record). Jeśli gracza z danym nickiem
jeszcze nie ma na liście w tej kategorii, zostaje DODANY AUTOMATYCZNIE
(w odróżnieniu od importu Trade Record, który takich tylko zgłasza w
popupie „Brak gracza", nie tworzy ich) — to raport całej bazy klientów,
nie pojedynczych transakcji, więc "brakujący" gracz tu to po prostu
jeszcze nie dodany. Wiersze bez wypełnionej kolumny „Firma" są pomijane
po cichu (w praktyce częste — nie każdy klient ma tam coś wpisane), bo
nie da się dla nich stworzyć gracza bez nazwy. Format .numbers (Apple)
NIE jest obsługiwany — brak dla niego biblioteki działającej w
przeglądarce; jeśli raport jest w Numbers, wyeksportuj go najpierw do
.xlsx (Plik → Eksportuj do → Excel). Nie wymaga migracji bazy.

**Runda 22** — import „Trade Record" (Rundy 19-20) dostępny jest teraz
WYŁĄCZNIE w podkategorii **Club** (wewnątrz Klubu) — w Live, Bar i Bilety
pozycja „Importuj Trade Record" nie pojawia się już w menu CSV. Nie
wymaga migracji bazy.

**Runda 24** — trzy zmiany:
- Pole ilości punktów w panelu gracza **resetuje się do 0** po każdej
  udanej zmianie (+/−), żeby przypadkiem nie dodać tej samej liczby
  drugi raz. Przy wartości 0 przyciski +/− nic nie robią. Kliknięcie w pole
  zaznacza jego zawartość, więc od razu można wpisać nową liczbę.
- Wrócił przycisk sortowania **„Punkty"** (od najwyższych), pomiędzy
  „A–Z" a „Ostatnie".
- Import **Trade Record** pomija wiersze, które już były zaimportowane —
  ten sam gracz, ta sama kwota i ta sama data z pliku (czyli ten sam
  komentarz „Import Trade Record (data)" w historii). Liczba pominiętych
  pokazuje się w podsumowaniu importu. Uwaga: jeśli ręcznie zmienisz
  komentarz takiego wpisu w historii, przestanie on być rozpoznawany jako
  duplikat.

Nie wymaga migracji bazy.

**Runda 25** — przeglądanie starszej historii:
- **„Pokaż więcej"** pod historią w panelu gracza (dociąga po 20
  starszych zmian) i pod widokiem „Historia" całej kategorii (po 50).
  Starsze zmiany są pobierane wprost z bazy, więc da się dojść do
  samego początku historii.
- **Filtr „Dzień"** w obu miejscach — wybierasz datę z kalendarza i widzisz
  wszystkie zmiany z tego dnia (czas polski, 00:00–24:00). „Wszystkie dni"
  wyłącza filtr.
- W widoku „Historia" kategorii działa też pole **„Szukaj gracza…"** —
  wpisanie nicku i wybranie dnia pokazuje zmiany tego gracza z tego dnia.

Nie wymaga migracji bazy.

**Runda 26** — aplikacja **zawsze wymaga logowania**. Sesja trzymana jest
tylko w pamięci otwartej karty (`persistSession: false` w
`src/supabaseClient.js`), więc odświeżenie strony, nowa karta czy ponowne
uruchomienie przeglądarki wymaga ponownego wpisania loginu i hasła. Sesje
zapamiętane przez wcześniejsze wersje są przy pierwszym wejściu usuwane z
przeglądarki. Pola logowania mają też ustawione `autocomplete`, żeby
przeglądarka nie podpowiadała zapisanego hasła — ale samo okienko
„Zapisać hasło?" zależy od przeglądarki i może się nadal pojawiać; wtedy
wybierz „Nigdy". Nie wymaga migracji bazy.

**Runda 27** — filtr historii „Dzień" (Runda 25) zamieniony na **zakres
dat „Od / Do"**, w panelu gracza i w widoku „Historia" kategorii. Oba dni
graniczne wliczają się w całości. Samo „Od" = od tego dnia do dziś, samo
„Do" = wszystko do tego dnia włącznie, jeden dzień = ta sama data w obu
polach. Zakres wpisany odwrotnie (Od późniejsze niż Do) jest sam
zamieniany. Z bazy pobieranych jest najwyżej 1000 zmian z zakresu naraz —
jeśli jest ich więcej, pod listą pojawia się informacja, żeby zawęzić
daty. Nie wymaga migracji bazy.

**Poprawka (przegląd po Rundzie 21)** — przycisk „Dodaj" przy wyszukiwaniu
nowego gracza sprawdzał duplikat nicku tylko po nicku bazowym, a nie po
nicku widocznym w aktualnie otwartej kategorii (niezgodnie z resztą
funkcji z Rundy 21). W praktyce i tak trudno było to wywołać przez samo
UI (lista wyszukiwania już wcześniej chowa przycisk „Dodaj", gdy nick się
pokrywa), ale poprawka domyka tę niekonsekwencję na wszelki wypadek — nie
wymaga migracji bazy.

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
3. W ustawieniach projektu (**Environment Variables**) dodaj zmienne z
   `.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` są wymagane (bez ostatnich dwóch aplikacja
   i tak zadziała, ale "Zarządzaj kontami" będzie zgłaszać błąd przy
   próbie dodania/usunięcia konta). `CRON_SECRET` jest zalecane — patrz
   "Automatyczny backup danych" niżej.
4. Kliknij **Deploy**. Po chwili dostaniesz publiczny adres
   (`https://twoja-nazwa.vercel.app`), który otwierasz na dowolnym urządzeniu.

Każda zmiana punktów synchronizuje się na żywo między wszystkimi otwartymi
urządzeniami (Supabase Realtime) — dla zalogowanych organizatorów. "Link
dla gracza" (patrz sekcja wyżej) odświeża się co ~20s zamiast na żywo.

## Automatyczny backup danych

Niezależnie od wbudowanych backupów Supabase (patrz niżej), aplikacja ma
teraz własny, codzienny backup — funkcja `api/backup-cron.js`, odpalana
automatycznie przez **Vercel Cron Jobs** (konfiguracja w `vercel.json`,
domyślnie o 3:00 UTC każdej nocy). Zrzuca WSZYSTKIE dane (`players`,
`point_events` ze wszystkich kategorii wraz z komentarzami, `profiles`
bez haseł) do jednego pliku JSON i zapisuje go w prywatnym buckecie
**Supabase Storage** o nazwie `backups` — w tym samym projekcie Supabase,
ale niezależnie od samych tabel, więc kopia przetrwa nawet omyłkowe
`DELETE`/`DROP` na tabeli. Stare kopie (starsze niż 30 dni) są same
sprzątane przy okazji każdego uruchomienia.

**Jak to skonfigurować:**

1. W Vercelu (**Settings → Environment Variables**) dodaj zmienną
   `CRON_SECRET` z dowolnym, losowym, długim ciągiem znaków (np.
   wygenerowanym przez `openssl rand -hex 32`) — to zabezpiecza endpoint
   backupu przed wywołaniem przez kogokolwiek innego. Bez tej zmiennej
   backup i tak zadziała (uruchomi go sam Vercel Cron), ale endpoint
   będzie można też wywołać ręcznie z zewnątrz, znając sam adres.
2. Bucket `backups` w Supabase Storage tworzy się sam przy pierwszym
   uruchomieniu — nic nie trzeba klikać ręcznie.
3. **Pobieranie backupu:** Supabase → **Storage → backups** — lista
   plików `backup-<data>.json`, każdy można pobrać jednym kliknięciem.
4. **Backup na żądanie** (nie czekając do 3:00 w nocy): w Vercelu →
   zakładka **Cron Jobs** przy projekcie → obok wpisu `backup-cron` jest
   przycisk uruchomienia ręcznego.

Vercel Cron Jobs na darmowym planie (Hobby) pozwalają na maksymalnie jedno
uruchomienie dziennie na projekt — to pasuje do domyślnej konfiguracji
(raz w nocy). Jeśli chcesz częściej, zmień `"schedule"` w `vercel.json` —
wymaga to płatnego planu Vercel (Pro).

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
