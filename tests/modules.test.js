import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dnerThickness, dnerDesign, computeN, minSurface } from '../app/core/pavement.js';
import { idfIntensity, kirpich, rationalQ, izzardQ, circularFlow, designPipe, depthRatioFor, designNetwork, gutterCheck } from '../app/core/drainage.js';
import { horizontalMarkings, signArea, suggestVerticalSigns, signageQuantities } from '../app/core/signage.js';
import { blocksFromRoads, subdivideBlock, lotDescription, checkLot, areaTable, roadPolygon } from '../app/core/lots.js';
import { Alignment } from '../app/core/alignment.js';
import { Profile } from '../app/core/profile.js';
import { Surface } from '../app/core/surface.js';
import { computeCorridor } from '../app/core/corridor.js';
import { corridorQuantities } from '../app/core/quantities.js';
import { defaultTemplate } from '../app/core/template.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, obtido ${a}`);

test('pavimento: fórmula do DNER e dimensionamento', () => {
  // Ht(N=1e6, CBR=5) = 77,67 · 1e6^0,0482 · 5^-0,598
  const H = dnerThickness(1e6, 5);
  near(H, 77.67 * Math.pow(1e6, 0.0482) * Math.pow(5, -0.598), 1e-9);
  assert.ok(H > 55 && H < 60, 'ordem de grandeza ~ 58 cm');
  assert.equal(minSurface(3e6).cm, 5);
  assert.equal(minSurface(2e7).cm, 10);
  const d = dnerDesign({ N: 5e6, cbrSubgrade: 8 });
  const sumK = d.layers.reduce((s, l) => s + l.thicknessCm * l.k, 0);
  assert.ok(sumK >= d.Ht - 1e-6, 'estrutura equivalente cobre Ht do subleito');
  const R = d.layers[0].thicknessCm * d.layers[0].k;
  const B = d.layers[1].thicknessCm * d.layers[1].k;
  assert.ok(R + B >= d.H20 - 1e-6, 'R·KR + B·KB ≥ H20');
  const N = computeN({ vmdc: 500, years: 10, growth: 0.03, fv: 2, fr: 1, fd: 0.5 });
  near(N, 365 * 500 * ((Math.pow(1.03, 10) - 1) / 0.03) * 2 * 0.5, 1e-3);
});

test('drenagem: IDF, Kirpich, racional, Izzard e Manning', () => {
  near(idfIntensity({ K: 1000, a: 0.15, b: 10, c: 0.8 }, 10, 10), 1000 * Math.pow(10, 0.15) / Math.pow(20, 0.8), 1e-9);
  near(kirpich(1, 20), 57 * Math.pow(1 / 20, 0.385), 1e-9);
  near(rationalQ(0.9, 100, 10000), 0.25, 1e-12, '1 ha, i = 100 mm/h, C = 0,9');
  const q = izzardQ({ crossSlope: 0.05, n: 0.016, I: 0.01, y: 0.10 });
  near(q, 0.375 * (20 / 0.016) * 0.1 * Math.pow(0.1, 8 / 3), 1e-12);
  // tubo cheio: Q = (1/n) A R^(2/3) S^(1/2) com R = D/4
  const D = 0.6, n = 0.013, S = 0.01;
  const full = circularFlow(D, 1, n, S);
  near(full.Q, (1 / n) * (Math.PI * D * D / 4) * Math.pow(D / 4, 2 / 3) * Math.sqrt(S), 1e-3);
  const p = designPipe(0.25, 0.01);
  assert.ok(p.ok);
  assert.ok(p.yD <= 0.85 + 1e-9);
  near(circularFlow(p.D, depthRatioFor(0.25, p.D, 0.013, 0.01), 0.013, 0.01).Q, 0.25, 1e-6);
  const g = gutterCheck({ segments: [{ s0: 0, s1: 200, grade: 0.02 }], crossSlope: 0.05, n: 0.016, yMax: 0.10, widthContrib: 7, C: 0.85, i: 120 });
  assert.ok(g[0].Lcrit > 0 && Number.isFinite(g[0].Lcrit));
});

test('drenagem: rede de galerias em série acumula vazão', () => {
  const nodes = [
    { id: 'A', z: 105, areaLocal: 5000, C: 0.8 },
    { id: 'B', z: 104, areaLocal: 5000, C: 0.8 },
    { id: 'C', z: 103, areaLocal: 5000, C: 0.8 },
  ];
  const links = [{ id: 'T1', from: 'A', to: 'B', length: 60 }, { id: 'T2', from: 'B', to: 'C', length: 60 }];
  const r = designNetwork({ nodes, links }, { idf: { K: 1000, a: 0.15, b: 10, c: 0.8 }, T: 10 });
  assert.equal(r.length, 2);
  assert.ok(r[1].Q > r[0].Q, 'vazão cresce para jusante');
  assert.ok(r[1].D >= r[0].D);
  for (const t of r) assert.ok(t.depthUp >= 1.0 + t.D - 1e-9, 'recobrimento mínimo');
});

test('sinalização: linhas a partir da seção e quantitativos', () => {
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 500 }] });
  const tpl = defaultTemplate('arterial');
  const hm = horizontalMarkings({ alignment: al, template: tpl, V: 60 });
  assert.ok(hm.lines.some((l) => l.code === 'LMS-2'), 'divisão de faixas do mesmo sentido');
  assert.ok(!hm.lines.some((l) => l.offset === 0), 'com canteiro central não há linha no eixo');
  const tplLocal = defaultTemplate('local');
  const hm2 = horizontalMarkings({ alignment: al, template: tplLocal, V: 30 });
  const center = hm2.lines.find((l) => l.offset === 0);
  assert.equal(center.code, 'LFO-2');
  near(center.area, 500 * 0.10 * (2 / 6), 1e-9, 'seccionada 2/4 m');
  near(signArea('circulo', 0.5), Math.PI * 0.0625, 1e-12);
  near(signArea('octogono', 0.35), 2 * (1 + Math.SQRT2) * 0.1225, 1e-12);
  const curve = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 300, R: 60 }, { x: 300, y: 300 }] });
  const sg = suggestVerticalSigns({ alignment: curve, V: 40 });
  assert.ok(sg.some((s) => s.code.startsWith('A-1') || s.code.startsWith('A-2')), 'advertência de curva');
  const q = signageQuantities({ horizontal: hm2.lines, signs: sg });
  assert.ok(q.some((i) => i.code === 'SV-SUP'));
});

test('loteamento: quadras a partir das vias, lotes e Lei 6.766', () => {
  const gleba = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }];
  const road = new Alignment({ pis: [{ x: -10, y: 60 }, { x: 210, y: 60 }] });
  const roadPoly = roadPolygon(road, 6, 6);
  const blocks = blocksFromRoads(gleba, [roadPoly]);
  assert.equal(blocks.length, 2);
  near(blocks[0].area + blocks[1].area, 200 * 120 - 200 * 12, 0.5);
  const lots = subdivideBlock(blocks[0].polygon, { front: 12 });
  const total = lots.reduce((s, l) => s + l.area, 0);
  near(total, blocks[0].area, 0.5, 'lotes somam a quadra');
  assert.equal(lots.length, 16, '200 m / 12 m = 16 lotes (sobra incorporada)');
  const d = lotDescription(lots[0].polygon);
  near(d.area, lots[0].area, 1e-6);
  assert.equal(d.sides.length >= 4, true);
  assert.deepEqual(checkLot({ area: 100, front: 4 }).length, 2);
  const tbl = areaTable({ glebaArea: 24000, lotsArea: 21600, roadsArea: 2400 });
  near(tbl.rows[0].pct, 0.9, 1e-12);
});

test('quantitativos do corredor (via local)', () => {
  const pts = [];
  for (let i = -6; i <= 6; i++) for (let j = -1; j <= 21; j++) pts.push({ x: i * 10, y: j * 10, z: 100 });
  const s = new Surface({ points: pts });
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 200 }] });
  const pr = new Profile({ pvis: [{ s: 0, z: 100.3 }, { s: 200, z: 100.3 }] });
  const tpl = defaultTemplate('local');
  const c = computeCorridor({ alignment: al, profile: pr, template: tpl, surface: s, interval: 20 });
  const q = corridorQuantities(c, tpl);
  const get = (code) => q.find((i) => i.code === code);
  near(get('PAV-02').qty, 2 * 3.0 * 200, 1e-6, 'área de revestimento');
  near(get('OBC-01').qty, 2 * 200, 1e-6, 'meio-fio dos dois lados');
  near(get('OBC-02').qty, 2 * 2.5 * 200, 1e-6, 'passeios');
  near(get('DRS-01').qty, 2 * 200, 1e-6, 'sarjetas');
});
