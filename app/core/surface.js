// URBIS - superfície TIN (Modelo Digital de Terreno)
// Triangulação de Delaunay com linhas de quebra (restrições), índice espacial em grade,
// interpolação de cotas, curvas de nível e cortes exatos (interseção com arestas do TIN).

import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';

const nextHE = (e) => (e % 3 === 2 ? e - 2 : e + 1);

export class Surface {
  /**
   * @param {object} o
   * @param {{x:number,y:number,z:number}[]} o.points
   * @param {{x:number,y:number,z:number}[][]} [o.breaklines]
   * @param {number} [o.maxEdge] remove triângulos longos da borda (m); 0 = não remove
   * @param {{x:number,y:number}[]} [o.boundary] contorno externo opcional
   */
  constructor(o = {}) {
    this.name = o.name || 'Terreno';
    this.id = o.id || null;
    this.maxEdge = +o.maxEdge || 0;
    this.boundary = o.boundary || null;
    this.sourcePoints = o.points || [];
    this.sourceBreaklines = o.breaklines || [];
    this.warnings = [];
    this._build();
  }

  _build() {
    // 1) junta pontos e vértices das linhas de quebra, removendo duplicados (tolerância 1 mm)
    const xs = [], ys = [], zs = [];
    const index = new Map();
    let dup = 0, dupConflict = 0;
    const add = (p) => {
      const x = +p.x, y = +p.y, z = +p.z;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
      const key = Math.round(x * 1000) + '_' + Math.round(y * 1000);
      const found = index.get(key);
      if (found !== undefined) {
        dup++;
        if (Math.abs(zs[found] - z) > 0.01) dupConflict++;
        return found;
      }
      const i = xs.length;
      xs.push(x); ys.push(y); zs.push(z);
      index.set(key, i);
      return i;
    };
    for (const p of this.sourcePoints) add(p);
    const constraints = [];
    for (const bl of this.sourceBreaklines) {
      let prev = -1;
      for (const v of bl) {
        const i = add(v);
        if (i >= 0 && prev >= 0 && i !== prev) constraints.push([prev, i]);
        if (i >= 0) prev = i;
      }
    }
    if (dup) this.warnings.push(`${dup} ponto(s) duplicado(s) ignorado(s)${dupConflict ? `, ${dupConflict} com cotas diferentes (mantida a primeira)` : ''}.`);
    const n = xs.length;
    this.n = n;
    if (n < 3) {
      this.warnings.push('São necessários pelo menos 3 pontos para gerar a superfície.');
      this._empty();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
    }
    this.ox = minX; this.oy = minY;
    const coords = new Float64Array(n * 2);
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) { coords[2 * i] = xs[i] - minX; coords[2 * i + 1] = ys[i] - minY; z[i] = zs[i]; }
    this.coords = coords; this.z = z;

    // 2) triangulação
    let del;
    try { del = new Delaunator(coords); } catch (err) {
      this.warnings.push('Falha na triangulação: ' + err.message);
      this._empty();
      return;
    }
    if (!del.triangles.length) {
      this.warnings.push('Os pontos são colineares; não foi possível triangular.');
      this._empty();
      return;
    }
    // 3) linhas de quebra
    this.constrained = 0;
    let failed = 0;
    if (constraints.length) {
      const con = new Constrainautor(del);
      for (const [a, b] of constraints) {
        try { con.constrainOne(a, b); this.constrained++; } catch { failed++; }
      }
      if (failed) this.warnings.push(`${failed} segmento(s) de linha de quebra ignorado(s) (cruzam outras linhas ou passam sobre pontos).`);
      this._isConstrained = (e) => con.isConstrained(e);
    } else {
      this._isConstrained = () => false;
    }
    this.triangles = del.triangles;
    this.halfedges = del.halfedges;
    const nt = this.triangles.length / 3;
    this.active = new Uint8Array(nt).fill(1);

    // 4) contorno opcional e remoção de triângulos longos na borda
    if (this.boundary && this.boundary.length >= 3) this._clipToBoundary(this.boundary);
    if (this.maxEdge > 0) this._peelLongEdges(this.maxEdge);

    // 5) estatísticas e índice
    let area = 0, nAct = 0;
    const used = new Uint8Array(n);
    const T = this.triangles;
    for (let t = 0; t < nt; t++) {
      if (!this.active[t]) continue;
      nAct++;
      const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
      used[a] = used[b] = used[c] = 1;
      area += Math.abs((coords[2 * b] - coords[2 * a]) * (coords[2 * c + 1] - coords[2 * a + 1]) - (coords[2 * c] - coords[2 * a]) * (coords[2 * b + 1] - coords[2 * a + 1])) / 2;
    }
    for (let i = 0; i < n; i++) if (used[i]) { if (z[i] < minZ) minZ = z[i]; if (z[i] > maxZ) maxZ = z[i]; }
    this.stats = { points: n, triangles: nAct, area, minZ, maxZ, minX, minY, maxX, maxY, breaklineSegments: this.constrained };
    this._buildGrid();
  }

  _empty() {
    this.coords = new Float64Array(0); this.z = new Float64Array(0);
    this.triangles = new Uint32Array(0); this.halfedges = new Int32Array(0);
    this.active = new Uint8Array(0);
    this.ox = 0; this.oy = 0;
    this.stats = { points: this.n || 0, triangles: 0, area: 0, minZ: NaN, maxZ: NaN, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this.grid = null;
  }

  _triCentroid(t) {
    const T = this.triangles, C = this.coords;
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    return { x: (C[2 * a] + C[2 * b] + C[2 * c]) / 3, y: (C[2 * a + 1] + C[2 * b + 1] + C[2 * c + 1]) / 3 };
  }

  _clipToBoundary(poly) {
    const lp = poly.map((p) => ({ x: p.x - this.ox, y: p.y - this.oy }));
    const nt = this.triangles.length / 3;
    for (let t = 0; t < nt; t++) {
      const c = this._triCentroid(t);
      if (!pip(c, lp)) this.active[t] = 0;
    }
  }

  _edgeLen(e) {
    const T = this.triangles, C = this.coords;
    const a = T[e], b = T[nextHE(e)];
    return Math.hypot(C[2 * b] - C[2 * a], C[2 * b + 1] - C[2 * a + 1]);
  }

  _isBoundaryEdge(e) {
    const h = this.halfedges[e];
    return h === -1 || !this.active[Math.floor(h / 3)];
  }

  _peelLongEdges(maxEdge) {
    const nt = this.triangles.length / 3;
    const queue = [];
    for (let t = 0; t < nt; t++) if (this.active[t]) queue.push(t);
    let removed = 0;
    while (queue.length) {
      const t = queue.pop();
      if (!this.active[t]) continue;
      let remove = false;
      for (let k = 0; k < 3; k++) {
        const e = 3 * t + k;
        if (this._isBoundaryEdge(e) && !this._isConstrained(e) && this._edgeLen(e) > maxEdge) { remove = true; break; }
      }
      if (remove) {
        this.active[t] = 0; removed++;
        for (let k = 0; k < 3; k++) {
          const h = this.halfedges[3 * t + k];
          if (h >= 0) { const nt2 = Math.floor(h / 3); if (this.active[nt2]) queue.push(nt2); }
        }
      }
    }
    if (removed) this.warnings.push(`${removed} triângulo(s) longo(s) removido(s) da borda (aresta > ${maxEdge} m).`);
  }

  _buildGrid() {
    const T = this.triangles, C = this.coords;
    const nt = T.length / 3;
    const w = this.stats.maxX - this.stats.minX, h = this.stats.maxY - this.stats.minY;
    const nAct = Math.max(1, this.stats.triangles);
    let cell = Math.sqrt(Math.max(w * h, 1) / nAct) * 1.5;
    if (!(cell > 0)) cell = 1;
    const nx = Math.max(1, Math.min(4096, Math.ceil(w / cell) + 1));
    const ny = Math.max(1, Math.min(4096, Math.ceil(h / cell) + 1));
    const cx = (w || 1) / (nx - 0.5 || 1), cy = (h || 1) / (ny - 0.5 || 1);
    const csx = Math.max(cx, 1e-6), csy = Math.max(cy, 1e-6);
    const counts = new Int32Array(nx * ny + 1);
    const forCells = (t, fn) => {
      const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
      const x0 = Math.min(C[2 * a], C[2 * b], C[2 * c]), x1 = Math.max(C[2 * a], C[2 * b], C[2 * c]);
      const y0 = Math.min(C[2 * a + 1], C[2 * b + 1], C[2 * c + 1]), y1 = Math.max(C[2 * a + 1], C[2 * b + 1], C[2 * c + 1]);
      const i0 = Math.max(0, Math.floor(x0 / csx)), i1 = Math.min(nx - 1, Math.floor(x1 / csx));
      const j0 = Math.max(0, Math.floor(y0 / csy)), j1 = Math.min(ny - 1, Math.floor(y1 / csy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * nx + i);
    };
    for (let t = 0; t < nt; t++) if (this.active[t]) forCells(t, (k) => counts[k + 1]++);
    for (let k = 0; k < nx * ny; k++) counts[k + 1] += counts[k];
    const items = new Int32Array(counts[nx * ny]);
    const fill = counts.slice(0, nx * ny);
    for (let t = 0; t < nt; t++) if (this.active[t]) forCells(t, (k) => { items[fill[k]++] = t; });
    this.grid = { nx, ny, csx, csy, start: counts, items };
    this._stamp = new Int32Array(nt);
    this._heStamp = new Int32Array(T.length);
    this._query = 0;
  }

  /** Triângulo que contém (x,y) absoluto, com coordenadas baricêntricas. */
  locate(x, y) {
    const g = this.grid;
    if (!g) return null;
    const lx = x - this.ox, ly = y - this.oy;
    const i = Math.floor(lx / g.csx), j = Math.floor(ly / g.csy);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
    const k = j * g.nx + i;
    const T = this.triangles, C = this.coords;
    for (let p = g.start[k]; p < g.start[k + 1]; p++) {
      const t = g.items[p];
      const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
      const ax = C[2 * a], ay = C[2 * a + 1], bx = C[2 * b], by = C[2 * b + 1], cx = C[2 * c], cy = C[2 * c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (d === 0) continue;
      const l1 = ((by - cy) * (lx - cx) + (cx - bx) * (ly - cy)) / d;
      const l2 = ((cy - ay) * (lx - cx) + (ax - cx) * (ly - cy)) / d;
      const l3 = 1 - l1 - l2;
      const eps = -1e-9;
      if (l1 >= eps && l2 >= eps && l3 >= eps) return { t, a, b, c, l1, l2, l3 };
    }
    return null;
  }

  /** Cota interpolada (plano do triângulo). null fora da superfície. */
  elevationAt(x, y) {
    const r = this.locate(x, y);
    if (!r) return null;
    return r.l1 * this.z[r.a] + r.l2 * this.z[r.b] + r.l3 * this.z[r.c];
  }

  /** Declividade (decimal) e direção de máxima descida no ponto. */
  slopeAt(x, y) {
    const r = this.locate(x, y);
    if (!r) return null;
    const C = this.coords, Z = this.z;
    const x1 = C[2 * r.a], y1 = C[2 * r.a + 1], z1 = Z[r.a];
    const x2 = C[2 * r.b], y2 = C[2 * r.b + 1], z2 = Z[r.b];
    const x3 = C[2 * r.c], y3 = C[2 * r.c + 1], z3 = Z[r.c];
    const nx = (y2 - y1) * (z3 - z1) - (z2 - z1) * (y3 - y1);
    const ny = (z2 - z1) * (x3 - x1) - (x2 - x1) * (z3 - z1);
    const nz = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    if (Math.abs(nz) < 1e-15) return null;
    const gx = -nx / nz, gy = -ny / nz; // dz/dx, dz/dy
    let az = Math.atan2(-gx, -gy);
    if (az < 0) az += 2 * Math.PI;
    return { slope: Math.hypot(gx, gy), az };
  }

  /**
   * Interseção exata do segmento A->B com o TIN.
   * Retorna trechos contínuos [[{t, d, x, y, z}]] (d = distância desde A).
   */
  intersectSegment(ax, ay, bx, by) {
    const g = this.grid;
    if (!g) return [];
    const T = this.triangles, C = this.coords, Z = this.z, H = this.halfedges;
    const lax = ax - this.ox, lay = ay - this.oy, lbx = bx - this.ox, lby = by - this.oy;
    const dx = lbx - lax, dy = lby - lay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) {
      const z = this.elevationAt(ax, ay);
      return z == null ? [] : [[{ t: 0, d: 0, x: ax, y: ay, z }]];
    }
    const q = ++this._query;
    const pts = [];
    const steps = Math.max(1, Math.ceil(len / (Math.min(g.csx, g.csy) * 0.5)));
    const visitCell = (i, j) => {
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return;
      const k = j * g.nx + i;
      for (let p = g.start[k]; p < g.start[k + 1]; p++) {
        const t = g.items[p];
        if (this._stamp[t] === q) continue;
        this._stamp[t] = q;
        for (let m = 0; m < 3; m++) {
          const e = 3 * t + m;
          const tw = H[e];
          if (this._heStamp[e] === q) continue;
          this._heStamp[e] = q;
          if (tw >= 0) this._heStamp[tw] = q;
          const pa = T[e], pb = T[nextHE(e)];
          const ex = C[2 * pa], ey = C[2 * pa + 1];
          const fx = C[2 * pb] - ex, fy = C[2 * pb + 1] - ey;
          const den = dx * fy - dy * fx;
          if (Math.abs(den) < 1e-14) continue;
          const tt = ((ex - lax) * fy - (ey - lay) * fx) / den;
          const uu = ((ex - lax) * dy - (ey - lay) * dx) / den;
          if (tt < -1e-12 || tt > 1 + 1e-12 || uu < -1e-12 || uu > 1 + 1e-12) continue;
          const tc = Math.min(1, Math.max(0, tt));
          const uc = Math.min(1, Math.max(0, uu));
          pts.push({ t: tc, z: Z[pa] + uc * (Z[pb] - Z[pa]) });
        }
      }
    };
    let lastI = -99, lastJ = -99;
    for (let s = 0; s <= steps; s++) {
      const px = lax + (dx * s) / steps, py = lay + (dy * s) / steps;
      const i = Math.floor(px / g.csx), j = Math.floor(py / g.csy);
      if (i === lastI && j === lastJ) continue;
      lastI = i; lastJ = j;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) visitCell(i + di, j + dj);
    }
    const za = this.elevationAt(ax, ay), zb = this.elevationAt(bx, by);
    if (za != null) pts.push({ t: 0, z: za });
    if (zb != null) pts.push({ t: 1, z: zb });
    pts.sort((p1, p2) => p1.t - p2.t);
    // remove duplicados
    const uniq = [];
    for (const p of pts) {
      const u = uniq[uniq.length - 1];
      if (u && (p.t - u.t) * len < 1e-6) continue;
      uniq.push(p);
    }
    // separa em trechos contínuos
    const pieces = [];
    let cur = [];
    for (let k = 0; k < uniq.length; k++) {
      const p = uniq[k];
      const rec = { t: p.t, d: p.t * len, x: ax + (bx - ax) * p.t, y: ay + (by - ay) * p.t, z: p.z };
      if (cur.length) {
        const prev = cur[cur.length - 1];
        const tm = (prev.t + p.t) / 2;
        const zm = this.elevationAt(ax + (bx - ax) * tm, ay + (by - ay) * tm);
        if (zm == null) { if (cur.length) pieces.push(cur); cur = []; }
      }
      cur.push(rec);
    }
    if (cur.length) pieces.push(cur);
    return pieces.filter((pc) => pc.length >= 1);
  }

  /** Perfil do terreno ao longo de uma polilinha [{x,y,s}] (s = estaca). Retorna [{s,z}] com null nas lacunas. */
  profileAlong(poly) {
    const out = [];
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const pieces = this.intersectSegment(a.x, a.y, b.x, b.y);
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      for (const pc of pieces) {
        for (const p of pc) {
          const s = a.s + (b.s - a.s) * (p.d / L);
          const last = out[out.length - 1];
          if (last && Math.abs(last.s - s) < 1e-6) continue;
          out.push({ s, z: p.z });
        }
        out.push({ s: NaN, z: null }); // marcador de lacuna
      }
    }
    // remove marcadores redundantes
    const clean = [];
    for (const p of out) {
      if (p.z == null) { if (clean.length && clean[clean.length - 1].z != null) clean.push(p); continue; }
      const last = clean[clean.length - 1];
      if (last && last.z == null && clean.length >= 2) {
        // lacuna real se houver distância entre os trechos
        const prev = clean[clean.length - 2];
        if (Math.abs(p.s - prev.s) < 1e-6) { clean.pop(); continue; }
      }
      clean.push(p);
    }
    while (clean.length && clean[clean.length - 1].z == null) clean.pop();
    return clean;
  }

  /**
   * Curvas de nível. Retorna [{z, major, lines:[[{x,y}]]}] em coordenadas absolutas.
   */
  contours(interval = 1, opts = {}) {
    const res = [];
    if (!this.grid || !(interval > 0)) return res;
    const base = opts.base ?? 0;
    const majorEvery = opts.majorEvery ?? 5;
    const T = this.triangles, C = this.coords, Z = this.z, H = this.halfedges;
    const nt = T.length / 3;
    const levels = new Map(); // idx -> {keys:[], segs:[]}
    const zmin = this.stats.minZ, zmax = this.stats.maxZ;
    const maxLevels = 2000;
    if ((zmax - zmin) / interval > maxLevels) interval = (zmax - zmin) / maxLevels;
    for (let t = 0; t < nt; t++) {
      if (!this.active[t]) continue;
      const e0 = 3 * t;
      const za = Z[T[e0]], zb = Z[T[e0 + 1]], zc = Z[T[e0 + 2]];
      const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc);
      if (hi - lo < 1e-12) continue;
      let k0 = Math.ceil((lo - base) / interval);
      const k1 = Math.floor((hi - base) / interval);
      for (let k = k0; k <= k1; k++) {
        let lv = base + k * interval;
        if (lv === lo || lv === hi) lv += 1e-9; // evita degenerescência em vértices
        const cross = [];
        for (let m = 0; m < 3; m++) {
          const e = e0 + m;
          const p = T[e], q = T[nextHE(e)];
          const zp = Z[p], zq = Z[q];
          if ((zp >= lv) !== (zq >= lv)) {
            const tw = H[e];
            const key = tw >= 0 && tw < e ? tw : e;
            const u = (lv - zp) / (zq - zp);
            cross.push({ key, x: C[2 * p] + u * (C[2 * q] - C[2 * p]), y: C[2 * p + 1] + u * (C[2 * q + 1] - C[2 * p + 1]) });
          }
        }
        if (cross.length !== 2) continue;
        let L = levels.get(k);
        if (!L) { L = { pts: new Map(), segs: [] }; levels.set(k, L); }
        L.pts.set(cross[0].key, cross[0]);
        L.pts.set(cross[1].key, cross[1]);
        L.segs.push(cross[0].key, cross[1].key);
      }
    }
    const ox = this.ox, oy = this.oy;
    const sortedK = [...levels.keys()].sort((a, b) => a - b);
    for (const k of sortedK) {
      const L = levels.get(k);
      const adj = new Map();
      const nseg = L.segs.length / 2;
      for (let s = 0; s < nseg; s++) {
        const a = L.segs[2 * s], b = L.segs[2 * s + 1];
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(s); adj.get(b).push(s);
      }
      const usedSeg = new Uint8Array(nseg);
      const lines = [];
      const walk = (startKey) => {
        const line = [startKey];
        let cur = startKey;
        for (;;) {
          const list = adj.get(cur);
          let nextS = -1;
          for (const s of list) if (!usedSeg[s]) { nextS = s; break; }
          if (nextS < 0) break;
          usedSeg[nextS] = 1;
          const a = L.segs[2 * nextS], b = L.segs[2 * nextS + 1];
          cur = a === cur ? b : a;
          line.push(cur);
          if (cur === startKey) break;
        }
        return line;
      };
      // primeiro as abertas (extremidades com grau 1)
      for (const [key, list] of adj) if (list.length === 1 && !usedSeg[list[0]]) lines.push(walk(key));
      for (let s = 0; s < nseg; s++) if (!usedSeg[s]) lines.push(walk(L.segs[2 * s]));
      const z = base + k * interval;
      res.push({
        z,
        major: majorEvery > 0 && Math.abs(Math.round(z / (interval * majorEvery)) * interval * majorEvery - z) < interval * 1e-6,
        lines: lines.filter((l) => l.length >= 2).map((l) => l.map((key) => { const p = L.pts.get(key); return { x: p.x + ox, y: p.y + oy }; })),
      });
    }
    return res;
  }

  /** Lista de arestas ativas para desenho (pares de índices). */
  activeTriangles() {
    const out = [];
    const T = this.triangles;
    for (let t = 0; t < this.active.length; t++) if (this.active[t]) out.push(T[3 * t], T[3 * t + 1], T[3 * t + 2]);
    return out;
  }

  pointXY(i) { return { x: this.coords[2 * i] + this.ox, y: this.coords[2 * i + 1] + this.oy, z: this.z[i] }; }

  /** Volume entre a superfície e um plano horizontal dentro de um polígono (método de grade). */
  volumeToPlane(poly, zRef, cell = 1) {
    let cut = 0, fill = 0, area = 0;
    const bb = poly.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    for (let x = bb.minX + cell / 2; x < bb.maxX; x += cell) {
      for (let y = bb.minY + cell / 2; y < bb.maxY; y += cell) {
        if (!pip({ x, y }, poly)) continue;
        const z = this.elevationAt(x, y);
        if (z == null) continue;
        area += cell * cell;
        const d = z - zRef;
        if (d > 0) cut += d * cell * cell; else fill += -d * cell * cell;
      }
    }
    return { cut, fill, area };
  }

  toJSON() {
    const pts = [];
    for (const p of this.sourcePoints) pts.push(round3(p.x), round3(p.y), round3(p.z));
    return {
      id: this.id, name: this.name, maxEdge: this.maxEdge,
      points: pts,
      codes: this.sourcePoints.some((p) => p.name || p.desc) ? this.sourcePoints.map((p) => [p.name || '', p.desc || '']) : undefined,
      breaklines: this.sourceBreaklines.map((bl) => bl.flatMap((v) => [round3(v.x), round3(v.y), round3(v.z)])),
      boundary: this.boundary,
    };
  }

  static fromJSON(o) {
    const pts = [];
    const P = o.points || [];
    for (let i = 0; i + 2 < P.length; i += 3) {
      const c = o.codes ? o.codes[i / 3] : null;
      pts.push({ x: P[i], y: P[i + 1], z: P[i + 2], name: c ? c[0] : undefined, desc: c ? c[1] : undefined });
    }
    const bls = (o.breaklines || []).map((arr) => {
      const out = [];
      for (let i = 0; i + 2 < arr.length; i += 3) out.push({ x: arr[i], y: arr[i + 1], z: arr[i + 2] });
      return out;
    });
    return new Surface({ id: o.id, name: o.name, maxEdge: o.maxEdge, points: pts, breaklines: bls, boundary: o.boundary });
  }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

function pip(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
