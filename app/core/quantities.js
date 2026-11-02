// URBIS - quantitativos do corredor (terraplenagem, pavimentação, drenagem superficial, passeios)

import { normAngle } from './util.js';
import { pavementThickness } from './template.js';

const CBUQ_DENSITY = 2.4; // t/m³ (referência usual)

/**
 * Integra as faixas (componentes) do corredor considerando a curvatura:
 * comprimento da faixa = ds - o·Δaz (o com sinal; positivo à direita).
 */
function integrateBands(corridor) {
  const acc = new Map(); // chave -> {type, side, area, length}
  const secs = corridor.sections;
  for (let i = 1; i < secs.length; i++) {
    const a = secs[i - 1], b = secs[i];
    const ds = b.s - a.s;
    if (ds <= 0) continue;
    const daz = normAngle(b.az - a.az);
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const ba = (side === 'L' ? a.left : a.right).bands;
      const bb = (side === 'L' ? b.left : b.right).bands;
      for (let k = 0; k < Math.min(ba.length, bb.length); k++) {
        const A = ba[k], B = bb[k];
        if (A.type !== B.type) continue;
        const w = (A.width + B.width) / 2;
        const oMid = sign * ((A.o0 + A.o1 + B.o0 + B.o1) / 4);
        const len = Math.max(0, ds - oMid * daz);
        const oEdge = sign * ((A.o0 + B.o0) / 2);
        const lenEdge = Math.max(0, ds - oEdge * daz);
        const key = `${side}:${A.type}:${k}`;
        const cur = acc.get(key) || { type: A.type, side, index: k, area: 0, length: 0, edgeLength: 0, thickness: A.thickness };
        cur.area += w * len;
        cur.length += len;
        cur.edgeLength += lenEdge;
        acc.set(key, cur);
      }
    }
  }
  return [...acc.values()];
}

/**
 * Lista de quantitativos.
 * @returns {{group:string, code:string, description:string, unit:string, qty:number}[]}
 */
export function corridorQuantities(corridor, template, opts = {}) {
  const items = [];
  if (!corridor || !corridor.totals) return items;
  const t = corridor.totals;
  const add = (group, code, description, unit, qty, note) => { if (qty > 1e-9) items.push({ group, code, description, unit, qty, note }); };
  const stripT = opts.topsoil ?? 0.20;

  add('Terraplenagem', 'TER-01', 'Desmatamento, destocamento e limpeza da faixa', 'm²', t.clearingArea);
  add('Terraplenagem', 'TER-02', `Remoção de camada vegetal (e = ${String(stripT).replace('.', ',')} m)`, 'm³', t.clearingArea * stripT);
  add('Terraplenagem', 'TER-03', 'Escavação, carga e transporte de material de 1ª categoria (corte)', 'm³', t.cut);
  add('Terraplenagem', 'TER-04', 'Compactação de aterros a 100% do Proctor normal', 'm³', t.fill);
  if (t.balance > 0) add('Terraplenagem', 'TER-05', 'Bota-fora do excedente de corte', 'm³', t.balance, 'Volume de corte (in situ) excedente após compensação');
  else add('Terraplenagem', 'TER-06', 'Empréstimo de material para aterro', 'm³', -t.balance, `Volume medido no corte equivalente (Fh = ${String(t.fh).replace('.', ',')})`);
  add('Terraplenagem', 'TER-07', 'Proteção vegetal de taludes (hidrossemeadura/grama)', 'm²', t.slopeAreaCut + t.slopeAreaFill);

  const bands = integrateBands(corridor);
  const sumBy = (types, f = 'area') => bands.filter((b) => types.includes(b.type)).reduce((s, b) => s + b[f], 0);
  const pavedArea = sumBy(['pista', 'acostamento', 'estacionamento']);
  const bikeArea = sumBy(['ciclovia']);
  const layers = template.pavement?.layers || [];
  if (pavedArea > 0) {
    add('Pavimentação', 'PAV-01', 'Regularização e compactação do subleito', 'm²', pavedArea);
    layers.forEach((l, i) => {
      const th = +l.thickness || 0;
      const isSurface = i === 0;
      if (isSurface) {
        add('Pavimentação', 'PAV-02', `${l.name} (e = ${(th * 100).toFixed(1).replace('.', ',')} cm)`, 'm²', pavedArea);
        if (/CBUQ|betuminoso/i.test(l.material || l.name)) add('Pavimentação', 'PAV-03', `${l.name} - massa (d = 2,4 t/m³)`, 't', pavedArea * th * CBUQ_DENSITY);
      } else {
        add('Pavimentação', `PAV-${String(i + 3).padStart(2, '0')}`, `${l.name} (e = ${(th * 100).toFixed(1).replace('.', ',')} cm)`, 'm³', pavedArea * th);
      }
    });
    if (layers.length > 1) add('Pavimentação', 'PAV-10', 'Imprimação de base', 'm²', pavedArea);
    if (layers.length > 1 && /CBUQ|betuminoso/i.test(layers[0].material || layers[0].name)) add('Pavimentação', 'PAV-11', 'Pintura de ligação', 'm²', pavedArea);
  }
  if (bikeArea > 0) add('Pavimentação', 'PAV-20', 'Pavimento de ciclovia', 'm²', bikeArea);

  const gutterLen = sumBy(['sarjeta'], 'length');
  const gutterArea = sumBy(['sarjeta']);
  add('Drenagem superficial', 'DRS-01', 'Sarjeta de concreto moldada no local', 'm', gutterLen);
  add('Drenagem superficial', 'DRS-02', 'Concreto da sarjeta (fck 20 MPa)', 'm³', gutterArea * (+template.gutterThickness || 0.10));
  const curbLen = sumBy(['meiofio'], 'edgeLength');
  add('Obras complementares', 'OBC-01', 'Meio-fio (guia) de concreto pré-moldado', 'm', curbLen);
  const swArea = sumBy(['passeio']);
  add('Obras complementares', 'OBC-02', 'Passeio em concreto', 'm²', swArea);
  add('Obras complementares', 'OBC-03', `Concreto do passeio (e = ${String(template.sidewalkThickness || 0.10).replace('.', ',')} m)`, 'm³', swArea * (+template.sidewalkThickness || 0.10));
  const green = sumBy(['canteiro', 'generico']);
  add('Obras complementares', 'OBC-04', 'Plantio de grama em canteiros', 'm²', green);
  if ((+template.median || 0) > 0) add('Obras complementares', 'OBC-05', 'Plantio de grama no canteiro central', 'm²', (+template.median) * t.length);
  return items;
}

export { integrateBands, pavementThickness };
