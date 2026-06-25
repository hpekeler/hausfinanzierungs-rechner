// Unit-Tests der Finanzmathematik. Ausführen mit:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kaufnebenkosten, monatsAnnuitaet, tilgungsplan, restschuld,
  bausparSparphase, etfEndwertBrutto, etfEndwertNetto, phase2,
  basisRechnung, vergleicheStrategien, szenarien, monteCarlo, perzentil,
  STANDARDWERTE,
} from '../finance.js';

const nahe = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≈ ${b} (±${tol})`);

test('Kaufnebenkosten summieren die Prozentsätze', () => {
  const nk = kaufnebenkosten(500000, { grunderwerbPct: 6.5, notarPct: 1.5, grundbuchPct: 0.5, maklerPct: 3.57 });
  nahe(nk.summe, 500000 * 0.1207, 1, 'Summe Nebenkosten');
  assert.equal(nk.grunderwerb, 32500);
});

test('Monatsannuität = Darlehen*(Sollzins+Tilgung)/12', () => {
  // 300.000 € bei 3 % Sollzins + 2 % Tilgung = 5 % p.a. = 15.000/Jahr = 1.250/Monat
  nahe(monatsAnnuitaet(300000, 3, 2), 1250, 1e-9, 'Annuität');
});

test('Tilgungsplan: bekannte Restschuld nach 10 Jahren', () => {
  // 300.000 €, 3 % Sollzins, 2 % Anfangstilgung. Rate 1.250 €/Monat, 120 Monate.
  // Geschlossene Formel: L*(1+i)^n - A*((1+i)^n-1)/i mit i=0,0025, n=120 → ≈ 230.122 €.
  const rate = monatsAnnuitaet(300000, 3, 2);
  const p = tilgungsplan(300000, 3, rate, 120);
  nahe(p.restschuld, 230122, 50, 'Restschuld nach 10 Jahren');
  assert.ok(p.restschuld < 300000, 'Restschuld muss kleiner als Darlehen sein');
  // Zinsen + Tilgung müssen zusammen ungefähr den eingezahlten Raten entsprechen.
  nahe(p.gezahlteZinsen + p.gezahlteTilgung, rate * 120, 5, 'Summe Zahlungen');
});

test('Sondertilgung senkt die Restschuld', () => {
  const ohne = restschuld(300000, 3, 2, 10, 0);
  const mit = restschuld(300000, 3, 2, 10, 5000);
  assert.ok(mit < ohne, 'Sondertilgung muss Restschuld senken');
});

test('Höhere Tilgung senkt die Restschuld', () => {
  assert.ok(restschuld(300000, 3, 3, 10) < restschuld(300000, 3, 2, 10));
});

test('Bauspar-Sparphase erreicht Zuteilung bei Mindestsparguthaben', () => {
  const sp = bausparSparphase({
    bausparsumme: 100000, abschlussgebuehrPct: 1.6, sparrate: 500,
    guthabenzinsPct: 0.5, mindestsparguthabenPct: 40, kontofuehrungJahr: 24,
  });
  assert.ok(sp.zuteilungMonat !== null, 'Zuteilung muss erreicht werden');
  assert.ok(sp.guthaben >= sp.ziel, 'Guthaben muss Ziel erreichen');
  // 500 €/Monat → 40.000 € Ziel in grob 6–7 Jahren.
  assert.ok(sp.zuteilungMonat > 60 && sp.zuteilungMonat < 100, `Zuteilung plausibel: ${sp.zuteilungMonat}`);
});

test('ETF-Endwert: positiver Zinseszins und Steuer', () => {
  const brutto = etfEndwertBrutto(300, 6, 10);
  assert.ok(brutto.wert > brutto.eingezahlt, 'Wert > Einzahlungen bei positiver Rendite');
  const netto = etfEndwertNetto({ sparrate: 300, renditePct: 6, jahre: 10, abgeltungssteuerPct: 26.375, teilfreistellungPct: 30 });
  assert.ok(netto.netto < netto.brutto, 'Netto < Brutto wegen Steuer');
  assert.ok(netto.steuer > 0, 'Steuer positiv');
  // Teilfreistellung 30 % → effektiver Steuersatz auf Gewinn ~18,46 %.
  nahe(netto.steuer, netto.gewinn * 0.26375 * 0.7, 1, 'Steuerformel');
});

test('phase2: höheres Budget tilgt schneller, teure Schuld zuerst', () => {
  const wenig = phase2({ schulden: [{ bal: 100000, ratePct: 4 }], budget: 800, monate: 120 });
  const viel = phase2({ schulden: [{ bal: 100000, ratePct: 4 }], budget: 1500, monate: 120 });
  assert.ok(viel.restschuld < wenig.restschuld, 'mehr Budget → weniger Restschuld');

  // Zwei Schulden: die teurere (6 %) wird zuerst getilgt.
  const r = phase2({ schulden: [{ bal: 50000, ratePct: 2 }, { bal: 50000, ratePct: 6 }], budget: 1000, monate: 12 });
  assert.ok(r.restschuld < 100000, 'es wird getilgt');
});

test('Szenarien sind nach Anschlusszins geordnet (Basis)', () => {
  const inp = { ...STANDARDWERTE };
  const s = szenarien(inp);
  // Bei der Basis-Strategie (reines Anschlussdarlehen) ist hoher Anschlusszins schlecht:
  assert.ok(s.optimistisch.basis.nettovermoegen >= s.erwartet.basis.nettovermoegen - 1, 'optimistisch ≥ erwartet (Basis)');
  assert.ok(s.erwartet.basis.nettovermoegen >= s.pessimistisch.basis.nettovermoegen - 1, 'erwartet ≥ pessimistisch (Basis)');
});

test('Höherer Anschlusszins macht Bausparvertrag relativ besser', () => {
  const basis = basisRechnung(STANDARDWERTE);
  const niedrig = vergleicheStrategien(STANDARDWERTE, basis, { anschlusszins: 2.0, etfRendite: 6 });
  const hoch = vergleicheStrategien(STANDARDWERTE, basis, { anschlusszins: 8.0, etfRendite: 6 });
  const vorteilNiedrig = niedrig.bauspar.nettovermoegen - niedrig.basis.nettovermoegen;
  const vorteilHoch = hoch.bauspar.nettovermoegen - hoch.basis.nettovermoegen;
  assert.ok(vorteilHoch > vorteilNiedrig, 'Bauspar-Vorteil wächst mit dem Anschlusszins');
});

test('Höhere ETF-Rendite macht ETF besser', () => {
  const basis = basisRechnung(STANDARDWERTE);
  const a = vergleicheStrategien(STANDARDWERTE, basis, { anschlusszins: 4, etfRendite: 2 });
  const b = vergleicheStrategien(STANDARDWERTE, basis, { anschlusszins: 4, etfRendite: 9 });
  assert.ok(b.etf.nettovermoegen > a.etf.nettovermoegen, 'mehr Rendite → mehr ETF-Vermögen');
});

test('Monte-Carlo liefert plausible Wahrscheinlichkeiten und Statistik', () => {
  const mc = monteCarlo(STANDARDWERTE, 500);
  assert.ok(mc.pEtfBesserBauspar >= 0 && mc.pEtfBesserBauspar <= 1, 'Wahrscheinlichkeit in [0,1]');
  assert.ok(mc.stats.etf.p05 <= mc.stats.etf.median, 'p05 ≤ Median');
  assert.ok(mc.stats.etf.median <= mc.stats.etf.p95, 'Median ≤ p95');
});

test('perzentil interpoliert korrekt', () => {
  const s = [0, 10, 20, 30, 40];
  assert.equal(perzentil(s, 0), 0);
  assert.equal(perzentil(s, 1), 40);
  assert.equal(perzentil(s, 0.5), 20);
});
