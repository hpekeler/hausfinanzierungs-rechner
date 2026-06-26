// app.js — verbindet Eingabeformular, Finanzmathematik und Darstellung.
import {
  STANDARDWERTE, kaufnebenkosten, basisRechnung, szenarien,
} from './finance.js';
import { restschuldChart, vergleichChart, phase2Chart } from './charts.js';

const SPEICHER = 'hausrechner.eingaben.v1';
const KEYS = Object.keys(STANDARDWERTE);
const LABELS = { basis: 'Anschlussdarlehen', bauspar: 'Bausparvertrag', etf: 'ETF-Sparplan' };
const REIHEN = ['basis', 'bauspar', 'etf'];

const eur = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Eingaben lesen / schreiben
// ---------------------------------------------------------------------------
function eingabenLesen() {
  const inp = {};
  for (const k of KEYS) {
    const el = $(k);
    inp[k] = el ? parseFloat(el.value) || 0 : STANDARDWERTE[k];
  }
  return inp;
}

function eingabenSchreiben(werte) {
  for (const k of KEYS) {
    const el = $(k);
    if (el) el.value = werte[k];
  }
}

function speichern(inp) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(inp)); } catch {}
}

function laden() {
  try {
    const roh = localStorage.getItem(SPEICHER);
    if (roh) return { ...STANDARDWERTE, ...JSON.parse(roh) };
  } catch {}
  return { ...STANDARDWERTE };
}

// ---------------------------------------------------------------------------
// Render: Nebenkostenhinweis
// ---------------------------------------------------------------------------
function nebenkostenHinweis(inp) {
  const nk = kaufnebenkosten(inp.kaufpreis, inp);
  const gesamt = inp.kaufpreis + nk.summe;
  const darlehen = inp.darlehenOverride > 0 ? inp.darlehenOverride : Math.max(0, gesamt - inp.eigenkapital);
  $('nebenkostenHinweis').innerHTML =
    `Nebenkosten gesamt: <strong>${eur(nk.summe)}</strong> · Gesamtkosten (Kaufpreis + Nebenkosten): ` +
    `<strong>${eur(gesamt)}</strong> · benötigtes Darlehen: <strong>${eur(darlehen)}</strong>` +
    (inp.eigenkapital < nk.summe ? ` · ⚠️ Eigenkapital deckt nicht einmal die Nebenkosten!` : '');
}

// ---------------------------------------------------------------------------
// Render: Ergebniskarten
// ---------------------------------------------------------------------------
function rendereKarten(sz) {
  const e = sz.erwartet, p = sz.pessimistisch, o = sz.optimistisch;
  const sieger = REIHEN.reduce((a, b) => (e[a].nettovermoegen >= e[b].nettovermoegen ? a : b));
  $('karten').innerHTML = REIHEN.map((k) => {
    const r = e[k];
    const zusatz = k === 'bauspar'
      ? `<div class="zeile"><span>Guthaben bei Zuteilung</span><span>${eur(r.guthaben)}</span></div>` +
        `<div class="zeile"><span>Bauspardarlehen genutzt</span><span>${eur(r.bauspardarlehen)}</span></div>` +
        (r.luecke > 1 ? `<div class="zeile"><span>Lücke zum Marktzins</span><span>${eur(r.luecke)}</span></div>` : '') +
        (!r.zugeteilt ? `<div class="zeile"><span>⚠️ Zuteilung</span><span>nicht rechtzeitig</span></div>` : '')
      : k === 'etf'
      ? `<div class="zeile"><span>ETF-Wert (netto) bei Refi</span><span>${eur(r.etfNetto)}</span></div>` +
        `<div class="zeile"><span>davon Abgeltungssteuer</span><span>${eur(r.etfSteuer)}</span></div>`
      : `<div class="zeile"><span>Restschuld nach Zinsbindung</span><span>${eur(r.restschuld)}</span></div>`;
    return `
      <div class="karte ${k} ${k === sieger ? 'sieger' : ''}">
        <h3>${LABELS[k]} ${k === sieger ? '<span class="badge">erwartet bester</span>' : ''}</h3>
        <div class="gross">${eur(r.nettovermoegen)}</div>
        <div class="real">real (heutige Kaufkraft): ${eur(r.nettovermoegenReal)}</div>
        <div class="zeile"><span>Spanne pessimistisch–optimistisch</span><span>${eur(p[k].nettovermoegen)} … ${eur(o[k].nettovermoegen)}</span></div>
        ${zusatz}
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Render: Empfehlung
// ---------------------------------------------------------------------------
function rendereEmpfehlung(sz, inp) {
  const e = sz.erwartet, p = sz.pessimistisch;
  const sieger = REIHEN.reduce((a, b) => (e[a].nettovermoegen >= e[b].nettovermoegen ? a : b));
  const siegerPess = REIHEN.reduce((a, b) => (p[a].nettovermoegen >= p[b].nettovermoegen ? a : b));
  const vsBasis = (k) => e[k].nettovermoegen - e.basis.nettovermoegen;

  let txt = `Im <strong>erwarteten Szenario</strong> liefert der <strong>${LABELS[sieger]}</strong> das höchste Nettovermögen (${eur(e[sieger].nettovermoegen)}). `;
  if (sieger !== 'basis') txt += `Das sind ${eur(Math.abs(vsBasis(sieger)))} ${vsBasis(sieger) >= 0 ? 'mehr' : 'weniger'} als ein reines Anschlussdarlehen. `;

  txt += `<br><br>Im <strong>pessimistischen Szenario</strong> (Anschlusszins +${inp.anschlusszinsSpanne} %, ETF-Rendite −${inp.etfRenditeSpanne} %) ` +
    `liegt der <strong>${LABELS[siegerPess]}</strong> vorn (${eur(p[siegerPess].nettovermoegen)}). `;
  txt += siegerPess === 'bauspar'
    ? `Der Bausparvertrag ist im schlechten Fall am <strong>robustesten</strong> — sinnvoll bei geringer Risikotoleranz oder wenn du auf den Termin angewiesen bist.`
    : siegerPess === 'etf'
    ? `Der ETF hält sich selbst im schlechten Fall gut — die Zinsabsicherung des Bausparvertrags lohnt bei diesen Annahmen wenig.`
    : `Wenn es schlecht läuft, zahlt sich die schnelle Tilgung über das einfache Anschlussdarlehen aus.`;
  $('empfehlung').innerHTML = txt;
}

// ---------------------------------------------------------------------------
// Render: Pro & Contra (statisch + dynamisch)
// ---------------------------------------------------------------------------
function rendereProContra(sz) {
  const e = sz.erwartet, p = sz.pessimistisch;
  const fmtVorteil = (k) => {
    const d = e[k].nettovermoegen - e.basis.nettovermoegen;
    return `${d >= 0 ? '+' : ''}${eur(d)} ggü. reinem Anschlussdarlehen (erwartet)`;
  };
  const boxen = {
    bauspar: {
      titel: 'Bausparvertrag',
      pro: [
        'Zins für das Anschlussdarlehen wird HEUTE festgeschrieben → Schutz vor steigenden Zinsen.',
        'Planungssicherheit: feste Raten, kein Marktrisiko.',
        'Staatliche Förderung möglich (Wohnungsbauprämie, Wohn-Riester, Arbeitnehmersparzulage).',
        `Pessimistisches Szenario: ${eur(p.bauspar.nettovermoegen)} — meist die robusteste Strategie.`,
      ],
      contra: [
        'Niedriger Guthabenzins + Abschlussgebühr (1–1,6 %) → Renditeschwäche in der Sparphase.',
        'Zuteilungszeitpunkt ist nicht exakt garantiert (Bewertungszahl).',
        'Verschenkter Vorteil, falls die Zinsen fallen statt steigen.',
        fmtVorteil('bauspar'),
      ],
    },
    etf: {
      titel: 'ETF-Sparplan',
      pro: [
        'Höhere erwartete Rendite (~6–8 %) → im Mittel das größte Vermögen.',
        'Flexibel und jederzeit verfügbar (nicht zweckgebunden).',
        '30 % Teilfreistellung senkt die Steuer auf Aktien-ETF-Gewinne.',
        `Erwartetes Szenario: ${eur(e.etf.nettovermoegen)} — im Mittel meist vorn.`,
      ].filter(Boolean),
      contra: [
        'Kursrisiko: ausgerechnet zum Refinanzierungstermin kann der Markt unten stehen.',
        'Keine Zinsabsicherung — trifft zusätzlich ein hoher Anschlusszins, wirken zwei Risiken zusammen.',
        'Abgeltungssteuer auf Gewinne; Vorabpauschale in der Ansparzeit (hier vereinfacht).',
        `Pessimistisches Szenario: ${eur(p.etf.nettovermoegen)} — oft tiefer als beim Bausparvertrag.`,
      ].filter(Boolean),
    },
    basis: {
      titel: 'Anschlussdarlehen (Basis)',
      pro: [
        'Einfach, keine Zusatzprodukte oder Gebühren.',
        'Seitenrate tilgt das Darlehen direkt → garantierte „Rendite" in Höhe des Sollzinses.',
        'Volle Flexibilität bei der Anschlussfinanzierung.',
      ],
      contra: [
        'Volles Zinsänderungsrisiko: der künftige Marktzins ist heute unbekannt.',
        'Kein Vermögensaufbau neben der Tilgung.',
        'Tipp: Ein Forward-Darlehen kann den Anschlusszins bis zu ~5 Jahre vorab sichern (Alternative zum Bauspar).',
      ],
    },
  };

  $('procontra').innerHTML = REIHEN.map((k) => {
    const b = boxen[k];
    return `<div class="pcbox">
      <h3>${b.titel}</h3>
      <div class="label">✓ Pro</div><ul class="pro">${b.pro.map((x) => `<li>${x}</li>`).join('')}</ul>
      <div class="label">✗ Contra</div><ul class="contra">${b.contra.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Render: Monatliche Belastung & Tilgungsplan (Phase 1, Bankdarlehen)
// ---------------------------------------------------------------------------
function rendereTilgungsplan(inp, basis) {
  // Monatliche Belastung auf einen Blick
  $('belastung').innerHTML =
    `<div class="zeile"><span>Bankrate (Annuität, Phase 1)</span><span>${eur(basis.annuitaet)} / Monat</span></div>` +
    `<div class="zeile"><span>Seitenrate (fließt in Bauspar / ETF / Sondertilgung)</span><span>${eur(inp.seitenrate)} / Monat</span></div>` +
    `<div class="zeile gesamt"><span>Gesamtbudget (gleich für alle Strategien)</span><span>${eur(basis.monatsbudget)} / Monat</span></div>` +
    `<div class="zeile"><span>Darlehenssumme</span><span>${eur(basis.darlehen)}</span></div>` +
    `<div class="zeile"><span>Restschuld am Ende der Zinsbindung (${inp.zinsbindungJahre} J.)</span><span>${eur(basis.restschuldBank)}</span></div>`;

  // Jahr-für-Jahr-Tilgungsplan des Bankdarlehens (nur Annuität, ohne Seitenrate)
  const v = basis.verlaufBank;
  const kopf = `<thead><tr><th>Jahr</th><th>Rate / Monat</th><th>Zinsen (Jahr)</th><th>Tilgung (Jahr)</th><th>Restschuld (Jahresende)</th></tr></thead>`;
  const zeilen = v.slice(1).map((p) => {
    const breakpoint = Math.abs(p.jahr - inp.zinsbindungJahre) < 1e-9;
    const rateMonat = p.rate > 0.5 ? eur(p.rate / 12) : '—';
    return `<tr class="${breakpoint ? 'breakpoint' : ''}">
      <td>${p.jahr}${breakpoint ? ' 🔻' : ''}</td>
      <td>${rateMonat}</td>
      <td>${eur(p.zins)}</td>
      <td>${eur(p.tilgung)}</td>
      <td>${eur(p.restschuld)}</td>
    </tr>`;
  }).join('');
  $('tilgungsplanTabelle').innerHTML = kopf + `<tbody>${zeilen}</tbody>`;
  $('tilgungsplanHinweis').innerHTML =
    `🔻 <strong>Break-Point: Ende der Zinsbindung nach ${inp.zinsbindungJahre} Jahren.</strong> ` +
    `Nur durch die <strong>Annuität</strong> der Bank bleibt eine Restschuld von <strong>${eur(basis.restschuldBank)}</strong>. ` +
    `Wie viel davon je Strategie tatsächlich noch übrig ist — je nachdem, was du nebenher mit der Seitenrate gemacht hast — ` +
    `zeigt der Abschnitt „Übergang Phase 1 → Phase 2".`;
}

// ---------------------------------------------------------------------------
// Render: Übergang Phase 1 → Phase 2 — wie aus dem Vertrag die zu
// refinanzierende Restschuld je Strategie entsteht (erwartetes Szenario).
// ---------------------------------------------------------------------------
function rendereUebergang(inp, basis, sz) {
  const e = sz.erwartet;
  const starts = REIHEN.map((k) => e[k].start);

  // Hilfszeile: pro Strategie eine Zelle
  const zeile = (label, werte, opts = {}) => {
    const cls = opts.stark ? ' class="ueb-stark"' : '';
    const tds = werte.map((w) => `<td>${w}</td>`).join('');
    return `<tr${cls}><td>${label}</td>${tds}</tr>`;
  };

  const kopf = `<thead><tr><th>Schritt</th>${REIHEN.map((k) => `<th>${LABELS[k]}</th>`).join('')}</tr></thead>`;

  const monate = basis.phase1Monate;
  const rows = [
    zeile(`Seitenrate (${eur(inp.seitenrate)}/Monat × ${monate} Monate) floss in`,
      starts.map((s) => s.seitenrateZiel)),
    zeile('Seitenrate eingezahlt gesamt',
      starts.map((s) => eur(s.eingezahltSeite))),
    zeile(`Bank-Restschuld nach ${inp.zinsbindungJahre} J. (nur Annuität)`,
      starts.map((s) => eur(s.bankRestschuld))),
    zeile('−  ' + 'angerechnet aus der Seitenrate',
      starts.map((s) => `−${eur(s.anrechnung)}<br><span class="ueb-klein">${s.anrechnungLabel}</span>`)),
    zeile('=  Zu refinanzierende Restschuld',
      starts.map((s) => eur(s.zuRefinanzieren)), { stark: true }),
    zeile('davon zum festen Bauspar-Darlehenszins',
      starts.map((s) => s.festZins > 1 ? `${eur(s.festZins)} <span class="ueb-klein">(${s.bausparDarlehenszins} %)</span>` : '—')),
    zeile('davon zum Markt-Anschlusszins',
      starts.map((s) => s.marktZins > 1 ? `${eur(s.marktZins)} <span class="ueb-klein">(${inp.anschlusszins} %)</span>` : '—')),
    zeile('zusätzliches Startguthaben angelegt',
      starts.map((s) => s.anlageStart > 1 ? eur(s.anlageStart) : '—')),
  ];

  $('uebergangTabelle').innerHTML = kopf + `<tbody>${rows.join('')}</tbody>`;
  $('uebergangHinweis').innerHTML =
    `Alle drei Strategien zahlen während der Zinsbindung dieselbe Bankrate — die senkt das Darlehen auf ${eur(basis.restschuldBank)}. ` +
    `Unterschiede entstehen nur dadurch, <strong>wohin die Seitenrate fließt</strong>: ` +
    `Beim <strong>Anschlussdarlehen</strong> tilgt sie direkt mit (niedrigere Restschuld). ` +
    `Beim <strong>Bausparvertrag</strong> wächst ein Guthaben an, das die Restschuld mindert; der Rest wird zum heute festen Bauspar-Zins finanziert. ` +
    `Beim <strong>ETF</strong> wird das (versteuerte) Depot gegen die Restschuld gerechnet. ` +
    `Übrig bleibt die <strong>zu refinanzierende Restschuld</strong> — der Startpunkt für Phase 2 (erwartetes Szenario).`;
}

// ---------------------------------------------------------------------------
// Render: Phase 2 — je Strategie eine eigene Tabelle (erwartetes Szenario).
// Jahr für Jahr: konstante Monatsrate, wohin sie fließt (Zinsen / Schuldenabbau
// / Anlage), und die resultierenden Bestände (Restschuld, Anlage, Netto).
// ---------------------------------------------------------------------------
function renderePhase2Tabellen(inp, basis, sz) {
  const e = sz.erwartet;
  const budgetJahr = basis.monatsbudget * 12;

  const bloecke = REIHEN.map((k) => {
    const v = e[k].verlauf;
    const start = e[k].start;
    const kopf =
      `<thead><tr>` +
      `<th>Jahr</th><th>Monatsrate</th><th>→ Zinsen</th><th>→ Schuldenabbau</th><th>→ in Anlage</th>` +
      `<th>Restschuld</th><th>Anlagewert</th><th>Netto</th>` +
      `</tr></thead>`;

    const zeilen = v.map((p, i) => {
      if (i === 0) {
        const netto0 = p.anlage - p.schuld;
        return `<tr class="breakpoint"><td>${inp.zinsbindungJahre} 🔻</td><td>Start</td><td>—</td><td>—</td><td>—</td>` +
          `<td>${eur(p.schuld)}</td><td>${eur(p.anlage)}</td><td class="${netto0 >= 0 ? 'pos' : 'neg'}">${eur(netto0)}</td></tr>`;
      }
      const vor = v[i - 1];
      const schuldAbbau = vor.schuld - p.schuld;     // tatsächlicher Schuldenrückgang
      const inAnlage = Math.max(0, budgetJahr - p.tilgung); // Budgetüberschuss → Anlage
      const netto = p.anlage - p.schuld;
      return `<tr>
        <td>${inp.zinsbindungJahre + p.jahr}</td>
        <td>${eur(basis.monatsbudget)}</td>
        <td>${eur(p.zins)}</td>
        <td>${eur(schuldAbbau)}</td>
        <td>${eur(inAnlage)}</td>
        <td>${eur(p.schuld)}</td>
        <td>${eur(p.anlage)}</td>
        <td class="${netto >= 0 ? 'pos' : 'neg'}">${eur(netto)}</td>
      </tr>`;
    }).join('');

    const offen = k === REIHEN.reduce((a, b) => (e[a].nettovermoegen >= e[b].nettovermoegen ? a : b));
    return `<details class="phase2-block" ${offen ? 'open' : ''}>
      <summary><span class="dot ${k}"></span>${LABELS[k]} — Start ${eur(start.zuRefinanzieren)} Restschuld → Netto ${eur(e[k].nettovermoegen)} nach ${inp.horizontJahre} J.</summary>
      <p class="erklaerung">
        Monatsrate bleibt konstant bei <strong>${eur(basis.monatsbudget)}</strong> (gleiches Budget wie in Phase 1).
        Jeder Jahresbetrag von ${eur(budgetJahr)} teilt sich auf in <em>Zinsen</em>, <em>Schuldenabbau</em> und — sobald
        Budget frei wird — <em>Anlage</em>. ${k === 'etf'
          ? 'In Phase 2 wird <strong>nicht weiter aktiv in den ETF eingezahlt</strong>; das Depot vom Break-Point wächst weiter und überschüssiges Budget wird angelegt.'
          : k === 'bauspar'
          ? 'Zuerst wird die teuerste Schuld getilgt; das günstige Bauspardarlehen bleibt länger stehen.'
          : 'Die gesamte Rate tilgt die Restschuld, danach fließt das Budget in die Anlage.'}
      </p>
      <div class="tabelle-wrap"><table class="tilgungsplan">${kopf}<tbody>${zeilen}</tbody></table></div>
    </details>`;
  }).join('');

  $('phase2Tabellen').innerHTML = bloecke;
}

// ---------------------------------------------------------------------------
// Hauptberechnung
// ---------------------------------------------------------------------------
function berechnen() {
  const inp = eingabenLesen();
  speichern(inp);
  nebenkostenHinweis(inp);

  if (inp.horizontJahre <= inp.zinsbindungJahre) {
    inp.horizontJahre = inp.zinsbindungJahre + 1; // Phase 2 braucht Laufzeit
  }

  const basis = basisRechnung(inp);
  const sz = szenarien(inp, basis);

  $('horizontLabel').textContent = inp.horizontJahre;
  rendereKarten(sz);
  rendereTilgungsplan(inp, basis);
  rendereUebergang(inp, basis, sz);
  renderePhase2Tabellen(inp, basis, sz);
  rendereEmpfehlung(sz, inp);
  rendereProContra(sz);
  restschuldChart(basis.verlaufBank);
  vergleichChart(sz.erwartet);
  phase2Chart('chartP2Pessimistisch', sz.pessimistisch, inp.zinsbindungJahre);
  phase2Chart('chartP2Erwartet', sz.erwartet, inp.zinsbindungJahre);
  phase2Chart('chartP2Optimistisch', sz.optimistisch, inp.zinsbindungJahre);

  $('ergebnisse').hidden = false;
  $('ergebnisse').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function init() {
  eingabenSchreiben(laden());

  $('berechnen').addEventListener('click', berechnen);
  $('reset').addEventListener('click', () => { eingabenSchreiben({ ...STANDARDWERTE }); speichern(STANDARDWERTE); berechnen(); });

  // Nebenkostenhinweis live aktualisieren
  for (const k of ['kaufpreis', 'eigenkapital', 'grunderwerbPct', 'notarPct', 'grundbuchPct', 'maklerPct', 'darlehenOverride']) {
    $(k)?.addEventListener('input', () => nebenkostenHinweis(eingabenLesen()));
  }

  nebenkostenHinweis(eingabenLesen());
  berechnen(); // direkt ein Ergebnis zeigen
}

if (typeof Chart === 'undefined') {
  document.body.insertAdjacentHTML('afterbegin',
    '<p style="background:#7f1d1d;color:#fff;padding:1rem;margin:0">Chart.js konnte nicht geladen werden (vendor/chart.umd.min.js fehlt). Diagramme bleiben leer.</p>');
}
init();
