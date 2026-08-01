# Prywatny dostęp właściciela — skrót planu

> Pełny plan: `context/changes/owner-private-access/plan.md`

## What & Why

MyPortfelik ma w MVP służyć jednej osobie i udostępniać dane portfela na komputerze, laptopie oraz telefonie. Starter zapewnia już Supabase Auth, ale wystawia publiczną rejestrację i wpuszcza każde zalogowane konto, dlatego wymaga zawężenia do jednego właściciela.

## Starting Point

Istnieją formularze logowania i rejestracji, endpointy auth, sesja SSR, middleware chroniący `/dashboard` oraz przykładowy dashboard. Brakuje reguły identyfikującej właściciela i produkcyjnej instrukcji zamknięcia rejestracji.

## Desired End State

Właściciel loguje się e-mailem i hasłem i trafia do prywatnego dashboardu z dowolnego urządzenia. Osoba bez sesji oraz zalogowane obce konto nie mają dostępu, publiczna rejestracja nie istnieje, a konto właściciela jest zakładane ręcznie w Supabase.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Model dostępu | Jedno konto, bez ról i publicznej rejestracji | Minimalizuje zakres MVP i odpowiada prywatnemu użyciu | PRD |
| Identyfikacja właściciela | Sekret `OWNER_USER_ID` z UUID Supabase | UUID jest niezmienny i umożliwia jednoznaczną autoryzację | Plan |
| Provisioning | Ręcznie w panelu Supabase | Nie wymaga wystawienia instalatora ani endpointu tworzenia kont | Plan |
| Dawna trasa signup | 404 po usunięciu strony i endpointu | Usuwa nieobsługiwaną powierzchnię aplikacji | Plan |
| Obce konto | Wylogowanie i ogólny komunikat | Nie pozostawia nieuprawnionej sesji i nie ujawnia właściciela | Plan |
| Dostawca sesji | Istniejący Supabase Auth | Starter ma już działającą integrację SSR | Tech stack |

## Scope

**In scope:**

- Serwerowa reguła właściciela oparta o `OWNER_USER_ID`.
- Ochrona dashboardu przed brakiem sesji i obcym kontem.
- Logowanie, wylogowanie i neutralne komunikaty po polsku.
- Usunięcie wszystkich elementów publicznej rejestracji.
- Wyłączenie signup w lokalnym i hostowanym Supabase.
- Instrukcja konfiguracji sekretów lokalnie i w Cloudflare.

**Out of scope:**

- Wielu użytkowników, role, zaproszenia i porównywanie portfeli.
- Odzyskiwanie hasła, MFA i logowanie społecznościowe.
- Import XTB, obliczenia oraz docelowy interfejs portfela.

## Architecture / Approach

Supabase uwierzytelnia użytkownika i utrzymuje sesję w ciasteczkach SSR. Serwerowy helper porównuje `user.id` z prywatnym `OWNER_USER_ID`; middleware używa tej reguły przed otwarciem prywatnej trasy, a logowanie usuwa sesję konta, które nie jest właścicielem. Warstwa aplikacji i konfiguracja Supabase niezależnie blokują signup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Polityka jednego właściciela | Jedna reguła uprawnień i chroniony dashboard | Błędny UUID lub brak sekretu blokuje także właściciela |
| 2. Minimalny przepływ logowania | Brak rejestracji, poprawne przekierowania i komunikaty | Pozostawiona trasa mogłaby nadal tworzyć konta |
| 3. Weryfikacja i wdrożenie | Spójna konfiguracja lokalna, Supabase i Cloudflare | Ustawienie lokalne nie zmienia automatycznie hostowanego Supabase |

**Prerequisites:** projekt Supabase oraz możliwość ręcznego utworzenia użytkownika i ustawienia sekretów Cloudflare.

**Estimated effort:** około 2–3 sesje po godzinach w trzech małych fazach.

## Open Risks & Assumptions

- Właściciel ma dostęp administracyjny do projektu Supabase i zna sposób ustawienia sekretów Cloudflare.
- Przed wyłączeniem signup zostanie utworzone konto właściciela i zapisany jego UUID.
- Brak odzyskiwania hasła jest świadomym ograniczeniem MVP; reset wymaga panelu administracyjnego Supabase.
- Testy z prawdziwymi sesjami wymagają lokalnego lub hostowanego projektu Supabase.

## Success Criteria (Summary)

- Tylko użytkownik o UUID zgodnym z `OWNER_USER_ID` może otworzyć prywatny dashboard.
- W aplikacji ani w Supabase nie da się publicznie utworzyć nowego konta.
- Właściciel może zalogować się, odświeżyć sesję i wylogować na urządzeniach mobilnych oraz desktopowych.
