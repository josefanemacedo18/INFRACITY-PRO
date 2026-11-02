// URBIS - alinhamento horizontal (eixo)
// Definição por PIs (pontos de interseção). Cada PI interno tem raio R e, opcionalmente,
// comprimento de espiral de transição Ls (clotoide simétrica). Ls = 0 -> curva circular simples.
// Convenções: azimute a partir do Norte, sentido horário. Afastamento positivo = lado direito (LD).

import { azimuth, dist, dirVec, rightVec, leftVec, moveAz } from './geom.js';
import { normAngle, fmt } from './util.js';

/** Coordenadas locais da clotoide no comprimento l (x ao longo da tangente, y para o lado da curva). */
export function spiralXY(l, R, Ls) {
  if (!(Ls > 0) || !(l > 0)) return { x: Math.max(0, l || 0), y: 0, theta: 0 };
  const th = (l * l) / (2 * R * Ls);
  const t2 = th * th;
  const x = l * (1 - t2 / 10 + (t2 * t2) / 216 - (t2 * t2 * t2) / 9360 + (t2 ** 4) / 685440);
  const y = l * (th / 3 - (th * t2) / 42 + (th * t2 * t2) / 1320 - (th * t2 ** 3) / 75600 + (th * t2 ** 4) / 6894720);
  return { x, y, theta: th };
}

function sideVec(az, dir) { return dir > 0 ? rightVec(az) : leftVec(az); }

function evalElement(el, l) {
  switch (el.type) {
    case 'line': {
      return { x: el.p0.x + Math.sin(el.az) * l, y: el.p0.y + Math.cos(el.az) * l, az: el.az, curv: 0 };
    }
    case 'spiralIn': {
      const s = spiralXY(l, el.R, el.Ls);
      const u = dirVec(el.az0), v = sideVec(el.az0, el.dir);
      return {
        x: el.origin.x + s.x * u.x + s.y * v.x,
        y: el.origin.y + s.x * u.y + s.y * v.y,
        az: el.az0 + el.dir * s.theta,
        curv: (el.dir * l) / (el.R * el.Ls),
      };
    }
    case 'arc': {
      const az = el.az0 + (el.dir * l) / el.R;
      const v = sideVec(az, el.dir);
      return { x: el.center.x - el.R * v.x, y: el.center.y - el.R * v.y, az, curv: el.dir / el.R };
    }
    case 'spiralOut': {
      const m = el.Ls - l;
      const s = spiralXY(m, el.R, el.Ls);
      const u = dirVec(el.az2), v = sideVec(el.az2, el.dir);
      return {
        x: el.origin.x - s.x * u.x + s.y * v.x,
        y: el.origin.y - s.x * u.y + s.y * v.y,
        az: el.az2 - el.dir * s.theta,
        curv: (el.dir * m) / (el.R * el.Ls),
      };
    }
    default:
      throw new Error('Elemento desconhecido: ' + el.type);
  }
}

export class Alignment {
  /**
   * @param {{pis:{x:number,y:number,R?:number,Ls?:number}[], startStation?:number, name?:string}} def
   */
  constructor(def) {
    this.def = def;
    this.name = def.name || 'Eixo';
    this.startStation = Number(def.startStation) || 0;
    this.errors = [];
    this.warnings = [];
    this.elements = [];
    this.curves = [];
    this.tangents = [];
    this._build();
  }

  _build() {
    const raw = (this.def.pis || []).map((p) => ({ x: +p.x, y: +p.y, R: +p.R || 0, Ls: Math.max(0, +p.Ls || 0) }));
    const pis = [];
    for (const p of raw) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const q = pis[pis.length - 1];
      if (q && Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) continue;
      pis.push(p);
    }
    this.pis = pis;
    const n = pis.length;
    if (n < 2) {
      this.errors.push('O eixo precisa de pelo menos 2 pontos.');
      this.length = 0;
      this.endStation = this.startStation;
      return;
    }
    const az = [], segLen = [];
    for (let i = 0; i < n - 1; i++) { az.push(azimuth(pis[i], pis[i + 1])); segLen.push(dist(pis[i], pis[i + 1])); }
    this.azimuths = az;

    const curves = new Array(n).fill(null);
    for (let i = 1; i < n - 1; i++) {
      const d = normAngle(az[i] - az[i - 1]);
      if (Math.abs(d) < 1e-7) continue; // PIs alinhados
      const I = Math.abs(d);
      const dir = d > 0 ? 1 : -1;
      let R = pis[i].R;
      if (!(R > 0)) {
        this.errors.push(`PI-${i}: informe o raio da curva.`);
        R = 1;
      }
      if (I > Math.PI - 1e-4) this.errors.push(`PI-${i}: deflexão próxima de 180°, geometria inválida.`);
      let Ls = pis[i].Ls;
      let ths = Ls > 0 ? Ls / (2 * R) : 0;
      if (2 * ths > I + 1e-12) {
        this.errors.push(`PI-${i}: espiral de ${fmt(Ls)} m é longa demais para a deflexão de ${fmt(I * 180 / Math.PI, 3)}° (θs > Δ/2). Usada curva circular.`);
        Ls = 0; ths = 0;
      }
      const sp = spiralXY(Ls, R, Ls);
      const p = Ls > 0 ? sp.y - R * (1 - Math.cos(ths)) : 0;
      const k = Ls > 0 ? sp.x - R * Math.sin(ths) : 0;
      const T = k + (R + p) * Math.tan(I / 2);
      const Dc = I - 2 * ths;
      const Lc = R * Dc;
      const E = (R + p) / Math.cos(I / 2) - R;
      curves[i] = {
        number: 0, piIndex: i, pi: { x: pis[i].x, y: pis[i].y }, delta: d, I, dir,
        side: dir > 0 ? 'D' : 'E', R, Ls, thetaS: ths, Xs: Ls > 0 ? sp.x : 0, Ys: Ls > 0 ? sp.y : 0,
        p, k, T, Dc, Lc, E, total: Lc + 2 * Ls,
        G20: R > 10 ? 2 * Math.asin(10 / R) * 180 / Math.PI : null,
        azIn: az[i - 1], azOut: az[i],
      };
    }
    let num = 0;
    for (const c of curves) if (c) c.number = ++num;

    // verificação das tangentes
    for (let i = 0; i < n - 1; i++) {
      const used = (curves[i] ? curves[i].T : 0) + (curves[i + 1] ? curves[i + 1].T : 0);
      const free = segLen[i] - used;
      this.tangents.push({ from: i, to: i + 1, length: segLen[i], free, az: az[i] });
      if (free < -1e-6) {
        this.errors.push(`Tangentes sobrepostas entre PI-${i} e PI-${i + 1}: faltam ${fmt(-free)} m. Reduza os raios ou afaste os PIs.`);
      }
    }

    // elementos
    let sta = this.startStation;
    let cursor = { x: pis[0].x, y: pis[0].y };
    const pushLine = (to, azv) => {
      const L = dist(cursor, to);
      if (L > 1e-9) {
        this.elements.push({ type: 'line', sta0: sta, len: L, p0: { ...cursor }, az: azv });
        sta += L;
      }
      cursor = { ...to };
    };
    for (let i = 1; i < n; i++) {
      const c = curves[i];
      if (!c) {
        if (i === n - 1) pushLine(pis[n - 1], az[n - 2]);
        continue;
      }
      const TS = moveAz(pis[i], az[i - 1], -c.T);
      pushLine(TS, az[i - 1]);
      c.TS = TS; c.staTS = sta;
      if (c.Ls > 0) {
        const el = { type: 'spiralIn', sta0: sta, len: c.Ls, origin: TS, az0: az[i - 1], R: c.R, Ls: c.Ls, dir: c.dir, curve: c.number };
        this.elements.push(el);
        sta += c.Ls;
      }
      const azSC = az[i - 1] + c.dir * c.thetaS;
      const SC = c.Ls > 0 ? evalElement(this.elements[this.elements.length - 1], c.Ls) : { ...TS };
      const v = sideVec(azSC, c.dir);
      const center = { x: SC.x + c.R * v.x, y: SC.y + c.R * v.y };
      c.SC = { x: SC.x, y: SC.y }; c.staSC = sta; c.center = center;
      if (c.Lc > 1e-9) {
        this.elements.push({ type: 'arc', sta0: sta, len: c.Lc, center, R: c.R, az0: azSC, dir: c.dir, curve: c.number });
        sta += c.Lc;
      }
      const ST = moveAz(pis[i], az[i], c.T);
      c.staCS = sta;
      if (c.Ls > 0) {
        const el = { type: 'spiralOut', sta0: sta, len: c.Ls, origin: ST, az2: az[i], R: c.R, Ls: c.Ls, dir: c.dir, curve: c.number };
        this.elements.push(el);
        c.CS = (() => { const q = evalElement(el, 0); return { x: q.x, y: q.y }; })();
        sta += c.Ls;
      } else {
        c.CS = { ...ST };
      }
      c.ST = ST; c.staST = sta;
      c.staPI = c.staTS + c.T;
      cursor = { ...ST };
      if (i === n - 1) break;
    }
    this.curves = curves.filter(Boolean);
    this.length = sta - this.startStation;
    this.endStation = sta;

    // continuidade (controle numérico)
    for (let j = 1; j < this.elements.length; j++) {
      const a = this.elements[j - 1], b = this.elements[j];
      const pa = evalElement(a, a.len), pb = evalElement(b, 0);
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 1e-3) {
        this.warnings.push(`Descontinuidade geométrica de ${fmt(Math.hypot(pa.x - pb.x, pa.y - pb.y), 3)} m na estaca ${fmt(b.sta0)} m.`);
      }
    }
    // estacas dos PIs (convenção: PI = TS + T)
    this.piStations = pis.map((_, i) => {
      if (i === 0) return this.startStation;
      if (i === n - 1) return this.endStation;
      const c = curves[i];
      if (c) return c.staPI;
      // PI alinhado: projeta
      return this.stationOffset(pis[i].x, pis[i].y).station;
    });
  }

  get ok() { return this.errors.length === 0; }

  _elementAt(sta) {
    const els = this.elements;
    if (!els.length) return null;
    let lo = 0, hi = els.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (els[mid].sta0 <= sta) lo = mid; else hi = mid - 1;
    }
    return els[lo];
  }

  /** Ponto do eixo na estaca (m). Fora do eixo, extrapola nas tangentes. */
  pointAt(sta) {
    if (!this.elements.length) {
      const p = this.pis[0] || { x: 0, y: 0 };
      return { x: p.x, y: p.y, az: 0, curv: 0 };
    }
    const el = this._elementAt(sta);
    let l = sta - el.sta0;
    if (el === this.elements[0] && l < 0) {
      const q = evalElement(el, 0); // l < 0: recua pela tangente inicial
      return { x: q.x + Math.sin(q.az) * l, y: q.y + Math.cos(q.az) * l, az: q.az, curv: 0 };
    }
    if (el === this.elements[this.elements.length - 1] && l > el.len) {
      const q = evalElement(el, el.len);
      const ex = l - el.len;
      return { x: q.x + Math.sin(q.az) * ex, y: q.y + Math.cos(q.az) * ex, az: q.az, curv: 0 };
    }
    l = Math.max(0, Math.min(el.len, l));
    return evalElement(el, l);
  }

  /** Ponto afastado do eixo: off > 0 lado direito, off < 0 lado esquerdo. */
  offsetPoint(sta, off) {
    const p = this.pointAt(sta);
    return { x: p.x + Math.cos(p.az) * off, y: p.y - Math.sin(p.az) * off, az: p.az };
  }

  /** Lista de pontos ao longo do eixo (polilinha), incluindo início/fim de elementos. */
  sample(step = 5, tol = 0.01, s0 = this.startStation, s1 = this.endStation) {
    const out = [];
    if (!this.elements.length) return out;
    for (const el of this.elements) {
      const a = Math.max(s0, el.sta0), b = Math.min(s1, el.sta0 + el.len);
      if (b < a - 1e-9) continue;
      let h = step;
      if (el.type !== 'line') {
        const R = el.R; // raio mínimo do elemento
        const chord = Math.sqrt(8 * R * tol);
        h = Math.min(step, Math.max(0.05, chord));
      } else {
        h = Math.max(step, 1e9); // retas: só extremos
      }
      const L = b - a;
      const nseg = Math.max(1, Math.ceil(L / h - 1e-9));
      for (let i = 0; i <= nseg; i++) {
        const s = a + (L * i) / nseg;
        if (out.length && Math.abs(out[out.length - 1].s - s) < 1e-9) continue;
        const q = evalElement(el, s - el.sta0);
        out.push({ s, x: q.x, y: q.y, az: q.az });
      }
    }
    return out;
  }

  /** Linha paralela ao eixo com afastamento constante. */
  offsetLine(off, step = 2, s0 = this.startStation, s1 = this.endStation) {
    return this.sample(step, 0.005, s0, s1).map((p) => ({ s: p.s, x: p.x + Math.cos(p.az) * off, y: p.y - Math.sin(p.az) * off }));
  }

  /** Projeção de um ponto no eixo: estaca e afastamento. */
  stationOffset(x, y) {
    if (!this.elements.length) return { station: this.startStation, offset: 0, dist: Infinity, x, y };
    if (!this._coarse) this._coarse = this.sample(2, 0.05);
    const pts = this._coarse;
    let best = Infinity, bs = this.startStation;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + t * dx, py = a.y + t * dy;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) { best = d; bs = a.s + t * (b.s - a.s); }
    }
    // refinamento (Newton sobre a tangente)
    let s = bs;
    for (let it = 0; it < 8; it++) {
      const p = this.pointAt(s);
      const ds = (x - p.x) * Math.sin(p.az) + (y - p.y) * Math.cos(p.az);
      s = Math.max(this.startStation, Math.min(this.endStation, s + ds));
      if (Math.abs(ds) < 1e-7) break;
    }
    const p = this.pointAt(s);
    const off = (x - p.x) * Math.cos(p.az) - (y - p.y) * Math.sin(p.az);
    return { station: s, offset: off, dist: Math.hypot(x - p.x, y - p.y), x: p.x, y: p.y, az: p.az };
  }

  /** Pontos notáveis (PP, TS, SC, CS, ST, PC, PT, PF). */
  keyPoints() {
    const out = [{ s: this.startStation, label: 'PP' }];
    for (const c of this.curves) {
      if (c.Ls > 0) {
        out.push({ s: c.staTS, label: 'TS', curve: c.number });
        out.push({ s: c.staSC, label: 'SC', curve: c.number });
        out.push({ s: c.staCS, label: 'CS', curve: c.number });
        out.push({ s: c.staST, label: 'ST', curve: c.number });
      } else {
        out.push({ s: c.staTS, label: 'PC', curve: c.number });
        out.push({ s: c.staST, label: 'PT', curve: c.number });
      }
    }
    out.push({ s: this.endStation, label: 'PF' });
    return out;
  }

  /** Estacas inteiras (múltiplos do intervalo). */
  regularStations(interval = 20) {
    const out = [];
    const first = Math.ceil((this.startStation - 1e-9) / interval) * interval;
    for (let s = first; s <= this.endStation + 1e-9; s += interval) out.push(Math.min(s, this.endStation));
    return out;
  }

  /** Curvatura com sinal na estaca (1/m; positiva = curva à direita). */
  curvatureAt(sta) { return this.pointAt(sta).curv; }

  /** Curva horizontal que contém a estaca (inclui espirais). */
  curveAt(sta) {
    for (const c of this.curves) if (sta >= c.staTS - 1e-9 && sta <= c.staST + 1e-9) return c;
    return null;
  }
}

export function buildAlignment(def) { return new Alignment(def); }
