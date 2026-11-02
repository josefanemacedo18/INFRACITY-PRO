// URBIS - seção tipo (template de corredor)
// Componentes do eixo para fora, por lado. Declividade positiva = sobe para fora do eixo.

import { ROAD_CLASSES } from './norms/brasil.js';

export const COMPONENT_TYPES = {
  pista: { label: 'Faixa de rolamento', paved: true, superelevates: true, defaults: { width: 3.5, slope: -0.02 } },
  acostamento: { label: 'Acostamento', paved: true, superelevates: false, defaults: { width: 2.5, slope: -0.05 } },
  ciclovia: { label: 'Ciclovia / ciclofaixa', paved: true, superelevates: false, defaults: { width: 1.5, slope: -0.02 } },
  estacionamento: { label: 'Faixa de estacionamento', paved: true, superelevates: false, defaults: { width: 2.5, slope: -0.02 } },
  sarjeta: { label: 'Sarjeta', paved: false, superelevates: false, defaults: { width: 0.30, slope: -0.05 } },
  meiofio: { label: 'Meio-fio (guia)', paved: false, superelevates: false, defaults: { width: 0.15, height: 0.15 } },
  passeio: { label: 'Passeio (calçada)', paved: false, superelevates: false, defaults: { width: 2.5, slope: 0.02 } },
  canteiro: { label: 'Canteiro / faixa verde', paved: false, superelevates: false, defaults: { width: 1.0, slope: 0.0 } },
  generico: { label: 'Faixa genérica', paved: false, superelevates: false, defaults: { width: 1.0, slope: 0.0 } },
};

export function makeComponent(type, over = {}) {
  const t = COMPONENT_TYPES[type];
  return { type, ...t.defaults, ...over };
}

/** Seção tipo padrão a partir de uma classe de via. */
export function defaultTemplate(classKey = 'local') {
  const rc = ROAD_CLASSES[classKey] || ROAD_CLASSES.local;
  const side = [];
  for (let i = 0; i < rc.lanes[1]; i++) side.push(makeComponent('pista', { width: rc.lane, slope: -rc.crown }));
  if (rc.shoulder > 0) side.push(makeComponent('acostamento', { width: rc.shoulder }));
  if (rc.gutter > 0) side.push(makeComponent('sarjeta', { width: rc.gutter }));
  if (rc.curb > 0) side.push(makeComponent('meiofio', { height: rc.curb }));
  if (rc.sidewalk > 0) side.push(makeComponent('passeio', { width: rc.sidewalk }));
  const urban = rc.group === 'urbana';
  return {
    name: rc.label,
    classKey,
    symmetric: true,
    median: rc.median || 0,
    left: side.map((c) => ({ ...c })),
    right: side.map((c) => ({ ...c })),
    cut: { slope: 1.0, ditch: urban ? null : { width: 1.0, depth: 0.30 } },
    fill: { slope: 1.5 },
    pavement: defaultPavement(classKey),
    sidewalkThickness: 0.10,
    curbDepth: 0.30,
    gutterThickness: 0.10,
    maxWidth: 60,
  };
}

export function defaultPavement(classKey = 'local') {
  const rc = ROAD_CLASSES[classKey] || ROAD_CLASSES.local;
  const heavy = rc.group === 'rodovia' || classKey === 'arterial' || classKey === 'transito_rapido';
  return {
    layers: heavy
      ? [
        { name: 'Revestimento CBUQ', material: 'Concreto betuminoso (CBUQ)', thickness: 0.075 },
        { name: 'Base de brita graduada simples', material: 'Base granular (BGS/BGTC)', thickness: 0.15 },
        { name: 'Sub-base granular', material: 'Sub-base granular', thickness: 0.20 },
      ]
      : [
        { name: 'Revestimento CBUQ', material: 'Concreto betuminoso (CBUQ)', thickness: 0.05 },
        { name: 'Base de brita graduada simples', material: 'Base granular (BGS/BGTC)', thickness: 0.15 },
        { name: 'Sub-base granular', material: 'Sub-base granular', thickness: 0.15 },
      ],
  };
}

export function pavementThickness(tpl) {
  return (tpl.pavement?.layers || []).reduce((s, l) => s + (+l.thickness || 0), 0);
}

/** Lado do template (aplica simetria). */
export function sideComponents(tpl, side) {
  if (tpl.symmetric || !tpl[side === 'L' ? 'left' : 'right']) return tpl.right || tpl.left || [];
  return side === 'L' ? tpl.left : tpl.right;
}

/** Larguras úteis: plataforma total e semi-largura de pista (para superelevação). */
export function templateWidths(tpl) {
  const w = (comps) => comps.reduce((s, c) => s + (+c.width || 0), 0);
  const lanes = (comps) => comps.filter((c) => c.type === 'pista').reduce((s, c) => s + (+c.width || 0), 0);
  const L = sideComponents(tpl, 'L'), R = sideComponents(tpl, 'R');
  const m = (+tpl.median || 0) / 2;
  return {
    left: m + w(L), right: m + w(R), total: 2 * m + w(L) + w(R),
    lanesLeft: lanes(L), lanesRight: lanes(R), carriageway: lanes(L) + lanes(R) + 2 * m,
  };
}

/** Espessura estrutural sob cada componente (para a linha de terraplenagem). */
export function componentThickness(tpl, c) {
  switch (c.type) {
    case 'pista': case 'acostamento': case 'estacionamento': return pavementThickness(tpl);
    case 'ciclovia': return Math.min(pavementThickness(tpl), 0.20);
    case 'sarjeta': return +tpl.gutterThickness || 0.10;
    case 'meiofio': return 0; // tratado pela profundidade da guia
    case 'passeio': return +tpl.sidewalkThickness || 0.10;
    default: return 0;
  }
}
