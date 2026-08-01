# Kontrakt raportu XTB — research

## Źródło

Przeanalizowano eksport ZIP wygenerowany 2026-08-01 dla pełnego zakresu dat. Archiwum zawiera cztery skoroszyty XLSX: PLN, EUR, USD oraz IKE. Analiza była tylko do odczytu; pliki nie zostały skopiowane do artefaktów projektu.

## Struktura archiwum

Każdy skoroszyt ma trzy arkusze:

1. `Closed Positions`
2. `Cash Operations`
3. `Open Positions`

Pierwsze wiersze każdego arkusza są metadanymi raportu. Właściwy nagłówek tabeli znajduje się dalej, dlatego parser nie może zakładać nagłówka w pierwszym wierszu.

## Closed Positions

Nagłówek zawiera między innymi:

- `Instrument`, `Ticker`, `Category`, `Type`, `Volume`
- `Open Price`, `Open Time (UTC)`, `Close Price`, `Close Time (UTC)`
- `Product`, `Profit/Loss`, `Gross Profit`, `Purchase Value`, `Sale Value`
- `Commission`, `Open Conversion Rate`, `Close Conversion Rate`
- `Position ID`, `Comment`

Arkusz pozwala sprawdzić zrealizowany wynik i szczegóły zamkniętych pozycji. Nie jest samodzielnym źródłem zewnętrznych przepływów XIRR, ponieważ zakup i sprzedaż instrumentu odbywają się wewnątrz portfela.

## Cash Operations

Nagłówek:

`Type`, `Instrument`, `Ticker`, `Category`, `Time`, `Amount`, `ID`, `Comment`, `Product`, `Position ID`

Zaobserwowane typy operacji:

- `Deposit`, `Withdrawal`
- `Transfer`, `Subaccount transfer`
- `IKE deposit`, `IKE return partial`, `IKE tax`
- `Stock purchase`, `Stock sell`
- `Dividend`, `Withholding tax`
- `Free funds interest`, `Free funds interest tax`
- `SEC fee`

Pole `Product` rozróżnia co najmniej `My Trades`, `Investment Plans` oraz `IKE`.

### Klasyfikacja do obliczeń

- Zakupy, sprzedaże, dywidendy, podatki, odsetki i opłaty są zmianami wewnątrz portfela. Wpływają na wartość, ale nie są zewnętrznymi przepływami właściciela dla XIRR całego portfela.
- `Deposit` i `Withdrawal` są kandydatami na zewnętrzne przepływy.
- `Transfer`, `Subaccount transfer`, `IKE deposit` i `IKE return partial` wymagają parowania. Przesunięcie pomiędzy rachunkami należącymi do importowanego portfela nie może zmieniać wyniku całego portfela.
- `IKE tax` wymaga jawnej decyzji domenowej: dla wyniku rachunku może być kosztem, ale dla przepływu całego portfela nie powinien być automatycznie uznany za wpłatę lub wypłatę bez sprawdzenia semantyki operacji.

## Open Positions

Arkusz zawiera:

- datę wygenerowania raportu,
- podsumowania `Product`, `Metric`, `Amount`, `Currency`, w tym bieżące `Value` i `Profit`,
- tabelę pozycji z `Ticker`, `Volume`, `Value`, bieżącą ceną, ceną otwarcia i wynikiem.

Podsumowanie `Value` jest właściwym źródłem końcowej wyceny dla dnia raportu. Raport obsługuje podział na produkt/plan bez sumowania wartości poszczególnych instrumentów jako podstawowego mechanizmu.

Tabela szczegółowa ma strukturę hierarchiczną: wiersz instrumentu jest następnie rozbity na jedną lub więcej pozycji identyfikowanych numerem. Sumowanie obu poziomów podwaja wartość. Parser musi używać podsumowania `Product / Value` jako wartości papierów, a szczegóły pozycji zachować wyłącznie do prezentacji i audytu.

Podsumowanie `Value` nie obejmuje wolnej gotówki. Przy eksporcie pełnego zakresu od początku rachunku saldo gotówkowe można odtworzyć jako sumę `Amount` wszystkich `Cash Operations` danego produktu. Próba kontrolna dała nieujemne, wiarygodne salda dla PLN, EUR i IKE oraz zero dla pustego USD. Końcowa wartość produktu to zatem `Open Positions.Value + reconstructed cash balance`. Import z niepełnym zakresem nie może publikować pełnego wyniku bez jawnego salda początkowego.

## Zweryfikowany zakres danych

- PLN: aktywne `My Trades` i `Investment Plans`, operacje od 2025-01-11.
- EUR: aktywne `My Trades` i `Investment Plans`, operacje od 2026-02-25.
- USD: poprawny pusty rachunek o wartości zero.
- IKE: aktywny produkt `IKE`, operacje od 2025-08-18.

Pusty arkusz ma wiersze podsumowania takie jak `Total` lub `Profit/loss`; parser musi je ignorować zamiast uznawać za transakcje.

## Daty i liczby

- Daty są zapisane jako numery seryjne Excela, mimo że kolumny opisano jako UTC.
- Parser musi przeliczać je względem epoki Excela i zachować jednoznaczną datę przepływu.
- Liczby są komórkami numerycznymi; nie należy parsować ich według polskiego separatora tekstowego.
- Identyfikatory mogą być zapisane przez Excel w notacji naukowej. Nie wolno używać ich do obliczeń zmiennoprzecinkowych; po normalizacji muszą być traktowane jako identyfikatory tekstowe.

## Waluty

Każdy zwykły rachunek ma walutę wynikającą z raportu i nazwy pliku. IKE w badanej próbce nie podaje waluty w komórce podsumowania. Właściciel potwierdził na kontrolnej pozycji `mWIG40TR`, że wartości IKE są wyrażone w PLN, dlatego parser może stosować kontrolowane mapowanie produktu `IKE` na PLN dla tego formatu raportu.

Raport nie zawiera pełnej tabeli historycznych kursów walut dla wszystkich przepływów. Poprawny łączny XIRR w walucie bazowej będzie wymagał zewnętrznego, datowanego źródła FX i zdefiniowanej reguły dla dni bez notowania.

## Historia wartości

Eksport zawiera bieżącą wycenę na dzień wygenerowania oraz historię operacji, lecz nie zawiera dziennych historycznych cen wszystkich otwartych instrumentów. Z samego pojedynczego ZIP-a nie da się wiarygodnie odtworzyć dziennego wykresu wartości portfela.

Bezpieczne opcje dalsze:

1. MVP zapisuje snapshot wartości przy każdym imporcie i buduje historię od pierwszego importu.
2. Osobny etap integruje zewnętrzne historyczne ceny instrumentów i FX.
3. Wykres pokazuje jedynie punkty wyceny pochodzące z zaimportowanych raportów, bez sugerowania dziennej dokładności.

## Wnioski dla parsera MVP

- Wejściem jest ZIP zawierający jeden lub więcej XLSX; pojedynczy XLSX również może być obsłużony jako wygodny wariant.
- Rozpoznanie skoroszytu i rachunku powinno opierać się na zawartości, nie wyłącznie na nazwie pliku lub folderu.
- Import powinien być idempotentny poprzez identyfikatory operacji, pozycji oraz odcisk pliku.
- Walidacja musi odrzucać brak wymaganych arkuszy lub nagłówków i raportować, który rachunek jest nieobsługiwany.
- Cały portfel należy liczyć po wyeliminowaniu transferów wewnętrznych i przeliczeniu zewnętrznych przepływów oraz końcowej wyceny do wybranej waluty bazowej.
- Pełny wynik wymaga eksportu od początku rachunku; data `Date from` musi poprzedzać pierwszą operację lub użytkownik musi dostarczyć saldo początkowe (saldo początkowe pozostaje poza MVP).

## Pozostałe decyzje przed implementacją

1. Wybrać źródło historycznych kursów PLN/EUR/USD oraz regułę weekendów i świąt.
2. Ustalić regułę parowania transferów pomiędzy rachunkami i obsługę nieparującej operacji.
3. Wybrać historię MVP: snapshoty kolejnych importów zamiast dziennej rekonstrukcji z cen rynkowych.

## Werdykt

Format raportu jest wystarczający do importu bieżącej wartości, podziału na rachunki/produkty oraz wyznaczenia kandydatów na przepływy XIRR. Faza kontraktu danych nie jest już blokowana próbką, ale implementacja poprawnego wyniku wymaga zamknięcia decyzji FX i transferów. Dzienna historia wartości pozostaje niemożliwa na podstawie pojedynczego eksportu bez dodatkowego źródła danych.
