# CLAUDE.md — Hausfinanzierungs-Rechner

> **Pflege-Regel:** Diese Datei ist die Referenz, damit nicht jedes Mal die ganze
> Codebasis gescannt werden muss. **Bei jedem neuen/geänderten Feature wird CLAUDE.md
> mitgepflegt** (Abschnitte „Dateien", „Wichtige Exports", „Feature-Stand").

## Überblick

Reiner Browser-Rechner (Vanilla JS, ES-Module, **keine Build-Tools, kein Server zur Laufzeit**).
Vergleicht drei Strategien zur Finanzierung der **Restschuld nach Ablauf der Zinsbindung**:
Anschlussdarlehen (`basis`), Bausparvertrag (`bauspar`), ETF-Sparplan (`etf`).
Alles läuft lokal im Browser — keine Datenübertragung, keine Anmeldung.

## Auslieferung & Ausführen

- **Auslieferung: ausschließlich GitHub Pages** (statisches Hosting). Kein Python-/Node-Server
  im Betrieb, keine Server-Komponente. Die Datei `.nojekyll` verhindert Jekyll-Verarbeitung;
  `vendor/chart.umd.min.js` liegt lokal bei (kein CDN), damit die Seite offline/standalone läuft.
- **Lokal testen** (nur Entwicklung): `python3 -m http.server` im Projektordner, dann `index.html`
  öffnen. Das ist *nur* ein lokaler Dev-Helfer, **nicht** die Auslieferung.
- **Tests:** `node --test test/finance.test.mjs` (importiert `finance.js` als ES-Modul).
  ⚠️ Nicht `node --test test/` benutzen — der Verzeichnis-Aufruf schlägt fehl.

## Dateien

- **finance.js** — Reine Finanzmathematik, KEINE DOM-Zugriffe, seiteneffektfrei.
  Nutzbar in Browser UND Node. Zinssätze als Prozent p.a., Beträge in Euro,
  Monatszins = Jahreszins/12 (nominal/linear, wie dt. Annuitätendarlehen).
- **app.js** — Verbindet Formular ↔ Finanzmathematik ↔ Darstellung.
  Liest Eingaben über IDs = Keys aus `STANDARDWERTE`, speichert in localStorage
  (`hausrechner.eingaben.v1`). `berechnen()` ist die Hauptfunktion. Render-Funktionen
  schreiben in feste Element-IDs.
- **charts.js** — Chart.js-Wrapper (`Chart` global via UMD-Script). Jede Funktion zerstört
  und erstellt den Chart auf dem Canvas neu. Exports: `restschuldChart`, `vergleichChart`,
  `monteCarloChart`, `perzentilBandChart`.
- **index.html** — Formular + Ergebnis-Section (`#ergebnisse`, anfangs `hidden`).
  Input-IDs müssen exakt den Keys in `STANDARDWERTE` entsprechen.
- **style.css** — Styling (Dark Theme, CSS-Variablen in `:root`).
- **vendor/chart.umd.min.js** — Chart.js (lokal, kein CDN).
- **test/finance.test.mjs** — Unit-Tests der Finanzmathematik (Node `node:test`).
- **README.md** — Ausführliche fachliche Dokumentation/Annahmen.

## Wichtige Exports (finance.js)

- `kaufnebenkosten`, `monatsAnnuitaet`, `tilgungsplan`, `restschuld`
- `bausparSparphase`, `bausparStatusBei`
- `etfEndwertBrutto`, `etfSteuer`, `etfEndwertNetto`
- `phase2` (Refinanzierung nach Zinsbindung mit festem Monatsbudget)
- `basisRechnung` (Kauf + Darlehen + Phase 1), `vergleicheStrategien`, `szenarien`, `monteCarlo`
- `perzentil`
- `STANDARDWERTE` (Default-Eingaben, DE 2026)

### Datenstrukturen der Verläufe (für die Tabellen)

- **`tilgungsplan(...).verlauf`** — Array mit Eintrag 0 als Startpunkt; je Jahr:
  `{ jahr, restschuld, zins, tilgung, sondertilgung, rate }`.
  `rate` = Summe der tatsächlich gezahlten Monatsraten im Jahr (→ Monatsrate = `rate/12`).
- **`phase2(...).verlauf`** — Array mit Eintrag 0 (Startpunkt = Break-Point); je Jahr:
  `{ jahr, schuld, anlage, zins, tilgung }`. `jahr` ist **relativ zum Phase-2-Start**
  (absolutes Jahr = `zinsbindungJahre + jahr`).
- **`basisRechnung(...)`** liefert u.a. `darlehen`, `annuitaet`, `monatsbudget`,
  `restschuldBank`, `restschuldBankSonder`, `verlaufBank`, `verlaufBankSonder`.
- **`vergleicheStrategien(...)`** → `{ basis, bauspar, etf }`, jede mit `nettovermoegen`,
  `nettovermoegenReal`, strategiespezifischen Feldern und `verlauf` (aus `phase2`).

## Render-Funktionen (app.js) → Ziel-Element-IDs

- `nebenkostenHinweis` → `#nebenkostenHinweis`
- `rendereKarten` → `#karten`
- `rendereTilgungsplan` → `#belastung`, `#tilgungsplanTabelle`, `#tilgungsplanHinweis`
- `renderePhase2Tabelle` → `#phase2Tabelle`
- `rendereSzenarioTabelle` → `#szenarioTabelle`
- `rendereEmpfehlung` → `#empfehlung`
- `rendereProContra` → `#procontra`
- `rendereMonteCarlo` → `#mcHeadline`, `#mcTabelle` (+ Charts `chartMC`, `chartMCBand`)
- Charts: `restschuldChart` → `chartRestschuld`, `vergleichChart` → `chartVergleich`

## Modell-Konventionen / Begriffe

- **Phase 1** = Zinsbindung des Bankdarlehens (Annuität konstant).
- **Phase 2** = Anschlussfinanzierung der Restschuld, Zins unsicher.
- **Seitenrate** = Betrag zusätzlich zur Bankrate; hält das Monatsbudget aller drei
  Strategien gleich (fließt in Bauspar/ETF bzw. als schnellere Tilgung).
- **Break-Point** = Ende der Zinsbindung (Übergang Phase 1 → Phase 2); in der UI mit 🔻 markiert.

## Feature-Stand

- Kauf-/Nebenkosten, Bankdarlehen Phase 1, Seitenrate, Anschlussfinanzierung Phase 2.
- Strategievergleich (Karten), Szenarien (pessimistisch/erwartet/optimistisch).
- Monte-Carlo-Risikoanalyse mit Verteilungs- und Perzentil-Charts.
- **Monatliche Belastung & Tilgungsplan**: Übersichtsbox (Bankrate, Seitenrate, Gesamtbudget,
  Darlehen, Restschuld bei Zinsbindungsende); Phase-1-Tilgungsplan Jahr-für-Jahr
  (Rate/Monat, Zinsen, Tilgung, Restschuld) mit hervorgehobenem Break-Point; Phase-2-Tabelle
  je Strategie (Restschuld, Anlage, Netto pro Jahr, erwartetes Szenario).
