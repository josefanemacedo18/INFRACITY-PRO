import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Alignment, spiralXY } from '../app/core/alignment.js';
import { Profile, autoProfile } from '../app/core/profile.js';
import { fmtStation, parseStation, parseNum, fmt, fmtDMS } from '../app/core/util.js';
import { geoToUtm, utmToGeo } from '../app/core/utm.js';
import { polygonArea, polygonCentroid } from '../app/core/geom.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, obtido ${a} (tol ${tol})`);

test('formatação de estacas e números pt-BR', () => {
  assert.equal(fmtStation(245.4), '12 + 5,40');
  assert.equal(fmtStation(240), '12 + 0,00');
  assert.equal(fmtStation(259.999), '13 + 0,00');
  near(parseStation('12+5,40'), 245.4, 1e-9);
  near(parseStation('12 + 5.4'), 245.4, 1e-9);
  near(parseNum('1.234,56'), 1234.56, 1e-9);
  near(parseNum('1,234.56'), 1234.56, 1e-9);
  near(parseNum('7394512,123'), 7394512.123, 1e-9);
  assert.equal(fmt(1234.5, 2), '1.234,50');
  assert.equal(fmtDMS(Math.PI / 4), '45°00\'00,0"');
});

test('UTM SIRGAS 2000: meridiano central, ponto a 3° e ida e volta', () => {
  const a = geoToUtm(0, -45, 23, 'S');
  near(a.E, 500000, 1e-6); near(a.N, 10000000, 1e-6);
  const b = geoToUtm(0, -42, 23, 'S');
  near(b.E, 833978.56, 0.02, 'E a 3° do MC');
  const lat = -23.5505, lon = -46.6333;
  const u = geoToUtm(lat, lon);
  assert.equal(u.zone, 23);
  const g = utmToGeo(u.E, u.N, 23, 'S');
  near(g.lat, lat, 1e-9); near(g.lon, lon, 1e-9);
  // ordem de grandeza conhecida para São Paulo
  assert.ok(u.E > 330000 && u.E < 336000, 'E São Paulo');
  assert.ok(u.N > 7393000 && u.N < 7396000, 'N São Paulo');
});

test('polígono: área e centróide', () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
  near(polygonArea(sq), 200, 1e-9);
  const c = polygonCentroid(sq);
  near(c.x, 5, 1e-9); near(c.y, 10, 1e-9);
});

test('curva circular simples: T, desenvolvimento, PC/PT e centro', () => {
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 100, R: 50 }, { x: 100, y: 100 }] });
  assert.deepEqual(al.errors, []);
  assert.deepEqual(al.warnings, []);
  const c = al.curves[0];
  assert.equal(c.side, 'D');
  near(c.T, 50, 1e-9);
  near(c.Lc, 50 * Math.PI / 2, 1e-9);
  near(c.TS.x, 0, 1e-9); near(c.TS.y, 50, 1e-9);
  near(c.ST.x, 50, 1e-9); near(c.ST.y, 100, 1e-9);
  near(c.center.x, 50, 1e-9); near(c.center.y, 50, 1e-9);
  near(al.length, 100 + 50 * Math.PI / 2, 1e-9);
  const mid = al.pointAt(50 + (50 * Math.PI / 2) / 2);
  near(mid.x, 50 - 50 * Math.SQRT1_2, 1e-9);
  near(mid.y, 50 + 50 * Math.SQRT1_2, 1e-9);
  near(mid.az, Math.PI / 4, 1e-12);
  const end = al.pointAt(al.endStation);
  near(end.x, 100, 1e-9); near(end.y, 100, 1e-9);
});

test('curva à esquerda e afastamentos', () => {
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 100, R: 40 }, { x: -100, y: 100 }] });
  const c = al.curves[0];
  assert.equal(c.side, 'E');
  near(c.center.x, -40, 1e-9); near(c.center.y, 60, 1e-9);
  // ponto 10 m à direita na tangente inicial (rumo norte => direita = leste)
  const p = al.offsetPoint(20, 10);
  near(p.x, 10, 1e-9); near(p.y, 20, 1e-9);
  const so = al.stationOffset(10, 20);
  near(so.station, 20, 1e-6); near(so.offset, 10, 1e-6);
  // ponto dentro da curva (lado esquerdo)
  const q = al.offsetPoint(c.staTS + 20, -5);
  const so2 = al.stationOffset(q.x, q.y);
  near(so2.station, c.staTS + 20, 1e-6); near(so2.offset, -5, 1e-6);
});

test('espiral de transição: série comparada à integração numérica de Fresnel', () => {
  const R = 200, Ls = 60;
  const s = spiralXY(Ls, R, Ls);
  // integração por Simpson
  const N = 2000; let x = 0, y = 0;
  for (let i = 0; i <= N; i++) {
    const l = (Ls * i) / N;
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
    const th = (l * l) / (2 * R * Ls);
    x += w * Math.cos(th); y += w * Math.sin(th);
  }
  x *= Ls / N / 3; y *= Ls / N / 3;
  near(s.x, x, 1e-7, 'Xs'); near(s.y, y, 1e-7, 'Ys');
  near(s.theta, 0.15, 1e-12);
});

test('curva com espirais simétricas: continuidade e parâmetros', () => {
  const R = 200, Ls = 60, D = 40 * Math.PI / 180;
  const pi = { x: 0, y: 500 };
  const out = { x: pi.x + Math.sin(D) * 500, y: pi.y + Math.cos(D) * 500 };
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { ...pi, R, Ls }, out] });
  assert.deepEqual(al.errors, []);
  assert.deepEqual(al.warnings, [], 'sem descontinuidades');
  const c = al.curves[0];
  near(c.thetaS, 0.15, 1e-12);
  const pExp = c.Ys - R * (1 - Math.cos(0.15));
  const kExp = c.Xs - R * Math.sin(0.15);
  near(c.p, pExp, 1e-12); near(c.k, kExp, 1e-12);
  near(c.T, kExp + (R + pExp) * Math.tan(D / 2), 1e-9);
  near(c.Lc, R * (D - 0.3), 1e-9);
  // SC e CS a distância R do centro
  near(Math.hypot(c.SC.x - c.center.x, c.SC.y - c.center.y), R, 1e-6);
  near(Math.hypot(c.CS.x - c.center.x, c.CS.y - c.center.y), R, 1e-6);
  // TS e ST a distância T do PI
  near(Math.hypot(c.TS.x - pi.x, c.TS.y - pi.y), c.T, 1e-9);
  near(Math.hypot(c.ST.x - pi.x, c.ST.y - pi.y), c.T, 1e-9);
  // azimute final igual ao da tangente de saída
  const end = al.pointAt(c.staST);
  near(end.x, c.ST.x, 1e-6); near(end.y, c.ST.y, 1e-6);
  near(end.az, D, 1e-9);
  // estacas notáveis
  const kp = al.keyPoints().map((k) => k.label);
  assert.deepEqual(kp, ['PP', 'TS', 'SC', 'CS', 'ST', 'PF']);
});

test('tangentes sobrepostas geram erro', () => {
  const al = new Alignment({ pis: [{ x: 0, y: 0 }, { x: 0, y: 30, R: 100 }, { x: 30, y: 30 }] });
  assert.ok(al.errors.some((e) => e.includes('sobrepostas')));
});

test('perfil: curva vertical convexa simétrica', () => {
  const pr = new Profile({ pvis: [{ s: 0, z: 100 }, { s: 200, z: 104, L: 100 }, { s: 400, z: 100 }] });
  assert.deepEqual(pr.errors, []);
  const c = pr.curves[0];
  assert.equal(c.type, 'convexa');
  near(c.K, 25, 1e-9);
  near(c.e, -0.5, 1e-12);
  near(pr.elevationAt(150), 103, 1e-12);
  near(pr.elevationAt(200), 103.5, 1e-12);
  near(pr.elevationAt(250), 103, 1e-12);
  near(pr.elevationAt(300), 102, 1e-12);
  near(pr.gradeAt(200), 0, 1e-12);
  near(c.extreme.s, 200, 1e-9);
  near(c.extreme.z, 103.5, 1e-12);
});

test('perfil: sobreposição de curvas verticais gera erro', () => {
  const pr = new Profile({ pvis: [{ s: 0, z: 100 }, { s: 100, z: 102, L: 120 }, { s: 160, z: 101, L: 80 }, { s: 300, z: 104 }] });
  assert.ok(pr.errors.some((e) => e.includes('sobrepostas')));
});

test('greide automático respeita rampa máxima', () => {
  const ground = [];
  for (let s = 0; s <= 600; s += 5) ground.push({ s, z: 100 + 30 * Math.sin(s / 120) });
  const def = autoProfile(ground, { maxGrade: 0.06, kCrest: 15, kSag: 12 });
  const pr = new Profile(def);
  assert.deepEqual(pr.errors, []);
  for (const g of pr.grades) assert.ok(Math.abs(g) <= 0.06 + 1e-9);
});
