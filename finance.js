// finance.js — Reine Finanzmathematik für den Hausfinanzierungs-Rechner.
// Keine DOM-Zugriffe: als ES-Modul sowohl im Browser als auch in Node nutzbar.
//
// Konventionen:
//  - Zinssätze werden als Prozent p.a. übergeben (z.B. 3.5 für 3,5 %).
//  - Beträge in Euro. Monatliche Verzinsung = Jahreszins / 12 (nominal/linear),
//    wie bei deutschen Annuitätendarlehen üblich.
//  - Alle Funktionen sind seiteneffektfrei.

// ---------------------------------------------------------------------------
// Grundbausteine
// ---------------------------------------------------------------------------

/** Kaufnebenkosten aus Kaufpreis und (variablen) Prozentsätzen. */
export function kaufnebenkosten(kaufpreis, { grunderwerbPct, notarPct, grundbuchPct, maklerPct }) {
  const grunderwerb = kaufpreis * (grunderwerbPct / 100);
  const notar = kaufpreis * (notarPct / 100);
  const grundbuch = kaufpreis * (grundbuchPct / 100);
  const makler = kaufpreis * (maklerPct / 100);
  const summe = grunderwerb + notar + grundbuch + makler;
  return { grunderwerb, notar, grundbuch, makler, summe };
}

/** Monatliche Annuität eines Annuitätendarlehens: Darlehen * (Sollzins+Tilgung)/12. */
export function monatsAnnuitaet(darlehen, sollzinsPct, tilgungPct) {
  return (darlehen * ((sollzinsPct + tilgungPct) / 100)) / 12;
}

/**
 * Tilgungsplan eines Annuitätendarlehens mit konstanter Monatsrate.
 * Optionale jährliche Sondertilgung (am Ende jedes vollen Jahres).
 * Liefert Restschuld, gezahlte Zinsen/Tilgung und jährliche Stützstellen.
 */
export function tilgungsplan(darlehen, sollzinsPct, monatsrate, monate, sondertilgungJahr = 0) {
  const r = sollzinsPct / 100 / 12;
  let balance = darlehen;
  let gezahlteZinsen = 0;
  let gezahlteTilgung = 0;
  const verlauf = [{ jahr: 0, restschuld: balance, zins: 0, tilgung: 0, sondertilgung: 0, rate: 0 }];
  let jZins = 0, jTilgung = 0, jSonder = 0, jRate = 0; // Aggregate je Jahr

  for (let m = 1; m <= monate && balance > 1e-6; m++) {
    const zins = balance * r;
    let tilgung = monatsrate - zins;
    if (tilgung < 0) tilgung = 0; // Rate deckt nicht einmal die Zinsen → keine Tilgung
    if (tilgung > balance) tilgung = balance;
    balance -= tilgung;
    gezahlteZinsen += zins;
    gezahlteTilgung += tilgung;
    jZins += zins;
    jTilgung += tilgung;
    jRate += zins + tilgung; // tatsächlich gezahlte Monatsrate (letzte Rate ggf. kleiner)

    if (m % 12 === 0 && sondertilgungJahr > 0 && balance > 0) {
      const st = Math.min(sondertilgungJahr, balance);
      balance -= st;
      gezahlteTilgung += st;
      jSonder += st;
    }
    if (m % 12 === 0) {
      verlauf.push({ jahr: m / 12, restschuld: balance, zins: jZins, tilgung: jTilgung, sondertilgung: jSonder, rate: jRate });
      jZins = 0; jTilgung = 0; jSonder = 0; jRate = 0;
    }
  }
  if (monate % 12 !== 0) {
    verlauf.push({ jahr: monate / 12, restschuld: balance, zins: jZins, tilgung: jTilgung, sondertilgung: jSonder, rate: jRate });
  }

  return { restschuld: balance, gezahlteZinsen, gezahlteTilgung, verlauf };
}

/** Bequeme Restschuld nach n Jahren bei gegebenem Sollzins/Tilgung. */
export function restschuld(darlehen, sollzinsPct, tilgungPct, jahre, sondertilgungJahr = 0) {
  const rate = monatsAnnuitaet(darlehen, sollzinsPct, tilgungPct);
  return tilgungsplan(darlehen, sollzinsPct, rate, jahre * 12, sondertilgungJahr).restschuld;
}

// ---------------------------------------------------------------------------
// Bausparvertrag
// ---------------------------------------------------------------------------

/**
 * Sparphase eines Bausparvertrags bis zur Zuteilung.
 * - Abschlussgebühr (% der Bausparsumme) wird zu Beginn vom Guthaben abgezogen.
 * - Monatliche Sparrate + jährliche Förderung, verzinst mit Guthabenzins.
 * - Kontoführungsgebühr jährlich abgezogen.
 * Zuteilung, sobald Guthaben >= Mindestsparguthaben (% der Bausparsumme).
 */
export function bausparSparphase({
  bausparsumme, abschlussgebuehrPct, sparrate, guthabenzinsPct,
  mindestsparguthabenPct, kontofuehrungJahr = 0, foerderungJahr = 0, maxMonate = 1200,
}) {
  const r = guthabenzinsPct / 100 / 12;
  const ziel = bausparsumme * (mindestsparguthabenPct / 100);
  let guthaben = -bausparsumme * (abschlussgebuehrPct / 100); // Abschlussgebühr vorab
  let eingezahlt = 0;
  let zuteilungMonat = null;
  const verlauf = [{ jahr: 0, guthaben: Math.max(0, guthaben) }];

  for (let m = 1; m <= maxMonate; m++) {
    guthaben += guthaben > 0 ? guthaben * r : 0;
    guthaben += sparrate;
    eingezahlt += sparrate;
    if (m % 12 === 0) {
      guthaben += foerderungJahr - kontofuehrungJahr;
      verlauf.push({ jahr: m / 12, guthaben });
    }
    if (zuteilungMonat === null && guthaben >= ziel) zuteilungMonat = m;
    if (zuteilungMonat !== null && m % 12 === 0) break;
  }
  return { zuteilungMonat, guthaben, eingezahlt, ziel, verlauf };
}

/**
 * Bewertet den Bausparvertrag am Refinanzierungszeitpunkt (Ende Zinsbindung):
 * Guthaben bis dahin und verfügbares Bauspardarlehen (Bausparsumme - Guthaben)
 * zum heute festgeschriebenen Darlehenszins.
 */
export function bausparStatusBei(jahre, params) {
  const monate = jahre * 12;
  const sp = bausparSparphase({ ...params, maxMonate: monate });
  const guthaben = Math.max(0, sp.guthaben);
  const bauspardarlehen = Math.max(0, params.bausparsumme - guthaben);
  const zugeteilt = sp.zuteilungMonat !== null && sp.zuteilungMonat <= monate;
  return { guthaben, bauspardarlehen, zugeteilt, zuteilungMonat: sp.zuteilungMonat, verlauf: sp.verlauf };
}

// ---------------------------------------------------------------------------
// ETF
// ---------------------------------------------------------------------------

/** Endwert eines ETF-Sparplans (deterministisch) vor Steuer. */
export function etfEndwertBrutto(sparrate, renditePct, jahre) {
  const r = Math.pow(1 + renditePct / 100, 1 / 12) - 1; // geometrisch monatlich
  const monate = Math.round(jahre * 12);
  let wert = 0;
  for (let m = 0; m < monate; m++) wert = (wert + sparrate) * (1 + r);
  const eingezahlt = sparrate * monate;
  return { wert, eingezahlt, gewinn: Math.max(0, wert - eingezahlt) };
}

/** Abgeltungssteuer auf ETF-Gewinn unter Berücksichtigung der Teilfreistellung. */
export function etfSteuer(gewinn, abgeltungssteuerPct, teilfreistellungPct) {
  const steuerpflichtig = Math.max(0, gewinn) * (1 - teilfreistellungPct / 100);
  return steuerpflichtig * (abgeltungssteuerPct / 100);
}

/** Netto-Endwert eines ETF-Sparplans nach Steuer (deterministisch). */
export function etfEndwertNetto({ sparrate, renditePct, jahre, abgeltungssteuerPct, teilfreistellungPct }) {
  const { wert, eingezahlt, gewinn } = etfEndwertBrutto(sparrate, renditePct, jahre);
  const steuer = etfSteuer(gewinn, abgeltungssteuerPct, teilfreistellungPct);
  return { brutto: wert, netto: wert - steuer, eingezahlt, gewinn, steuer };
}

// ---------------------------------------------------------------------------
// Phase 2: Refinanzierung der Restschuld mit festem Monatsbudget
// ---------------------------------------------------------------------------

/**
 * Simuliert die zweite Phase (nach Zinsbindung) über `monate` mit konstantem
 * Monatsbudget. Mehrere Schulden werden parallel verzinst; die Rate tilgt
 * zuerst die teuerste Schuld. Wird das Budget frei (alle Schulden getilgt),
 * fließt der Rest als Anlage zum `anlageZinsPct`.
 * Schulden: [{ bal, ratePct }].
 */
export function phase2({ schulden, budget, monate, anlageStart = 0, anlageZinsPct = 0 }) {
  const debts = schulden.map((s) => ({ bal: s.bal, r: s.ratePct / 100 / 12 }))
    .filter((d) => d.bal > 1e-6)
    .sort((a, b) => b.r - a.r); // teuerste zuerst
  const ra = Math.pow(1 + anlageZinsPct / 100, 1 / 12) - 1;
  let anlage = anlageStart;
  const verlauf = [{ jahr: 0, schuld: debts.reduce((s, d) => s + d.bal, 0), anlage, zins: 0, tilgung: 0 }];
  let jZins = 0, jTilgung = 0; // Aggregate je Jahr

  for (let m = 1; m <= monate; m++) {
    anlage *= 1 + ra;
    // Zinsen auf alle Schulden
    for (const d of debts) {
      const z = d.bal * d.r;
      d.bal += z;
      jZins += z;
    }
    let rest = budget;
    // teuerste Schuld zuerst tilgen
    for (const d of debts) {
      if (rest <= 0) break;
      const zahlung = Math.min(rest, d.bal);
      d.bal -= zahlung;
      rest -= zahlung;
      jTilgung += zahlung;
    }
    if (rest > 0) anlage += rest; // Budgetüberschuss anlegen
    if (m % 12 === 0) {
      verlauf.push({ jahr: m / 12, schuld: debts.reduce((s, d) => s + d.bal, 0), anlage, zins: jZins, tilgung: jTilgung });
      jZins = 0; jTilgung = 0;
    }
  }
  const restschuldGes = debts.reduce((s, d) => s + d.bal, 0);
  return { restschuld: restschuldGes, anlage, verlauf };
}

// ---------------------------------------------------------------------------
// Gemeinsame Vorberechnung (Kauf, Darlehen, Phase 1)
// ---------------------------------------------------------------------------

export function basisRechnung(inp) {
  const nk = kaufnebenkosten(inp.kaufpreis, inp);
  const gesamtkosten = inp.kaufpreis + nk.summe;
  const darlehen = inp.darlehenOverride && inp.darlehenOverride > 0
    ? inp.darlehenOverride
    : Math.max(0, gesamtkosten - inp.eigenkapital);
  const annuitaet = monatsAnnuitaet(darlehen, inp.sollzins, inp.tilgung);
  const phase1Monate = Math.round(inp.zinsbindungJahre * 12);

  // Restschuld am Ende der Zinsbindung, OHNE Seitenrate (für Bauspar/ETF, die parallel sparen)
  const planBank = tilgungsplan(darlehen, inp.sollzins, annuitaet, phase1Monate);
  // Restschuld mit Seitenrate als Sondertilgung (Basis-Strategie: Schulden schneller tilgen)
  const planBankSonder = tilgungsplan(darlehen, inp.sollzins, annuitaet + inp.seitenrate, phase1Monate);

  return {
    nk, gesamtkosten, darlehen, annuitaet, phase1Monate,
    restschuldBank: planBank.restschuld,
    restschuldBankSonder: planBankSonder.restschuld,
    verlaufBank: planBank.verlauf,
    verlaufBankSonder: planBankSonder.verlauf,
    monatsbudget: annuitaet + inp.seitenrate,
  };
}

// ---------------------------------------------------------------------------
// Strategievergleich
// ---------------------------------------------------------------------------

/**
 * Vergleicht die drei Strategien für gegebene (ggf. szenarienabhängige)
 * Annahmen `anschlusszins` und `etfRendite`. Metrik: Finanz-Nettovermögen
 * am Horizont (Anlage - Restschuld), nominal und real.
 * `basis` stammt aus basisRechnung(inp).
 */
export function vergleicheStrategien(inp, basis, { anschlusszins, etfRendite }) {
  const phase2Monate = Math.round((inp.horizontJahre - inp.zinsbindungJahre) * 12);
  const budget = basis.monatsbudget;
  const realFaktor = Math.pow(1 + inp.inflation / 100, inp.horizontJahre);
  const out = {};

  // --- Basis: Anschlussdarlehen (Seitenrate floss als Sondertilgung) ---
  {
    const p2 = phase2({
      schulden: [{ bal: basis.restschuldBankSonder, ratePct: anschlusszins }],
      budget, monate: phase2Monate, anlageZinsPct: anschlusszins,
    });
    const netto = p2.anlage - p2.restschuld;
    out.basis = nettoErgebnis(netto, realFaktor, { restschuld: basis.restschuldBankSonder, verlauf: p2.verlauf });
  }

  // --- ETF ---
  {
    const etf = etfEndwertNetto({
      sparrate: inp.seitenrate, renditePct: etfRendite, jahre: inp.zinsbindungJahre,
      abgeltungssteuerPct: inp.abgeltungssteuer, teilfreistellungPct: inp.teilfreistellung,
    });
    const restNachETF = Math.max(0, basis.restschuldBank - etf.netto);
    const startAnlage = Math.max(0, etf.netto - basis.restschuldBank);
    const p2 = phase2({
      schulden: [{ bal: restNachETF, ratePct: anschlusszins }],
      budget, monate: phase2Monate, anlageStart: startAnlage, anlageZinsPct: etfRendite,
    });
    const netto = p2.anlage - p2.restschuld;
    out.etf = nettoErgebnis(netto, realFaktor, {
      restschuld: basis.restschuldBank, etfNetto: etf.netto, etfSteuer: etf.steuer, verlauf: p2.verlauf,
    });
  }

  // --- Bausparvertrag ---
  {
    const status = bausparStatusBei(inp.zinsbindungJahre, {
      bausparsumme: inp.bausparsumme, abschlussgebuehrPct: inp.bausparAbschlussgebuehr,
      sparrate: inp.seitenrate, guthabenzinsPct: inp.bausparGuthabenzins,
      mindestsparguthabenPct: inp.bausparMindestsparguthaben,
      kontofuehrungJahr: inp.bausparKontofuehrung, foerderungJahr: inp.bausparFoerderung,
    });
    const restNachGuthaben = Math.max(0, basis.restschuldBank - status.guthaben);
    const startAnlage = Math.max(0, status.guthaben - basis.restschuldBank);
    const ausBauspar = Math.min(restNachGuthaben, status.bauspardarlehen); // zum festen Zins
    const luecke = Math.max(0, restNachGuthaben - status.bauspardarlehen);   // zum Marktzins
    const p2 = phase2({
      schulden: [
        { bal: ausBauspar, ratePct: inp.bausparDarlehenszins },
        { bal: luecke, ratePct: anschlusszins },
      ],
      budget, monate: phase2Monate, anlageStart: startAnlage, anlageZinsPct: inp.bausparGuthabenzins,
    });
    const netto = p2.anlage - p2.restschuld;
    out.bauspar = nettoErgebnis(netto, realFaktor, {
      restschuld: basis.restschuldBank, guthaben: status.guthaben, bauspardarlehen: ausBauspar,
      luecke, zugeteilt: status.zugeteilt, zuteilungMonat: status.zuteilungMonat, verlauf: p2.verlauf,
    });
  }

  return out;
}

function nettoErgebnis(netto, realFaktor, extra) {
  return { nettovermoegen: netto, nettovermoegenReal: netto / realFaktor, ...extra };
}

// ---------------------------------------------------------------------------
// Szenarien (pessimistisch / erwartet / optimistisch)
// ---------------------------------------------------------------------------

export function szenarien(inp, basis = basisRechnung(inp)) {
  const sz = {
    pessimistisch: { anschlusszins: inp.anschlusszins + inp.anschlusszinsSpanne, etfRendite: inp.etfRendite - inp.etfRenditeSpanne },
    erwartet: { anschlusszins: inp.anschlusszins, etfRendite: inp.etfRendite },
    optimistisch: { anschlusszins: inp.anschlusszins - inp.anschlusszinsSpanne, etfRendite: inp.etfRendite + inp.etfRenditeSpanne },
  };
  const res = {};
  for (const [name, ann] of Object.entries(sz)) res[name] = vergleicheStrategien(inp, basis, ann);
  return res;
}

// ---------------------------------------------------------------------------
// Monte-Carlo-Simulation
// ---------------------------------------------------------------------------

// Box-Muller: Standardnormalverteilte Zufallszahl.
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Monte-Carlo über unsichere Zukunft: Anschlusszins ~ Normal(µ, σ),
 * ETF-Jahresrendite ~ Normal(µ, vol). Liefert Verteilungen je Strategie.
 */
export function monteCarlo(inp, n = 2000, basis = basisRechnung(inp)) {
  const ergebnisse = { basis: [], etf: [], bauspar: [] };
  let etfBesserAlsBauspar = 0;
  let etfBesserAlsBasis = 0;

  for (let i = 0; i < n; i++) {
    const anschlusszins = Math.max(0, inp.anschlusszins + randn() * inp.anschlusszinsSigma);
    const etfRendite = inp.etfRendite + randn() * inp.etfVolatilitaet;
    const v = vergleicheStrategien(inp, basis, { anschlusszins, etfRendite });
    ergebnisse.basis.push(v.basis.nettovermoegen);
    ergebnisse.etf.push(v.etf.nettovermoegen);
    ergebnisse.bauspar.push(v.bauspar.nettovermoegen);
    if (v.etf.nettovermoegen > v.bauspar.nettovermoegen) etfBesserAlsBauspar++;
    if (v.etf.nettovermoegen > v.basis.nettovermoegen) etfBesserAlsBasis++;
  }

  const stats = {};
  for (const k of Object.keys(ergebnisse)) stats[k] = verteilungsStatistik(ergebnisse[k]);
  return {
    n,
    roh: ergebnisse,
    stats,
    pEtfBesserBauspar: etfBesserAlsBauspar / n,
    pEtfBesserBasis: etfBesserAlsBasis / n,
  };
}

export function perzentil(sortiert, p) {
  if (sortiert.length === 0) return NaN;
  const idx = (sortiert.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortiert[lo];
  return sortiert[lo] + (sortiert[hi] - sortiert[lo]) * (idx - lo);
}

function verteilungsStatistik(werte) {
  const s = [...werte].sort((a, b) => a - b);
  const mean = werte.reduce((a, b) => a + b, 0) / werte.length;
  return {
    mean,
    median: perzentil(s, 0.5),
    p05: perzentil(s, 0.05),
    p25: perzentil(s, 0.25),
    p75: perzentil(s, 0.75),
    p95: perzentil(s, 0.95),
    min: s[0],
    max: s[s.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Sinnvolle Standardwerte (Deutschland, 2026)
// ---------------------------------------------------------------------------

export const STANDARDWERTE = {
  // Kauf & Nebenkosten
  kaufpreis: 500000,
  eigenkapital: 120000,
  grunderwerbPct: 6.5,
  notarPct: 1.5,
  grundbuchPct: 0.5,
  maklerPct: 3.57,
  // Bankdarlehen (Phase 1)
  darlehenOverride: 0, // 0 = automatisch aus Kaufpreis+Nebenkosten-Eigenkapital
  sollzins: 3.6,
  tilgung: 2.0,
  zinsbindungJahre: 10,
  // Betrachtung & Seitenrate
  horizontJahre: 25,
  seitenrate: 300, // monatlich, zusätzlich zum Bankdarlehen
  // Anschlussfinanzierung
  anschlusszins: 4.0,
  anschlusszinsSpanne: 1.5,  // ± für Szenarien
  anschlusszinsSigma: 1.2,   // Streuung für Monte-Carlo
  // Bausparvertrag
  bausparsumme: 100000,
  bausparAbschlussgebuehr: 1.6,
  bausparGuthabenzins: 0.5,
  bausparDarlehenszins: 2.5,
  bausparMindestsparguthaben: 40,
  bausparKontofuehrung: 24,
  bausparFoerderung: 0,
  // ETF
  etfRendite: 6.0,
  etfRenditeSpanne: 3.0,   // ± für Szenarien
  etfVolatilitaet: 15.0,   // Standardabweichung der Jahresrendite (Monte-Carlo)
  abgeltungssteuer: 26.375,
  teilfreistellung: 30,
  // Markt
  inflation: 2.0,
  hausWertsteigerung: 2.0,
};
