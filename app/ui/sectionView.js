// URBIS - visualização das seções transversais

import { store } from './store.js';
import { fmt, fmtStation, fmtPct } from '../core/util.js';

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

const CODE_COLORS = { pista: '#9aa3ad', acostamento: '#b0b6be', sarjeta: '#d0d0d0', meiofio: '#ffffff', passeio: '#d8c9a8', canteiro: '#7bd36a', ciclovia: '#e07b7b', estacionamento: '#a0a7b0', generico: '#c0c0c0' };

export class SectionView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._raf = 0;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    window.addEventListener('keydown', (this._key = (e) => this._keydown(e)));
    canvas.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    this.zoom = 2;
    this.resize();
  }
  destroy() { this._ro.disconnect(); window.removeEventListener('keydown', this._key); }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height); this.dpr = d;
    this.canvas.width = Math.round(this.W * d); this.canvas.height = Math.round(this.H * d);
    this.render();
  }
  render() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); }

  data() {
    const road = store.selectedRoad() || store.project.roads[0];
    if (!road) return null;
    const r = store.roadResult(road.id);
    if (!r || !r.corridor || !r.corridor.sections.length) return null;
    const n = r.corridor.sections.length;
    const idx = Math.max(0, Math.min(n - 1, store.ui.sectionIndex || 0));
    return { road, r, sc: r.corridor.sections[idx], idx, n };
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, this.W, this.H);
    const d = this.data();
    if (!d) {
      ctx.fillStyle = '#6c7889'; ctx.font = '14px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText('Sem seções calculadas. Desenhe uma via sobre um terreno importado.', this.W / 2, this.H / 2);
      return;
    }
    const sc = d.sc;
    const iv = store.project.settings.stationInterval || 20;
    // extensão
    let oMin = Infinity, oMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const p of sc.top) { oMin = Math.min(oMin, p.o); oMax = Math.max(oMax, p.o); zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); }
    const pad = Math.max(5, (oMax - oMin) * 0.12);
    oMin -= pad; oMax += pad;
    for (const p of sc.ground) if (p.z != null && p.o >= oMin && p.o <= oMax) { zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); }
    for (const p of sc.datum) { zMin = Math.min(zMin, p.z); }
    const ex = this.zoom;
    const k = Math.min((this.W - 80) / (oMax - oMin), (this.H - 110) / Math.max(1, (zMax - zMin) * ex));
    const ky = k * ex;
    const oc = (oMin + oMax) / 2, zc = (zMin + zMax) / 2;
    const X = (o) => this.W / 2 + (o - oc) * k;
    const Y = (z) => this.H / 2 + 10 - (z - zc) * ky;
    // grade
    const os = niceStep(60 / k), zs = niceStep(40 / ky);
    ctx.strokeStyle = '#1b222c'; ctx.lineWidth = 1; ctx.beginPath();
    for (let o = Math.ceil(oMin / os) * os; o <= oMax; o += os) { const x = Math.round(X(o)) + 0.5; ctx.moveTo(x, 40); ctx.lineTo(x, this.H - 20); }
    const zt = zc + (this.H / 2 - 30) / ky, zb = zc - (this.H / 2 - 20) / ky;
    for (let z = Math.ceil(zb / zs) * zs; z <= zt; z += zs) { const y = Math.round(Y(z)) + 0.5; ctx.moveTo(40, y); ctx.lineTo(this.W - 10, y); }
    ctx.stroke();
    ctx.fillStyle = '#5d6a7b'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let z = Math.ceil(zb / zs) * zs; z <= zt; z += zs) ctx.fillText(fmt(z, zs < 1 ? 1 : 0), 38, Y(z));
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let o = Math.ceil(oMin / os) * os; o <= oMax; o += os) ctx.fillText(fmt(o, 0), X(o), this.H - 4);
    // áreas de corte e aterro (polígono entre linha de terraplenagem e terreno)
    this._fillAreas(sc, X, Y);
    // terreno
    ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = 1.6; ctx.beginPath();
    let pen = false;
    for (const p of sc.ground) { if (p.z == null) { pen = false; continue; } if (!pen) { ctx.moveTo(X(p.o), Y(p.z)); pen = true; } else ctx.lineTo(X(p.o), Y(p.z)); }
    ctx.stroke();
    // linha de terraplenagem
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); sc.datum.forEach((p, i) => (i ? ctx.lineTo(X(p.o), Y(p.z)) : ctx.moveTo(X(p.o), Y(p.z)))); ctx.stroke(); ctx.setLineDash([]);
    // superfície de projeto, colorida por componente
    ctx.lineWidth = 3;
    for (let i = 1; i < sc.top.length; i++) {
      const a = sc.top[i - 1], b = sc.top[i];
      const code = (b.o >= 0 ? b.code : a.code) || '';
      const type = code.replace(/[0-9]+(_FACE)?$/, '');
      ctx.strokeStyle = CODE_COLORS[type] || (code === 'OFFSET' || code.startsWith('VALETA') ? '#ff5a4a' : '#e6ebf2');
      if (code === 'OFFSET' || code.startsWith('VALETA') || (a.code === 'OFFSET')) ctx.lineWidth = 1.6; else ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X(a.o), Y(a.z)); ctx.lineTo(X(b.o), Y(b.z)); ctx.stroke();
    }
    // eixo
    ctx.strokeStyle = '#ff5a4a'; ctx.setLineDash([8, 3, 2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(0), 36); ctx.lineTo(X(0), this.H - 20); ctx.stroke(); ctx.setLineDash([]);
    // rótulos
    ctx.fillStyle = '#e6ebf2'; ctx.font = '600 13px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${d.road.name} — Estaca ${fmtStation(sc.s, iv)}  (${fmt(sc.s, 2)} m)   seção ${d.idx + 1} de ${d.n}`, 50, 8);
    ctx.font = '11px Segoe UI'; ctx.fillStyle = '#9aa6b6';
    const hTxt = sc.height == null ? '' : (sc.height >= 0 ? `aterro ${fmt(sc.height, 2)} m no eixo` : `corte ${fmt(-sc.height, 2)} m no eixo`);
    ctx.fillText(`Greide ${fmt(sc.zc, 3)}   Terreno ${sc.zg == null ? '-' : fmt(sc.zg, 3)}   ${hTxt}   Declividades LE ${fmtPct(sc.slopes.L)} / LD ${fmtPct(sc.slopes.R)}`, 50, 26);
    // caixa de áreas
    const bx = this.W - 210, by = 8;
    ctx.fillStyle = 'rgba(16,20,26,0.9)'; ctx.fillRect(bx, by, 200, 62);
    ctx.strokeStyle = '#2e3744'; ctx.strokeRect(bx + 0.5, by + 0.5, 199, 61);
    ctx.font = '12px Segoe UI'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ff9b8f'; ctx.fillText(`Corte:   ${fmt(sc.cutArea, 2)} m²`, bx + 10, by + 8);
    ctx.fillStyle = '#93e69a'; ctx.fillText(`Aterro:  ${fmt(sc.fillArea, 2)} m²`, bx + 10, by + 26);
    ctx.fillStyle = '#9aa6b6'; ctx.fillText(`Largura de limpeza: ${fmt(sc.clearing, 2)} m`, bx + 10, by + 44);
    // offsets dos taludes
    ctx.font = '10px Segoe UI'; ctx.fillStyle = '#ffb3ab'; ctx.textAlign = 'center';
    for (const side of ['left', 'right']) {
      const dl = sc[side].daylight;
      if (!dl.pts.length) continue;
      const p = dl.pts[dl.pts.length - 1];
      const o = side === 'left' ? -p.o : p.o;
      ctx.beginPath(); ctx.arc(X(o), Y(p.z), 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(`${dl.type === 'corte' ? 'crista' : 'pé'} ${fmt(Math.abs(o), 2)} m · ${fmt(p.z, 2)}`, X(o), Y(p.z) - 14);
    }
    ctx.fillStyle = '#6c7889'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`setas ← → navegam entre seções · roda do mouse: exagero vertical ${fmt(ex, 1)}×`, this.W - 10, this.H - 18);
  }

  _fillAreas(sc, X, Y) {
    const ctx = this.ctx;
    const g = sc.ground.filter((p) => p.z != null);
    if (g.length < 2) return;
    const gAt = (o) => {
      for (let i = 1; i < sc.ground.length; i++) {
        const a = sc.ground[i - 1], b = sc.ground[i];
        if (a.z == null || b.z == null) continue;
        if (o >= a.o && o <= b.o) return a.z + ((b.z - a.z) * (o - a.o)) / (b.o - a.o || 1);
      }
      return null;
    };
    const D = sc.datum;
    for (let i = 1; i < D.length; i++) {
      const P = D[i - 1], Q = D[i];
      if (Q.o - P.o < 1e-6) continue;
      const xs = [P.o];
      for (const p of g) if (p.o > P.o && p.o < Q.o) xs.push(p.o);
      xs.push(Q.o);
      for (let k = 1; k < xs.length; k++) {
        const a = xs[k - 1], b = xs[k];
        const ga = gAt(a), gb = gAt(b);
        if (ga == null || gb == null) continue;
        const da = P.z + ((Q.z - P.z) * (a - P.o)) / (Q.o - P.o), db = P.z + ((Q.z - P.z) * (b - P.o)) / (Q.o - P.o);
        const fill = (da - ga + db - gb) / 2 > 0;
        ctx.fillStyle = fill ? 'rgba(110,160,80,0.45)' : 'rgba(196,110,70,0.5)';
        ctx.beginPath(); ctx.moveTo(X(a), Y(da)); ctx.lineTo(X(b), Y(db)); ctx.lineTo(X(b), Y(gb)); ctx.lineTo(X(a), Y(ga)); ctx.closePath(); ctx.fill();
      }
    }
  }

  _wheel(e) { e.preventDefault(); this.zoom = Math.max(1, Math.min(10, this.zoom * Math.exp(-e.deltaY * 0.0015))); this.render(); }

  _keydown(e) {
    if (!this.canvas.isConnected) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const d = this.data();
    if (!d) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { store.setUI({ sectionIndex: Math.min(d.n - 1, d.idx + 1) }); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { store.setUI({ sectionIndex: Math.max(0, d.idx - 1) }); e.preventDefault(); }
    if (e.key === 'Home') store.setUI({ sectionIndex: 0 });
    if (e.key === 'End') store.setUI({ sectionIndex: d.n - 1 });
  }
}
