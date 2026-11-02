// URBIS - documentos em PDF (jsPDF): pranchas técnicas, quadros, memorial e orçamento
import { fmt, fmtPct, fmtStation, fmtDMS, fmtAz } from '../util.js';
import { sideComponents, templateWidths } from '../template.js';
import { ROAD_CLASSES } from '../norms/brasil.js';
import { collectBudget, collectItems } from './budget.js';
import { buildMemorial } from './memorial.js';

export const PAPER = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] };

/** Remove caracteres fora do conjunto suportado pelas fontes padrão do PDF. */
export function t(s) {
  return String(s ?? '')
    .replace(/Δ/g, 'AC').replace(/θ/g, 'teta').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/→/g, '->').replace(/⁰/g, '0').replace(/¹/g, '1').replace(/⁴/g, '4').replace(/⁵/g, '5').replace(/⁶/g, '6').replace(/⁷/g, '7').replace(/⁸/g, '8')
    .replace(/[^\x00-\xFF]/g, '?');
}

const C = {
  black: [0, 0, 0], gray: [110, 110, 110], light: [190, 190, 190], grid: [215, 215, 215], red: [200, 30, 30], blue: [20, 90, 200],
  brown: [150, 105, 60], contour: [190, 160, 120], contourMajor: [150, 110, 70], green: [40, 130, 60], orange: [220, 140, 0], magenta: [170, 50, 170],
};

// ------------------------------------------------------------------ utilitários de desenho
function setLine(doc, color, w, dash) {
  doc.setDrawColor(...color);
  doc.setLineWidth(w);
  doc.setLineDashPattern(dash || [], 0);
}

/** Recorte de segmento por retângulo (Liang-Barsky). */
function clipSeg(x0, y0, x1, y1, r) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy], q = [x0 - r.x, r.x + r.w - x0, y0 - r.y, r.y + r.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const tt = q[i] / p[i];
    if (p[i] < 0) { if (tt > t1) return null; if (tt > t0) t0 = tt; } else { if (tt < t0) return null; if (tt < t1) t1 = tt; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

function polyline(doc, pts, rect) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!a || !b) continue;
    if (rect) {
      const c = clipSeg(a[0], a[1], b[0], b[1], rect);
      if (c) doc.line(c[0], c[1], c[2], c[3]);
    } else doc.line(a[0], a[1], b[0], b[1]);
  }
}

function inRect(x, y, r, pad = 0) { return x >= r.x + pad && x <= r.x + r.w - pad && y >= r.y + pad && y <= r.y + r.h - pad; }

function text(doc, s, x, y, o = {}) {
  doc.setFontSize(o.size ?? 7);
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
  doc.setTextColor(...(o.color || C.black));
  const opts = {};
  if (o.align) opts.align = o.align;
  if (o.angle) opts.angle = o.angle;
  if (o.baseline) opts.baseline = o.baseline;
  doc.text(t(s), x, y, opts);
}

// ------------------------------------------------------------------ moldura e carimbo
function sheetFrame(doc, W, H, info) {
  const ml = 25, mo = W > 420 ? 10 : 7;
  setLine(doc, C.black, 0.7);
  doc.rect(ml, mo, W - ml - mo, H - 2 * mo);
  // carimbo
  const cw = 175, ch = 60;
  const cx = W - mo - cw, cy = H - mo - ch;
  setLine(doc, C.black, 0.5);
  doc.rect(cx, cy, cw, ch);
  const rows = [12, 9, 9, 9, 10, 11];
  let y = cy;
  const ys = [];
  for (const h of rows) { ys.push(y); y += h; if (y < cy + ch - 0.1) { setLine(doc, C.black, 0.3); doc.line(cx, y, cx + cw, y); } }
  text(doc, info.company || 'URBIS', cx + 3, ys[0] + 5.5, { size: 10, bold: true });
  text(doc, 'Projeto urbano e viário', cx + 3, ys[0] + 10, { size: 6, color: C.gray });
  text(doc, 'PROJETO', cx + 3, ys[1] + 3, { size: 5, color: C.gray });
  text(doc, info.project, cx + 3, ys[1] + 7.5, { size: 8.5, bold: true });
  text(doc, 'TÍTULO DA PRANCHA', cx + 3, ys[2] + 3, { size: 5, color: C.gray });
  text(doc, info.title, cx + 3, ys[2] + 7.5, { size: 8, bold: true });
  setLine(doc, C.black, 0.3); doc.line(cx + 95, ys[3], cx + 95, ys[3] + 9);
  text(doc, 'CLIENTE', cx + 3, ys[3] + 3, { size: 5, color: C.gray }); text(doc, info.client || '-', cx + 3, ys[3] + 7.2, { size: 7 });
  text(doc, 'LOCAL', cx + 97, ys[3] + 3, { size: 5, color: C.gray }); text(doc, info.location || '-', cx + 97, ys[3] + 7.2, { size: 7 });
  doc.line(cx + 115, ys[4], cx + 115, ys[4] + 10);
  text(doc, 'RESPONSÁVEL TÉCNICO', cx + 3, ys[4] + 3, { size: 5, color: C.gray });
  text(doc, `${info.author || ''}${info.crea ? '  -  CREA/CAU ' + info.crea : ''}${info.art ? '  -  ART ' + info.art : ''}`, cx + 3, ys[4] + 7.5, { size: 6.5 });
  text(doc, 'ASSINATURA', cx + 117, ys[4] + 3, { size: 5, color: C.gray });
  const cols = [0, 45, 85, 135, 175];
  for (let i = 1; i < cols.length - 1; i++) doc.line(cx + cols[i], ys[5], cx + cols[i], ys[5] + 11);
  const cells = [['ESCALA', info.scale || 'Indicada'], ['DATA', info.date], ['FOLHA', info.sheet === '#/#' ? '' : info.sheet], ['REVISÃO', info.rev || '00']];
  cells.forEach(([k, v], i) => { text(doc, k, cx + cols[i] + 2, ys[5] + 3, { size: 5, color: C.gray }); text(doc, v, cx + cols[i] + 2, ys[5] + 8.5, { size: 8, bold: true }); });
  return { x: ml + 4, y: mo + 4, w: W - ml - mo - 8, h: H - 2 * mo - 8, carimbo: { x: cx, y: cy, w: cw, h: ch }, ml, mo };
}

function northArrow(doc, x, y, angleRad) {
  // angleRad: ângulo (papel) do norte, 0 = para cima
  const L = 9;
  const s = Math.sin(angleRad), c = Math.cos(angleRad);
  const P = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
  const tip = P(0, -L), l = P(-3, L * 0.5), r = P(3, L * 0.5), m = P(0, L * 0.15);
  doc.setFillColor(0, 0, 0); setLine(doc, C.black, 0.3);
  doc.triangle(tip[0], tip[1], l[0], l[1], m[0], m[1], 'FD');
  doc.setFillColor(255, 255, 255);
  doc.triangle(tip[0], tip[1], r[0], r[1], m[0], m[1], 'FD');
  const n = P(0, -L - 3.5);
  text(doc, 'N', n[0], n[1], { size: 9, bold: true, align: 'center' });
}

// ------------------------------------------------------------------ contexto de cálculo
function contoursFor(ctx, surface) {
  if (!surface) return [];
  if (!ctx._contours) ctx._contours = new Map();
  if (!ctx._contours.has(surface)) ctx._contours.set(surface, surface.contours(ctx.project.settings.contourInterval || 1, { majorEvery: ctx.project.settings.contourMajor || 5 }));
  return ctx._contours.get(surface);
}

// ------------------------------------------------------------------ planta (vista rotacionada)
class PlanFrame {
  constructor(rect, center, u, k) {
    this.r = rect; this.c = center; this.u = u; this.v = { x: -u.y, y: u.x }; this.k = k;
    this.cx = rect.x + rect.w / 2; this.cy = rect.y + rect.h / 2;
  }
  P(x, y) {
    const dx = x - this.c.x, dy = y - this.c.y;
    return [this.cx + (dx * this.u.x + dy * this.u.y) * this.k, this.cy - (dx * this.v.x + dy * this.v.y) * this.k];
  }
  /** Ângulo (graus, anti-horário) para texto ao longo de uma direção do mundo (azimute). */
  angleOf(az) {
    const d = { x: Math.sin(az), y: Math.cos(az) };
    const px = d.x * this.u.x + d.y * this.u.y, py = d.x * this.v.x + d.y * this.v.y;
    let a = Math.atan2(py, px) * 180 / Math.PI;
    if (a > 90) a -= 180; if (a < -90) a += 180;
    return a;
  }
}

function drawPlanContent(doc, ctx, pf, opts = {}) {
  const r = pf.r;
  // curvas de nível
  for (const sdef of ctx.project.surfaces) {
    const sf = ctx.model.surface(ctx.project, sdef.id);
    for (const lv of contoursFor(ctx, sf)) {
      setLine(doc, lv.major ? C.contourMajor : C.contour, lv.major ? 0.18 : 0.08);
      for (const line of lv.lines) {
        const pts = line.map((q) => pf.P(q.x, q.y));
        polyline(doc, pts, r);
        if (lv.major && line.length > 10) {
          const mid = Math.floor(line.length / 2);
          const p = pts[mid];
          if (inRect(p[0], p[1], r, 6)) {
            const a = Math.atan2(line[mid + 1].y - line[mid].y, line[mid + 1].x - line[mid].x);
            const az = Math.PI / 2 - a;
            doc.setFillColor(255, 255, 255);
            text(doc, fmt(lv.z, 0), p[0], p[1], { size: 4.5, color: C.contourMajor, angle: pf.angleOf(az), align: 'center' });
          }
        }
      }
    }
  }
  // loteamento
  const P = ctx.results.parcels;
  if (P && opts.parcels !== false) {
    if (P.blocks) for (const b of P.blocks) { setLine(doc, C.gray, 0.2); polyline(doc, [...b.polygon, b.polygon[0]].map((q) => pf.P(q.x, q.y)), r); }
    if (P.lots) for (const l of P.lots) {
      setLine(doc, C.gray, 0.12); polyline(doc, [...l.polygon, l.polygon[0]].map((q) => pf.P(q.x, q.y)), r);
      if (opts.lotLabels) { const c = pf.P(l.centroid.x, l.centroid.y); if (inRect(c[0], c[1], r, 3)) { text(doc, `${l.number}`, c[0], c[1] - 0.5, { size: 4.5, align: 'center', bold: true }); text(doc, `${fmt(l.area, 1)}`, c[0], c[1] + 2.2, { size: 3.6, align: 'center', color: C.gray }); } }
    }
    if (ctx.project.parcels.gleba) { setLine(doc, C.magenta, 0.35, [3, 1.5]); polyline(doc, [...ctx.project.parcels.gleba, ctx.project.parcels.gleba[0]].map((q) => pf.P(q.x, q.y)), r); }
  }
  // vias
  for (const rr of ctx.results.roads) drawRoadPlan(doc, ctx, pf, rr, opts);
  setLine(doc, C.black, 0.2);
}

function drawRoadPlan(doc, ctx, pf, rr, opts) {
  const al = rr.alignment;
  if (!al?.elements?.length) return;
  const r = pf.r;
  const tpl = rr.road.template;
  const iv = ctx.project.settings.stationInterval || 20;
  // linhas da seção tipo
  const offs = new Set([0]);
  for (const side of ['L', 'R']) {
    let o = (+tpl.median || 0) / 2;
    if (o > 0) offs.add(side === 'L' ? -o : o);
    for (const c of sideComponents(tpl, side)) { o += +c.width || 0; offs.add(side === 'L' ? -o : o); }
  }
  for (const o of offs) {
    if (o === 0) continue;
    setLine(doc, C.black, 0.15);
    polyline(doc, al.offsetLine(o, 2).map((q) => pf.P(q.x, q.y)), r);
  }
  // offsets (taludes) e hachura
  if (rr.corridor) {
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const pts = [];
      for (const sc of rr.corridor.sections) {
        const d = side === 'L' ? sc.left : sc.right;
        const dl = d.daylight.pts;
        if (!dl.length) { pts.push(null); continue; }
        const q = al.offsetPoint(sc.s, sign * dl[dl.length - 1].o);
        pts.push({ p: pf.P(q.x, q.y), s: sc.s, o: dl[dl.length - 1].o, e: d.edge.o, type: d.daylight.type });
      }
      setLine(doc, C.gray, 0.15, [1.2, 0.8]);
      for (let i = 1; i < pts.length; i++) if (pts[i - 1] && pts[i]) { const c = clipSeg(pts[i - 1].p[0], pts[i - 1].p[1], pts[i].p[0], pts[i].p[1], r); if (c) doc.line(c[0], c[1], c[2], c[3]); }
      setLine(doc, C.gray, 0.1);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (!a || !b) continue;
        const n = Math.max(1, Math.floor((b.s - a.s) / 3));
        for (let k = 0; k < n; k++) {
          const s = a.s + ((b.s - a.s) * k) / n;
          const tt = (s - a.s) / (b.s - a.s);
          const e = a.e + (b.e - a.e) * tt, o = a.o + (b.o - a.o) * tt;
          const len = k % 2 ? 0.45 : 0.9;
          const cut = (a.type || b.type) === 'corte';
          const from = cut ? o : e, to = cut ? o + (e - o) * len : e + (o - e) * len;
          const p1 = al.offsetPoint(s, sign * from), p2 = al.offsetPoint(s, sign * to);
          const s1 = pf.P(p1.x, p1.y), s2 = pf.P(p2.x, p2.y);
          const c = clipSeg(s1[0], s1[1], s2[0], s2[1], r);
          if (c) doc.line(c[0], c[1], c[2], c[3]);
        }
      }
    }
  }
  // sinalização horizontal
  if (rr.markings && opts.signage !== false) {
    for (const ln of rr.markings.lines) {
      const col = ln.color === 'amarela' ? C.orange : C.gray;
      setLine(doc, col, 0.2, ln.dashed ? [ln.dash.dash * pf.k, ln.dash.gap * pf.k] : []);
      const offs2 = ln.double ? [ln.offset - 0.15, ln.offset + 0.15] : [ln.offset];
      for (const o of offs2) polyline(doc, al.offsetLine(o, 2).map((q) => pf.P(q.x, q.y)), r);
    }
    setLine(doc, C.black, 0.2);
    for (const sg of rr.signs || []) {
      const q = al.offsetPoint(sg.s, sg.offset ?? 5);
      const p = pf.P(q.x, q.y);
      if (!inRect(p[0], p[1], r, 2)) continue;
      doc.setFillColor(255, 255, 255); setLine(doc, C.red, 0.3);
      doc.circle(p[0], p[1], 1.2, 'FD');
      text(doc, sg.code + (sg.param ? ' ' + sg.param : ''), p[0] + 1.8, p[1] + 0.8, { size: 4.2, color: C.red });
    }
  }
  // drenagem
  if (rr.drainage && opts.drainage !== false) {
    const nodes = new Map(rr.drainage.network.nodes.map((n) => [n.id, n]));
    setLine(doc, C.blue, 0.35);
    for (const p of rr.drainage.pipes) {
      const a = nodes.get(p.from), b = nodes.get(p.to);
      const pa = pf.P(a.x, a.y), pb = pf.P(b.x, b.y);
      const c = clipSeg(pa[0], pa[1], pb[0], pb[1], r);
      if (c) {
        doc.line(c[0], c[1], c[2], c[3]);
        const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        if (inRect(m[0], m[1], r, 4)) text(doc, `Ø${Math.round(p.D * 1000)} i=${fmt(p.S * 100, 2)}% L=${fmt(p.length, 1)}`, m[0], m[1] - 1, { size: 3.8, color: C.blue, align: 'center', angle: pf.angleOf(Math.atan2(b.x - a.x, b.y - a.y)) });
      }
    }
    for (const n of rr.drainage.network.nodes) {
      const p = pf.P(n.x, n.y);
      if (!inRect(p[0], p[1], r, 2)) continue;
      doc.setFillColor(255, 255, 255); setLine(doc, C.blue, 0.3); doc.circle(p[0], p[1], 0.9, 'FD');
      text(doc, n.id, p[0] + 1.3, p[1] - 1.2, { size: 3.8, color: C.blue });
    }
  }
  // eixo
  setLine(doc, C.red, 0.3, [4, 1, 0.6, 1]);
  polyline(doc, al.sample(2, 0.01).map((q) => pf.P(q.x, q.y)), r);
  setLine(doc, C.black, 0.2);
  // estacas
  for (const s of al.regularStations(iv)) {
    const est = Math.round(s / iv);
    const q = al.pointAt(s);
    const p = pf.P(q.x, q.y);
    if (!inRect(p[0], p[1], r, 3)) continue;
    const major = est % 5 === 0;
    const a = al.offsetPoint(s, major ? -2.2 : -1.2), b = al.offsetPoint(s, major ? 2.2 : 1.2);
    const pa = pf.P(a.x, a.y), pb = pf.P(b.x, b.y);
    setLine(doc, C.red, major ? 0.25 : 0.15);
    doc.line(pa[0], pa[1], pb[0], pb[1]);
    if (major || pf.k >= 1.9) {
      const lp = al.offsetPoint(s, 4.2 / pf.k + 2);
      const pp = pf.P(lp.x, lp.y);
      text(doc, String(est), pp[0], pp[1], { size: major ? 5.5 : 4.2, color: C.red, bold: major, angle: pf.angleOf(q.az + Math.PI / 2), align: 'center' });
    }
  }
  // pontos notáveis e curvas
  for (const kpt of al.keyPoints()) {
    const q = al.pointAt(kpt.s);
    const p = pf.P(q.x, q.y);
    if (!inRect(p[0], p[1], r, 3)) continue;
    doc.setFillColor(0, 0, 0); doc.circle(p[0], p[1], 0.5, 'F');
    const lp = al.offsetPoint(kpt.s, -(templateWidths(tpl).left + 3));
    const pp = pf.P(lp.x, lp.y);
    if (inRect(pp[0], pp[1], r, 3)) text(doc, `${kpt.label}${kpt.curve || ''} = ${fmtStation(kpt.s, iv)}`, pp[0], pp[1], { size: 4.2, angle: pf.angleOf(q.az + Math.PI / 2) });
  }
  for (const c of al.curves) {
    const p = pf.P(c.pi.x, c.pi.y);
    if (!inRect(p[0], p[1], r, 10)) continue;
    setLine(doc, C.gray, 0.12, [1, 1]);
    const ts = pf.P(c.TS.x, c.TS.y), st = pf.P(c.ST.x, c.ST.y);
    doc.line(ts[0], ts[1], p[0], p[1]); doc.line(p[0], p[1], st[0], st[1]);
    setLine(doc, C.black, 0.2);
    const lines = [`PI-${c.piIndex}  C${c.number} (${c.side === 'D' ? 'direita' : 'esquerda'})`, `AC = ${fmtDMS(c.I)}`, `R = ${fmt(c.R, 2)} m${c.Ls ? '   Ls = ' + fmt(c.Ls, 2) + ' m' : ''}`, `T = ${fmt(c.T, 3)} m   D = ${fmt(c.total, 3)} m`];
    lines.forEach((ln, i) => text(doc, ln, p[0] + 2, p[1] - 6 + i * 2.6, { size: 4.4, bold: i === 0 }));
  }
}

function coordGrid(doc, pf, step = 100) {
  const r = pf.r;
  // inverso: papel -> mundo para achar a faixa
  const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => {
    const a = (x - pf.cx) / pf.k, b = -(y - pf.cy) / pf.k;
    return { x: pf.c.x + a * pf.u.x + b * pf.v.x, y: pf.c.y + a * pf.u.y + b * pf.v.y };
  });
  const minX = Math.min(...corners.map((c) => c.x)), maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y)), maxY = Math.max(...corners.map((c) => c.y));
  setLine(doc, C.light, 0.15);
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const p = pf.P(x, y);
      if (!inRect(p[0], p[1], r, 4)) continue;
      doc.line(p[0] - 1.5, p[1], p[0] + 1.5, p[1]); doc.line(p[0], p[1] - 1.5, p[0], p[1] + 1.5);
      text(doc, `E ${fmt(x, 0)}`, p[0] + 1, p[1] - 1, { size: 3.6, color: C.gray });
      text(doc, `N ${fmt(y, 0)}`, p[0] + 1, p[1] + 2.6, { size: 3.6, color: C.gray });
    }
  }
}

// ------------------------------------------------------------------ prancha planta e perfil
function planProfileSheet(doc, ctx, rr, s0, s1, sheetInfo, o) {
  const [W, H] = PAPER[o.paper];
  const area = sheetFrame(doc, W, H, sheetInfo);
  const al = rr.alignment, pr = rr.profile;
  const iv = ctx.project.settings.stationInterval || 20;
  const k = 1000 / o.planScale; // mm por metro
  const usableH = area.h - area.carimbo.h - 4;
  const planRect = { x: area.x, y: area.y, w: area.w, h: usableH * 0.5 };
  const profRect = { x: area.x, y: area.y + usableH * 0.5 + 4, w: area.w, h: usableH * 0.5 - 4 };
  setLine(doc, C.black, 0.3); doc.rect(planRect.x, planRect.y, planRect.w, planRect.h); doc.rect(profRect.x, profRect.y, profRect.w, profRect.h);
  // planta
  const a = al.pointAt(s0), b = al.pointAt(s1);
  let ux = b.x - a.x, uy = b.y - a.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  const pts = al.sample(5, 0.05, s0, s1);
  // centro = meio da caixa envolvente rotacionada
  let mnA = Infinity, mxA = -Infinity, mnB = Infinity, mxB = -Infinity;
  for (const q of pts) { const A = q.x * ux + q.y * uy, B = -q.x * uy + q.y * ux; mnA = Math.min(mnA, A); mxA = Math.max(mxA, A); mnB = Math.min(mnB, B); mxB = Math.max(mxB, B); }
  const cA = (mnA + mxA) / 2, cB = (mnB + mxB) / 2;
  const center = { x: cA * ux - cB * uy, y: cA * uy + cB * ux };
  const pf = new PlanFrame(planRect, center, { x: ux, y: uy }, k);
  coordGrid(doc, pf, o.planScale <= 1000 ? 100 : 200);
  drawPlanContent(doc, ctx, pf, {});
  northArrow(doc, planRect.x + planRect.w - 12, planRect.y + 16, -Math.atan2(-uy, ux) + 0);
  text(doc, `PLANTA - ESCALA 1:${o.planScale}`, planRect.x + 3, planRect.y + 5, { size: 8, bold: true });
  // perfil
  drawProfile(doc, ctx, rr, s0, s1, profRect, o);
  // notas
  const nx = area.x, ny = area.carimbo.y + 2;
  text(doc, 'NOTAS', nx, ny + 3, { size: 6.5, bold: true });
  const notes = [
    `1. Coordenadas no sistema SIRGAS 2000, projeção UTM, fuso ${ctx.project.meta.zone}${ctx.project.meta.hemisphere}. Cotas em metros.`,
    `2. Estaqueamento a cada ${iv} m. Classe: ${ROAD_CLASSES[rr.road.classKey]?.label || rr.road.classKey}; velocidade diretriz ${rr.road.V} km/h.`,
    `3. Taludes: corte ${fmt(rr.road.template.cut.slope, 2)}H:1V; aterro ${fmt(rr.road.template.fill.slope, 2)}H:1V.`,
    '4. Projeto geométrico conforme DNIT (IPR-706/IPR-740); sinalização conforme CONTRAN (MBST).',
  ];
  notes.forEach((n, i) => text(doc, n, nx, ny + 7 + i * 3.4, { size: 5.5 }));
  void s0;
}

function drawProfile(doc, ctx, rr, s0, s1, rect, o) {
  const pr = rr.profile, al = rr.alignment;
  const iv = ctx.project.settings.stationInterval || 20;
  const k = 1000 / o.planScale;
  const bandH = 7.5, nb = 5;
  const graph = { x: rect.x + 26, y: rect.y + 8, w: rect.w - 30, h: rect.h - 8 - nb * bandH - 3 };
  const g = (rr.ground || []).filter((p) => p.z != null && p.s >= s0 - 1 && p.s <= s1 + 1);
  let zmin = Infinity, zmax = -Infinity;
  for (const p of g) { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); }
  for (let s = s0; s <= s1; s += 5) { const z = pr.elevationAt(s); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  if (!Number.isFinite(zmin)) { zmin = 0; zmax = 10; }
  let vScale = o.vScale;
  for (const vs of [o.vScale, 200, 250, 500, 1000, 2000]) { if (vs < o.vScale) continue; vScale = vs; if ((zmax - zmin + 4) * (1000 / vs) <= graph.h) break; }
  const kv = 1000 / vScale;
  const zBase = Math.floor((zmin - 1) / 1) * 1;
  const X = (s) => graph.x + (s - s0) * k;
  const Y = (z) => graph.y + graph.h - (z - zBase) * kv;
  text(doc, `PERFIL LONGITUDINAL - ESCALAS H 1:${o.planScale}  V 1:${vScale}`, rect.x + 3, rect.y + 5, { size: 8, bold: true });
  // grade
  const zTop = zBase + graph.h / kv;
  for (let z = Math.ceil(zBase); z <= zTop; z += 1) {
    const major = z % 5 === 0;
    setLine(doc, major ? C.light : C.grid, major ? 0.15 : 0.08);
    doc.line(graph.x, Y(z), graph.x + graph.w, Y(z));
    if (major) text(doc, fmt(z, 0), graph.x - 1.5, Y(z) + 1, { size: 5, align: 'right', color: C.gray });
  }
  const sFirst = Math.ceil(s0 / iv) * iv;
  for (let s = sFirst; s <= s1 + 1e-6; s += iv) {
    const x = X(s);
    if (x > graph.x + graph.w + 0.01) break;
    setLine(doc, Math.round(s / iv) % 5 === 0 ? C.light : C.grid, 0.1);
    doc.line(x, graph.y, x, graph.y + graph.h + nb * bandH);
  }
  const clip = { x: graph.x, y: graph.y, w: graph.w, h: graph.h };
  // terreno
  setLine(doc, C.brown, 0.25);
  const gp = [];
  for (const p of rr.ground || []) { if (p.z == null || p.s < s0 - 2 || p.s > s1 + 2) { gp.push(null); continue; } gp.push([X(p.s), Y(p.z)]); }
  polyline(doc, gp, clip);
  // greide
  setLine(doc, C.red, 0.45);
  const dp = [];
  for (let s = Math.max(s0, pr.startStation); s <= Math.min(s1, pr.endStation); s += 1) dp.push([X(s), Y(pr.elevationAt(s))]);
  dp.push([X(Math.min(s1, pr.endStation)), Y(pr.elevationAt(Math.min(s1, pr.endStation)))]);
  polyline(doc, dp, clip);
  // curvas verticais e PIVs
  for (const c of pr.curves) {
    if (c.s < s0 || c.s > s1) continue;
    setLine(doc, C.gray, 0.12, [1, 0.8]);
    const pcv = [X(c.sPCV), Y(c.zPCV)], ptv = [X(c.sPTV), Y(c.zPTV)], piv = [X(c.s), Y(c.z)];
    for (const q of [pcv, ptv]) { const cc = clipSeg(q[0], q[1], piv[0], piv[1], clip); if (cc) doc.line(cc[0], cc[1], cc[2], cc[3]); }
    setLine(doc, C.black, 0.2);
    for (const q of [pcv, ptv]) if (inRect(q[0], q[1], clip)) doc.line(q[0], q[1] - 2, q[0], q[1] + 2);
    if (inRect(piv[0], piv[1], clip)) {
      doc.setFillColor(255, 255, 255); doc.circle(piv[0], piv[1], 0.7, 'FD');
      const up = c.type === 'convexa' ? -1 : 1;
      const lines = [`PIV ${c.pviIndex}  Est. ${fmtStation(c.s, iv)}  Cota ${fmt(c.z, 3)}`, `L = ${fmt(c.L, 2)} m   K = ${fmt(c.K, 1)}   e = ${fmt(Math.abs(c.e), 3)} m`, `PCV ${fmtStation(c.sPCV, iv)} (${fmt(c.zPCV, 3)})   PTV ${fmtStation(c.sPTV, iv)} (${fmt(c.zPTV, 3)})`];
      const baseY = up < 0 ? Math.max(graph.y + 3, piv[1] - 14) : Math.min(graph.y + graph.h - 9, piv[1] + 6);
      lines.forEach((ln, i) => text(doc, ln, piv[0], baseY + i * 2.6, { size: 4.2, align: 'center', bold: i === 0 }));
    }
  }
  for (let i = 0; i < pr.pvis.length - 1; i++) {
    const a = pr.pvis[i], b = pr.pvis[i + 1];
    const sm = (Math.max(a.s, s0) + Math.min(b.s, s1)) / 2;
    if (sm < s0 || sm > s1 || Math.min(b.s, s1) - Math.max(a.s, s0) < 30) continue;
    const ang = Math.atan2((b.z - a.z) * kv, (b.s - a.s) * k) * 180 / Math.PI;
    text(doc, `i = ${fmtPct(pr.grades[i], 3)}   L = ${fmt(b.s - a.s, 2)} m`, X(sm), Y(pr.elevationAt(sm)) - 2.5, { size: 4.6, align: 'center', angle: ang, bold: true });
  }
  // faixas inferiores
  const by = graph.y + graph.h + 1;
  const bands = ['Cota do greide', 'Cota do terreno', 'Corte (-) / aterro (+)', 'Estacas', 'Alinhamento horizontal'];
  setLine(doc, C.black, 0.2);
  for (let i = 0; i <= nb; i++) doc.line(rect.x, by + i * bandH, graph.x + graph.w, by + i * bandH);
  bands.forEach((bn, i) => text(doc, bn, rect.x + 1, by + i * bandH + 4.6, { size: 4.6, bold: true }));
  for (let s = sFirst; s <= s1 + 1e-6; s += iv) {
    const x = X(s);
    if (x > graph.x + graph.w + 0.01) break;
    const zp = s >= pr.startStation && s <= pr.endStation ? pr.elevationAt(s) : null;
    const zg = groundAt(rr.ground, s);
    if (zp != null) text(doc, fmt(zp, 3), x + 0.9, by + bandH - 0.6, { size: 3.6, angle: 90 });
    if (zg != null) text(doc, fmt(zg, 3), x + 0.9, by + 2 * bandH - 0.6, { size: 3.6, angle: 90 });
    if (zp != null && zg != null) text(doc, (zp - zg >= 0 ? '+' : '') + fmt(zp - zg, 2), x + 0.9, by + 3 * bandH - 0.6, { size: 3.6, angle: 90, color: zp - zg >= 0 ? C.green : C.red });
    const est = Math.round(s / iv);
    text(doc, String(est), x, by + 4 * bandH - 2, { size: est % 5 === 0 ? 4.6 : 3.8, align: 'center', bold: est % 5 === 0 });
  }
  // diagrama do alinhamento horizontal
  const yMid = by + 4.5 * bandH;
  setLine(doc, C.black, 0.25);
  doc.line(X(Math.max(s0, al.startStation)), yMid, X(Math.min(s1, al.endStation)), yMid);
  for (const c of al.curves) {
    const a = Math.max(s0, c.staTS), b = Math.min(s1, c.staST);
    if (b <= a) continue;
    const h = c.dir > 0 ? -2.2 : 2.2;
    doc.setFillColor(255, 255, 255);
    doc.rect(X(a), Math.min(yMid, yMid + h), X(b) - X(a), Math.abs(h), 'FD');
    text(doc, `C${c.number} R=${fmt(c.R, 0)}`, (X(a) + X(b)) / 2, yMid + (h < 0 ? -2.8 : 4.8), { size: 3.8, align: 'center' });
  }
}

function groundAt(g, s) {
  if (!g) return null;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1], b = g[i];
    if (a.z == null || b.z == null) continue;
    if (s >= a.s - 1e-9 && s <= b.s + 1e-9) return a.z + ((b.z - a.z) * (s - a.s)) / ((b.s - a.s) || 1);
  }
  return null;
}

// ------------------------------------------------------------------ pranchas de seções
function sectionSheets(doc, ctx, rr, o, info, addSheet) {
  const secs = rr.corridor?.sections?.filter((sc) => sc.ground.some((p) => p.z != null)) || [];
  if (!secs.length) return 0;
  const k = 1000 / o.sectionScale;
  let oMin = Infinity, oMax = -Infinity, hMax = 0;
  for (const sc of secs) {
    for (const p of sc.top) { oMin = Math.min(oMin, p.o); oMax = Math.max(oMax, p.o); }
    let zmn = Infinity, zmx = -Infinity;
    for (const p of sc.top) { zmn = Math.min(zmn, p.z); zmx = Math.max(zmx, p.z); }
    for (const p of sc.ground) if (p.z != null && p.o >= oMin - 3 && p.o <= oMax + 3) { zmn = Math.min(zmn, p.z); zmx = Math.max(zmx, p.z); }
    for (const p of sc.datum) zmn = Math.min(zmn, p.z);
    hMax = Math.max(hMax, zmx - zmn);
  }
  oMin -= 3; oMax += 3;
  const cellW = (oMax - oMin) * k + 8, cellH = hMax * k + 18;
  const [W, H] = PAPER[o.paper];
  let count = 0, idx = 0;
  while (idx < secs.length) {
    const area = addSheet(`SEÇÕES TRANSVERSAIS - ${rr.road.name.toUpperCase()}`, `1:${o.sectionScale}`);
    const usable = { x: area.x, y: area.y + 6, w: area.w, h: area.h - area.carimbo.h - 10 };
    text(doc, `SEÇÕES TRANSVERSAIS - ${rr.road.name} - ESCALA 1:${o.sectionScale}`, area.x, area.y + 3, { size: 8, bold: true });
    const ncol = Math.max(1, Math.floor(usable.w / cellW)), nrow = Math.max(1, Math.floor(usable.h / cellH));
    for (let row = 0; row < nrow && idx < secs.length; row++) {
      for (let col = 0; col < ncol && idx < secs.length; col++) {
        const cell = { x: usable.x + col * cellW, y: usable.y + row * cellH, w: cellW, h: cellH };
        drawSectionCell(doc, ctx, secs[idx++], cell, k, oMin, oMax);
      }
    }
    count++;
    void W; void H;
  }
  return count;
}

function drawSectionCell(doc, ctx, sc, cell, k, oMin, oMax) {
  const iv = ctx.project.settings.stationInterval || 20;
  let zmn = Infinity, zmx = -Infinity;
  for (const p of sc.top) { zmn = Math.min(zmn, p.z); zmx = Math.max(zmx, p.z); }
  for (const p of sc.ground) if (p.z != null && p.o >= oMin && p.o <= oMax) { zmn = Math.min(zmn, p.z); zmx = Math.max(zmx, p.z); }
  for (const p of sc.datum) zmn = Math.min(zmn, p.z);
  const X = (o) => cell.x + 4 + (o - oMin) * k;
  const zc = (zmn + zmx) / 2;
  const Y = (z) => cell.y + 10 + (cell.h - 18) / 2 - (z - zc) * k;
  const clip = { x: cell.x + 1, y: cell.y + 7, w: cell.w - 2, h: cell.h - 9 };
  setLine(doc, C.light, 0.1);
  doc.rect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
  // eixo
  setLine(doc, C.red, 0.15, [2, 0.6, 0.4, 0.6]);
  doc.line(X(0), cell.y + 7, X(0), cell.y + cell.h - 2);
  // terreno
  setLine(doc, C.brown, 0.18);
  polyline(doc, sc.ground.map((p) => (p.z == null || p.o < oMin || p.o > oMax ? null : [X(p.o), Y(p.z)])), clip);
  // terraplenagem
  setLine(doc, C.gray, 0.12, [0.8, 0.6]);
  polyline(doc, sc.datum.map((p) => [X(p.o), Y(p.z)]), clip);
  // projeto
  setLine(doc, C.black, 0.35);
  polyline(doc, sc.top.map((p) => [X(p.o), Y(p.z)]), clip);
  setLine(doc, C.black, 0.2);
  text(doc, `EST. ${fmtStation(sc.s, iv)}`, cell.x + cell.w / 2, cell.y + 4.2, { size: 6, bold: true, align: 'center' });
  text(doc, `Ac = ${fmt(sc.cutArea, 2)} m²   Aa = ${fmt(sc.fillArea, 2)} m²`, cell.x + cell.w / 2, cell.y + 6.8, { size: 4.4, align: 'center' });
  text(doc, `Gr ${fmt(sc.zc, 3)}`, X(0) + 1, Y(sc.zc) - 1.2, { size: 4 });
  if (sc.zg != null) text(doc, `Tn ${fmt(sc.zg, 3)}`, X(0) + 1, cell.y + cell.h - 2.5, { size: 4, color: C.brown });
  for (const side of ['left', 'right']) {
    const dl = sc[side].daylight.pts;
    if (!dl.length) continue;
    const p = dl[dl.length - 1];
    const oo = side === 'left' ? -p.o : p.o;
    text(doc, `${fmt(Math.abs(oo), 2)}`, X(oo), Y(p.z) - 1.5, { size: 3.8, align: 'center' });
  }
}

// ------------------------------------------------------------------ tabelas A4
class TablePage {
  constructor(doc, info, pageAdder) { this.doc = doc; this.info = info; this.add = pageAdder; this.y = 0; this.newPage(); }
  newPage(title) {
    this.add();
    const d = this.doc;
    setLine(d, C.black, 0.3);
    d.line(15, 14, 195, 14);
    text(d, this.info.project, 15, 11, { size: 8, bold: true });
    text(d, this.info.company || 'URBIS', 195, 11, { size: 7, align: 'right', color: C.gray });
    this.y = 22;
    if (title) this.heading(title);
  }
  ensure(h) { if (this.y + h > 280) this.newPage(); }
  heading(s, size = 11) { this.ensure(12); text(this.doc, s, 15, this.y, { size, bold: true }); this.y += size * 0.55; }
  para(s, size = 8.5) {
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', 'normal');
    const lines = this.doc.splitTextToSize(t(s), 180);
    for (const ln of lines) { this.ensure(4.5); text(this.doc, ln, 15, this.y, { size }); this.y += size * 0.45; }
    this.y += 1.5;
  }
  table(cols, rows, o = {}) {
    const d = this.doc;
    const size = o.size ?? 6.5;
    const total = cols.reduce((s, c) => s + c.w, 0);
    const scale = 180 / total;
    const ws = cols.map((c) => c.w * scale);
    const rowH = size * 0.55 + 1.2;
    const drawHead = () => {
      d.setFillColor(31, 95, 89);
      d.rect(15, this.y - rowH + 1.2, 180, rowH, 'F');
      let x = 15;
      cols.forEach((c, i) => { text(d, c.h, c.align === 'right' ? x + ws[i] - 1 : x + 1, this.y, { size, bold: true, color: [255, 255, 255], align: c.align === 'right' ? 'right' : undefined }); x += ws[i]; });
      this.y += rowH;
    };
    this.ensure(rowH * 3);
    this.y += rowH - 1;
    drawHead();
    rows.forEach((row, ri) => {
      if (this.y > 280) { this.newPage(); this.y += rowH - 1; drawHead(); }
      if (row.__group) { text(d, row.__group, 16, this.y, { size, bold: true, color: [31, 95, 89] }); this.y += rowH; return; }
      if (ri % 2 === 0) { d.setFillColor(244, 247, 247); d.rect(15, this.y - rowH + 1.4, 180, rowH, 'F'); }
      let x = 15;
      cols.forEach((c, i) => {
        let v = row[c.k];
        if (typeof v === 'number') v = fmt(v, c.dec ?? 2);
        const txt = t(v ?? '');
        const maxW = ws[i] - 2;
        d.setFontSize(size);
        const fitted = d.getTextWidth(txt) > maxW ? d.splitTextToSize(txt, maxW)[0] : txt;
        text(d, fitted, c.align === 'right' ? x + ws[i] - 1 : x + 1, this.y, { size, align: c.align === 'right' ? 'right' : undefined, bold: !!row.__bold });
        x += ws[i];
      });
      this.y += rowH;
    });
    this.y += 4;
  }
}

function addFooters(doc, label) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    if (W < 220) text(doc, `${label} - página ${i} de ${n}`, W - 15, H - 8, { size: 6.5, align: 'right', color: C.gray });
  }
}

// ------------------------------------------------------------------ API pública
function baseInfo(project) {
  const m = project.meta;
  return { project: m.name, client: m.client, location: m.location, company: m.company, author: m.author, crea: m.crea, art: m.art, date: new Date().toLocaleDateString('pt-BR') };
}

/** Pranchas técnicas (planta e perfil, seções, loteamento). */
export function buildSheets(jsPDF, ctx, o) {
  const [W, H] = PAPER[o.paper];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true });
  let first = true;
  const sheets = [];
  const info = baseInfo(ctx.project);
  const addSheet = (title, scale) => {
    if (!first) doc.addPage([W, H], 'landscape');
    first = false;
    const rec = { title, scale };
    sheets.push(rec);
    rec.page = doc.getNumberOfPages();
    return sheetFrame(doc, W, H, { ...info, title, scale, sheet: '#/#' });
  };
  const k = 1000 / o.planScale;
  for (const rr of ctx.results.roads) {
    if (!rr.alignment?.ok || !rr.profile) continue;
    if (o.sheets) {
      const area0 = { w: W - 25 - (W > 420 ? 10 : 7) - 8 - 30 };
      const span = (area0.w / k) * 0.97;
      const s0 = rr.alignment.startStation, s1 = rr.alignment.endStation;
      // janelas de comprimento fixo (múltiplo de 20 m), a última com o restante
      const step = Math.max(40, Math.floor(span / 20) * 20);
      const n = Math.max(1, Math.ceil((s1 - s0 - 1e-6) / step));
      for (let i = 0; i < n; i++) {
        const a = s0 + step * i, b = Math.min(s1, s0 + step * (i + 1));
        const title = `PLANTA E PERFIL - ${rr.road.name.toUpperCase()} - EST. ${fmtStation(a, ctx.project.settings.stationInterval)} A ${fmtStation(b, ctx.project.settings.stationInterval)}`;
        if (!first) doc.addPage([W, H], 'landscape');
        first = false;
        sheets.push({ title, page: doc.getNumberOfPages() });
        planProfileSheet(doc, ctx, rr, a, b, { ...info, title, scale: `H 1:${o.planScale} V 1:${o.vScale}`, sheet: '#/#' }, o);
      }
    }
    if (o.sections) sectionSheets(doc, ctx, rr, o, info, addSheet);
  }
  if (o.parcels && ctx.project.parcels.gleba) parcelsSheet(doc, ctx, o, addSheet);
  // numeração das folhas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const area = { cx: W - (W > 420 ? 10 : 7) - 175, cy: H - (W > 420 ? 10 : 7) - 60 };
    text(doc, `${String(p).padStart(2, '0')}/${String(total).padStart(2, '0')}`, area.cx + 87, area.cy + 57.5, { size: 8, bold: true });
  }
  return { doc, pages: total };
}

function parcelsSheet(doc, ctx, o, addSheet) {
  const P = ctx.results.parcels;
  const gl = ctx.project.parcels.gleba;
  const area = addSheet('PLANTA DO LOTEAMENTO E QUADRO DE ÁREAS', 'Indicada');
  const tableW = 120;
  const rect = { x: area.x, y: area.y + 6, w: area.w - tableW - 6, h: area.h - area.carimbo.h - 12 };
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const q of gl) { mnx = Math.min(mnx, q.x); mxx = Math.max(mxx, q.x); mny = Math.min(mny, q.y); mxy = Math.max(mxy, q.y); }
  const scales = [250, 500, 750, 1000, 1500, 2000, 2500, 5000];
  let sc = scales[scales.length - 1];
  for (const s of scales) { const k = 1000 / s; if ((mxx - mnx) * k <= rect.w * 0.95 && (mxy - mny) * k <= rect.h * 0.95) { sc = s; break; } }
  const pf = new PlanFrame(rect, { x: (mnx + mxx) / 2, y: (mny + mxy) / 2 }, { x: 1, y: 0 }, 1000 / sc);
  setLine(doc, C.black, 0.3); doc.rect(rect.x, rect.y, rect.w, rect.h);
  text(doc, `PLANTA DO LOTEAMENTO - ESCALA 1:${sc}`, rect.x + 2, rect.y - 1.5, { size: 8, bold: true });
  coordGrid(doc, pf, sc <= 1000 ? 100 : 200);
  drawPlanContent(doc, ctx, pf, { lotLabels: true, signage: false, drainage: false });
  northArrow(doc, rect.x + rect.w - 12, rect.y + 16, 0);
  // quadro de áreas
  const tx = rect.x + rect.w + 6;
  let ty = rect.y + 2;
  text(doc, 'QUADRO DE ÁREAS', tx, ty, { size: 8, bold: true }); ty += 5;
  setLine(doc, C.black, 0.2);
  for (const rw of [...(P?.table?.rows || []), { item: 'TOTAL DA GLEBA', area: P?.table?.total || 0, pct: 1 }]) {
    text(doc, rw.item, tx, ty, { size: 5.8, bold: rw.item.startsWith('TOTAL') });
    text(doc, `${fmt(rw.area, 2)} m²`, tx + 88, ty, { size: 5.8, align: 'right' });
    text(doc, fmtPct(rw.pct, 2), tx + tableW, ty, { size: 5.8, align: 'right' });
    doc.line(tx, ty + 1.3, tx + tableW, ty + 1.3);
    ty += 4.2;
  }
  ty += 4;
  text(doc, 'QUADRO DE LOTES', tx, ty, { size: 8, bold: true }); ty += 5;
  const lots = P?.lots || [];
  const colW = tableW / 2;
  let col = 0, y0 = ty;
  for (const l of lots) {
    if (ty > rect.y + rect.h - 3) { col++; ty = y0; if (col > 1) break; }
    const x = tx + col * colW;
    text(doc, `Q${l.block} L${l.number}`, x, ty, { size: 5, color: l.issues.length ? C.red : C.black });
    text(doc, `${fmt(l.area, 2)} m²`, x + colW - 3, ty, { size: 5, align: 'right', color: l.issues.length ? C.red : C.black });
    ty += 3;
  }
  text(doc, 'Lotes em vermelho estão abaixo dos mínimos da Lei 6.766/1979 (125 m² e 5 m de frente).', area.x, area.carimbo.y + 6, { size: 5.5 });
}

/** Quadros técnicos em A4. */
export function buildTables(jsPDF, ctx) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let first = true;
  const info = baseInfo(ctx.project);
  const tp = new TablePage(doc, info, () => { if (!first) doc.addPage('a4', 'portrait'); first = false; });
  const iv = ctx.project.settings.stationInterval || 20;
  tp.heading('QUADROS TÉCNICOS', 14);
  tp.para(`${ctx.project.meta.name} - emitido em ${info.date}. Sistema de referência SIRGAS 2000 / UTM ${ctx.project.meta.zone}${ctx.project.meta.hemisphere}.`);
  for (const rr of ctx.results.roads) {
    if (!rr.alignment?.ok) continue;
    const al = rr.alignment, pr = rr.profile;
    tp.newPage(`${rr.road.name} - Quadro de curvas horizontais`);
    tp.table([{ h: 'Curva', k: 'c', w: 10 }, { h: 'PI', k: 'pi', w: 10 }, { h: 'Este', k: 'e', w: 20, align: 'right', dec: 3 }, { h: 'Norte', k: 'n', w: 22, align: 'right', dec: 3 }, { h: 'AC', k: 'ac', w: 18 }, { h: 'R (m)', k: 'R', w: 13, align: 'right' }, { h: 'Ls (m)', k: 'Ls', w: 12, align: 'right' }, { h: 'T (m)', k: 'T', w: 13, align: 'right', dec: 3 }, { h: 'D (m)', k: 'D', w: 13, align: 'right', dec: 3 }, { h: 'Início', k: 'i', w: 14 }, { h: 'Fim', k: 'f', w: 14 }],
      al.curves.map((c) => ({ c: `C${c.number}${c.side}`, pi: `PI-${c.piIndex}`, e: c.pi.x, n: c.pi.y, ac: fmtDMS(c.I), R: c.R, Ls: c.Ls, T: c.T, D: c.total, i: fmtStation(c.staTS, iv), f: fmtStation(c.staST, iv) })));
    tp.table([{ h: 'Ponto', k: 'p', w: 14 }, { h: 'Estaca', k: 's', w: 20 }, { h: 'Este', k: 'e', w: 24, align: 'right', dec: 3 }, { h: 'Norte', k: 'n', w: 26, align: 'right', dec: 3 }, { h: 'Azimute', k: 'az', w: 22 }],
      al.keyPoints().map((k) => { const q = al.pointAt(k.s); return { p: k.label + (k.curve || ''), s: fmtStation(k.s, iv), e: q.x, n: q.y, az: fmtAz(q.az) }; }));
    tp.heading(`${rr.road.name} - Quadro de curvas verticais`);
    tp.table([{ h: 'PIV', k: 'i', w: 8, dec: 0 }, { h: 'Estaca', k: 's', w: 16 }, { h: 'Cota', k: 'z', w: 14, align: 'right', dec: 3 }, { h: 'i1 (%)', k: 'g1', w: 12, align: 'right', dec: 3 }, { h: 'i2 (%)', k: 'g2', w: 12, align: 'right', dec: 3 }, { h: 'Tipo', k: 't', w: 14 }, { h: 'L (m)', k: 'L', w: 12, align: 'right' }, { h: 'K', k: 'K', w: 10, align: 'right', dec: 1 }, { h: 'Flecha', k: 'e', w: 12, align: 'right', dec: 3 }, { h: 'PCV', k: 'pcv', w: 16 }, { h: 'PTV', k: 'ptv', w: 16 }],
      pr.pvis.map((p, i) => { const c = pr.curves.find((x) => x.pviIndex === i); return { i, s: fmtStation(p.s, iv), z: p.z, g1: i > 0 ? pr.grades[i - 1] * 100 : '', g2: i < pr.grades.length ? pr.grades[i] * 100 : '', t: c ? c.type : '', L: c ? c.L : '', K: c ? c.K : '', e: c ? Math.abs(c.e) : '', pcv: c ? fmtStation(c.sPCV, iv) : '', ptv: c ? fmtStation(c.sPTV, iv) : '' }; }));
    if (rr.corridor?.totals) {
      tp.newPage(`${rr.road.name} - Nota de serviço de terraplenagem`);
      tp.table([{ h: 'Estaca', k: 'e', w: 15 }, { h: 'Terreno', k: 'zg', w: 14, align: 'right', dec: 3 }, { h: 'Greide', k: 'zc', w: 14, align: 'right', dec: 3 }, { h: 'Corte', k: 'hc', w: 11, align: 'right', dec: 3 }, { h: 'Aterro', k: 'ha', w: 11, align: 'right', dec: 3 }, { h: 'Off. LE', k: 'ol', w: 12, align: 'right' }, { h: 'Cota LE', k: 'zl', w: 14, align: 'right', dec: 3 }, { h: 'Off. LD', k: 'or', w: 12, align: 'right' }, { h: 'Cota LD', k: 'zr', w: 14, align: 'right', dec: 3 }, { h: 'e LE/LD (%)', k: 'sp', w: 16 }],
        rr.corridor.sections.map((sc) => { const L = sc.left.daylight.pts, R = sc.right.daylight.pts; return { e: fmtStation(sc.s, iv), zg: sc.zg ?? '', zc: sc.zc, hc: sc.height != null && sc.height < 0 ? -sc.height : '', ha: sc.height != null && sc.height >= 0 ? sc.height : '', ol: L.length ? L[L.length - 1].o : '', zl: L.length ? L[L.length - 1].z : '', or: R.length ? R[R.length - 1].o : '', zr: R.length ? R[R.length - 1].z : '', sp: `${fmt(sc.slopes.L * 100, 2)} / ${fmt(sc.slopes.R * 100, 2)}` }; }));
      tp.newPage(`${rr.road.name} - Volumes de terraplenagem (Fh = ${fmt(ctx.project.settings.fh, 2)})`);
      tp.table([{ h: 'Estaca', k: 'e', w: 15 }, { h: 'Dist.', k: 'd', w: 10, align: 'right' }, { h: 'A corte', k: 'ac', w: 13, align: 'right' }, { h: 'A aterro', k: 'aa', w: 13, align: 'right' }, { h: 'V corte', k: 'vc', w: 15, align: 'right' }, { h: 'V aterro', k: 'va', w: 15, align: 'right' }, { h: 'V aterro x Fh', k: 'vf', w: 16, align: 'right' }, { h: 'Brückner', k: 'b', w: 17, align: 'right' }],
        [...rr.corridor.volumes.map((v) => ({ e: fmtStation(v.s, iv), d: v.dist, ac: v.cutArea, aa: v.fillArea, vc: v.cutVol, va: v.fillVol, vf: v.fillVolCorr, b: v.mass })), { __bold: true, e: 'TOTAL', vc: rr.corridor.totals.cut, va: rr.corridor.totals.fill, vf: rr.corridor.totals.fillCorr, b: rr.corridor.totals.balance }]);
    }
    if (rr.drainage) {
      tp.newPage(`${rr.road.name} - Planilha de cálculo das galerias`);
      tp.para(`Método racional. Intensidade pela equação IDF do projeto, TR = ${ctx.project.drainage.T} anos, tc inicial ${ctx.project.drainage.tcMin} min. Manning n = ${ctx.project.drainage.n}.`);
      tp.table([{ h: 'Trecho', k: 'id', w: 10 }, { h: 'L (m)', k: 'L', w: 10, align: 'right' }, { h: 'A·C (m²)', k: 'a', w: 13, align: 'right', dec: 0 }, { h: 'tc', k: 'tc', w: 8, align: 'right', dec: 1 }, { h: 'i (mm/h)', k: 'i', w: 11, align: 'right', dec: 1 }, { h: 'Q (L/s)', k: 'q', w: 11, align: 'right', dec: 1 }, { h: 'Ø mm', k: 'D', w: 9, align: 'right', dec: 0 }, { h: 'Decl. %', k: 's', w: 10, align: 'right', dec: 3 }, { h: 'V (m/s)', k: 'v', w: 10, align: 'right' }, { h: 'y/D', k: 'yd', w: 8, align: 'right' }, { h: 'CF mont.', k: 'cm', w: 13, align: 'right', dec: 3 }, { h: 'CF jus.', k: 'cj', w: 13, align: 'right', dec: 3 }, { h: 'Prof.', k: 'pr', w: 14 }],
        rr.drainage.pipes.map((p) => ({ id: p.id, L: p.length, a: p.areaAcc, tc: p.tc, i: p.i, q: p.Q * 1000, D: p.D * 1000, s: p.S * 100, v: p.V ?? '', yd: p.yD ?? '', cm: p.invUp, cj: p.invDn, pr: `${fmt(p.depthUp, 2)}/${fmt(p.depthDn, 2)}` })));
    }
  }
  const items = collectItems(ctx.project, ctx.results);
  if (items.length) {
    tp.newPage('Quantitativos');
    const rows = [];
    let lastVia = null;
    for (const it of items) { if (it.via !== lastVia) { rows.push({ __group: it.via }); lastVia = it.via; } rows.push({ c: it.code, d: it.description, u: it.unit, q: it.qty }); }
    tp.table([{ h: 'Código', k: 'c', w: 16 }, { h: 'Descrição', k: 'd', w: 110 }, { h: 'Un.', k: 'u', w: 10 }, { h: 'Quantidade', k: 'q', w: 22, align: 'right' }], rows);
  }
  const P = ctx.results.parcels;
  if (P && P.lots && P.lots.length) {
    tp.newPage('Loteamento - quadro de lotes');
    tp.table([{ h: 'Quadra', k: 'q', w: 12 }, { h: 'Lote', k: 'l', w: 10 }, { h: 'Área (m²)', k: 'a', w: 18, align: 'right' }, { h: 'Perímetro (m)', k: 'p', w: 18, align: 'right' }, { h: 'Frente (m)', k: 'f', w: 15, align: 'right' }, { h: 'Situação', k: 's', w: 70 }],
      P.lots.map((l) => ({ q: l.block, l: l.number, a: l.area, p: l.perimeter, f: l.front, s: l.issues.length ? l.issues.join(' ') : 'Atende à Lei 6.766/1979' })));
  }
  addFooters(doc, 'Quadros técnicos');
  return doc;
}

/** Memorial descritivo em A4. */
export function buildMemorialPdf(jsPDF, ctx) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let first = true;
  const info = baseInfo(ctx.project);
  const tp = new TablePage(doc, info, () => { if (!first) doc.addPage('a4', 'portrait'); first = false; });
  const mem = buildMemorial(ctx.project, ctx.results);
  tp.y += 6;
  text(doc, 'MEMORIAL DESCRITIVO', 105, tp.y, { size: 16, bold: true, align: 'center' }); tp.y += 8;
  text(doc, ctx.project.meta.name, 105, tp.y, { size: 11, align: 'center' }); tp.y += 10;
  for (const sec of mem) {
    if (sec.pageBreak) tp.newPage();
    tp.heading(sec.title, sec.level === 2 ? 9.5 : 11);
    for (const p of sec.paragraphs || []) tp.para(p);
    if (sec.table) tp.table(sec.table.cols, sec.table.rows, { size: 6.5 });
  }
  tp.ensure(30);
  tp.y += 12;
  setLine(doc, C.black, 0.3); doc.line(60, tp.y, 150, tp.y);
  text(doc, ctx.project.meta.author || 'Responsável técnico', 105, tp.y + 4, { size: 8, align: 'center' });
  text(doc, ctx.project.meta.crea ? `CREA/CAU ${ctx.project.meta.crea}` : 'CREA/CAU', 105, tp.y + 8, { size: 7.5, align: 'center', color: C.gray });
  addFooters(doc, 'Memorial descritivo');
  return doc;
}

/** Orçamento em A4. */
export function buildBudgetPdf(jsPDF, ctx) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let first = true;
  const info = baseInfo(ctx.project);
  const tp = new TablePage(doc, info, () => { if (!first) doc.addPage('a4', 'portrait'); first = false; });
  const b = collectBudget(ctx.project, ctx.results);
  tp.heading('ORÇAMENTO ESTIMATIVO', 14);
  tp.para(`Referência de preços: ${ctx.project.budget.reference || '-'}. Data de emissão: ${info.date}. BDI: ${fmtPct(b.bdi, 2)}.`);
  const rows = [];
  for (const g of b.groups) {
    rows.push({ __group: g.name });
    for (const it of g.items) rows.push({ c: it.code, d: it.description, u: it.unit, q: it.qty, p: it.price, tt: it.total });
    rows.push({ __bold: true, d: `Subtotal - ${g.name}`, tt: g.subtotal });
  }
  rows.push({ __bold: true, d: 'CUSTO DIRETO', tt: b.direct });
  rows.push({ __bold: true, d: `BDI (${fmtPct(b.bdi, 2)})`, tt: b.direct * b.bdi });
  rows.push({ __bold: true, d: 'TOTAL GERAL', tt: b.total });
  tp.table([{ h: 'Código', k: 'c', w: 15 }, { h: 'Descrição', k: 'd', w: 88 }, { h: 'Un.', k: 'u', w: 8 }, { h: 'Quant.', k: 'q', w: 17, align: 'right' }, { h: 'P. unit. (R$)', k: 'p', w: 18, align: 'right' }, { h: 'Total (R$)', k: 'tt', w: 22, align: 'right' }], rows);
  if (b.items.some((i) => !i.price)) tp.para('Itens com preço unitário zero não foram precificados. Informe os preços no diálogo de orçamento.', 7.5);
  addFooters(doc, 'Orçamento');
  return doc;
}
