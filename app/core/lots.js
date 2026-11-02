// URBIS - loteamento: quadras a partir do sistema viário, divisão em lotes e quadro de áreas

import polygonClipping from 'polygon-clipping';
import { polygonArea, polygonPerimeter, azimuth, dist, signedArea, polygonCentroid } from './geom.js';
import { LAND_USE } from './norms/brasil.js';

// conversões entre {x,y}[] e o formato do polygon-clipping (anel fechado [[x,y],...])
const toRing = (poly) => { const r = poly.map((p) => [p.x, p.y]); r.push([poly[0].x, poly[0].y]); return r; };
const fromRing = (ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }));

/** Faixa do sistema viário (polígono) a partir do eixo e das semi-larguras. */
export function roadPolygon(alignment, halfLeft, halfRight, step = 2) {
  const right = alignment.offsetLine(halfRight, step);
  const left = alignment.offsetLine(-halfLeft, step).reverse();
  return [...right, ...left].map((p) => ({ x: p.x, y: p.y }));
}

/** Diferença entre a gleba e o sistema viário: devolve as quadras (polígonos externos, sem furos). */
export function blocksFromRoads(gleba, roads, opts = {}) {
  const minArea = opts.minArea ?? 50;
  let geom = [[toRing(gleba)]];
  if (roads.length) {
    const roadGeoms = roads.map((r) => [[toRing(r)]]);
    const union = polygonClipping.union(...roadGeoms);
    geom = polygonClipping.difference(geom, union);
  }
  const blocks = [];
  for (const poly of geom) {
    const outer = fromRing(poly[0]);
    const area = polygonArea(outer) - poly.slice(1).reduce((s, h) => s + polygonArea(fromRing(h)), 0);
    if (area >= minArea) blocks.push({ polygon: outer, holes: poly.slice(1).map(fromRing), area });
  }
  return blocks;
}

/** Interseção de polígono com faixa entre dois planos perpendiculares a uma direção. */
function clipStrip(poly, origin, u, a, b) {
  const big = 1e5;
  const v = { x: -u.y, y: u.x };
  const P = (t, w) => [origin.x + u.x * t + v.x * w, origin.y + u.y * t + v.y * w];
  const strip = [[P(a, -big), P(b, -big), P(b, big), P(a, big), P(a, -big)]];
  return polygonClipping.intersection([[toRing(poly)]], [strip]);
}

/** Aresta mais longa (frente sugerida). */
export function longestEdge(poly) {
  let best = 0, bi = 0;
  for (let i = 0; i < poly.length; i++) {
    const d = dist(poly[i], poly[(i + 1) % poly.length]);
    if (d > best) { best = d; bi = i; }
  }
  return bi;
}

/** Divide a quadra ao meio (paralelo à frente) quando a profundidade comporta duas frentes. */
export function splitDoubleFront(block, frontIdx, minDepth) {
  const a = block[frontIdx], b = block[(frontIdx + 1) % block.length];
  const L = dist(a, b);
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const nIn = signedArea(block) > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  let depth = 0;
  for (const p of block) depth = Math.max(depth, (p.x - a.x) * nIn.x + (p.y - a.y) * nIn.y);
  if (depth < 2 * minDepth) return null;
  const half = depth / 2;
  const big = 1e5;
  const P = (t, w) => [a.x + u.x * t + nIn.x * w, a.y + u.y * t + nIn.y * w];
  const s1 = [[P(-big, -1), P(big, -1), P(big, half), P(-big, half), P(-big, -1)]];
  const s2 = [[P(-big, half), P(big, half), P(big, depth + 1), P(-big, depth + 1), P(-big, half)]];
  const g1 = polygonClipping.intersection([[toRing(block)]], [s1]);
  const g2 = polygonClipping.intersection([[toRing(block)]], [s2]);
  if (!g1.length || !g2.length) return null;
  const h1 = fromRing(g1[0][0]), h2 = fromRing(g2[0][0]);
  // a frente da segunda metade é a aresta oposta (mais distante da frente original)
  let bestJ = 0, bestD = -Infinity;
  for (let j = 0; j < h2.length; j++) {
    const m = { x: (h2[j].x + h2[(j + 1) % h2.length].x) / 2, y: (h2[j].y + h2[(j + 1) % h2.length].y) / 2 };
    const d = (m.x - a.x) * nIn.x + (m.y - a.y) * nIn.y;
    const len = dist(h2[j], h2[(j + 1) % h2.length]);
    if (len > L * 0.3 && d > bestD) { bestD = d; bestJ = j; }
  }
  // aresta da frente na primeira metade: a mais próxima da frente original
  let f1 = 0, bestD1 = Infinity;
  for (let j = 0; j < h1.length; j++) {
    const m = { x: (h1[j].x + h1[(j + 1) % h1.length].x) / 2, y: (h1[j].y + h1[(j + 1) % h1.length].y) / 2 };
    const d = Math.abs((m.x - a.x) * nIn.x + (m.y - a.y) * nIn.y);
    const len = dist(h1[j], h1[(j + 1) % h1.length]);
    if (len > L * 0.3 && d < bestD1) { bestD1 = d; f1 = j; }
  }
  return [{ polygon: h1, front: f1 }, { polygon: h2, front: bestJ }];
}

/**
 * Divide uma quadra em lotes com frente aproximadamente constante.
 * @param {{x,y}[]} block
 * @param {{front:number, frontIdx?:number, mergeRemainder?:boolean}} o
 */
export function subdivideBlock(block, o) {
  const fi = o.frontIdx ?? longestEdge(block);
  const a = block[fi], b = block[(fi + 1) % block.length];
  const L = dist(a, b);
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  // extensão da quadra projetada na direção da frente
  let tMin = Infinity, tMax = -Infinity;
  for (const p of block) { const t = (p.x - a.x) * u.x + (p.y - a.y) * u.y; tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
  const span = tMax - tMin;
  const n = Math.max(1, Math.floor(span / o.front + 1e-9));
  const rem = span - n * o.front;
  const widths = Array(n).fill(o.front);
  if (rem > 1e-6) {
    if (rem >= o.front * 0.5 && o.mergeRemainder === false) widths.push(rem);
    else widths[widths.length - 1] += rem; // incorpora a sobra no último lote
  }
  const lots = [];
  let t = tMin;
  for (const w of widths) {
    const g = clipStrip(block, a, u, t, t + w);
    for (const poly of g) {
      const ring = fromRing(poly[0]);
      const area = polygonArea(ring);
      if (area > 1) lots.push({ polygon: ring, area });
    }
    t += w;
  }
  return lots;
}

/** Atributos do lote: área, perímetro, frente, confrontações (azimute e distância por lado). */
export function lotDescription(poly, frontLine) {
  const n = poly.length;
  const ccw = signedArea(poly) > 0;
  const pts = ccw ? poly : [...poly].reverse();
  const sides = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    sides.push({ from: i + 1, to: ((i + 1) % n) + 1, az: azimuth(p, q), length: dist(p, q), p, q });
  }
  let front = 0;
  if (frontLine) {
    for (const s of sides) {
      const m = { x: (s.p.x + s.q.x) / 2, y: (s.p.y + s.q.y) / 2 };
      if (frontLine(m)) front += s.length;
    }
  }
  return { area: polygonArea(poly), perimeter: polygonPerimeter(poly), sides, front, centroid: polygonCentroid(poly), vertices: pts };
}

/** Verificações da Lei 6.766/1979. */
export function checkLot(lot, o = {}) {
  const minA = o.minArea ?? LAND_USE.minLotArea.value;
  const minF = o.minFront ?? LAND_USE.minLotFront.value;
  const issues = [];
  if (lot.area < minA - 1e-6) issues.push(`Área ${lot.area.toFixed(2).replace('.', ',')} m² abaixo do mínimo de ${minA} m² (Lei 6.766/1979, art. 4º, II).`);
  if (lot.front != null && lot.front > 0 && lot.front < minF - 1e-6) issues.push(`Frente ${lot.front.toFixed(2).replace('.', ',')} m abaixo do mínimo de ${minF} m.`);
  return issues;
}

/** Quadro de áreas do loteamento. */
export function areaTable({ glebaArea, lotsArea, roadsArea, greenArea = 0, institutionalArea = 0, appArea = 0 }) {
  const rows = [
    { item: 'Área dos lotes', area: lotsArea },
    { item: 'Sistema viário', area: roadsArea },
    { item: 'Áreas verdes / espaços livres', area: greenArea },
    { item: 'Áreas institucionais (equipamentos públicos)', area: institutionalArea },
    { item: 'Áreas de preservação permanente (APP)', area: appArea },
  ];
  const sumParts = rows.reduce((s, r) => s + r.area, 0);
  const rest = glebaArea - sumParts;
  if (Math.abs(rest) > 0.5) rows.push({ item: 'Remanescente / não classificado', area: rest });
  return {
    rows: rows.map((r) => ({ ...r, pct: glebaArea > 0 ? r.area / glebaArea : 0 })),
    total: glebaArea,
    publicPct: glebaArea > 0 ? (roadsArea + greenArea + institutionalArea) / glebaArea : 0,
  };
}
