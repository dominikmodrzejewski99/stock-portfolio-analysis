# Prywatny dostęp właściciela — plan implementacji

## Overview

Ograniczyć aplikację MyPortfelik do jednego konta właściciela. Właściciel loguje się e-mailem i hasłem na każdym urządzeniu, natomiast użytkownik niezalogowany oraz inne konto Supabase nie uzyskują dostępu do prywatnego obszaru portfela.

## Current State Analysis

Starter ma działające elementy Supabase Auth: klienta serwerowego, logowanie, wylogowanie, rejestrację, middleware i chroniony dashboard. Obecny mechanizm uznaje jednak dowolnego zalogowanego użytkownika za uprawnionego i wystawia publiczną rejestrację, co jest sprzeczne z modelem jednego właściciela.

## Desired End State

Jedyną osobą dopuszczoną do `/dashboard` i przyszłych prywatnych tras jest użytkownik, którego niezmienny identyfikator Supabase odpowiada sekretowi `OWNER_USER_ID`. Konto jest tworzone ręcznie w Supabase. Publiczny formularz i endpoint rejestracji nie istnieją, nieuprawnione konto jest wylogowywane z ogólnym komunikatem, a poprawny właściciel po logowaniu trafia do prywatnego obszaru.

### Key Discoveries

- `src/middleware.ts:4` chroni obecnie tylko `/dashboard`, a `src/middleware.ts:18` sprawdza wyłącznie obecność dowolnego użytkownika.
- `src/pages/api/auth/signup.ts:13` umożliwia publiczne utworzenie konta, a odnośnik do rejestracji jest widoczny w `src/pages/auth/signin.astro:17`.
- `src/pages/api/auth/signin.ts:19` kieruje poprawne logowanie na stronę główną zamiast do prywatnego obszaru.
- `src/lib/supabase.ts:3` korzysta z typowanych sekretów `astro:env/server`; identyfikator właściciela powinien podążyć tym samym wzorcem.
- `supabase/config.toml:168` oraz `supabase/config.toml:202` dopuszczają lokalną rejestrację i wymagają wyłączenia obu przełączników.
- PRD wymaga jednego konta, braku publicznej rejestracji i niedostępności danych dla osób niezalogowanych (`context/foundation/prd.md:89`).

## What We're NOT Doing

- Nie dodajemy wielu użytkowników, ról, zaproszeń ani porównywania portfeli.
- Nie dodajemy rejestracji, jednorazowego kreatora właściciela ani panelu zarządzania kontami.
- Nie dodajemy odzyskiwania hasła, zmiany hasła, MFA ani logowania społecznościowego.
- Nie implementujemy importu XTB, obliczeń ani docelowego dashboardu portfela.
- Nie przechowujemy hasła ani danych logowania XTB.

## Implementation Approach

Supabase pozostaje dostawcą sesji. Autoryzacja właściciela zostaje wydzielona jako jedna serwerowa reguła oparta o `user.id === OWNER_USER_ID`, używana przez middleware oraz przepływ logowania. Publiczna rejestracja zostaje usunięta z aplikacji i wyłączona w lokalnej konfiguracji Supabase; na środowisku hostowanym stanowi to również wymagany krok konfiguracyjny. Komunikaty błędów logowania są ogólne, aby nie ujawniać, czy konto istnieje lub jest kontem właściciela.

## Critical Implementation Details

`OWNER_USER_ID` musi być identyfikatorem UUID użytkownika z Supabase Auth, a nie adresem e-mail. Nie może trafić do zmiennych publicznych ani kodu klienta. Wyłączenie rejestracji w repozytorium dotyczy środowiska lokalnego; hostowany projekt Supabase wymaga osobnej zmiany ustawienia przed uruchomieniem produkcji.

## Phase 1: Polityka jednego właściciela

### Overview

Wprowadzić jedno źródło prawdy dla uprawnień właściciela i zastosować je na granicy prywatnej części aplikacji.

### Changes Required

#### 1. Konfiguracja środowiska

**Files**: `.env.example`, `src/env.d.ts`

**Intent**: Udokumentować wymagany serwerowy identyfikator właściciela i zapewnić jego typowanie bez ujawniania go w kodzie klienta.

**Contract**: Aplikacja wymaga sekretu `OWNER_USER_ID`, którego wartością jest `user.id` ręcznie utworzonego konta Supabase.

#### 2. Reguła autoryzacji właściciela

**File**: `src/lib/auth.ts` (new)

**Intent**: Scentralizować porównanie bieżącego użytkownika z właścicielem, aby middleware i endpointy nie implementowały rozbieżnych reguł.

**Contract**: Serwerowy helper przyjmuje użytkownika Supabase lub `null` i zwraca informację, czy jego niezmienny identyfikator odpowiada `OWNER_USER_ID`; brak konfiguracji nie przyznaje dostępu.

#### 3. Ochrona prywatnych tras

**File**: `src/middleware.ts`

**Intent**: Dopuścić do prywatnych tras wyłącznie właściciela i zachować rozróżnienie pomiędzy brakiem sesji a sesją nieuprawnionego konta.

**Contract**: `/dashboard` pozostaje chroniony; brak sesji przekierowuje do `/auth/signin`, a sesja użytkownika innego niż właściciel jest kończona i przekierowywana do `/auth/signin?error=access_denied`. `Astro.locals.user` jest dostępny w prywatnej trasie wyłącznie dla właściciela.

### Success Criteria

#### Automated Verification

- Kontrola typów Astro przechodzi: `ASTRO_TELEMETRY_DISABLED=1 npx astro check`.
- Lint przechodzi: `npm run lint`.
- Build produkcyjny przechodzi: `ASTRO_TELEMETRY_DISABLED=1 npm run build`.

#### Manual Verification

- Niezalogowane wejście na `/dashboard` przekierowuje do logowania.
- Konto o identyfikatorze innym niż `OWNER_USER_ID` nie może otworzyć `/dashboard` i zostaje wylogowane.
- Konto właściciela może otworzyć `/dashboard` po odświeżeniu strony.

**Implementation Note**: Po tej fazie należy potwierdzić ręcznie trzy scenariusze dostępu przed zmianami UI.

---

## Phase 2: Minimalny przepływ logowania

### Overview

Usunąć publiczną rejestrację i dopasować logowanie oraz komunikaty do prywatnej aplikacji jednego właściciela.

### Changes Required

#### 1. Usunięcie przepływu rejestracji

**Files**: `src/pages/auth/signup.astro` (remove), `src/pages/api/auth/signup.ts` (remove), `src/pages/auth/confirm-email.astro` (remove), `src/components/auth/SignUpForm.tsx` (remove)

**Intent**: Zlikwidować wszystkie aplikacyjne wejścia umożliwiające tworzenie konta.

**Contract**: Żądania GET `/auth/signup` i POST `/api/auth/signup` nie mają pasujących tras i zwracają 404; nie pozostaje też ekran potwierdzenia rejestracji.

#### 2. Logowanie właściciela

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Po poprawnym uwierzytelnieniu potwierdzić autoryzację właściciela, kierować go do dashboardu i pokazywać neutralne polskie komunikaty bez odnośnika do rejestracji.

**Contract**: Udane logowanie właściciela przekierowuje do `/dashboard`. Błędne dane i konto niebędące właścicielem kończą się ogólnym komunikatem bez ujawnienia przyczyny; obca sesja zostaje wylogowana. Formularz zachowuje walidację po stronie klienta i dostępne etykiety.

#### 3. Wylogowanie i nawigacja

**Files**: `src/pages/api/auth/signout.ts`, `src/pages/dashboard.astro`

**Intent**: Zapewnić przewidywalne zakończenie sesji i spójny, polski minimalny ekran prywatny przygotowany pod kolejne funkcje.

**Contract**: POST `/api/auth/signout` kończy sesję i kieruje do `/auth/signin`; dashboard identyfikuje zalogowanego właściciela i oferuje przycisk wylogowania.

### Success Criteria

#### Automated Verification

- W repozytorium nie istnieją aplikacyjne trasy ani odnośniki rejestracji: `rg "auth/signup|api/auth/signup|confirm-email" src` nie zwraca wyników.
- Kontrola typów Astro przechodzi: `ASTRO_TELEMETRY_DISABLED=1 npx astro check`.
- Lint i build przechodzą: `npm run lint` oraz `ASTRO_TELEMETRY_DISABLED=1 npm run build`.

#### Manual Verification

- Właściciel loguje się poprawnymi danymi i trafia bezpośrednio do `/dashboard`.
- Błędne dane oraz obce konto pokazują ten sam ogólny komunikat i nie otwierają prywatnej strony.
- `/auth/signup` zwraca 404, a wylogowanie kończy sesję i wraca do ekranu logowania.
- Ekrany logowania i dashboardu pozostają użyteczne na telefonie, laptopie i komputerze.

**Implementation Note**: Przed kolejną fazą należy przejść pełny przepływ logowania i wylogowania na co najmniej jednym wąskim oraz jednym szerokim ekranie.

---

## Phase 3: Weryfikacja i konfiguracja wdrożenia

### Overview

Zamknąć możliwość rejestracji na poziomie dostawcy auth i opisać powtarzalne uruchomienie lokalne oraz produkcyjne.

### Changes Required

#### 1. Lokalna konfiguracja Supabase

**File**: `supabase/config.toml`

**Intent**: Ujednolicić lokalne zachowanie dostawcy auth z zasadą braku rejestracji.

**Contract**: Globalny oraz e-mailowy przełącznik signup są wyłączone; istniejące, ręcznie utworzone konto nadal może się logować.

#### 2. Instrukcja provisioningu i wdrożenia

**Files**: `README.md`, `.env.example`

**Intent**: Opisać bezpieczne utworzenie właściciela oraz konfigurację Supabase i Cloudflare bez umieszczania sekretów w repozytorium.

**Contract**: Dokumentacja obejmuje ręczne utworzenie użytkownika, skopiowanie jego UUID do `OWNER_USER_ID`, wyłączenie publicznych rejestracji w hostowanym Supabase, ustawienie `SUPABASE_URL`, `SUPABASE_KEY` i `OWNER_USER_ID` w środowiskach lokalnym oraz Cloudflare i kontrolę poprawnych adresów przekierowań.

### Success Criteria

#### Automated Verification

- Lokalna konfiguracja ma wyłączoną rejestrację globalną i e-mailową.
- `.env.example` wymienia wszystkie wymagane zmienne bez rzeczywistych sekretów.
- Końcowe `astro check`, lint i build przechodzą.

#### Manual Verification

- Nowego konta nie można utworzyć ani przez aplikację, ani przez publiczne wywołanie signup hostowanego Supabase.
- Właściciel może zalogować się do wdrożonej aplikacji z dwóch różnych urządzeń.
- Osoba bez sesji nie może uzyskać dostępu do prywatnego obszaru przez bezpośredni URL.

**Implementation Note**: Weryfikacja produkcyjna wymaga ręcznej konfiguracji projektu Supabase i sekretów Cloudflare przez właściciela.

---

## Testing Strategy

### Unit Tests

- Przetestować helper autoryzacji dla `null`, poprawnego UUID, obcego UUID oraz brakującej konfiguracji, jeśli istniejąca konfiguracja testowa pozwala zrobić to bez rozszerzania zakresu.
- Nie dodawać nowego frameworka testowego wyłącznie dla tej zmiany; podstawową automatyczną bramką pozostają typy, lint i build.

### Integration Tests

- Sprawdzić macierz: brak sesji, właściciel, obce konto × chroniona trasa.
- Sprawdzić, że endpoint logowania nie pozostawia aktywnej sesji obcego konta.
- Sprawdzić brak tras GET i POST rejestracji.

### Manual Testing Steps

1. Utworzyć ręcznie właściciela i pomocnicze obce konto w lokalnym środowisku Supabase przed wyłączeniem signup.
2. Ustawić UUID właściciela w `OWNER_USER_ID` i uruchomić aplikację.
3. Otworzyć `/dashboard` bez sesji i potwierdzić przekierowanie.
4. Zalogować się obcym kontem, potwierdzić ogólny błąd, a następnie ponownie otworzyć `/dashboard`.
5. Zalogować się kontem właściciela, odświeżyć dashboard i wylogować się.
6. Sprawdzić 404 dla `/auth/signup` oraz POST `/api/auth/signup`.
7. Powtórzyć kluczowy przepływ na telefonie i komputerze lub w odpowiadających im viewportach.

## Performance Considerations

Zmiana dodaje wyłącznie porównanie identyfikatora po istniejącym `supabase.auth.getUser()`, więc nie wymaga dodatkowego zapytania do bazy. Nie należy dodawać tabeli profili ani osobnego odczytu roli do każdego żądania.

## Migration Notes

Przed wyłączeniem signup należy utworzyć konto właściciela i zachować jego UUID. Jeżeli w środowisku istnieją konta starterowe, nie otrzymają dostępu dzięki `OWNER_USER_ID`; można je później usunąć ręcznie w Supabase. Cofnięcie aplikacji nie powinno automatycznie ponownie włączać publicznej rejestracji.

## References

- `context/foundation/prd.md:60`
- `context/foundation/prd.md:89`
- `context/foundation/roadmap.md:74`
- `context/foundation/tech-stack.md:24`
- `src/middleware.ts:4`
- `src/lib/supabase.ts:3`
- `src/pages/api/auth/signin.ts:4`
- `supabase/config.toml:168`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Polityka jednego właściciela

#### Automated

- [x] 1.1 Kontrola typów Astro przechodzi — 0a335c0
- [x] 1.2 Lint przechodzi — 0a335c0
- [x] 1.3 Build produkcyjny przechodzi — 0a335c0

#### Manual

- [x] 1.4 Niezalogowany użytkownik jest kierowany do logowania — 0a335c0
- [x] 1.5 Obce konto nie może otworzyć dashboardu i zostaje wylogowane — 0a335c0
- [x] 1.6 Właściciel zachowuje dostęp po odświeżeniu — 0a335c0

### Phase 2: Minimalny przepływ logowania

#### Automated

- [x] 2.1 W kodzie nie pozostają trasy ani odnośniki rejestracji — 3741c99
- [x] 2.2 Kontrola typów Astro przechodzi — 3741c99
- [x] 2.3 Lint i build przechodzą — 3741c99

#### Manual

- [x] 2.4 Właściciel loguje się i trafia do dashboardu — 3741c99
- [x] 2.5 Błędne dane i obce konto mają ten sam komunikat — 3741c99
- [x] 2.6 Rejestracja zwraca 404, a wylogowanie kończy sesję — 3741c99
- [x] 2.7 Interfejs działa na wąskim i szerokim ekranie — 3741c99

### Phase 3: Weryfikacja i konfiguracja wdrożenia

#### Automated

- [x] 3.1 Lokalna konfiguracja blokuje rejestrację
- [x] 3.2 Przykład środowiska zawiera komplet zmiennych bez sekretów
- [x] 3.3 Końcowe kontrole jakości przechodzą

#### Manual

- [x] 3.4 Hostowany Supabase odrzuca publiczny signup
- [x] 3.5 Właściciel loguje się z dwóch urządzeń
- [x] 3.6 Bezpośredni URL nie omija ochrony prywatnego obszaru
