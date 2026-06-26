// charts.js — Chart.js-Wrapper. `Chart` ist global (UMD-Script in index.html).
// Jede Funktion zerstört einen ggf. vorhandenen Chart auf demselben Canvas neu.

const FARBEN = { basis: '#f59e0b', bauspar: '#34d399', etf: '#818cf8' };
const LABELS = { basis: 'Anschlussdarlehen', bauspar: 'Bausparvertrag', etf: 'ETF-Sparplan' };
const charts = {};

const eur = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

function neu(canvasId, config) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, config);
  return charts[canvasId];
}

const achsenFarbe = '#94a3b8';
const grid = { color: 'rgba(148,163,184,.15)' };
const gemeinsameOptionen = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: achsenFarbe } } },
  scales: {
    x: { ticks: { color: achsenFarbe }, grid },
    y: { ticks: { color: achsenFarbe, callback: (v) => eur(v) }, grid },
  },
};

/** Restschuldverlauf des Bankdarlehens (Phase 1). */
export function restschuldChart(verlauf) {
  neu('chartRestschuld', {
    type: 'line',
    data: {
      labels: verlauf.map((p) => `${p.jahr}`),
      datasets: [{
        label: 'Restschuld',
        data: verlauf.map((p) => p.restschuld),
        borderColor: FARBEN.basis,
        backgroundColor: 'rgba(245,158,11,.15)',
        fill: true, tension: .2,
      }],
    },
    options: {
      ...gemeinsameOptionen,
      scales: { ...gemeinsameOptionen.scales, x: { ...gemeinsameOptionen.scales.x, title: { display: true, text: 'Jahr', color: achsenFarbe } } },
    },
  });
}

/** Balkenvergleich des Nettovermögens (erwartetes Szenario) je Strategie. */
export function vergleichChart(erwartet) {
  const keys = ['basis', 'bauspar', 'etf'];
  neu('chartVergleich', {
    type: 'bar',
    data: {
      labels: keys.map((k) => LABELS[k]),
      datasets: [{
        label: 'Nettovermögen (nominal)',
        data: keys.map((k) => erwartet[k].nettovermoegen),
        backgroundColor: keys.map((k) => FARBEN[k]),
      }],
    },
    options: { ...gemeinsameOptionen, plugins: { legend: { display: false } } },
  });
}

/**
 * Phase-2-Verlauf eines Szenarios: Nettovermögen (Anlage − Restschuld) je Jahr
 * für alle drei Strategien. `ergebnis` = ein Szenario aus szenarien() (z.B. sz.erwartet),
 * jede Strategie mit `.verlauf` aus phase2(). `zinsbindungJahre` für absolute Jahres-Achse.
 */
export function phase2Chart(canvasId, ergebnis, zinsbindungJahre) {
  const keys = ['basis', 'bauspar', 'etf'];
  const verlauf = ergebnis.basis.verlauf;
  const labels = verlauf.map((p) => `${zinsbindungJahre + p.jahr}`);
  neu(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: keys.map((k) => ({
        label: LABELS[k],
        data: ergebnis[k].verlauf.map((p) => p.anlage - p.schuld),
        borderColor: FARBEN[k],
        backgroundColor: FARBEN[k] + '22',
        fill: false, tension: .2, pointRadius: 0,
      })),
    },
    options: {
      ...gemeinsameOptionen,
      plugins: { legend: { labels: { color: achsenFarbe } } },
      scales: {
        ...gemeinsameOptionen.scales,
        x: { ...gemeinsameOptionen.scales.x, title: { display: true, text: 'Jahr', color: achsenFarbe } },
        y: { ...gemeinsameOptionen.scales.y, title: { display: true, text: 'Nettovermögen', color: achsenFarbe } },
      },
    },
  });
}

/** Histogramm der Monte-Carlo-Endwerte (drei Strategien überlagert). */
export function monteCarloChart(roh) {
  const alle = [...roh.basis, ...roh.bauspar, ...roh.etf];
  const min = Math.min(...alle), max = Math.max(...alle);
  const bins = 30;
  const breite = (max - min) / bins || 1;
  const kanten = Array.from({ length: bins }, (_, i) => min + i * breite);

  const histogramm = (werte) => {
    const h = new Array(bins).fill(0);
    for (const w of werte) {
      let idx = Math.floor((w - min) / breite);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      h[idx]++;
    }
    return h;
  };

  const ds = ['basis', 'bauspar', 'etf'].map((k) => ({
    label: LABELS[k],
    data: histogramm(roh[k]),
    backgroundColor: FARBEN[k] + 'cc',
    borderColor: FARBEN[k],
    borderWidth: 1,
  }));

  neu('chartMC', {
    type: 'bar',
    data: { labels: kanten.map((k) => eur(k)), datasets: ds },
    options: {
      ...gemeinsameOptionen,
      scales: {
        x: { ticks: { color: achsenFarbe, maxTicksLimit: 8 }, grid, stacked: false, title: { display: true, text: 'Nettovermögen', color: achsenFarbe } },
        y: { ticks: { color: achsenFarbe }, grid, title: { display: true, text: 'Häufigkeit', color: achsenFarbe } },
      },
    },
  });
}

/** Perzentilbänder (5/25/50/75/95) je Strategie als „Floating Bars". */
export function perzentilBandChart(stats) {
  const keys = ['basis', 'bauspar', 'etf'];
  neu('chartMCBand', {
    type: 'bar',
    data: {
      labels: keys.map((k) => LABELS[k]),
      datasets: [
        { label: '5 %–95 %', data: keys.map((k) => [stats[k].p05, stats[k].p95]), backgroundColor: keys.map((k) => FARBEN[k] + '55'), borderColor: keys.map((k) => FARBEN[k]), borderWidth: 1 },
        { label: '25 %–75 %', data: keys.map((k) => [stats[k].p25, stats[k].p75]), backgroundColor: keys.map((k) => FARBEN[k] + 'bb') },
      ],
    },
    options: {
      ...gemeinsameOptionen,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: achsenFarbe, callback: (v) => eur(v) }, grid },
        y: { ticks: { color: achsenFarbe }, grid, stacked: true },
      },
      plugins: {
        legend: { labels: { color: achsenFarbe } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${eur(c.raw[0])} … ${eur(c.raw[1])}` } },
      },
    },
  });
}
