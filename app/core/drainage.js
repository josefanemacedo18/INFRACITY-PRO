// URBIS - drenagem pluvial: chuvas intensas, método racional, sarjetas (Izzard) e galerias (Manning)

import { DRAINAGE } from './norms/brasil.js';
import { interpTable } from './util.js';

/** Intensidade (mm/h) pela equação IDF: i = K·T^a / (t + b)^c, com t em minutos. */
export function idfIntensity(idf, T, tMin) {
  return (idf.K * Math.pow(T, idf.a)) / Math.pow(tMin + idf.b, idf.c);
}

/** Tempo de concentração de Kirpich (min). L em km, H (desnível) em m. */
export function kirpich(Lkm, Hm) {
  if (!(Lkm > 0) || !(Hm > 0)) return NaN;
  return 57 * Math.pow((Lkm ** 3) / Hm, 0.385);
}

/** Vazão pelo método racional (m³/s). i em mm/h, A em m². */
export function rationalQ(C, i, Am2) { return (C * i * Am2) / 3.6e6; }

/** Fator de redução da capacidade da sarjeta em função da declividade (prática DAEE/CETESB). */
const FR_TABLE = [[0.004, 0.50], [0.01, 0.80], [0.03, 0.80], [0.05, 0.50], [0.06, 0.40], [0.08, 0.27], [0.10, 0.20]];
export function gutterReduction(I) { return interpTable(FR_TABLE, Math.abs(I)); }

/**
 * Capacidade teórica da sarjeta pela fórmula de Izzard (m³/s).
 * Q = 0,375 · (z/n) · I^(1/2) · y^(8/3), z = 1 / declividade transversal.
 */
export function izzardQ({ crossSlope, n = 0.016, I, y }) {
  const z = 1 / Math.max(1e-4, Math.abs(crossSlope));
  return 0.375 * (z / n) * Math.sqrt(Math.max(Math.abs(I), 1e-6)) * Math.pow(y, 8 / 3);
}

/**
 * Verificação de sarjetas ao longo de trechos do greide.
 * @param {{segments:{s0,s1,grade}[], crossSlope, n, yMax, widthContrib, C, i}} o
 * @returns {{s0,s1,grade,Qcap,Qadm,qUnit,Lcrit,velocity,spread,ok}[]}
 */
export function gutterCheck(o) {
  const out = [];
  for (const seg of o.segments) {
    const I = Math.abs(seg.grade);
    const Qcap = izzardQ({ crossSlope: o.crossSlope, n: o.n, I, y: o.yMax });
    const FR = gutterReduction(I);
    const Qadm = Qcap * FR;
    const qUnit = rationalQ(o.C, o.i, o.widthContrib); // m³/s por metro de via
    const Lcrit = qUnit > 0 ? Qadm / qUnit : Infinity;
    const z = 1 / Math.max(1e-4, Math.abs(o.crossSlope));
    const area = 0.5 * z * o.yMax * o.yMax;
    const len = seg.s1 - seg.s0;
    const Qend = qUnit * len;
    out.push({ ...seg, Qcap, FR, Qadm, qUnit, Lcrit, velocity: Qcap / area, spread: z * o.yMax, Qend, needsInlet: Qend > Qadm, inlets: Qadm > 0 ? Math.max(0, Math.ceil(len / Lcrit - 1e-9)) : 0 });
  }
  return out;
}

/** Elementos hidráulicos de seção circular parcialmente cheia. */
export function circularFlow(D, yD, n, S) {
  const y = Math.min(1, Math.max(1e-4, yD)) * D;
  const theta = 2 * Math.acos(1 - (2 * y) / D);
  const A = (D * D / 8) * (theta - Math.sin(theta));
  const P = (D * theta) / 2;
  const R = A / P;
  const V = (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(Math.max(S, 0));
  return { A, P, R, V, Q: V * A, theta };
}

/** Lâmina relativa y/D para uma vazão Q (bisseção). */
export function depthRatioFor(Q, D, n, S) {
  const full = circularFlow(D, 0.938, n, S).Q; // máxima vazão ocorre em ~0,938 D
  if (Q > full) return null;
  let lo = 1e-4, hi = 0.938;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (circularFlow(D, mid, n, S).Q < Q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Escolhe o menor diâmetro comercial que atende a vazão com lâmina máxima. */
export function designPipe(Q, S, opts = {}) {
  const n = opts.n ?? DRAINAGE.manning['Tubo de concreto'];
  const maxYD = opts.maxYD ?? DRAINAGE.pipeMaxDepthRatio.value;
  const minD = opts.minD ?? DRAINAGE.pipeMinDiameter.value;
  const diameters = (opts.diameters || DRAINAGE.pipeDiameters.values).filter((d) => d >= minD - 1e-9);
  for (const D of diameters) {
    const cap = circularFlow(D, maxYD, n, S).Q;
    if (cap >= Q) {
      const yD = depthRatioFor(Q, D, n, S);
      const f = circularFlow(D, yD, n, S);
      return { D, yD, V: f.V, Qcap: cap, ok: true };
    }
  }
  const D = diameters[diameters.length - 1];
  return { D, yD: null, V: null, Qcap: circularFlow(D, maxYD, n, S).Q, ok: false };
}

/**
 * Dimensionamento de rede de galerias (árvore). Nós: {id, x, y, zTerreno, areaLocal (m²), C}.
 * Trechos: {id, from, to, length}. Calcula em ordem de montante para jusante.
 */
export function designNetwork(net, o) {
  const nodes = new Map(net.nodes.map((nd) => [nd.id, { ...nd }]));
  const links = net.links.map((l) => ({ ...l }));
  const byFrom = new Map(links.map((l) => [l.from, l]));
  const upstream = new Map();
  for (const l of links) { if (!upstream.has(l.to)) upstream.set(l.to, []); upstream.get(l.to).push(l); }
  const cover = o.cover ?? DRAINAGE.minCover.value;
  const sMin = o.sMin ?? 0.005;
  const tcMin = o.tcMin ?? DRAINAGE.tcMin.value;
  const n = o.n ?? DRAINAGE.manning['Tubo de concreto'];
  const vmin = o.vmin ?? DRAINAGE.pipeVmin.value, vmax = o.vmax ?? DRAINAGE.pipeVmax.value;
  // ordem topológica (de montante para jusante)
  const indeg = new Map();
  for (const l of links) indeg.set(l.from, (indeg.get(l.from) || 0));
  const order = [];
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const u of upstream.get(id) || []) visit(u.from);
    const l = byFrom.get(id);
    if (l) order.push(l);
  };
  const outlets = [...nodes.keys()].filter((id) => !byFrom.has(id));
  for (const id of outlets) visit(id);
  const result = [];
  const state = new Map(); // nó -> {A·C acumulado, tc, cotaFundo}
  for (const l of order) {
    const up = nodes.get(l.from), dn = nodes.get(l.to);
    const ups = (upstream.get(l.from) || []).map((u) => state.get(u.id)).filter(Boolean);
    const acLocal = (up.areaLocal || 0) * (up.C ?? 0.7);
    const acAcc = acLocal + ups.reduce((s, u) => s + u.acOut, 0);
    const tc = Math.max(tcMin, ...ups.map((u) => u.tcOut));
    const i = idfIntensity(o.idf, o.T, tc);
    const Q = rationalQ(1, i, acAcc);
    const groundSlope = (up.z - dn.z) / l.length;
    let S = Math.max(sMin, groundSlope);
    // o diâmetro nunca diminui para jusante
    const minD = Math.max(o.minD ?? DRAINAGE.pipeMinDiameter.value, ...ups.map((u) => u.D));
    let pipe = designPipe(Q, S, { n, minD, maxYD: o.maxYD });
    // ajusta declividade para velocidade mínima
    let guard = 0;
    while (pipe.ok && pipe.V < vmin && guard++ < 40) { S *= 1.15; pipe = designPipe(Q, S, { n, minD, maxYD: o.maxYD }); }
    const upInvertCover = up.z - cover - pipe.D;
    const upInvertFromUps = ups.length ? Math.min(...ups.map((u) => u.invertOut)) : Infinity;
    const invUp = Math.min(upInvertCover, upInvertFromUps);
    let invDn = invUp - S * l.length;
    const dnMax = dn.z - cover - pipe.D;
    if (invDn > dnMax) { invDn = dnMax; S = (invUp - invDn) / l.length; pipe = designPipe(Q, S, { n, minD, maxYD: o.maxYD }); }
    const travel = pipe.V ? l.length / pipe.V / 60 : 0;
    const rec = {
      id: l.id, from: l.from, to: l.to, length: l.length, areaAcc: acAcc, tc, i, Q,
      S, D: pipe.D, yD: pipe.yD, V: pipe.V, Qcap: pipe.Qcap, ok: pipe.ok,
      invUp, invDn, depthUp: up.z - invUp, depthDn: dn.z - invDn, travel,
      warnings: [],
    };
    if (!pipe.ok) rec.warnings.push('Vazão excede o maior diâmetro disponível.');
    if (pipe.V && pipe.V > vmax) rec.warnings.push(`Velocidade ${pipe.V.toFixed(2)} m/s acima da máxima.`);
    if (pipe.V && pipe.V < vmin) rec.warnings.push(`Velocidade ${pipe.V.toFixed(2)} m/s abaixo da mínima.`);
    state.set(l.id, { acOut: acAcc, tcOut: tc + travel, invertOut: invDn, D: pipe.D });
    result.push(rec);
  }
  return result;
}

/** Gera rede ao longo do eixo: PVs igualmente espaçados (até 'spacing' m) no lado indicado. */
export function networkAlongAlignment(alignment, profile, surface, o) {
  const spacing = o.spacing || 50;
  const offset = o.offset ?? 0;
  const s0 = alignment.startStation, s1 = alignment.endStation;
  const nSeg = Math.max(1, Math.ceil((s1 - s0) / spacing - 1e-9));
  const stations = [];
  for (let k = 0; k <= nSeg; k++) stations.push(s0 + ((s1 - s0) * k) / nSeg);
  const dir = o.flowToEnd ?? true;
  const list = dir ? stations : [...stations].reverse();
  const nodes = list.map((s, k) => {
    const p = alignment.offsetPoint(s, offset);
    let z = profile ? profile.elevationAt(s) : (surface ? surface.elevationAt(p.x, p.y) : 0);
    if (!Number.isFinite(z) && surface) z = surface.elevationAt(p.x, p.y) ?? 0;
    const prev = list[k - 1], next = list[k + 1];
    const half = ((prev != null ? Math.abs(s - prev) : 0) + (next != null ? Math.abs(next - s) : 0)) / 2;
    return { id: 'PV-' + String(k + 1).padStart(2, '0'), s, x: p.x, y: p.y, z, areaLocal: half * (o.widthContrib || 10), C: o.C ?? 0.75 };
  });
  nodes[nodes.length - 1].areaLocal = nodes[nodes.length - 1].areaLocal / 2;
  const links = [];
  for (let k = 0; k < nodes.length - 1; k++) links.push({ id: `T-${k + 1}`, from: nodes[k].id, to: nodes[k + 1].id, length: Math.abs(nodes[k + 1].s - nodes[k].s) });
  return { nodes, links };
}
