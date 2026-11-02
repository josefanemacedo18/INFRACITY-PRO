import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Alignment } from '../app/core/alignment.js';
import { Profile } from '../app/core/profile.js';
import { Surface } from '../app/core/surface.js';
import { computeCorridor, featureLines } from '../app/core/corridor.js';
import { makeComponent, defaultTemplate } from '../app/core/template.js';
import { buildSuperelevation } from '../app/core/superelevation.js';
import { geo } from '../app/core/norms/brasil.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, obtido ${a}`);
const E0 = 500000, N0 = 7500000;

function flatSurface(z = 100) {
  const pts = [];
  for (let i = -10; i <= 10; i++) for (let j = -2; j <= 14; j++) pts.push({ x: E0 + i * 10, y: N0 + j * 10, z });
  return new Surface({ points: pts });
}
function simpleTemplate(pavement = 0) {
  return {
    symmetric: true, median: 0,
    right: [makeComponent('pista', { width: 3.5, slope: -0.02 })],
    left: [makeComponent('pista', { width: 3.5, slope: -0.02 })],
    cut: { slope: 1.0, ditch: null }, fill: { slope: 1.5 },
    pavement: { layers: pavement ? [{ name: 'Pav', material: 'x', thickness: pavement }] : [] },
    maxWidth: 40,
  };
}
const straight = new Alignment({ pis: [{ x: E0, y: N0 }, { x: E0, y: N0 + 100 }] });

test('corredor em aterro sobre terreno plano: área analítica', () => {
  const pr = new Profile({ pvis: [{ s: 0, z: 101 }, { s: 100, z: 101 }] });
  const c = computeCorridor({ alignment: straight, profile: pr, template: simpleTemplate(0), surface: flatSurface(), interval: 20 });
  assert.equal(c.sections.length, 6);
  const expected = 2 * ((3.5 - 0.02 * 3.5 * 3.5 / 2) + 0.5 * (0.93 * 1.5) * 0.93);
  for (const sc of c.sections) {
    near(sc.fillArea, expected, 1e-6, 'área de aterro');
    near(sc.cutArea, 0, 1e-9);
    assert.equal(sc.slopeType.R, 'aterro');
    near(sc.right.daylight.pts[0].o, 3.5 + 0.93 * 1.5, 1e-6, 'offset do pé do aterro');
  }
  near(c.totals.fill, expected * 100, 1e-4, 'volume');
  near(c.totals.cut, 0, 1e-9);
  near(c.totals.clearingArea, 2 * (3.5 + 0.93 * 1.5) * 100, 1e-4);
});

test('corredor em corte com pavimento de 0,30 m', () => {
  const pr = new Profile({ pvis: [{ s: 0, z: 99 }, { s: 100, z: 99 }] });
  const c = computeCorridor({ alignment: straight, profile: pr, template: simpleTemplate(0.30), surface: flatSurface(), interval: 50, fh: 1.25 });
  const right = 3.5 * 1.3 + 0.02 * 3.5 * 3.5 / 2 + 0.5 * 1.07 * 1.07;
  for (const sc of c.sections) {
    near(sc.cutArea, 2 * right, 1e-6, 'área de corte');
    near(sc.fillArea, 0, 1e-9);
  }
  const last = c.volumes[c.volumes.length - 1];
  near(last.mass, 2 * right * 100, 1e-4, 'Brückner acumula o corte');
});

test('corredor misto: corte num lado e aterro no outro (terreno inclinado)', () => {
  const pts = [];
  for (let i = -10; i <= 10; i++) for (let j = -2; j <= 14; j++) pts.push({ x: E0 + i * 10, y: N0 + j * 10, z: 100 + 0.1 * i * 10 });
  const s = new Surface({ points: pts });
  const pr = new Profile({ pvis: [{ s: 0, z: 100 }, { s: 100, z: 100 }] });
  const c = computeCorridor({ alignment: straight, profile: pr, template: simpleTemplate(0), surface: s, interval: 50 });
  const sc = c.sections[1];
  assert.equal(sc.slopeType.R, 'corte', 'lado direito (leste) sobe');
  assert.equal(sc.slopeType.L, 'aterro');
  assert.ok(sc.cutArea > 0 && sc.fillArea > 0);
});

test('superelevação: taxa DNER e rotação em torno do eixo', () => {
  const V = 60, emax = 0.08;
  const R = 150;
  const e = geo.superelevation(V, R, emax, 0.02);
  const rmin = geo.rMin(V, emax);
  near(rmin, 3600 / (127 * 0.23), 1e-9);
  near(e, emax * (2 * rmin / R - (rmin * rmin) / (R * R)), 1e-12);
  assert.equal(geo.superelevation(V, 2000, emax), 0, 'R acima do dispensável');
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 300, R, Ls: 60 }, { x: 300, y: 600 }] });
  const sup = buildSuperelevation(al, { enabled: true, V, emax, crown: 0.02, widthLeft: 3.5, widthRight: 3.5 });
  const c = al.curves[0];
  const mid = (c.staSC + c.staCS) / 2;
  const sl = sup.slopeAt(mid);
  near(sl.L, e, 1e-12, 'lado externo (curva à direita) sobe');
  near(sl.R, -e, 1e-12);
  const far = sup.slopeAt(5);
  near(far.L, -0.02, 1e-12); near(far.R, -0.02, 1e-12);
  const ts = sup.slopeAt(c.staTS);
  near(ts.L, 0, 1e-12, 'no TS o lado externo está em nível');
});

test('template padrão de via local e linhas do corredor', () => {
  const tpl = defaultTemplate('local');
  const pr = new Profile({ pvis: [{ s: 0, z: 100.5 }, { s: 100, z: 100.5 }] });
  const c = computeCorridor({ alignment: straight, profile: pr, template: tpl, surface: flatSurface(), interval: 20 });
  assert.ok(c.sections.length >= 6);
  const lines = featureLines(c, straight);
  const keys = lines.map((l) => l.key);
  assert.ok(keys.includes('R:meiofio2'), 'meio-fio direito');
  assert.ok(keys.includes('L:OFFSET'));
  const mf = lines.find((l) => l.key === 'R:meiofio2');
  near(mf.pts[0].o, 3.0 + 0.30 + 0.15, 1e-9);
});
