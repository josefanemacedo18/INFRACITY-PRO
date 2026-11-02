// URBIS - perfil longitudinal (greide)
// PIVs com curvas verticais parabólicas simétricas de comprimento L.

import { fmt, fmtPct } from './util.js';
import { fmtStation } from './util.js';

export class Profile {
  /** @param {{pvis:{s:number,z:number,L?:number}[]}} def */
  constructor(def, opts = {}) {
    this.def = def;
    this.interval = opts.interval || 20;
    this.errors = [];
    this.warnings = [];
    this._build();
  }

  _build() {
    const pv = (this.def.pvis || [])
      .map((p) => ({ s: +p.s, z: +p.z, L: Math.max(0, +p.L || 0) }))
      .filter((p) => Number.isFinite(p.s) && Number.isFinite(p.z))
      .sort((a, b) => a.s - b.s);
    this.pvis = pv;
    const n = pv.length;
    this.grades = [];
    this.curves = [];
    if (n < 2) {
      this.errors.push('O greide precisa de pelo menos 2 PIVs.');
      return;
    }
    for (let i = 0; i < n - 1; i++) {
      const ds = pv[i + 1].s - pv[i].s;
      if (ds < 1e-6) {
        this.errors.push(`PIVs ${i} e ${i + 1} na mesma estaca.`);
        this.grades.push(0);
      } else this.grades.push((pv[i + 1].z - pv[i].z) / ds);
    }
    pv[0].L = 0; pv[n - 1].L = 0;
    for (let i = 1; i < n - 1; i++) {
      const L = pv[i].L;
      const g1 = this.grades[i - 1], g2 = this.grades[i];
      const A = g2 - g1; // decimal
      if (L <= 0) {
        if (Math.abs(A) > 1e-9) this.warnings.push(`PIV-${i}: sem curva vertical (L = 0).`);
        continue;
      }
      const sPCV = pv[i].s - L / 2, sPTV = pv[i].s + L / 2;
      const zPCV = pv[i].z - g1 * L / 2, zPTV = pv[i].z + g2 * L / 2;
      const e = (A * L) / 8; // flecha (m), positiva = côncava
      let extreme = null;
      if (Math.abs(A) > 1e-12) {
        const x = -g1 * L / A;
        if (x > 0 && x < L) extreme = { s: sPCV + x, z: zPCV + g1 * x + (A / (2 * L)) * x * x };
      }
      this.curves.push({
        number: this.curves.length + 1, pviIndex: i, s: pv[i].s, z: pv[i].z, g1, g2, A, L,
        K: Math.abs(A) > 1e-12 ? L / Math.abs(A * 100) : Infinity,
        type: A < 0 ? 'convexa' : 'côncava',
        sPCV, zPCV, sPTV, zPTV, e, extreme,
      });
    }
    // sobreposição de curvas
    for (let i = 0; i < n - 1; i++) {
      const endPrev = pv[i].s + (i > 0 ? pv[i].L / 2 : 0);
      const startNext = pv[i + 1].s - (i + 1 < n - 1 ? pv[i + 1].L / 2 : 0);
      if (startNext < endPrev - 1e-6) {
        this.errors.push(`Curvas verticais sobrepostas entre PIV-${i} e PIV-${i + 1} (faltam ${fmt(endPrev - startNext)} m). Reduza L ou afaste os PIVs.`);
      }
    }
  }

  get ok() { return this.errors.length === 0; }
  get startStation() { return this.pvis.length ? this.pvis[0].s : 0; }
  get endStation() { return this.pvis.length ? this.pvis[this.pvis.length - 1].s : 0; }

  _curveAt(s) {
    for (const c of this.curves) if (s >= c.sPCV - 1e-9 && s <= c.sPTV + 1e-9) return c;
    return null;
  }

  _tangentIndex(s) {
    const pv = this.pvis;
    let i = 0;
    while (i < pv.length - 2 && s > pv[i + 1].s) i++;
    return i;
  }

  /** Cota do greide na estaca s. */
  elevationAt(s) {
    const pv = this.pvis;
    if (pv.length < 2) return pv.length ? pv[0].z : NaN;
    const c = this._curveAt(s);
    if (c) {
      const x = s - c.sPCV;
      return c.zPCV + c.g1 * x + (c.A / (2 * c.L)) * x * x;
    }
    const i = this._tangentIndex(s);
    return pv[i].z + this.grades[i] * (s - pv[i].s);
  }

  /** Declividade (decimal) do greide na estaca s. */
  gradeAt(s) {
    const pv = this.pvis;
    if (pv.length < 2) return 0;
    const c = this._curveAt(s);
    if (c) return c.g1 + (c.A / c.L) * (s - c.sPCV);
    return this.grades[this._tangentIndex(s)];
  }

  /** Pontos notáveis do greide. */
  keyPoints() {
    const out = [];
    const pv = this.pvis;
    pv.forEach((p, i) => {
      if (i === 0) out.push({ s: p.s, label: 'Início', z: p.z });
      else if (i === pv.length - 1) out.push({ s: p.s, label: 'Fim', z: p.z });
    });
    for (const c of this.curves) {
      out.push({ s: c.sPCV, label: 'PCV', z: c.zPCV, curve: c.number });
      out.push({ s: c.s, label: 'PIV', z: c.z, curve: c.number });
      out.push({ s: c.sPTV, label: 'PTV', z: c.zPTV, curve: c.number });
    }
    return out.sort((a, b) => a.s - b.s);
  }

  /** Polilinha do greide para desenho. */
  sample(step = 2) {
    const pv = this.pvis;
    if (pv.length < 2) return [];
    const out = [];
    const s0 = pv[0].s, s1 = pv[pv.length - 1].s;
    const marks = new Set([s0, s1]);
    for (const c of this.curves) { marks.add(c.sPCV); marks.add(c.sPTV); }
    for (const p of pv) marks.add(p.s);
    const list = [...marks].sort((a, b) => a - b);
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1];
      const inCurve = this._curveAt((a + b) / 2);
      const nseg = inCurve ? Math.max(2, Math.ceil((b - a) / step)) : 1;
      for (let j = 0; j < nseg; j++) {
        const s = a + ((b - a) * j) / nseg;
        out.push({ s, z: this.elevationAt(s) });
      }
    }
    out.push({ s: s1, z: this.elevationAt(s1) });
    return out;
  }

  describe(interval = this.interval) {
    return this.curves.map((c) =>
      `PIV ${c.number}: est. ${fmtStation(c.s, interval)}, cota ${fmt(c.z, 3)}, i1 = ${fmtPct(c.g1)}, i2 = ${fmtPct(c.g2)}, L = ${fmt(c.L)} m, K = ${fmt(c.K, 1)} (${c.type})`);
  }
}

export function buildProfile(def, opts) { return new Profile(def, opts); }

/**
 * Greide automático: segue o terreno suavizado respeitando rampa máxima e K mínimo.
 * ground: [{s,z}] (amostrado). Retorna definição {pvis}.
 */
export function autoProfile(ground, opts = {}) {
  const pts = ground.filter((p) => Number.isFinite(p.z));
  if (pts.length < 2) return { pvis: [] };
  const s0 = pts[0].s, s1 = pts[pts.length - 1].s;
  const total = s1 - s0;
  const spacing = opts.spacing || Math.max(60, Math.min(200, total / 4));
  const maxG = opts.maxGrade ?? 0.08;
  const minG = (opts.minGrade ?? 0.005) * 1.02; // margem para o arredondamento das cotas
  const kCrest = opts.kCrest ?? 10, kSag = opts.kSag ?? 10;
  const lift = opts.lift ?? 0; // elevação adicional do greide sobre o terreno
  const zAt = (s) => {
    // média do terreno numa janela
    const w = spacing / 2;
    let sz = 0, c = 0;
    for (const p of pts) if (Math.abs(p.s - s) <= w) { sz += p.z; c++; }
    if (c) return sz / c;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.s - s) < Math.abs(best.s - s)) best = p;
    return best.z;
  };
  const nInt = Math.max(1, Math.round(total / spacing));
  const pvis = [];
  for (let i = 0; i <= nInt; i++) {
    const s = s0 + (total * i) / nInt;
    let z = (i === 0 || i === nInt) ? nearestZ(pts, s) : zAt(s);
    pvis.push({ s, z: z + lift, L: 0 });
  }
  // limita rampas
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < pvis.length; i++) {
      const ds = pvis[i].s - pvis[i - 1].s;
      let g = (pvis[i].z - pvis[i - 1].z) / ds;
      if (g > maxG) pvis[i].z = pvis[i - 1].z + maxG * ds;
      if (g < -maxG) pvis[i].z = pvis[i - 1].z - maxG * ds;
      g = (pvis[i].z - pvis[i - 1].z) / ds;
      if (Math.abs(g) < minG) pvis[i].z = pvis[i - 1].z + Math.sign(g || 1) * minG * ds;
    }
  }
  // remove PIVs quase alinhados
  const clean = [pvis[0]];
  for (let i = 1; i < pvis.length - 1; i++) {
    const a = clean[clean.length - 1], b = pvis[i], c = pvis[i + 1];
    const g1 = (b.z - a.z) / (b.s - a.s), g2 = (c.z - b.z) / (c.s - b.s);
    if (Math.abs(g2 - g1) > 0.002) clean.push(b);
  }
  clean.push(pvis[pvis.length - 1]);
  // curvas verticais pelo K mínimo, limitado pelo espaço disponível
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1], b = clean[i], c = clean[i + 1];
    const g1 = (b.z - a.z) / (b.s - a.s), g2 = (c.z - b.z) / (c.s - b.s);
    const A = Math.abs(g2 - g1) * 100;
    const K = g2 < g1 ? kCrest : kSag;
    let L = Math.max(opts.minL ?? 20, Math.ceil((K * A) / 10) * 10);
    const room = Math.min(b.s - a.s, c.s - b.s);
    L = Math.min(L, Math.floor(room * 0.9 / 10) * 10 || room * 0.9);
    b.L = Math.max(0, L);
  }
  return { pvis: clean.map((p) => ({ s: round3(p.s), z: round3(p.z), L: p.L })) };
}

function nearestZ(pts, s) {
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.s - s) < Math.abs(best.s - s)) best = p;
  return best.z;
}
function round3(v) { return Math.round(v * 1000) / 1000; }
