// URBIS - sinalização viária horizontal e vertical

import { SIGNAGE, SIGN_SIZES, SIGN_CATALOG, geo } from './norms/brasil.js';
import { sideComponents } from './template.js';

/** Área da placa (m²) pela forma e dimensão característica. */
export function signArea(shape, dim) {
  switch (shape) {
    case 'octogono': return 2 * (1 + Math.SQRT2) * dim * dim;
    case 'circulo': return (Math.PI * dim * dim) / 4;
    case 'triangulo': return (Math.sqrt(3) / 4) * dim * dim;
    case 'losango': return dim * dim;
    case 'retangulo': return dim * dim * 0.5;
    default: return dim * dim;
  }
}

export function signInfo(code) { return SIGN_CATALOG.find((s) => s.code === code) || { code, name: code, shape: 'retangulo' }; }

export function signDimension(code, rural = false) {
  const info = signInfo(code);
  const sz = SIGN_SIZES[info.shape] || SIGN_SIZES.retangulo;
  return rural ? sz.rural : sz.urban;
}

/**
 * Gera a sinalização horizontal longitudinal a partir da seção tipo.
 * @param {{alignment, template, V:number, center?:'LFO1'|'LFO2'|'LFO3'|'none', edgeLines?:boolean}} o
 * @returns {{lines:{type, code, label, offset, color, dashed, double, width, length, area}[]}}
 */
export function horizontalMarkings(o) {
  const { alignment, template: tpl } = o;
  const V = o.V || 40;
  const width = SIGNAGE.lineWidth(V);
  const dash = SIGNAGE.dash(V);
  const ratio = dash.dash / (dash.dash + dash.gap);
  const lines = [];
  const L = alignment.length;
  const median = (+tpl.median || 0) / 2;
  const lanesOf = (side) => sideComponents(tpl, side).filter((c) => c.type === 'pista');
  const lanesL = lanesOf('L'), lanesR = lanesOf('R');
  const twoWay = lanesL.length > 0 && lanesR.length > 0;
  const add = (typeKey, offset, opts = {}) => {
    const t = SIGNAGE.lineTypes[typeKey];
    const k = 1; // comprimento ao longo do eixo (curvas: correção pelo afastamento)
    let len = L * k;
    if (alignment.curves && offset !== 0) {
      let corr = 0;
      for (const c of alignment.curves) corr += offset * (c.dir * (c.I));
      len = Math.max(0, L - corr);
    }
    const factor = (t.dashed ? ratio : 1) * (t.double ? 2 : 1);
    lines.push({ type: typeKey, code: t.code, label: t.label, offset, color: t.color, dashed: t.dashed, double: t.double, width, length: len, area: len * width * factor, dash: t.dashed ? dash : null, ...opts });
  };
  // linha central
  if (twoWay && median === 0) {
    let center = o.center;
    if (!center) {
      const cw = lanesL.reduce((s, c) => s + c.width, 0) + lanesR.reduce((s, c) => s + c.width, 0);
      center = cw >= SIGNAGE.lfo3MinWidth.value && V >= 60 ? 'LFO3' : V <= 40 ? 'LFO2' : 'LFO1';
    }
    if (center !== 'none') add(center, 0);
  }
  // linhas entre faixas do mesmo sentido e bordos
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    let off = median;
    const lanes = lanesOf(side);
    lanes.forEach((ln, i) => {
      off += ln.width;
      if (i < lanes.length - 1) add('LMS2', sign * off);
    });
    if (median > 0 && lanes.length) add('LBO', sign * (median + 0.20), { note: 'bordo interno (canteiro)' });
    const edge = o.edgeLines ?? (tpl.classKey ? tpl.classKey.startsWith('rodovia') || tpl.classKey === 'transito_rapido' : false);
    if (edge && lanes.length) add('LBO', sign * (off - width / 2));
  }
  return { lines, width, dash };
}

/** Faixa de pedestres zebrada (FTP-1) atravessando a pista na estaca s. */
export function crosswalk(o) {
  const cw = SIGNAGE.crosswalk;
  const width = o.carriageway;
  const nBars = Math.max(1, Math.floor((width + cw.barGap) / (cw.barWidth + cw.barGap)));
  return { s: o.s, length: o.length ?? cw.length, nBars, barWidth: cw.barWidth, barGap: cw.barGap, area: nBars * cw.barWidth * (o.length ?? cw.length) };
}

/**
 * Sugestão de sinalização vertical: velocidade máxima no início (cada sentido)
 * e advertência antes de curvas fechadas.
 */
export function suggestVerticalSigns(o) {
  const { alignment, V } = o;
  const rural = !!o.rural;
  const signs = [];
  const sideOff = o.offset ?? 4.5;
  signs.push({ code: 'R-19', s: alignment.startStation + 10, side: 'R', offset: sideOff, param: String(V), auto: true });
  signs.push({ code: 'R-19', s: alignment.endStation - 10, side: 'L', offset: -sideOff, param: String(V), auto: true });
  const rLimit = geo.rMin(V, 0.06) * 2.5;
  for (const c of alignment.curves || []) {
    if (c.R > rLimit) continue;
    const sharp = c.R < geo.rMin(V, 0.06) * 1.3;
    const right = c.dir > 0;
    const code = sharp ? (right ? 'A-1b' : 'A-1a') : (right ? 'A-2b' : 'A-2a');
    const dist = Math.max(30, Math.min(150, geo.dvp(V)));
    signs.push({ code, s: Math.max(alignment.startStation, c.staTS - dist), side: 'R', offset: sideOff, auto: true, curve: c.number });
    const back = sharp ? (right ? 'A-1a' : 'A-1b') : (right ? 'A-2a' : 'A-2b');
    signs.push({ code: back, s: Math.min(alignment.endStation, c.staST + dist), side: 'L', offset: -sideOff, auto: true, curve: c.number });
  }
  return signs.map((sg) => ({ ...sg, dim: signDimension(sg.code, rural) }));
}

/** Quantitativo de sinalização (horizontal e vertical). */
export function signageQuantities({ horizontal = [], crosswalks = [], signs = [], rural = false }) {
  const items = [];
  const byType = new Map();
  for (const l of horizontal) {
    const k = l.code;
    const cur = byType.get(k) || { code: k, label: l.label, length: 0, area: 0, width: l.width };
    cur.length += l.length; cur.area += l.area;
    byType.set(k, cur);
  }
  for (const v of byType.values()) {
    items.push({ group: 'Sinalização horizontal', code: 'SH-' + v.code, description: `${v.label} - largura ${String(v.width.toFixed(2)).replace('.', ',')} m`, unit: 'm²', qty: v.area, note: `Extensão ${v.length.toFixed(1).replace('.', ',')} m` });
  }
  const zebra = crosswalks.reduce((s, c) => s + c.area, 0);
  if (zebra > 0) items.push({ group: 'Sinalização horizontal', code: 'SH-FTP', description: 'Faixa de travessia de pedestres zebrada (FTP-1)', unit: 'm²', qty: zebra });
  const byCode = new Map();
  for (const s of signs) {
    const info = signInfo(s.code);
    const dim = s.dim || signDimension(s.code, rural);
    const k = `${s.code}|${dim}`;
    const cur = byCode.get(k) || { code: s.code, name: info.name, shape: info.shape, dim, count: 0 };
    cur.count++;
    byCode.set(k, cur);
  }
  let posts = 0;
  for (const v of byCode.values()) {
    const area = signArea(v.shape, v.dim);
    items.push({ group: 'Sinalização vertical', code: 'SV-' + v.code, description: `Placa ${v.code} - ${v.name} (${SIGN_SIZES[v.shape]?.dim || 'dim.'} ${String(v.dim.toFixed(2)).replace('.', ',')} m)`, unit: 'un', qty: v.count, note: `Área unitária ${area.toFixed(3).replace('.', ',')} m²` });
    items.push({ group: 'Sinalização vertical', code: 'SV-A-' + v.code, description: `Chapa de aço/alumínio refletiva - placa ${v.code}`, unit: 'm²', qty: area * v.count });
    posts += v.count;
  }
  if (posts) items.push({ group: 'Sinalização vertical', code: 'SV-SUP', description: 'Suporte metálico galvanizado para placa (h = 3,0 m)', unit: 'un', qty: posts });
  return items;
}
