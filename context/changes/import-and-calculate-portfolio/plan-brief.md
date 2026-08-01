# Import i obliczenie portfela — skrót planu

> Pełny plan: `context/changes/import-and-calculate-portfolio/plan.md`
> Research: `context/changes/verify-xtb-report-contract/research.md`

## What & Why

Właściciel zaimportuje ZIP lub XLSX z XTB i otrzyma łączną wartość portfela oraz annualizowany MWR/XIRR w wybranej walucie. Obliczenie musi prawidłowo obsługiwać PLN, EUR, USD, IKE i transfery między własnymi rachunkami.

## Starting Point

Aplikacja ma gotowy prywatny dostęp właściciela, ale nie ma tabel portfela, parsera XLSX ani testów. Rzeczywisty eksport XTB potwierdził trzy arkusze, hierarchiczne pozycje, przepływy oraz możliwość odtworzenia wolnej gotówki z pełnej historii operacji.

## Desired End State

Import jest bezpieczny, atomowy i idempotentny. Surowy plik nie jest przechowywany; aplikacja zapisuje dane znormalizowane, snapshot wyceny, audytowalne kursy NBP i wynik XIRR albo jednoznaczny powód jego zablokowania.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Wejście | ZIP wielu rachunków lub pojedynczy XLSX | Odpowiada rzeczywistemu eksportowi XTB | Research |
| Waluta bazowa | PLN domyślnie, wybór PLN/EUR/USD | Łączy rachunki bez mieszania nominałów | PRD / Plan |
| FX | Średni kurs NBP A; ostatni wcześniejszy dzień | Bezpłatne, oficjalne i deterministyczne źródło | Plan |
| Transfery | Parowanie; niejednoznaczność blokuje wynik | Chroni przed fałszywym XIRR | Plan |
| Gotówka | Suma pełnej historii Cash Operations | Open Positions.Value obejmuje tylko papiery | Research |
| XIRR | Lokalny deterministyczny solver | Jawne błędy i kontrola dokładności | Plan |
| Prywatność | Bez zapisu surowego ZIP-a | Minimalizuje ryzyko danych finansowych | Plan |
| Idempotencja | SHA-256 pliku i stabilne klucze rekordów | Powtórny import nie duplikuje danych | Plan |
| Historia | Snapshot każdego importu | Raport nie ma dziennych cen historycznych | Research |

## Scope

**In scope:** parser ZIP/XLSX, walidacja pełnego zakresu, PLN/EUR/USD/IKE, transfery, NBP FX, XIRR, Supabase/RLS, upload i widok wyniku.

**Out of scope:** dzienne historyczne ceny instrumentów, wykres historii, ręczne saldo początkowe, edycja operacji, wielu użytkowników i przechowywanie surowych raportów.

## Architecture / Approach

Endpoint właściciela przyjmuje plik do pamięci, sprawdza limity i przekazuje go do czystego parsera. Warstwa domenowa klasyfikuje operacje, rekonstruuje gotówkę, paruje transfery, pobiera/cache’uje kursy NBP i liczy XIRR. Jedna funkcja SQL zapisuje atomowo import, rachunki, operacje, snapshoty, kursy i wynik. Dashboard korzysta z tego endpointu jako mała wyspa React.

## Phases at a Glance

| Faza | Rezultat | Główne ryzyko |
| --- | --- | --- |
| 1. Parser i testy | Bezpieczne, zweryfikowane dane XTB | Zmienna struktura XLSX i podwójne wiersze pozycji |
| 2. Silnik wyniku | Transfery, FX i XIRR | Pozornie poprawny wynik przy błędnej klasyfikacji |
| 3. Zapis i API | Atomowy, prywatny, idempotentny import | Częściowy zapis lub obejście RLS |
| 4. Dashboard | Upload i audytowalny wynik do 5 s | Nieczytelny stan błędu lub obietnica fałszywej dokładności |

**Prerequisites:** działający lokalny Supabase, pełny raport XTB oraz dostęp do publicznego API NBP.

**Estimated effort:** około 6–10 sesji po godzinach w czterech fazach.

## Open Risks & Assumptions

- Eksport musi obejmować pełną historię rachunku; MVP nie przyjmuje salda początkowego.
- NBP może być chwilowo niedostępny, dlatego użyte kursy są zapisywane i ponownie wykorzystywane.
- Transfery walutowe XTB mogą mieć spread i różne godziny; niejednoznaczna para blokuje wynik.
- Pełny raport użytkownika pozostaje lokalnym materiałem kontrolnym i nie trafia do Git.

## Success Criteria (Summary)

- Próbny ZIP rozpoznaje wszystkie cztery rachunki, produkty, kontrolną pozycję IKE i salda gotówkowe.
- Transfery wewnętrzne nie wpływają na XIRR, a nierozwiązane przypadki blokują publikację wyniku.
- Wartość i XIRR mają audyt kursów NBP, zgodność do 0,01 p.p. i nie duplikują się po reimporcie.
