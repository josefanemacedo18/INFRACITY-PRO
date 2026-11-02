// URBIS - vista em planta (canvas 2D): desenho interativo de vias, terreno e loteamento

import { store } from './store.js';
import { fmt, fmtStation } from '../core/util.js';
import { templateWidths, sideComponents } from '../core/template.js';
import { newRoad } from '../core/project.js';
import { signInfo } from '../core/signage.js';

const COLORS = {
  bg: '#10141a', grid: '#1b222c', gridText: '#5d6a7b',
  contour: 'rgba(176,140,96,0.42)', contourMajor: 'rgba(214,170,112,0.78)', contourLabel: '#c9a77a',
  tri: 'rgba(90,120,150,0.25)', point: '#7fb2d9',
  axis: '#ff5a4a', pi: '#ffd166', tangent: 'rgba(255,209,102,0.55)',
  pista: '#3b414b', acostamento: '#4a515c', estacionamento: '#454b55', ciclovia: '#7a3b3b', sarjeta: '#80868f', meiofio: '#d9dde3', passeio: '#a39b8b', canteiro: '#3f6b3a', generico: '#5b6470', median: '#3f6b3a',
  cut: 'rgba(196,110,70,0.55)', fill: 'rgba(110,160,80,0.50)', tick: 'rgba(255,255,255,0.35)',
  gleba: '#d46bd8', block: 'rgba(120,140,170,0.10)', blockLine: 'rgba(150,170,200,0.55)', lot: 'rgba(230,230,240,0.55)', green: 'rgba(80,170,90,0.35)', inst: 'rgba(80,140,220,0.35)',
  pipe: '#3aa0ff', pv: '#9fd0ff', white: '#f2f2f2', yellow: '#f5c400', sel: '#2fb9a8', err: '#ff4d4d', draft: '#2fb9a8',
};

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

export class PlanView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cx = 0; this.cy = 0; this.k = 1;
    this.G = { x: 0, y: 0 };
    this.draft = [];
    this.drag = null;
    this.hover = null;
    this.mouse = null;
    this.preview = null; // geometria temporária durante arraste
    this.cache = new Map();
    this._raf = 0;
    this._fitDone = -1;
    this.measure = [];
    this._bind();
    this.resize();
  }

  destroy() {
    this._ro?.disconnect();
    window.removeEventListener('keydown', this._onKey);
    cancelAnimationFrame(this._raf);
  }

  _bind() {
    const c = this.canvas;
    this._ro = new ResizeObserver(() => { this.resize(); });
    this._ro.observe(c.parentElement);
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('mousedown', (e) => this._onDown(e));
    window.addEventListener('mousemove', (this._onMoveW = (e) => this._onMove(e)));
    window.addEventListener('mouseup', (this._onUpW = (e) => this._onUp(e)));
    c.addEventListener('dblclick', (e) => this._onDbl(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height);
    this.canvas.width = Math.round(this.W * d); this.canvas.height = Math.round(this.H * d);
    this.dpr = d;
    this.render();
  }

  // ---- transformações
  w2s(x, y) { return [this.W / 2 + (x - this.cx) * this.k, this.H / 2 - (y - this.cy) * this.k]; }
  s2w(sx, sy) { return { x: this.cx + (sx - this.W / 2) / this.k, y: this.cy - (sy - this.H / 2) / this.k }; }
  evtW(e) { const r = this.canvas.getBoundingClientRect(); return this.s2w(e.clientX - r.left, e.clientY - r.top); }
  evtS(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  worldTransform() {
    const d = this.dpr, k = this.k;
    this.ctx.setTransform(d * k, 0, 0, -d * k, d * (this.W / 2 + (this.G.x - this.cx) * k), d * (this.H / 2 + (this.cy - this.G.y) * k));
  }
  screenTransform() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  dataBounds() {
    const p = store.project;
    let b = null;
    const ext = (x, y) => { if (!b) b = { minX: x, minY: y, maxX: x, maxY: y }; else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); } };
    for (const s of p.surfaces) { const sf = store.model.surface(p, s.id); if (sf && sf.stats.triangles) { ext(sf.stats.minX, sf.stats.minY); ext(sf.stats.maxX, sf.stats.maxY); } }
    for (const r of p.roads) for (const q of r.pis) ext(q.x, q.y);
    if (p.parcels.gleba) for (const q of p.parcels.gleba) ext(q.x, q.y);
    return b;
  }

  fit() {
    const b = this.dataBounds();
    if (!b) { this.cx = this.G.x; this.cy = this.G.y; this.k = 1; this.render(); return; }
    this.cx = (b.minX + b.maxX) / 2; this.cy = (b.minY + b.maxY) / 2;
    const w = Math.max(20, b.maxX - b.minX), h = Math.max(20, b.maxY - b.minY);
    this.k = Math.min(this.W / (w * 1.12), this.H / (h * 1.12));
    this.render();
  }

  _updateOrigin() {
    const b = this.dataBounds();
    const g = b ? { x: Math.round(b.minX / 1000) * 1000, y: Math.round(b.minY / 1000) * 1000 } : { x: 0, y: 0 };
    if (g.x !== this.G.x || g.y !== this.G.y) { this.G = g; this.cache.clear(); }
  }

  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  // ---- caches de caminhos (coordenadas relativas a G)
  _path(pts, close = false) {
    const p = new Path2D();
    const G = this.G;
    pts.forEach((q, i) => (i ? p.lineTo(q.x - G.x, q.y - G.y) : p.moveTo(q.x - G.x, q.y - G.y)));
    if (close) p.closePath();
    return p;
  }

  _surfaceCache(sdef) {
    const p = store.project;
    const st = p.settings;
    const key = `sf:${sdef.id}@${sdef.rev}:${st.contourInterval}:${st.contourMajor}:${this.G.x},${this.G.y}`;
    let c = this.cache.get(key);
    if (c) return c;
    const sf = store.model.surface(p, sdef.id);
    if (!sf || !sf.stats.triangles) return null;
    const cs = sf.contours(st.contourInterval || 1, { majorEvery: st.contourMajor || 5 });
    const minor = new Path2D(), major = new Path2D();
    const labels = [];
    const G = this.G;
    for (const lv of cs) {
      const target = lv.major ? major : minor;
      for (const line of lv.lines) {
        line.forEach((q, i) => (i ? target.lineTo(q.x - G.x, q.y - G.y) : target.moveTo(q.x - G.x, q.y - G.y)));
        if (lv.major && line.length > 8) {
          let acc = 0;
          for (let i = 1; i < line.length; i++) {
            acc += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
            if (acc > 120) { acc = 0; labels.push({ x: line[i].x, y: line[i].y, a: Math.atan2(line[i].y - line[i - 1].y, line[i].x - line[i - 1].x), z: lv.z }); }
          }
        }
      }
    }
    const tri = new Path2D();
    const T = sf.triangles, C = sf.coords;
    const ox = sf.ox - G.x, oy = sf.oy - G.y;
    for (let t = 0; t < sf.active.length; t++) {
      if (!sf.active[t]) continue;
      const a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
      tri.moveTo(C[2 * a] + ox, C[2 * a + 1] + oy); tri.lineTo(C[2 * b] + ox, C[2 * b + 1] + oy); tri.lineTo(C[2 * d] + ox, C[2 * d + 1] + oy); tri.closePath();
    }
    // contorno da superfície
    c = { minor, major, labels, tri, sf };
    this.cache.set(key, c);
    return c;
  }

  /** Faixas da seção tipo ao longo do eixo (independe do corredor; rápido para arrastar). */
  _ribbons(alignment, tpl) {
    const out = [];
    const step = Math.max(1, Math.min(5, 3 / Math.max(this.k, 0.05)));
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      let o = (+tpl.median || 0) / 2;
      if (o > 0 && side === 'R') {
        const a = alignment.offsetLine(-o, step), b = alignment.offsetLine(o, step).reverse();
        out.push({ type: 'median', path: this._path([...a, ...b], true) });
      }
      for (const c of sideComponents(tpl, side)) {
        const w = +c.width || 0;
        if (w <= 0) continue;
        const a = alignment.offsetLine(sign * o, step), b = alignment.offsetLine(sign * (o + w), step).reverse();
        out.push({ type: c.type, path: this._path([...a, ...b], true) });
        o += w;
      }
    }
    return out;
  }

  // ---- desenho
  draw() {
    const ctx = this.ctx;
    const p = store.project, ui = store.ui;
    if (this._fitDone !== ui.fitRequest) { this._updateOrigin(); this._fitDone = ui.fitRequest; this.fit(); return; }
    this._updateOrigin();
    const tech = ui.mode === 'tecnico';
    this.screenTransform();
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    if (ui.layers.grid) this._drawGrid(tech);
    // superfícies
    for (const s of p.surfaces) {
      const c = this._surfaceCache(s);
      if (!c) continue;
      this.worldTransform();
      if (ui.layers.triangles) { ctx.strokeStyle = COLORS.tri; ctx.lineWidth = 1 / this.k; ctx.stroke(c.tri); }
      if (ui.layers.contours) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = COLORS.contour; ctx.lineWidth = 0.8 / this.k; ctx.stroke(c.minor);
        ctx.strokeStyle = COLORS.contourMajor; ctx.lineWidth = 1.4 / this.k; ctx.stroke(c.major);
      }
      this.screenTransform();
      if (ui.layers.points) this._drawPoints(c.sf);
      if (ui.layers.contours && (tech || this.k > 0.8) && ui.layers.labels) {
        ctx.font = '10px Segoe UI, sans-serif'; ctx.fillStyle = COLORS.contourLabel; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const l of c.labels) {
          const [sx, sy] = this.w2s(l.x, l.y);
          if (sx < -20 || sy < -20 || sx > this.W + 20 || sy > this.H + 20) continue;
          ctx.save(); ctx.translate(sx, sy); let a = -l.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; ctx.rotate(a);
          ctx.fillStyle = COLORS.bg; ctx.fillRect(-14, -6, 28, 12); ctx.fillStyle = COLORS.contourLabel; ctx.fillText(fmt(l.z, 0), 0, 0); ctx.restore();
        }
      }
    }
    // loteamento
    if (ui.layers.lots) this._drawParcels(tech);
    // vias
    for (const road of p.roads) {
      if (road.visible === false) continue;
      this._drawRoad(road, tech);
    }
    // rascunho da ferramenta
    this._drawDraft();
    this._drawMeasure();
    this.screenTransform();
    this._drawScale();
    this._drawNorth();
  }

  _drawGrid(tech) {
    const ctx = this.ctx;
    const step = niceStep(110 / this.k);
    const tl = this.s2w(0, 0), br = this.s2w(this.W, this.H);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const [sx] = this.w2s(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, this.H); }
    for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) { const [, sy] = this.w2s(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(this.W, Math.round(sy) + 0.5); }
    ctx.stroke();
    if (tech) {
      ctx.fillStyle = COLORS.gridText; ctx.font = '10px Segoe UI, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const [sx] = this.w2s(x, 0); ctx.fillText('E ' + fmt(x, 0), sx + 3, 3); }
      ctx.textBaseline = 'bottom';
      for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) { const [, sy] = this.w2s(0, y); ctx.fillText('N ' + fmt(y, 0), 3, sy - 2); }
    }
  }

  _drawPoints(sf) {
    const ctx = this.ctx;
    const n = sf.n;
    if (n > 60000 && this.k < 1) return;
    ctx.fillStyle = COLORS.point;
    const tech = store.ui.mode === 'tecnico';
    for (let i = 0; i < n; i++) {
      const x = sf.coords[2 * i] + sf.ox, y = sf.coords[2 * i + 1] + sf.oy;
      const [sx, sy] = this.w2s(x, y);
      if (sx < 0 || sy < 0 || sx > this.W || sy > this.H) continue;
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      if (tech && this.k > 3) { ctx.font = '9px Segoe UI'; ctx.fillText(fmt(sf.z[i], 2), sx + 3, sy - 3); }
    }
  }

  _roadGeometry(road) {
    if (this.preview && this.preview.roadId === road.id) return this.preview;
    const r = store.roadResult(road.id);
    return r ? { alignment: r.alignment, pis: r.pis, result: r } : null;
  }

  _drawRoad(road, tech) {
    const ctx = this.ctx;
    const g = this._roadGeometry(road);
    if (!g || !g.alignment || !g.alignment.elements.length) return;
    const al = g.alignment;
    const sel = store.ui.selection?.kind === 'road' && store.ui.selection.id === road.id;
    const res = g.result;
    const live = !!(this.preview && this.preview.roadId === road.id);
    // taludes (corte/aterro)
    if (store.ui.layers.slopes && res?.corridor && !live) this._drawSlopes(road, res, tech);
    // faixas da seção tipo
    const key = `rib:${road.id}:${res ? res.alignment === al : 'p'}:${this.G.x}`;
    let ribbons = !live && res && res.__ribbons && res.__ribbonsK === Math.round(Math.log2(this.k) * 2) ? res.__ribbons : null;
    if (!ribbons) {
      ribbons = this._ribbons(al, road.template);
      if (!live && res) { res.__ribbons = ribbons; res.__ribbonsK = Math.round(Math.log2(this.k) * 2); }
    }
    void key;
    this.worldTransform();
    for (const rb of ribbons) { ctx.fillStyle = COLORS[rb.type] || COLORS.generico; ctx.fill(rb.path); }
    // sinalização horizontal
    if (store.ui.layers.signage && res && !live) this._drawMarkings(road, res, al);
    // drenagem
    if (store.ui.layers.drainage && res?.drainage && !live) this._drawDrainage(res);
    // eixo
    const axisPts = al.sample(5, 0.05);
    const axisPath = this._path(axisPts);
    this.worldTransform();
    ctx.strokeStyle = sel ? COLORS.sel : COLORS.axis; ctx.lineWidth = (sel ? 2.2 : 1.4) / this.k;
    ctx.setLineDash([12 / this.k, 4 / this.k, 2 / this.k, 4 / this.k]);
    ctx.stroke(axisPath);
    ctx.setLineDash([]);
    // erros: halo
    const hasErr = res?.checks?.some((c) => c.level === 'erro');
    if (hasErr && !live) {
      ctx.strokeStyle = 'rgba(255,77,77,0.35)'; ctx.lineWidth = 10 / this.k;
      for (const c of res.checks.filter((x) => x.level === 'erro' && x.s != null && x.group === 'Eixo')) {
        const cv = al.curveAt(c.s);
        if (cv) ctx.stroke(this._path(al.sample(3, 0.05, cv.staTS, cv.staST)));
      }
    }
    this.screenTransform();
    // estacas e rótulos técnicos
    if (tech && store.ui.layers.labels) this._drawStations(al, road);
    // sinais verticais
    if (store.ui.layers.signage && res && !live) this._drawSigns(res, al, tech);
    // PIs
    if (sel || tech) this._drawPIs(road, g, sel);
    // nome da via
    if (store.ui.layers.labels) {
      const mid = al.pointAt(al.startStation + al.length * 0.5);
      const [sx, sy] = this.w2s(mid.x, mid.y);
      let a = Math.PI / 2 - mid.az; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.font = '600 12px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = road.name;
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(16,20,26,0.8)'; ctx.fillRect(-w / 2, -9, w, 18);
      ctx.fillStyle = road.color || COLORS.road; ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  _drawSlopes(road, res, tech) {
    const ctx = this.ctx;
    const al = res.alignment;
    this.worldTransform();
    const secs = res.corridor.sections;
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      for (let i = 1; i < secs.length; i++) {
        const a = secs[i - 1], b = secs[i];
        const da = side === 'L' ? a.left : a.right, db = side === 'L' ? b.left : b.right;
        const pa = da.daylight.pts, pb = db.daylight.pts;
        if (!pa.length || !pb.length) continue;
        const ea = al.offsetPoint(a.s, sign * da.edge.o), eb = al.offsetPoint(b.s, sign * db.edge.o);
        const oa = al.offsetPoint(a.s, sign * pa[pa.length - 1].o), ob = al.offsetPoint(b.s, sign * pb[pb.length - 1].o);
        const t = da.daylight.type || db.daylight.type;
        ctx.fillStyle = t === 'corte' ? COLORS.cut : COLORS.fill;
        const path = this._path([ea, eb, ob, oa], true);
        ctx.fill(path);
      }
    }
    // hachura de talude (técnico)
    if (tech && this.k > 0.6) {
      ctx.strokeStyle = COLORS.tick; ctx.lineWidth = 1 / this.k;
      const step = Math.max(2, 6 / this.k);
      const path = new Path2D();
      for (const side of ['L', 'R']) {
        const sign = side === 'L' ? -1 : 1;
        for (let i = 1; i < secs.length; i++) {
          const a = secs[i - 1], b = secs[i];
          const da = side === 'L' ? a.left : a.right, db = side === 'L' ? b.left : b.right;
          if (!da.daylight.pts.length || !db.daylight.pts.length) continue;
          const oa = da.daylight.pts[da.daylight.pts.length - 1].o, ob = db.daylight.pts[db.daylight.pts.length - 1].o;
          let n = 0;
          for (let s = a.s; s < b.s; s += step, n++) {
            const t = (s - a.s) / (b.s - a.s);
            const e = da.edge.o + t * (db.edge.o - da.edge.o);
            const o = oa + t * (ob - oa);
            const len = n % 2 ? 0.5 : 1;
            const p1 = al.offsetPoint(s, sign * e), p2 = al.offsetPoint(s, sign * (e + (o - e) * len));
            path.moveTo(p1.x - this.G.x, p1.y - this.G.y); path.lineTo(p2.x - this.G.x, p2.y - this.G.y);
          }
        }
      }
      ctx.stroke(path);
    }
  }

  _drawMarkings(road, res, al) {
    const ctx = this.ctx;
    this.worldTransform();
    for (const l of res.markings.lines) {
      const color = l.color === 'amarela' ? COLORS.yellow : COLORS.white;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(l.width, 0.6 / this.k);
      if (l.dashed && l.dash) ctx.setLineDash([l.dash.dash, l.dash.gap]); else ctx.setLineDash([]);
      const offs = l.double ? [l.offset - 0.12, l.offset + 0.12] : [l.offset];
      for (const o of offs) ctx.stroke(this._path(al.offsetLine(o, 2)));
    }
    ctx.setLineDash([]);
    // faixas de pedestres
    for (const cw of res.crosswalks) {
      const w = templateWidths(road.template);
      ctx.fillStyle = COLORS.white;
      for (let o = -w.carriageway / 2 + 0.25; o + cw.barWidth <= w.carriageway / 2; o += cw.barWidth + cw.barGap) {
        const s0 = cw.s - cw.length / 2, s1 = cw.s + cw.length / 2;
        const quad = [al.offsetPoint(s0, o), al.offsetPoint(s1, o), al.offsetPoint(s1, o + cw.barWidth), al.offsetPoint(s0, o + cw.barWidth)];
        ctx.fill(this._path(quad, true));
      }
    }
  }

  _drawSigns(res, al, tech) {
    const ctx = this.ctx;
    for (const sg of res.signs) {
      const p = al.offsetPoint(sg.s, sg.offset ?? (sg.side === 'L' ? -5 : 5));
      const [sx, sy] = this.w2s(p.x, p.y);
      if (sx < -20 || sy < -20 || sx > this.W + 20 || sy > this.H + 20) continue;
      const info = signInfo(sg.code);
      const r = Math.max(4, Math.min(9, 0.9 * this.k));
      ctx.save(); ctx.translate(sx, sy);
      ctx.lineWidth = 1.5;
      if (info.shape === 'losango') { ctx.rotate(Math.PI / 4); ctx.fillStyle = '#f5c400'; ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); ctx.strokeStyle = '#000'; ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); }
      else if (info.shape === 'octogono') { ctx.fillStyle = '#d32f2f'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); }
      else if (info.shape === 'triangulo') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(-r, -r * 0.7); ctx.lineTo(r, -r * 0.7); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d32f2f'; ctx.stroke(); }
      else if (info.shape === 'circulo') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 2.5; ctx.stroke(); }
      else { ctx.fillStyle = '#1565c0'; ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2); }
      ctx.restore();
      if (tech) { ctx.font = '10px Segoe UI'; ctx.fillStyle = '#ddd'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(sg.code + (sg.param ? ' ' + sg.param : ''), sx + r + 3, sy); }
    }
  }

  _drawDrainage(res) {
    const ctx = this.ctx;
    const d = res.drainage;
    const nodes = new Map(d.network.nodes.map((n) => [n.id, n]));
    this.worldTransform();
    ctx.strokeStyle = COLORS.pipe; ctx.lineWidth = 2.2 / this.k;
    for (const l of d.network.links) {
      const a = nodes.get(l.from), b = nodes.get(l.to);
      ctx.stroke(this._path([a, b]));
    }
    this.screenTransform();
    const tech = store.ui.mode === 'tecnico';
    for (const n of d.network.nodes) {
      const [sx, sy] = this.w2s(n.x, n.y);
      ctx.fillStyle = '#0d2a44'; ctx.strokeStyle = COLORS.pv; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (tech && this.k > 0.7) { ctx.fillStyle = COLORS.pv; ctx.font = '10px Segoe UI'; ctx.textAlign = 'left'; ctx.fillText(n.id, sx + 6, sy - 6); }
    }
    if (tech && this.k > 0.7) {
      for (const pp of d.pipes) {
        const a = nodes.get(pp.from), b = nodes.get(pp.to);
        const [sx, sy] = this.w2s((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.fillStyle = COLORS.pipe; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText(`Ø${Math.round(pp.D * 1000)} i=${fmt(pp.S * 100, 2)}%`, sx, sy + 12);
      }
    }
  }

  _drawStations(al, road) {
    const ctx = this.ctx;
    const iv = store.project.settings.stationInterval || 20;
    const every = this.k > 1.2 ? 1 : this.k > 0.45 ? 5 : 10;
    ctx.strokeStyle = '#ffb3ab'; ctx.fillStyle = '#ffb3ab'; ctx.lineWidth = 1;
    ctx.font = '10px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tickLen = 5;
    let n = 0;
    for (const s of al.regularStations(iv)) {
      const est = Math.round(s / iv);
      const major = est % every === 0;
      const p = al.pointAt(s);
      const [sx, sy] = this.w2s(p.x, p.y);
      if (sx < -30 || sy < -30 || sx > this.W + 30 || sy > this.H + 30) { n++; continue; }
      const nx = Math.cos(p.az), ny = Math.sin(p.az); // normal à direita em tela (y invertido)
      const L = major ? tickLen * 2 : tickLen;
      ctx.beginPath(); ctx.moveTo(sx - nx * L, sy - ny * L); ctx.lineTo(sx + nx * L, sy + ny * L); ctx.stroke();
      if (major) {
        ctx.save(); ctx.translate(sx + nx * (L + 3), sy + ny * (L + 3)); let a = -p.az + 0; a = Math.atan2(ny, nx); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; ctx.rotate(a);
        ctx.fillText(String(est), 0, 0); ctx.restore();
      }
      n++;
    }
    // pontos notáveis
    ctx.fillStyle = '#ffd166'; ctx.font = '600 10px Segoe UI';
    for (const k of al.keyPoints()) {
      if (k.label === 'PP' || k.label === 'PF') continue;
      const p = al.pointAt(k.s);
      const [sx, sy] = this.w2s(p.x, p.y);
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
      if (this.k > 0.5) ctx.fillText(`${k.label}${k.curve} ${fmtStation(k.s, iv)}`, sx + 5, sy + 10);
    }
    // dados das curvas
    for (const c of al.curves) {
      const mid = al.pointAt((c.staTS + c.staST) / 2);
      const off = (c.dir > 0 ? -1 : 1) * 14 / this.k;
      const q = { x: mid.x - Math.cos(mid.az) * off, y: mid.y + Math.sin(mid.az) * off };
      const [sx, sy] = this.w2s(q.x, q.y);
      ctx.fillStyle = '#ffd166'; ctx.font = '600 11px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText(`C${c.number}  R=${fmt(c.R, 1)}${c.Ls ? '  Ls=' + fmt(c.Ls, 0) : ''}`, sx, sy);
      ctx.font = '10px Segoe UI'; ctx.fillStyle = '#d8c48c';
      ctx.fillText(`Δ=${fmt(c.I * 180 / Math.PI, 2)}°  T=${fmt(c.T)}  D=${fmt(c.total)}`, sx, sy + 13);
    }
    void road;
  }

  _drawPIs(road, g, sel) {
    const ctx = this.ctx;
    const pis = g.pis || road.pis;
    ctx.strokeStyle = COLORS.tangent; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    pis.forEach((q, i) => { const [sx, sy] = this.w2s(q.x, q.y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.stroke(); ctx.setLineDash([]);
    const selPi = store.ui.selection?.pi;
    pis.forEach((q, i) => {
      const [sx, sy] = this.w2s(q.x, q.y);
      ctx.fillStyle = sel && selPi === i ? COLORS.sel : '#10141a';
      ctx.strokeStyle = COLORS.pi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, sel ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (sel || store.ui.mode === 'tecnico') {
        ctx.fillStyle = COLORS.pi; ctx.font = '600 10px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(i === 0 ? 'PP' : i === pis.length - 1 ? 'PF' : `PI-${i}`, sx + 7, sy - 4);
      }
    });
  }

  _drawParcels(tech) {
    const ctx = this.ctx;
    const P = store.project.parcels;
    const res = store.results.parcels;
    this.worldTransform();
    if (res && res.blocks) {
      for (const b of res.blocks) {
        const path = this._path(b.polygon, true);
        ctx.fillStyle = COLORS.block; ctx.fill(path);
        ctx.strokeStyle = COLORS.blockLine; ctx.lineWidth = 1.2 / this.k; ctx.stroke(path);
      }
    }
    for (const g of P.green || []) { ctx.fillStyle = COLORS.green; ctx.fill(this._path(g.polygon, true)); }
    for (const g of P.institutional || []) { ctx.fillStyle = COLORS.inst; ctx.fill(this._path(g.polygon, true)); }
    if (res && res.lots) {
      const selLot = store.ui.selection?.kind === 'lot' ? store.ui.selection.index : -1;
      res.lots.forEach((l, i) => {
        const path = this._path(l.polygon, true);
        if (i === selLot) { ctx.fillStyle = 'rgba(47,185,168,0.35)'; ctx.fill(path); }
        else if (l.issues?.length) { ctx.fillStyle = 'rgba(255,77,77,0.18)'; ctx.fill(path); }
        ctx.strokeStyle = COLORS.lot; ctx.lineWidth = 1 / this.k; ctx.stroke(path);
      });
    }
    if (P.gleba) {
      ctx.strokeStyle = COLORS.gleba; ctx.lineWidth = 2 / this.k; ctx.setLineDash([10 / this.k, 5 / this.k]);
      ctx.stroke(this._path(P.gleba, true)); ctx.setLineDash([]);
    }
    this.screenTransform();
    if (res && res.lots) {
      ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const l of res.lots) {
        // rótulo só quando o lote tem tamanho suficiente na tela (evita sobreposição)
        if (Math.min(l.front || 10, Math.sqrt(l.area)) * this.k < 30) continue;
        const [sx, sy] = this.w2s(l.centroid.x, l.centroid.y);
        if (sx < 0 || sy < 0 || sx > this.W || sy > this.H) continue;
        ctx.fillStyle = '#e6ebf2'; ctx.fillText(`Q${l.block ?? ''}-L${l.number}`, sx, sy - 6);
        ctx.fillStyle = '#9aa6b6'; ctx.fillText(`${fmt(l.area, 1)} m²`, sx, sy + 6);
      }
    }
  }

  _drawDraft() {
    const ctx = this.ctx;
    const tool = store.ui.tool;
    if (!this.draft.length || !['road', 'gleba', 'green', 'institutional'].includes(tool)) return;
    const pts = [...this.draft, ...(this.mouse ? [this.mouse] : [])];
    this.screenTransform();
    ctx.strokeStyle = COLORS.draft; ctx.lineWidth = 2; ctx.setLineDash(tool === 'road' ? [] : [6, 4]);
    ctx.beginPath();
    pts.forEach((q, i) => { const [sx, sy] = this.w2s(q.x, q.y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    if (tool !== 'road' && pts.length > 2) ctx.closePath();
    ctx.stroke(); ctx.setLineDash([]);
    for (const q of this.draft) { const [sx, sy] = this.w2s(q.x, q.y); ctx.fillStyle = COLORS.draft; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill(); }
    if (tool === 'road' && this.draftRoad) {
      // prévia com raios automáticos
      const al = this.draftRoad.alignment;
      if (al && al.elements.length) {
        const rb = this._ribbons(al, this.draftRoad.road.template);
        this.worldTransform();
        ctx.globalAlpha = 0.65;
        for (const r of rb) { ctx.fillStyle = COLORS[r.type] || COLORS.generico; ctx.fill(r.path); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1.5 / this.k; ctx.stroke(this._path(al.sample(3, 0.05)));
        this.screenTransform();
      }
    }
    if (this.mouse && this.draft.length) {
      const a = this.draft[this.draft.length - 1], b = this.mouse;
      const [sx, sy] = this.w2s(b.x, b.y);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.fillStyle = '#e6ebf2'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'left';
      ctx.fillText(`${fmt(d, 1)} m`, sx + 12, sy + 16);
    }
  }

  _drawMeasure() {
    if (store.ui.tool !== 'measure' || !this.measure.length) return;
    const ctx = this.ctx;
    this.screenTransform();
    const pts = [...this.measure, ...(this.measure.length === 1 && this.mouse ? [this.mouse] : [])];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const [ax, ay] = this.w2s(a.x, a.y), [bx, by] = this.w2s(b.x, b.y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let az = Math.atan2(b.x - a.x, b.y - a.y); if (az < 0) az += 2 * Math.PI;
    const deg = az * 180 / Math.PI;
    const D = Math.floor(deg), M = Math.floor((deg - D) * 60), S = ((deg - D) * 60 - M) * 60;
    ctx.fillStyle = '#fff'; ctx.font = '600 12px Segoe UI'; ctx.textAlign = 'left';
    ctx.fillText(`${fmt(d, 3)} m  Az ${D}°${String(M).padStart(2, '0')}'${fmt(S, 1)}"`, (ax + bx) / 2 + 8, (ay + by) / 2 - 8);
  }

  _drawScale() {
    const ctx = this.ctx;
    const len = niceStep(120 / this.k);
    const px = len * this.k;
    const x0 = this.W - px - 24, y0 = this.H - 22;
    ctx.fillStyle = 'rgba(16,20,26,0.8)'; ctx.fillRect(x0 - 8, y0 - 18, px + 16, 28);
    ctx.strokeStyle = '#e6ebf2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 3); ctx.moveTo(x0 + px, y0 - 5); ctx.lineTo(x0 + px, y0 + 3); ctx.stroke();
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(`${fmt(len, len < 1 ? 1 : 0)} m`, x0 + px / 2, y0 - 7);
  }

  _drawNorth() {
    const ctx = this.ctx;
    const x = this.W - 30, y = 70;
    ctx.fillStyle = 'rgba(16,20,26,0.8)'; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6ebf2'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 6, y + 8); ctx.lineTo(x, y + 4); ctx.lineTo(x - 6, y + 8); ctx.closePath(); ctx.fill();
    ctx.font = '700 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('N', x, y - 18);
  }

  // ---- interação
  _onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.evtS(e);
    const before = this.s2w(sx, sy);
    const f = Math.exp(-e.deltaY * 0.0015);
    this.k = Math.min(400, Math.max(0.005, this.k * f));
    const after = this.s2w(sx, sy);
    this.cx += before.x - after.x; this.cy += before.y - after.y;
    this.render();
  }

  _hitRoad(w, tolPx = 10) {
    let best = null;
    for (const road of store.project.roads) {
      const r = store.roadResult(road.id);
      if (!r || !r.alignment?.elements?.length) continue;
      const so = r.alignment.stationOffset(w.x, w.y);
      const wd = templateWidths(road.template);
      const half = so.offset < 0 ? wd.left : wd.right;
      const inside = so.dist <= half + tolPx / this.k && so.station > r.alignment.startStation - 1 && so.station < r.alignment.endStation + 1;
      if (inside && (!best || so.dist < best.so.dist)) best = { road, r, so };
    }
    return best;
  }

  _hitPI(sxy) {
    const sel = store.ui.selection;
    const roads = sel?.kind === 'road' ? [store.road(sel.id)].filter(Boolean) : store.ui.mode === 'tecnico' ? store.project.roads : [];
    for (const road of roads) {
      for (let i = 0; i < road.pis.length; i++) {
        const [sx, sy] = this.w2s(road.pis[i].x, road.pis[i].y);
        if (Math.hypot(sx - sxy[0], sy - sxy[1]) <= 9) return { road, i };
      }
    }
    return null;
  }

  _hitLot(w) {
    const res = store.results.parcels;
    if (!res || !res.lots) return -1;
    for (let i = 0; i < res.lots.length; i++) if (pip(w, res.lots[i].polygon)) return i;
    return -1;
  }

  _onDown(e) {
    const w = this.evtW(e), sxy = this.evtS(e);
    const tool = store.ui.tool;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      this.drag = { kind: 'pan', sx: sxy[0], sy: sxy[1], cx: this.cx, cy: this.cy };
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'road' || tool === 'gleba' || tool === 'green' || tool === 'institutional') {
      this.draft.push(w);
      this._updateDraftRoad();
      this.render();
      return;
    }
    if (tool === 'measure') {
      if (this.measure.length >= 2) this.measure = [];
      this.measure.push(w);
      this.render();
      return;
    }
    if (tool === 'sign' || tool === 'crosswalk') {
      const hit = this._hitRoad(w, 40);
      if (!hit) { store.toast('Clique sobre uma via ou junto a ela.', 'err'); return; }
      const s = Math.max(hit.r.alignment.startStation, Math.min(hit.r.alignment.endStation, hit.so.station));
      if (tool === 'sign') {
        const code = store.ui.signCode;
        store.update(`Placa ${code} em ${hit.road.name}`, (p) => {
          const rd = p.roads.find((r) => r.id === hit.road.id);
          rd.signage.signs.push({ code, s, offset: hit.so.offset, side: hit.so.offset < 0 ? 'L' : 'R', param: code === 'R-19' ? String(rd.V) : undefined });
        });
      } else {
        store.update(`Faixa de pedestres em ${hit.road.name}`, (p) => {
          const rd = p.roads.find((r) => r.id === hit.road.id);
          rd.signage.crosswalks.push({ s });
        });
      }
      return;
    }
    // seleção
    const piHit = this._hitPI(sxy);
    if (piHit) {
      store.setUI({ selection: { kind: 'road', id: piHit.road.id, pi: piHit.i } });
      this.drag = { kind: 'pi', roadId: piHit.road.id, i: piHit.i, moved: false, start: w };
      return;
    }
    const hit = this._hitRoad(w);
    if (hit) {
      store.setUI({ selection: { kind: 'road', id: hit.road.id } });
      this.drag = { kind: 'pan', sx: sxy[0], sy: sxy[1], cx: this.cx, cy: this.cy, click: true };
      return;
    }
    const li = this._hitLot(w);
    if (li >= 0) { store.setUI({ selection: { kind: 'lot', index: li } }); return; }
    if (store.project.parcels.gleba && pip(w, store.project.parcels.gleba)) {
      store.setUI({ selection: { kind: 'parcels' } });
      this.drag = { kind: 'pan', sx: sxy[0], sy: sxy[1], cx: this.cx, cy: this.cy };
      return;
    }
    this.drag = { kind: 'pan', sx: sxy[0], sy: sxy[1], cx: this.cx, cy: this.cy, deselect: true };
  }

  _updateDraftRoad() {
    if (store.ui.tool !== 'road') { this.draftRoad = null; return; }
    const pts = [...this.draft, ...(this.mouse ? [this.mouse] : [])];
    if (pts.length < 2) { this.draftRoad = null; return; }
    const road = newRoad(store.project, { classKey: store.ui.newRoadClass, pis: pts });
    const g = store.model.roadGeometry(store.project, road);
    this.draftRoad = { road, alignment: g.alignment };
  }

  _onMove(e) {
    if (!this.canvas.isConnected) return;
    const r = this.canvas.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const w = this.evtW(e), sxy = this.evtS(e);
    if (this.drag?.kind === 'pan') {
      const dx = sxy[0] - this.drag.sx, dy = sxy[1] - this.drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      this.cx = this.drag.cx - dx / this.k; this.cy = this.drag.cy + dy / this.k;
      this.render();
      return;
    }
    if (this.drag?.kind === 'pi') {
      this.drag.moved = true;
      const road = store.road(this.drag.roadId);
      const tmp = { ...road, pis: road.pis.map((p, i) => (i === this.drag.i ? { ...p, x: w.x, y: w.y } : p)) };
      const g = store.model.roadGeometry(store.project, tmp);
      this.preview = { roadId: road.id, alignment: g.alignment, pis: g.pis, result: null };
      this.drag.last = w;
      this.render();
      return;
    }
    if (!inside) return;
    this.mouse = w;
    if (this.draft.length && store.ui.tool === 'road') this._updateDraftRoad();
    if (this.draft.length || store.ui.tool === 'measure') this.render();
    // leitura de coordenadas
    let z = null;
    for (const s of store.project.surfaces) { const sf = store.model.surface(store.project, s.id); if (sf) { z = sf.elevationAt(w.x, w.y); if (z != null) break; } }
    const hit = this._hitRoad(w, 25);
    const cur = { x: w.x, y: w.y, z, road: hit ? { name: hit.road.name, s: hit.so.station, o: hit.so.offset } : null };
    clearTimeout(this._curT);
    this._curT = setTimeout(() => store.setUI({ cursor: cur }), 40);
  }

  _onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'pi') {
      this.preview = null;
      if (d.moved && d.last) {
        const w = d.last;
        store.update('Mover PI', (p) => {
          const rd = p.roads.find((r) => r.id === d.roadId);
          rd.pis[d.i].x = w.x; rd.pis[d.i].y = w.y;
          if (rd.profile.auto === false) rd.profile.auto = false;
        });
      }
      this.render();
      return;
    }
    if (d.kind === 'pan' && !d.moved && d.deselect) store.setUI({ selection: null });
    void e;
  }

  _onDbl(e) {
    const tool = store.ui.tool;
    if (tool === 'road' || tool === 'gleba' || tool === 'green' || tool === 'institutional') { this.finishDraft(); return; }
    const w = this.evtW(e);
    const sel = store.selectedRoad();
    if (sel) {
      const r = store.roadResult(sel.id);
      if (!r) return;
      const so = r.alignment.stationOffset(w.x, w.y);
      if (so.dist > 15 / this.k + 5) return;
      // insere PI entre os PIs vizinhos da estaca clicada
      const stations = r.alignment.piStations;
      let idx = 1;
      while (idx < stations.length && stations[idx] < so.station) idx++;
      store.update('Inserir PI', (p) => {
        const rd = p.roads.find((x) => x.id === sel.id);
        rd.pis.splice(idx, 0, { x: w.x, y: w.y, R: 0, Ls: 0, autoR: true });
      });
      store.setUI({ selection: { kind: 'road', id: sel.id, pi: idx } });
    }
  }

  finishDraft() {
    const tool = store.ui.tool;
    const pts = this.draft.slice();
    // remove ponto duplicado do duplo clique
    while (pts.length >= 2 && Math.hypot(pts[pts.length - 1].x - pts[pts.length - 2].x, pts[pts.length - 1].y - pts[pts.length - 2].y) < 0.5) pts.pop();
    this.draft = []; this.draftRoad = null;
    if (tool === 'road') {
      if (pts.length < 2) { store.toast('Uma via precisa de pelo menos 2 pontos.', 'err'); this.render(); return; }
      const road = newRoad(store.project, { classKey: store.ui.newRoadClass, pis: pts });
      store.update(`Nova via: ${road.name}`, (p) => { p.roads.push(road); });
      store.setUI({ selection: { kind: 'road', id: road.id }, tool: 'select' });
    } else if (pts.length >= 3) {
      if (tool === 'gleba') {
        store.update('Desenhar gleba', (p) => { p.parcels.gleba = pts; p.parcels.lots = []; });
        store.setUI({ selection: { kind: 'parcels' }, tool: 'select' });
      } else {
        const label = tool === 'green' ? 'Área verde' : 'Área institucional';
        store.update(label, (p) => { (tool === 'green' ? p.parcels.green : p.parcels.institutional).push({ polygon: pts, name: label }); });
        store.setUI({ tool: 'select' });
      }
    } else store.toast('O polígono precisa de pelo menos 3 pontos.', 'err');
    this.render();
  }

  cancelDraft() { this.draft = []; this.draftRoad = null; this.measure = []; this.render(); }

  _key(e) {
    if (!this.canvas.isConnected) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'Escape') { if (this.draft.length || this.measure.length) this.cancelDraft(); else store.setUI({ tool: 'select' }); }
    else if (e.key === 'Enter') { if (this.draft.length) this.finishDraft(); }
    else if (e.key === 'Backspace' && this.draft.length) { this.draft.pop(); this._updateDraftRoad(); this.render(); e.preventDefault(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && store.ui.selection?.kind === 'road' && store.ui.selection.pi != null) {
      const sel = store.ui.selection;
      const road = store.road(sel.id);
      if (road && road.pis.length > 2) {
        store.update('Remover PI', (p) => { p.roads.find((r) => r.id === sel.id).pis.splice(sel.pi, 1); });
        store.setUI({ selection: { kind: 'road', id: sel.id } });
      }
      e.preventDefault();
    } else if (e.key === 'f' || e.key === 'F') { this.fit(); }
  }
}

function pip(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
