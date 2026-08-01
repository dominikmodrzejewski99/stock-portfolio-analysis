# Import i obliczenie portfela — plan implementacji

## Overview

Zaimplementować bezpieczny import raportu XTB oraz obliczenie łącznej wartości i annualizowanego MWR/XIRR całego portfela w PLN, EUR lub USD. Wynik ma uwzględniać wyłącznie przepływy zewnętrzne, eliminować transfery między własnymi rachunkami i używać audytowalnych kursów NBP.

## Current State Analysis

Prywatny dostęp właściciela działa, ale dashboard jest szkieletem, Supabase nie ma tabel domenowych, a projekt nie ma runnera testów ani bibliotek do ZIP/XLSX i arytmetyki dziesiętnej. Zweryfikowany eksport zawiera trzy arkusze na rachunek, produkty `My Trades`, `Investment Plans` i `IKE`, hierarchiczne wiersze pozycji oraz operacje wystarczające do odtworzenia wolnej gotówki przy pełnym zakresie raportu.

## Desired End State

Właściciel przesyła jeden ZIP lub XLSX, wybiera walutę bazową i w ciągu 5 sekund otrzymuje wartość papierów, gotówkę, łączną wartość oraz XIRR albo dokładny, bezpieczny powód braku wyniku. Identyczny import zwraca istniejący rezultat. Dane zapisują się atomowo i są dostępne wyłącznie właścicielowi.

### Key Discoveries

- Dashboard jest serwerową stroną Astro bez funkcji portfelowych (`src/pages/dashboard.astro:7`).
- Middleware chroni `/dashboard`, ale nowe endpointy wymagają rozszerzenia ochrony (`src/middleware.ts:5`).
- Projekt używa serwerowego klienta Supabase (`src/lib/supabase.ts:5`), lecz nie ma migracji ani tabel.
- `Open Positions` zawiera podsumowania oraz hierarchiczne wiersze instrument/pozycja; sumowanie szczegółów podwaja wartość (`context/changes/verify-xtb-report-contract/research.md`).
- Wolna gotówka jest odtwarzalna z sumy pełnej historii `Cash Operations`; raport częściowy nie wystarcza do pełnej wyceny.
- NBP udostępnia bezpłatne historyczne kursy średnie od 2002 r.; pojedynczy zakres API jest ograniczony do 93 dni.

## What We're NOT Doing

- Nie rekonstruujemy dziennej historii cen ani wykresu wartości.
- Nie przyjmujemy ręcznego salda początkowego ani częściowego eksportu jako pełnego portfela.
- Nie zapisujemy oryginalnego ZIP/XLSX w bazie lub Storage.
- Nie pozwalamy edytować klasyfikacji operacji w MVP.
- Nie obsługujemy walut innych niż PLN, EUR i USD.
- Nie dodajemy wielu użytkowników ani porównywania portfeli.

## Implementation Approach

Logika jest podzielona na czyste, testowalne warstwy: parser XTB, domenę portfela, klienta NBP i repozytorium Supabase. Pieniądze są liczone dziesiętnie; `number` służy tylko solverowi XIRR z kontrolowanymi granicami i weryfikacją reszty równania. Endpoint wykonuje cały pipeline, a wynik zapisuje przez jedną transakcyjną funkcję SQL.

## Critical Implementation Details

`Open Positions.Value` jest wartością papierów, nie pełnym equity. Końcowa wartość produktu to podsumowanie papierów plus suma wszystkich operacji gotówkowych od początku rachunku. Parser musi rozpoznać pełny zakres raportu; w przeciwnym razie nie publikuje wartości ani XIRR.

## Phase 1: Bezpieczny parser XTB i fundament testów

### Overview

Dodać testy oraz czysty parser ZIP/XLSX odporny na błędne i złośliwe wejścia.

### Changes Required

#### 1. Zależności i runner testów

**Files**: `package.json`, `package-lock.json`, `vitest.config.ts` (new)

**Intent**: Dodać lekkie biblioteki działające na `ArrayBuffer` w Cloudflare oraz pierwszą projektową komendę testową.

**Contract**: `npm test` uruchamia Vitest; zależności obejmują rozpakowanie ZIP, odczyt XML/XLSX i arytmetykę dziesiętną. XIRR pozostaje kodem domenowym, nie biblioteką black-box.

#### 2. Kontrakty i błędy XTB

**Files**: `src/lib/xtb/types.ts`, `src/lib/xtb/errors.ts`, `src/lib/xtb/constants.ts` (new)

**Intent**: Zdefiniować znormalizowany raport, rachunki, produkty, operacje, pozycje, snapshoty i diagnostykę bez zależności od UI/bazy.

**Contract**: Identyfikatory są tekstem, kwoty mają oryginalną walutę, daty są UTC/ISO, IKE mapuje się na PLN, a błędy wskazują plik/arkusz/wiersz bez logowania wartości finansowych.

#### 3. Rozpakowanie i parser skoroszytów

**Files**: `src/lib/xtb/archive.ts`, `src/lib/xtb/workbook.ts`, `src/lib/xtb/parser.ts` (new)

**Intent**: Przyjmować ZIP wielu rachunków lub pojedynczy XLSX i rozpoznawać strukturę po arkuszach/nagłówkach.

**Contract**: Maksymalnie 10 MB wejścia, 10 skoroszytów i 50 MB po dekompresji; odrzucane są path traversal, szyfrowanie, nieznane formaty, duplikaty ścieżek i brak wymaganych arkuszy. Wiersze nagłówków są wyszukiwane po kontrakcie, nie stałym indeksie.

#### 4. Normalizacja i fixture’y

**Files**: `src/lib/xtb/normalize.ts`, `src/lib/xtb/__tests__/*`, `test/fixtures/xtb/*` (new)

**Intent**: Pokryć rzeczywisty format zanonimizowanymi, syntetycznymi fixture’ami bez prywatnego raportu.

**Contract**: Testy obejmują daty Excela, ID naukowe, pusty USD, IKE→PLN, wszystkie typy operacji, przesunięte nagłówki, hierarchiczne pozycje, gotówkę z pełnej historii oraz kontrolną pozycję 132,7967 jednostki / 22 211,58 PLN.

### Success Criteria

#### Automated Verification

- `npm test` przechodzi dla parsera i fixture’ów.
- Parser rozpoznaje ZIP/XLSX, PLN/EUR/USD/IKE oraz puste rachunki.
- Testy bezpieczeństwa odrzucają uszkodzony lub nadmierny input.
- Astro check i lint przechodzą.

#### Manual Verification

- Prywatny raport użytkownika przechodzi lokalnie bez zapisywania go w repozytorium lub logach.
- Diagnostyka błędnego pliku jest zrozumiała i nie ujawnia wartości portfela.

---

## Phase 2: Transfery, kursy NBP i XIRR

### Overview

Zbudować deterministyczny silnik wyniku całego portfela.

### Changes Required

#### 1. Klasyfikacja i gotówka

**Files**: `src/lib/portfolio/classify.ts`, `src/lib/portfolio/cash-balance.ts` (new)

**Intent**: Oddzielić zewnętrzne przepływy właściciela od operacji wewnętrznych i odtworzyć gotówkę.

**Contract**: Deposit jest ujemnym CF, Withdrawal dodatnim; transakcje, dywidendy, podatki i opłaty nie są osobnymi CF. Nieznany typ blokuje wynik. Gotówka jest sumą pełnej historii Amount per rachunek/produkt.

#### 2. Parowanie transferów

**File**: `src/lib/portfolio/transfers.ts` (new)

**Intent**: Usunąć z XIRR relokacje pomiędzy importowanymi rachunkami bez zgadywania.

**Contract**: Parowanie używa identyfikatora/referencji, przeciwnych znaków, okna do 24 h i tolerancji `max(0,01 waluty docelowej, 0,1%)`; dopasowanie jest jednoznaczne i 1:1. Brak lub wieloznaczność blokuje wynik i generuje audytowalną diagnostykę.

#### 3. Klient i cache NBP

**Files**: `src/lib/portfolio/nbp-client.ts`, `src/lib/portfolio/fx.ts` (new)

**Intent**: Przeliczać każdy przepływ i wycenę po historycznym średnim kursie NBP A.

**Contract**: PLN=1; EUR/USD są notowane do PLN, crossy idą przez PLN. Dla dnia bez tabeli używany jest ostatni wcześniejszy kurs. Zwracane są rate, effectiveDate, tableNo i source; brak kursu blokuje wynik.

#### 4. Solver i agregacja

**Files**: `src/lib/portfolio/xirr.ts`, `src/lib/portfolio/calculate.ts` (new)

**Intent**: Obliczyć wartość i annualizowany MWR/XIRR w sposób powtarzalny.

**Contract**: Przepływy dnia są agregowane, ending value jest dodatnim CF, `r > -1`, wymagany jest znak ujemny i dodatni. Solver wykrywa brak lub wielość rozwiązań i nie publikuje arbitralnej wartości; dokładność wynosi 0,01 p.p.

#### 5. Testy domenowe

**Files**: `src/lib/portfolio/__tests__/*` (new)

**Intent**: Zablokować regresje w klasyfikacji, FX, transferach i matematyce.

**Contract**: Testy obejmują weekend/święto, kurs krzyżowy, transfer same/foreign currency, brak pary, konflikt par, XIRR referencyjny, brak/multiple roots oraz niepełny raport.

### Success Criteria

#### Automated Verification

- Wszystkie testy domenowe przechodzą.
- XIRR zgadza się z niezależnym przypadkiem do 0,01 p.p.
- Sparowane transfery nie zmieniają XIRR, a niejednoznaczne blokują wynik.
- Kursy weekendowe i krzyżowe mają właściwą datę oraz audyt.
- Astro check, lint i build przechodzą.

#### Manual Verification

- Wynik próbnego raportu ma sensowne składowe wartości dla PLN, EUR, USD i IKE.
- Użytkownik może prześledzić, które operacje uznano za przepływy zewnętrzne.

---

## Phase 3: Prywatny, atomowy zapis i API importu

### Overview

Zapisać znormalizowany wynik w Supabase i wystawić endpoint właściciela.

### Changes Required

#### 1. Schemat i RLS

**File**: `supabase/migrations/20260801_import_portfolio.sql` (new)

**Intent**: Przechowywać importy, rachunki, operacje, snapshoty, wyniki i użyte kursy z izolacją właściciela.

**Contract**: Tabele mają `owner_id`, RLS `auth.uid() = owner_id`, unikalne fingerprinty i klucze domenowe. Kwoty są `numeric`, identyfikatory XTB tekstem, surowy plik nie jest przechowywany.

#### 2. Atomowy RPC

**File**: `supabase/migrations/20260801_import_portfolio.sql`

**Intent**: Zapisać cały import w jednej transakcji lub wycofać wszystko.

**Contract**: Funkcja SECURITY INVOKER przyjmuje znormalizowany payload właściciela; identyczny fingerprint zwraca istniejący import, a ten sam klucz z inną treścią zgłasza konflikt.

#### 3. Repozytorium i endpoint

**Files**: `src/lib/portfolio/repository.ts`, `src/pages/api/portfolio/import.ts`, `src/middleware.ts` (new/update)

**Intent**: Połączyć parser, kalkulator i zapis za chronioną trasą.

**Contract**: POST multipart wymaga właściciela, pliku i baseCurrency PLN/EUR/USD; zwraca wynik lub typowaną diagnostykę. `/api/portfolio` jest owner-only, nie loguje nazw/kwot i nie zachowuje bufora po żądaniu.

#### 4. Testy integracyjne

**Files**: `src/pages/api/portfolio/__tests__/import.test.ts`, `supabase/tests/*` (new)

**Intent**: Zweryfikować RLS, rollback, reimport i kontrakt HTTP.

**Contract**: Testy obejmują brak sesji, obce konto, idempotencję, konflikt, błąd NBP, rollback oraz brak surowego pliku w bazie.

### Success Criteria

#### Automated Verification

- Migracja stosuje się na czystej lokalnej bazie.
- Testy RLS, atomowości i idempotencji przechodzą.
- Nieautoryzowany endpoint zwraca odmowę bez przetwarzania pliku.
- Astro check, testy, lint i build przechodzą.

#### Manual Verification

- Powtórny import tego samego ZIP-a pokazuje ten sam wynik bez duplikatów.
- Błąd w jednym rachunku nie pozostawia częściowego importu.

---

## Phase 4: Dashboard importu i wyniku

### Overview

Udostępnić właścicielowi kompletny przepływ od pliku do audytowalnego wyniku.

### Changes Required

#### 1. Formularz importu

**Files**: `src/components/portfolio/ImportPortfolioForm.tsx`, `src/components/portfolio/types.ts` (new)

**Intent**: Pozwolić wybrać ZIP/XLSX i walutę bazową z jasnym stanem przetwarzania.

**Contract**: Akceptowane `.zip`/`.xlsx`, limit 10 MB, domyślne PLN, waluty PLN/EUR/USD, blokada podwójnego wysłania, dostępne etykiety i komunikaty po polsku.

#### 2. Widok wyniku

**Files**: `src/components/portfolio/PortfolioResult.tsx`, `src/components/portfolio/ImportDiagnostics.tsx` (new)

**Intent**: Pokazać łączną wartość, gotówkę, papiery i XIRR bez ukrywania założeń.

**Contract**: Wynik pokazuje walutę bazową, datę wyceny, annualizowany XIRR, rachunki/produkty i źródła FX. Stan zablokowany nie pokazuje liczby XIRR, tylko przyczynę i operacje do wyjaśnienia.

#### 3. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Zastąpić starterowy ekran właściwym prywatnym obszarem MyPortfelik.

**Contract**: Dashboard renderuje formularz i ostatni wynik, zachowuje wylogowanie oraz działa na telefonie, laptopie i komputerze.

#### 4. Test przepływu i budżet czasu

**Files**: `src/components/portfolio/__tests__/*`, `test/e2e/import-flow.*` (new)

**Intent**: Zweryfikować pełny UX oraz wymóg 5 sekund na reprezentatywnym, zanonimizowanym fixture.

**Contract**: Test obejmuje sukces, reimport, błąd pliku, nieznany typ, transfer do wyjaśnienia, niedostępny NBP i responsywne viewporty.

### Success Criteria

#### Automated Verification

- Test komponentów i pełnego przepływu przechodzi.
- Reprezentatywny import kończy się w mniej niż 5 sekund w środowisku testowym.
- Astro check, testy, lint i build przechodzą.

#### Manual Verification

- Właściciel wykonuje przepływ: logowanie → import → wynik bez instrukcji technicznej.
- Wynik jest czytelny na telefonie i desktopie, a stany błędów nie sugerują niepoprawnej liczby.

---

## Testing Strategy

### Unit Tests

- Parser i normalizacja każdej odmiany arkusza.
- Klasyfikacja wszystkich zaobserwowanych typów operacji.
- Transfery, FX, gotówka i solver XIRR z przypadkami granicznymi.

### Integration Tests

- RPC, RLS, rollback i idempotencja na lokalnym Supabase.
- Endpoint z prawdziwą sesją właściciela i syntetycznym ZIP-em.
- Stubowane odpowiedzi NBP, aby testy były deterministyczne.

### Manual Testing Steps

1. Zaimportować prywatny ZIP lokalnie i porównać pozycję kontrolną IKE.
2. Sprawdzić wartości papierów, gotówki i sumy per rachunek.
3. Przejrzeć listę zewnętrznych przepływów i sparowanych transferów.
4. Powtórzyć import i potwierdzić brak duplikatów.
5. Sprawdzić błąd częściowego raportu i nieznanej operacji.
6. Powtórzyć przepływ na telefonie i desktopie.

## Performance Considerations

Cały plik jest przetwarzany w pamięci, ale twarde limity chronią Workera. Kursy NBP są pobierane zakresami do 93 dni, deduplikowane po walucie/dacie i cache’owane w bazie. Parser nie wykonuje zapytań per wiersz, a zapis odbywa się jednym RPC.

## Migration Notes

To pierwszy schemat domenowy; migracja nie przenosi istniejących danych. Przed zastosowaniem należy dodać brakujący `supabase/seed.sql` albo wyłączyć seed w konfiguracji. Rollback usuwa wyłącznie nowe obiekty w odwrotnej kolejności zależności.

## References

- `context/foundation/prd.md:58`
- `context/foundation/roadmap.md:86`
- `context/changes/verify-xtb-report-contract/research.md`
- `src/middleware.ts:5`
- `src/lib/supabase.ts:5`
- `src/pages/dashboard.astro:7`
- NBP Web API: `https://api.nbp.pl/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bezpieczny parser XTB i fundament testów

#### Automated

- [x] 1.1 Testy parsera i fixture’ów przechodzą — 45e1772
- [x] 1.2 Parser rozpoznaje wspierane raporty i puste rachunki — 45e1772
- [x] 1.3 Niebezpieczny input jest odrzucany — 45e1772
- [x] 1.4 Astro check i lint przechodzą — 45e1772

#### Manual

- [x] 1.5 Prywatny raport przechodzi bez zapisu lub logowania danych — 45e1772
- [x] 1.6 Diagnostyka błędnego pliku jest bezpieczna i zrozumiała — 45e1772

### Phase 2: Transfery, kursy NBP i XIRR

#### Automated

- [x] 2.1 Testy domenowe przechodzą
- [x] 2.2 XIRR spełnia dokładność 0,01 p.p.
- [x] 2.3 Transfery są eliminowane lub blokują wynik
- [x] 2.4 Kursy weekendowe i krzyżowe mają audyt
- [x] 2.5 Końcowe kontrole jakości przechodzą

#### Manual

- [x] 2.6 Składowe próbnego portfela są wiarygodne
- [x] 2.7 Przepływy zewnętrzne są audytowalne

### Phase 3: Prywatny, atomowy zapis i API importu

#### Automated

- [ ] 3.1 Migracja stosuje się na czystej bazie
- [ ] 3.2 Testy RLS, atomowości i idempotencji przechodzą
- [ ] 3.3 Nieautoryzowany import jest odrzucany
- [ ] 3.4 Końcowe kontrole jakości przechodzą

#### Manual

- [ ] 3.5 Reimport nie tworzy duplikatów
- [ ] 3.6 Błąd rachunku nie pozostawia częściowego importu

### Phase 4: Dashboard importu i wyniku

#### Automated

- [ ] 4.1 Testy komponentów i pełnego przepływu przechodzą
- [ ] 4.2 Import reprezentatywny trwa krócej niż 5 sekund
- [ ] 4.3 Końcowe kontrole jakości przechodzą

#### Manual

- [ ] 4.4 Właściciel przechodzi od logowania do wyniku
- [ ] 4.5 Wynik i błędy są czytelne na telefonie i desktopie
