// URBIS - perfil longitudinal interativo (terreno x greide)

import { store } from './store.js';
import { fmt, fmtPct, fmtStation } from '../core/util.js';
import { Profile } from '../core/profile.js';

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

export class ProfileView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ex = 10; // exagero vertical
    this.view = null; // {s0, s1, z0, z1}
    this.drag = null;
    this.selPvi = null;
    this.preview = null;
    this._raf = 0;
    this._roadId = null;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    canvas.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    canvas.addEventListener('mousedown', (e) => this._down(e));
    window.addEventListener('mousemove', (this._mv = (e) => this._move(e)));
    window.addEventListener('mouseup', (this._up = () => this._release()));
    canvas.addEventListener('dblclick', (e) => this._dbl(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (this._key = (e) => this._keydown(e)));
    this.resize();
  }

  destroy() { this._ro.disconnect(); window.removeEventListener('mousemove', this._mv); window.removeEventListener('mouseup', this._up); window.removeEventListener('keydown', this._key); }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height); this.dpr = d;
    this.canvas.width = Math.round(this.W * d); this.canvas.height = Math.round(this.H * d);
    this.render();
  }

  render() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); }

  road() {
    const sel = store.selectedRoad();
    return sel || store.project.roads[0] || null;
  }

  data() {
    const road = this.road();
    if (!road) return null;
    const r = store.roadResult(road.id);
    if (!r || !r.profile) return null;
    const profile = this.preview ? this.preview : r.profile;
    return { road, r, profile, ground: r.ground || [] };
  }

  fitView(d) {
    const al = d.r.alignment;
    let zmin = Infinity, zmax = -Infinity;
    for (const g of d.ground) if (g.z != null) { zmin = Math.min(zmin, g.z); zmax = Math.max(zmax, g.z); }
    for (const p of d.profile.pvis) { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); }
    if (!Number.isFinite(zmin)) { zmin = 0; zmax = 10; }
    const padS = al.length * 0.04;
    this.view = { s0: al.startStation - padS, s1: al.endStation + padS };
    const kx = (this.W - 80) / (this.view.s1 - this.view.s0);
    this.kx = kx;
    // exagero vertical para o perfil ocupar ~65% da altura (entre 2x e 50x, arredondado)
    const range = Math.max(1, zmax - zmin);
    let ex = ((this.H - 60) * 0.65) / (range * kx);
    ex = Math.max(2, Math.min(50, ex));
    ex = ex >= 10 ? Math.round(ex / 5) * 5 : Math.round(ex);
    this.ex = ex; this.ky = kx * ex;
    this.zc = (zmin + zmax) / 2;
    this.sOff = this.view.s0;
  }

  s2x(s) { return 60 + (s - this.sOff) * this.kx; }
  z2y(z) { return this.H / 2 - (z - this.zc) * this.ky; }
  x2s(x) { return this.sOff + (x - 60) / this.kx; }
  y2z(y) { return this.zc - (y - this.H / 2) / this.ky; }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, this.W, this.H);
    const d = this.data();
    if (!d) {
      ctx.fillStyle = '#6c7889'; ctx.font = '14px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText('Desenhe uma via na planta para ver o perfil longitudinal.', this.W / 2, this.H / 2);
      return;
    }
    if (this._roadId !== d.road.id || !this.view || store.ui.fitRequest !== this._fit) { this._roadId = d.road.id; this._fit = store.ui.fitRequest; this.fitView(d); }
    const tech = store.ui.mode === 'tecnico';
    const iv = store.project.settings.stationInterval || 20;
    // grade
    const sStep = niceStep(70 / this.kx);
    const zStep = niceStep(40 / this.ky);
    ctx.strokeStyle = '#1b222c'; ctx.lineWidth = 1; ctx.font = '10px Segoe UI'; ctx.fillStyle = '#5d6a7b';
    ctx.beginPath();
    const s0 = this.x2s(0), s1 = this.x2s(this.W);
    for (let s = Math.ceil(s0 / sStep) * sStep; s <= s1; s += sStep) { const x = Math.round(this.s2x(s)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, this.H - 18); }
    const zTop = this.y2z(0), zBot = this.y2z(this.H);
    for (let z = Math.ceil(zBot / zStep) * zStep; z <= zTop; z += zStep) { const y = Math.round(this.z2y(z)) + 0.5; ctx.moveTo(40, y); ctx.lineTo(this.W, y); }
    ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let z = Math.ceil(zBot / zStep) * zStep; z <= zTop; z += zStep) ctx.fillText(fmt(z, zStep < 1 ? 1 : 0), 38, this.z2y(z));
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let s = Math.ceil(s0 / sStep) * sStep; s <= s1; s += sStep) ctx.fillText(sStep >= iv ? `${fmtStation(s, iv, 0).replace(' + 0', '')}` : fmt(s, 0), this.s2x(s), this.H - 3);
    const al = d.r.alignment;
    // terreno e greide
    const g = d.ground;
    const pr = d.profile;
    // áreas de corte/aterro
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i];
      if (a.z == null || b.z == null) continue;
      if (a.s < pr.startStation || b.s > pr.endStation) continue;
      const za = pr.elevationAt(a.s), zb = pr.elevationAt(b.s);
      const cut = (a.z + b.z) / 2 > (za + zb) / 2;
      ctx.fillStyle = cut ? 'rgba(196,110,70,0.35)' : 'rgba(110,160,80,0.32)';
      ctx.beginPath();
      ctx.moveTo(this.s2x(a.s), this.z2y(a.z)); ctx.lineTo(this.s2x(b.s), this.z2y(b.z));
      ctx.lineTo(this.s2x(b.s), this.z2y(zb)); ctx.lineTo(this.s2x(a.s), this.z2y(za)); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = 1.6; ctx.beginPath();
    let pen = false;
    for (const p of g) {
      if (p.z == null) { pen = false; continue; }
      const x = this.s2x(p.s), y = this.z2y(p.z);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // tangentes do greide
    ctx.strokeStyle = 'rgba(255,209,102,0.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); pr.pvis.forEach((p, i) => (i ? ctx.lineTo(this.s2x(p.s), this.z2y(p.z)) : ctx.moveTo(this.s2x(p.s), this.z2y(p.z)))); ctx.stroke();
    ctx.setLineDash([]);
    // greide
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2.2; ctx.beginPath();
    pr.sample(Math.max(0.5, 2 / this.kx)).forEach((p, i) => (i ? ctx.lineTo(this.s2x(p.s), this.z2y(p.z)) : ctx.moveTo(this.s2x(p.s), this.z2y(p.z))));
    ctx.stroke();
    // curvas verticais
    for (const c of pr.curves) {
      ctx.fillStyle = '#ffd166';
      for (const [s, z, lb] of [[c.sPCV, c.zPCV, 'PCV'], [c.sPTV, c.zPTV, 'PTV']]) {
        const x = this.s2x(s), y = this.z2y(z);
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        if (tech) { ctx.font = '9px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(lb, x, y + 12); }
      }
      if (tech) {
        const x = this.s2x(c.s), y = this.z2y(c.z);
        ctx.fillStyle = '#ffd166'; ctx.font = '600 10px Segoe UI'; ctx.textAlign = 'center';
        const up = c.type === 'convexa' ? -1 : 1;
        ctx.fillText(`PIV ${c.number}  ${fmtStation(c.s, iv)}  cota ${fmt(c.z, 3)}`, x, y + up * 28);
        ctx.font = '10px Segoe UI'; ctx.fillStyle = '#d8c48c';
        ctx.fillText(`L=${fmt(c.L, 0)} m  K=${fmt(c.K, 1)}  e=${fmt(Math.abs(c.e), 3)} m (${c.type})`, x, y + up * 16);
      }
    }
    // rampas
    ctx.font = '600 11px Segoe UI'; ctx.textAlign = 'center';
    for (let i = 0; i < pr.pvis.length - 1; i++) {
      const a = pr.pvis[i], b = pr.pvis[i + 1];
      const sm = (a.s + b.s) / 2;
      const x = this.s2x(sm), y = this.z2y(pr.elevationAt(sm));
      const gtxt = `i = ${fmtPct(pr.grades[i])}`;
      const ang = Math.atan2(-(b.z - a.z) * this.ky, (b.s - a.s) * this.kx);
      ctx.save(); ctx.translate(x, y - 10); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(16,20,26,0.75)'; const w = ctx.measureText(gtxt).width + 8; ctx.fillRect(-w / 2, -8, w, 15);
      const rcMax = d.r.checks?.some((c) => c.group === 'Greide' && c.level === 'erro' && Math.abs((c.s ?? -1) - a.s) < 1e-6 && c.msg.startsWith('Rampa'));
      ctx.fillStyle = rcMax ? '#ff6b6b' : '#e6ebf2'; ctx.fillText(gtxt, 0, 0); ctx.restore();
    }
    // PIVs
    const editable = !!store.selectedRoad();
    pr.pvis.forEach((p, i) => {
      const x = this.s2x(p.s), y = this.z2y(p.z);
      ctx.fillStyle = this.selPvi === i ? '#2fb9a8' : '#10141a'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, editable ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // estacas dos pontos notáveis horizontais
    ctx.strokeStyle = 'rgba(76,179,232,0.45)'; ctx.setLineDash([2, 3]);
    for (const k of al.keyPoints()) {
      if (k.label === 'PP' || k.label === 'PF') continue;
      const x = this.s2x(k.s); ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, this.H - 18); ctx.stroke();
      if (tech) { ctx.fillStyle = '#4cb3e8'; ctx.font = '9px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(k.label + k.curve, x, 16); }
    }
    ctx.setLineDash([]);
    // cursor
    if (this.hover) {
      const { s } = this.hover;
      if (s >= al.startStation && s <= al.endStation) {
        const x = this.s2x(s);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H - 18); ctx.stroke();
        const zg = groundAt(g, s), zp = pr.elevationAt(s);
        const txt = `Est. ${fmtStation(s, iv)}   Terreno ${zg == null ? '-' : fmt(zg, 3)}   Greide ${fmt(zp, 3)}   ${zg == null ? '' : (zp - zg >= 0 ? 'Aterro ' : 'Corte ') + fmt(Math.abs(zp - zg), 2) + ' m'}   Rampa ${fmtPct(pr.gradeAt(s))}`;
        ctx.font = '11px Segoe UI'; const w = ctx.measureText(txt).width + 14;
        const bx = Math.min(this.W - w - 6, Math.max(46, x + 8));
        ctx.fillStyle = 'rgba(16,20,26,0.9)'; ctx.fillRect(bx, 6, w, 20);
        ctx.fillStyle = '#e6ebf2'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 7, 16);
      }
    }
    ctx.fillStyle = '#6c7889'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${d.road.name} · exagero vertical ${fmt(this.ex, 1)}×${d.road.profile.auto ? ' · greide automático' : ''}`, this.W - 8, this.H - 20);
  }

  _evt(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  _wheel(e) {
    e.preventDefault();
    if (!this.view) return;
    const [x, y] = this._evt(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const s = this.x2s(x), z = this.y2z(y);
    if (e.shiftKey) { this.ky *= f; this.ex = this.ky / this.kx; }
    else { this.kx *= f; this.ky *= f; }
    this.sOff = s - (x - 60) / this.kx;
    this.zc = z + (y - this.H / 2) / this.ky;
    this.render();
  }

  _pviAt(x, y, d) {
    for (let i = 0; i < d.profile.pvis.length; i++) {
      const p = d.profile.pvis[i];
      if (Math.hypot(this.s2x(p.s) - x, this.z2y(p.z) - y) <= 9) return i;
    }
    return -1;
  }

  _down(e) {
    const d = this.data();
    if (!d) return;
    const [x, y] = this._evt(e);
    if (e.button === 0 && store.selectedRoad()) {
      const i = this._pviAt(x, y, d);
      if (i >= 0) {
        this.selPvi = i;
        this.drag = { kind: 'pvi', i, base: d.profile.pvis.map((p) => ({ ...p })), x, y };
        this.render();
        return;
      }
    }
    this.drag = { kind: 'pan', x, y, sOff: this.sOff, zc: this.zc };
  }

  _move(e) {
    if (!this.canvas.isConnected) return;
    const [x, y] = this._evt(e);
    if (this.drag?.kind === 'pan') {
      this.sOff = this.drag.sOff - (x - this.drag.x) / this.kx;
      this.zc = this.drag.zc + (y - this.drag.y) / this.ky;
      this.render();
      return;
    }
    if (this.drag?.kind === 'pvi') {
      const d = this.data();
      const pv = this.drag.base.map((p) => ({ ...p }));
      const i = this.drag.i;
      const z = this.y2z(y);
      pv[i].z = Math.round(z * 1000) / 1000;
      if (i > 0 && i < pv.length - 1) {
        let s = this.x2s(x);
        s = Math.max(pv[i - 1].s + 1, Math.min(pv[i + 1].s - 1, s));
        pv[i].s = Math.round(s * 100) / 100;
      }
      this.drag.result = pv;
      this.preview = new Profile({ pvis: pv });
      void d;
      this.render();
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { if (this.hover) { this.hover = null; this.render(); } return; }
    if (this.view) { this.hover = { s: this.x2s(x) }; this.render(); }
  }

  _release() {
    const dr = this.drag;
    this.drag = null;
    if (dr?.kind === 'pvi' && dr.result) {
      const road = this.road();
      const pv = dr.result;
      this.preview = null;
      store.update('Editar greide (PIV)', (p) => {
        const rd = p.roads.find((r) => r.id === road.id);
        rd.profile = { pvis: pv, auto: false };
      });
    } else if (dr?.kind === 'pvi') { this.preview = null; }
    this.render();
  }

  _dbl(e) {
    const road = store.selectedRoad();
    const d = this.data();
    if (!road || !d) return;
    const [x, y] = this._evt(e);
    const s = this.x2s(x), z = this.y2z(y);
    const pv = d.profile.pvis.map((p) => ({ ...p }));
    if (s <= pv[0].s || s >= pv[pv.length - 1].s) return;
    let idx = pv.findIndex((p) => p.s > s);
    const V = road.V;
    // comprimento da curva limitado ao espaço livre entre as curvas vizinhas
    const prev = pv[idx - 1], next = pv[idx];
    // abre espaço reduzindo as curvas vizinhas (no máximo até 45% da distância ao novo PIV)
    if (idx - 1 > 0) prev.L = Math.min(prev.L || 0, Math.floor((2 * (s - prev.s) * 0.45) / 5) * 5);
    if (idx < pv.length - 1) next.L = Math.min(next.L || 0, Math.floor((2 * (next.s - s) * 0.45) / 5) * 5);
    const prevEnd = prev.s + (idx - 1 > 0 ? (prev.L || 0) / 2 : 0);
    const nextStart = next.s - (idx < pv.length - 1 ? (next.L || 0) / 2 : 0);
    const room = Math.min(s - prevEnd, nextStart - s);
    if (room <= 1) { store.toast('Sem espaço para um PIV aqui: aproxime o zoom ou afaste os PIVs vizinhos.', 'err'); return; }
    const want = Math.max(20, Math.ceil((0.6 * V) / 10) * 10 + 20);
    const L = Math.max(0, Math.min(want, Math.floor((2 * room * 0.95) / 5) * 5));
    pv.splice(idx, 0, { s: Math.round(s * 100) / 100, z: Math.round(z * 1000) / 1000, L });
    store.update('Inserir PIV', (p) => { p.roads.find((r) => r.id === road.id).profile = { pvis: pv, auto: false }; });
    this.selPvi = idx;
  }

  _keydown(e) {
    if (!this.canvas.isConnected) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selPvi != null) {
      const road = store.selectedRoad();
      const d = this.data();
      if (!road || !d) return;
      const pv = d.profile.pvis.map((p) => ({ ...p }));
      if (this.selPvi <= 0 || this.selPvi >= pv.length - 1) return;
      pv.splice(this.selPvi, 1);
      this.selPvi = null;
      store.update('Remover PIV', (p) => { p.roads.find((r) => r.id === road.id).profile = { pvis: pv, auto: false }; });
      e.preventDefault();
    } else if (e.key === 'f' || e.key === 'F') { this.view = null; this.render(); }
  }
}

function groundAt(g, s) {
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1], b = g[i];
    if (a.z == null || b.z == null) continue;
    if (s >= a.s && s <= b.s) return a.z + ((b.z - a.z) * (s - a.s)) / (b.s - a.s || 1);
  }
  return null;
}
