# Hausfinanzierungs-Rechner

Eine eigenständige Web-Seite, die für einen Hauskauf in Deutschland vergleicht,
wie man die **Restschuld nach Ablauf der Zinsbindung** am besten finanziert:

1. **Anschlussdarlehen** (Basis) – einfach neu finanzieren zum dann gültigen Marktzins,
2. **Bausparvertrag** – heute einen Darlehenszins festschreiben (Zinsabsicherung),
3. **ETF-Sparplan** – parallel investieren und später die Restschuld (teilweise) ablösen.

Alle Parameter sind Eingabefelder. Ergebnis: Nettovermögen nach *N* Jahren je
Strategie, Szenarien (pessimistisch/erwartet/optimistisch), eine
Monte-Carlo-Risikoanalyse, Pro/Contra-Listen und eine Empfehlung.

## Starten

Kein Build nötig. Wegen ES-Modulen muss die Seite über einen Webserver laufen
(nicht per `file://` öffnen):

```bash
cd /home/pekeler/Desktop/Private/Geldanlage
python3 -m http.server 8000
# Browser: http://localhost:8000
```

Chart.js liegt lokal unter `vendor/` – die Seite funktioniert **vollständig
offline**.

## Tests

Die Finanzmathematik (`finance.js`) ist reine, DOM-freie Logik und getestet:

```bash
node --test        # 13 Tests, u.a. Annuität, Restschuld, Bauspar, ETF-Steuer, Szenarien, Monte-Carlo
```

## Dateien

| Datei | Inhalt |
|-------|--------|
| `index.html` | Eingabeformular + Ergebnisbereich |
| `style.css` | Gestaltung |
| `finance.js` | **Reine Finanzmathematik** (ES-Modul, im Browser und in Node nutzbar) |
| `charts.js` | Chart.js-Diagramme |
| `app.js` | Verbindet Formular, Berechnung und Darstellung; speichert Eingaben in `localStorage` |
| `vendor/chart.umd.min.js` | Chart.js 4.4 (lokal, offline) |
| `test/finance.test.mjs` | Unit-Tests |

## Rechenmodell (Kurzfassung)

**Phase 1 – Bankdarlehen (Annuitätendarlehen).** Eigenkapital deckt zuerst die
Kaufnebenkosten, der Rest mindert das Darlehen. Konstante Monatsrate
= `Darlehen · (Sollzins + Tilgung) / 12`. Monatszins = `Restschuld · Sollzins/12`,
der Rest tilgt. Optionale jährliche Sondertilgung. Am Ende der Zinsbindung bleibt
die **Restschuld**.

**Gleiches Monatsbudget für faire Vergleichbarkeit.** Alle Strategien geben
monatlich denselben Betrag aus: Bankrate + *Seitenrate*. Sie unterscheiden sich
nur darin, **wohin die Seitenrate fließt** und **wie die Restschuld refinanziert
wird**:

- **Basis:** Seitenrate = zusätzliche Sondertilgung; Restschuld wird zum
  unsicheren Anschlusszins neu finanziert.
- **Bausparvertrag:** Seitenrate spart den Bausparvertrag an; bei Zuteilung wird
  das Guthaben gegen die Restschuld verrechnet, der Rest über das
  Bauspardarlehen zum **heute festgeschriebenen** Zins finanziert (Lücke
  darüber zum Marktzins).
- **ETF:** Seitenrate wird investiert; bei Refinanzierung wird der Netto-Wert
  (nach Abgeltungssteuer/Teilfreistellung) gegen die Restschuld verrechnet, der
  Rest zum Marktzins finanziert.

**Metrik:** *Nettovermögen* am Horizont = Anlagevermögen − Restschuld, nominal
und real (inflationsbereinigt).

**Szenarien** variieren Anschlusszins und ETF-Rendite um die eingestellte Spanne.
**Monte-Carlo** würfelt beide normalverteilt (σ-Eingaben) über tausende Läufe und
liefert Median, Perzentile (5/25/75/95) und die Wahrscheinlichkeit, dass der ETF
den Bausparvertrag schlägt.

## Vereinfachende Annahmen (bewusst)

- Nominale, lineare Monatsverzinsung (wie marktüblich), keine unterjährige Zinseszins-Feinheit.
- ETF-Steuer fällt nur beim Verkauf an; die **Vorabpauschale** während der
  Ansparzeit ist vernachlässigt (in Niedrigzinsphasen klein).
- Die **Zuteilung** des Bausparvertrags wird zum Ende der Zinsbindung angenommen;
  erreicht das Guthaben das Mindestsparguthaben nicht rechtzeitig, weist die Karte
  darauf hin.
- Der Hauswert selbst ist in allen Strategien gleich und kürzt sich im Vergleich
  heraus; verglichen wird das **finanzielle** Nettovermögen.

Es ist ein Orientierungswerkzeug – **keine Finanz- oder Steuerberatung.**

## Glossar

| Begriff | Bedeutung |
|---------|-----------|
| **Eigenkapital** | Eigenes Startkapital; deckt zuerst die Nebenkosten. |
| **Kaufnebenkosten** | Grunderwerbsteuer (je Bundesland 3,5–6,5 %), Notar (~1,5 %), Grundbuch (~0,5 %), Makler (oft 3,57 %). Banken finanzieren sie meist **nicht** mit. |
| **Annuitätendarlehen** | Darlehen mit konstanter Rate aus Zins + Tilgung; Tilgungsanteil steigt über die Zeit. |
| **Sollzins** | Gebundener Nominalzins während der Zinsbindung. |
| **(Anfangs-)Tilgung** | Anfänglicher jährlicher Tilgungssatz; bestimmt mit dem Sollzins die Rate. |
| **Zinsbindung** | Zeitraum der Zinsfestschreibung (oft 5/10/15/20 Jahre). |
| **Restschuld** | Verbleibende Schuld am Ende der Zinsbindung. |
| **Sondertilgung** | Außerplanmäßige Extra-Tilgung (viele Verträge erlauben ~5 %/Jahr gebührenfrei). |
| **Anschlussfinanzierung** | Neue Finanzierung der Restschuld nach der Zinsbindung. |
| **Bausparsumme** | Zielsumme des Bausparvertrags = Guthaben + Bauspardarlehen. |
| **Zuteilung** | Zeitpunkt, ab dem das Bauspardarlehen abrufbar ist (Mindestsparguthaben + Mindestlaufzeit erreicht). |
| **Abgeltungssteuer** | 25 % + Soli = 26,375 % auf Kapitalerträge (ggf. + Kirchensteuer). |
| **Teilfreistellung** | Bei Aktien-ETFs sind 30 % der Gewinne steuerfrei. |

## Was du dir zusätzlich anschauen solltest (im Tool nicht modelliert)

- **Forward-Darlehen:** sichert den Anschlusszins schon bis zu ~5 Jahre vor
  Ablauf der Zinsbindung – die direkte Alternative zur Zinsabsicherung per
  Bausparvertrag, oft mit geringem Zinsaufschlag.
- **Volltilgerdarlehen:** Darlehen, das innerhalb der Zinsbindung vollständig
  getilgt wird – keine Restschuld, häufig besserer Zins, aber höhere Rate.
- **KfW-Förderung:** zinsverbilligte Darlehen/Zuschüsse für energieeffizientes
  Bauen/Kaufen (z. B. Wohneigentum für Familien).
- **Vorfälligkeitsentschädigung** bei vorzeitiger Ablösung außerhalb der
  Sonderkündigungsrechte (§ 489 BGB: nach 10 Jahren mit 6 Monaten Frist kündbar).
- **Disagio / Bereitstellungszinsen** und KdW-Spielräume je nach Bank.
