// app.js — verbindet Eingabeformular, Finanzmathematik und Darstellung.
import {
  STANDARDWERTE, kaufnebenkosten, basisRechnung, szenarien, monteCarlo,
} from './finance.js';
import { restschuldChart, vergleichChart, monteCarloChart, perzentilBandChart } from './charts.js';

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
// Render: Szenariotabelle
// ---------------------------------------------------------------------------
function rendereSzenarioTabelle(sz) {
  const namen = [['pessimistisch', 'Pessimistisch'], ['erwartet', 'Erwartet'], ['optimistisch', 'Optimistisch']];
  const kopf = `<thead><tr><th>Szenario</th>${REIHEN.map((k) => `<th>${LABELS[k]}</th>`).join('')}</tr></thead>`;
  const zeilen = namen.map(([key, label]) => {
    const tds = REIHEN.map((k) => {
      const v = sz[key][k].nettovermoegen;
      return `<td class="${v >= 0 ? 'pos' : 'neg'}">${eur(v)}</td>`;
    }).join('');
    return `<tr><td>${label}</td>${tds}</tr>`;
  }).join('');
  $('szenarioTabelle').innerHTML = kopf + `<tbody>${zeilen}</tbody>`;
}

// ---------------------------------------------------------------------------
// Render: Empfehlung
// ---------------------------------------------------------------------------
function rendereEmpfehlung(sz, mc, inp) {
  const e = sz.erwartet;
  const sieger = REIHEN.reduce((a, b) => (e[a].nettovermoegen >= e[b].nettovermoegen ? a : b));
  const vsBasis = (k) => e[k].nettovermoegen - e.basis.nettovermoegen;

  let txt = `Im <strong>erwarteten Szenario</strong> liefert der <strong>${LABELS[sieger]}</strong> das höchste Nettovermögen (${eur(e[sieger].nettovermoegen)}). `;
  if (sieger !== 'basis') txt += `Das sind ${eur(Math.abs(vsBasis(sieger)))} ${vsBasis(sieger) >= 0 ? 'mehr' : 'weniger'} als ein reines Anschlussdarlehen. `;

  if (mc) {
    txt += `<br><br>Im Risikoblick (Monte-Carlo): ETF schlägt den Bausparvertrag in <strong>${(mc.pEtfBesserBauspar * 100).toFixed(0)} %</strong> der Fälle. `;
    txt += `Im Worst-Case (5. Perzentil) steht der ETF bei ${eur(mc.stats.etf.p05)}, der Bausparvertrag bei ${eur(mc.stats.bauspar.p05)}. `;
    const sicher = mc.stats.bauspar.p05 > mc.stats.etf.p05;
    txt += sicher
      ? `Der Bausparvertrag ist im schlechten Fall <strong>robuster</strong> — sinnvoll bei geringer Risikotoleranz oder wenn du auf den Termin angewiesen bist.`
      : `Der ETF ist hier sogar im Worst-Case nicht schlechter — die Zinsabsicherung des Bausparvertrags lohnt bei diesen Annahmen wenig.`;
  }
  $('empfehlung').innerHTML = txt;
}

// ---------------------------------------------------------------------------
// Render: Pro & Contra (statisch + dynamisch)
// ---------------------------------------------------------------------------
function rendereProContra(sz, mc) {
  const e = sz.erwartet;
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
        `Worst-Case (5. Perz.): ${mc ? eur(mc.stats.bauspar.p05) : '—'} — meist die robusteste Strategie.`,
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
        mc ? `Gewinnt gegen Bauspar in ${(mc.pEtfBesserBauspar * 100).toFixed(0)} % der simulierten Zukünfte.` : '',
      ].filter(Boolean),
      contra: [
        'Kursrisiko: ausgerechnet zum Refinanzierungstermin kann der Markt unten stehen.',
        'Keine Zinsabsicherung — trifft zusätzlich ein hoher Anschlusszins, wirken zwei Risiken zusammen.',
        'Abgeltungssteuer auf Gewinne; Vorabpauschale in der Ansparzeit (hier vereinfacht).',
        mc ? `Worst-Case (5. Perz.): ${eur(mc.stats.etf.p05)} — tiefer als beim Bausparvertrag.` : '',
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
// Render: Monte-Carlo
// ---------------------------------------------------------------------------
function rendereMonteCarlo(mc) {
  $('mcHeadline').innerHTML =
    `Aus <strong>${mc.n.toLocaleString('de-DE')}</strong> simulierten Zukünften: ` +
    `<strong>ETF schlägt Bausparvertrag in ${(mc.pEtfBesserBauspar * 100).toFixed(1)} % der Fälle</strong>, ` +
    `das Anschlussdarlehen in ${(mc.pEtfBesserBasis * 100).toFixed(1)} %.`;

  const kopf = `<thead><tr><th>Strategie</th><th>5. Perz.</th><th>Median</th><th>Mittelwert</th><th>95. Perz.</th></tr></thead>`;
  const zeilen = REIHEN.map((k) => {
    const s = mc.stats[k];
    return `<tr><td>${LABELS[k]}</td><td>${eur(s.p05)}</td><td>${eur(s.median)}</td><td>${eur(s.mean)}</td><td>${eur(s.p95)}</td></tr>`;
  }).join('');
  $('mcTabelle').innerHTML = kopf + `<tbody>${zeilen}</tbody>`;

  monteCarloChart(mc.roh);
  perzentilBandChart(mc.stats);
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
    `Die verbleibende Restschuld von <strong>${eur(basis.restschuldBank)}</strong> muss jetzt anschlussfinanziert werden — ` +
    `wie das je nach Strategie weitergeht, zeigt die Tabelle unten.`;
}

// ---------------------------------------------------------------------------
// Render: Phase 2 (nach Zinsbindung) — Restschuld & Anlagevermögen je Jahr
// ---------------------------------------------------------------------------
function renderePhase2Tabelle(inp, sz) {
  const e = sz.erwartet;
  const basisVerlauf = e.basis.verlauf; // enthält jahr 0 als Startpunkt
  const kopf =
    `<thead>
      <tr><th rowspan="2">Jahr</th>` +
      REIHEN.map((k) => `<th colspan="3">${LABELS[k]}</th>`).join('') +
    `</tr>
      <tr>` +
      REIHEN.map(() => `<th>Restschuld</th><th>Anlage</th><th>Netto</th>`).join('') +
    `</tr></thead>`;

  const zeilen = basisVerlauf.map((_, i) => {
    if (i === 0) return ''; // Startpunkt (= Break-Point) überspringen, steht schon oben
    const absJahr = inp.zinsbindungJahre + basisVerlauf[i].jahr;
    const tds = REIHEN.map((k) => {
      const p = e[k].verlauf[i];
      const netto = p.anlage - p.schuld;
      return `<td>${eur(p.schuld)}</td><td>${eur(p.anlage)}</td><td class="${netto >= 0 ? 'pos' : 'neg'}">${eur(netto)}</td>`;
    }).join('');
    return `<tr><td>${absJahr}</td>${tds}</tr>`;
  }).join('');
  $('phase2Tabelle').innerHTML = kopf + `<tbody>${zeilen}</tbody>`;
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
  const mc = monteCarlo(inp, Math.max(200, Math.min(50000, parseInt($('mcLaeufe').value, 10) || 3000)), basis);

  $('horizontLabel').textContent = inp.horizontJahre;
  rendereKarten(sz);
  rendereTilgungsplan(inp, basis);
  renderePhase2Tabelle(inp, sz);
  rendereSzenarioTabelle(sz);
  rendereEmpfehlung(sz, mc, inp);
  rendereProContra(sz, mc);
  restschuldChart(basis.verlaufBank);
  vergleichChart(sz.erwartet);
  rendereMonteCarlo(mc);

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

  // Tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('aktiv'));
      btn.classList.add('aktiv');
      document.querySelectorAll('[data-tabinhalt]').forEach((el) => {
        el.hidden = el.dataset.tabinhalt !== btn.dataset.tab;
      });
    });
  });

  nebenkostenHinweis(eingabenLesen());
  berechnen(); // direkt ein Ergebnis zeigen
}

if (typeof Chart === 'undefined') {
  document.body.insertAdjacentHTML('afterbegin',
    '<p style="background:#7f1d1d;color:#fff;padding:1rem;margin:0">Chart.js konnte nicht geladen werden (vendor/chart.umd.min.js fehlt). Diagramme bleiben leer.</p>');
}
init();
