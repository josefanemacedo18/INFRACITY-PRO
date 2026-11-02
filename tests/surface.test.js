import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../app/core/surface.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, obtido ${a}`);

// plano inclinado z = 100 + 0.02 x + 0.05 y em coordenadas UTM
const E0 = 690000, N0 = 7470000;
const plane = (x, y) => 100 + 0.02 * (x - E0) + 0.05 * (y - N0);
function gridPoints(nx, ny, step, f = plane, jitter = 0) {
  const pts = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    const x = E0 + i * step + jitter * rnd(), y = N0 + j * step + jitter * rnd();
    pts.push({ x, y, z: f(x, y) });
  }
  return pts;
}

test('TIN reproduz exatamente um plano', () => {
  const s = new Surface({ points: gridPoints(20, 20, 10, plane, 3) });
  assert.equal(s.stats.points, 441);
  for (const [x, y] of [[E0 + 55.3, N0 + 77.1], [E0 + 101, N0 + 33], [E0 + 150.5, N0 + 150.5]]) {
    near(s.elevationAt(x, y), plane(x, y), 1e-9);
  }
  assert.equal(s.elevationAt(E0 - 50, N0 - 50), null);
  const sl = s.slopeAt(E0 + 50, N0 + 50);
  near(sl.slope, Math.hypot(0.02, 0.05), 1e-9);
});

test('interseção exata de segmento com o TIN', () => {
  const s = new Surface({ points: gridPoints(10, 10, 10, plane, 2) });
  const pieces = s.intersectSegment(E0 + 5, N0 + 5, E0 + 95, N0 + 60);
  assert.equal(pieces.length, 1);
  const pc = pieces[0];
  assert.ok(pc.length > 10);
  for (const p of pc) near(p.z, plane(p.x, p.y), 1e-9);
  // segmento que sai da superfície
  const out = s.intersectSegment(E0 + 50, N0 + 50, E0 + 150, N0 + 50);
  assert.equal(out.length, 1);
  assert.ok(out[0][out[0].length - 1].x <= E0 + 100 + 2.5);
});

test('curvas de nível de um cone são círculos na cota correta', () => {
  const cone = (x, y) => 120 - Math.hypot(x - E0 - 100, y - N0 - 100) * 0.1;
  const s = new Surface({ points: gridPoints(40, 40, 5, cone, 0.7) });
  const cs = s.contours(1, { majorEvery: 5 });
  const c110 = cs.find((c) => Math.abs(c.z - 110) < 1e-9);
  assert.ok(c110, 'curva 110');
  assert.equal(c110.major, true);
  assert.equal(c110.lines.length, 1, 'linha única fechada');
  const line = c110.lines[0];
  // raio esperado = 100 m (TIN linear aproxima o cone; tolerância pela discretização)
  for (const p of line) near(Math.hypot(p.x - E0 - 100, p.y - N0 - 100), 100, 0.6);
  const first = line[0], last = line[line.length - 1];
  near(first.x, last.x, 1e-9); near(first.y, last.y, 1e-9);
});

test('linhas de quebra são respeitadas', () => {
  // vala: pontos esparsos + linha de quebra no fundo
  const pts = [
    { x: 0, y: 0, z: 10 }, { x: 100, y: 0, z: 10 }, { x: 100, y: 100, z: 10 }, { x: 0, y: 100, z: 10 },
  ];
  const bl = [[{ x: 50, y: -1, z: 5 }, { x: 50, y: 101, z: 5 }]];
  const s = new Surface({ points: pts, breaklines: bl });
  assert.ok(s.constrained >= 1);
  near(s.elevationAt(50, 50), 5, 1e-9, 'fundo da vala');
  near(s.elevationAt(25, 50), 7.5, 1e-6, 'meia encosta');
});

test('remoção de triângulos longos na borda', () => {
  // L com concavidade
  const pts = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    if (i > 5 && j > 5) continue;
    pts.push({ x: i * 10, y: j * 10, z: 1 });
  }
  const s1 = new Surface({ points: pts });
  const s2 = new Surface({ points: pts, maxEdge: 15 });
  assert.ok(s1.elevationAt(70, 70) != null, 'sem limite cobre a concavidade');
  assert.equal(s2.elevationAt(70, 70), null, 'com limite remove a concavidade');
  assert.ok(s2.elevationAt(20, 20) != null);
});

test('serialização ida e volta', () => {
  const s = new Surface({ points: gridPoints(5, 5, 10), name: 'T1' });
  const j = JSON.parse(JSON.stringify(s.toJSON()));
  const s2 = Surface.fromJSON(j);
  near(s2.elevationAt(E0 + 22, N0 + 31), s.elevationAt(E0 + 22, N0 + 31), 1e-6);
  assert.equal(s2.name, 'T1');
});
