// URBIS - pavimentação: número N e método do DNER (1981) para pavimentos flexíveis

import { PAVEMENT } from './norms/brasil.js';

/** Espessura total necessária sobre material de CBR dado (cm): Ht = 77,67 N^0,0482 CBR^-0,598 */
export function dnerThickness(N, CBR) {
  const f = PAVEMENT.formula;
  return f.a * Math.pow(N, f.b) * Math.pow(Math.max(CBR, 0.5), f.c);
}

/** Espessura mínima de revestimento (cm) pela faixa de N. */
export function minSurface(N) {
  for (const r of PAVEMENT.minSurface) if (N <= r.maxN) return r;
  return PAVEMENT.minSurface[PAVEMENT.minSurface.length - 1];
}

/**
 * Número N (repetições do eixo padrão de 8,2 tf).
 * N = 365 · Σ VMDc(ano) · FV · FR · FD
 */
export function computeN({ vmdc, years = 10, growth = 0.03, fv = 2.0, fr = 1.0, fd = 0.5, growthType = 'geometrica' }) {
  let sumV = 0;
  for (let k = 0; k < years; k++) sumV += growthType === 'linear' ? vmdc * (1 + growth * k) : vmdc * Math.pow(1 + growth, k);
  return 365 * sumV * fv * fr * fd;
}

const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

/**
 * Dimensionamento pelo método do DNER.
 * @param {{N:number, cbrSubgrade:number, cbrReinforcement?:number|null, cbrSubbase?:number,
 *   kR?:number, kB?:number, kS?:number, kRef?:number, minLayer?:number, step?:number}} o
 * @returns {{layers:{name,material,thicknessCm,k}[], Ht:number, H20:number, Hn:number, warnings:string[]}}
 */
export function dnerDesign(o) {
  const warnings = [];
  const N = o.N;
  const kR = o.kR ?? 2.0, kB = o.kB ?? 1.0, kS = o.kS ?? 1.0, kRef = o.kRef ?? 1.0;
  const minLayer = o.minLayer ?? 15;
  const step = o.step ?? 1;
  const cbrSub = o.cbrSubgrade;
  if (cbrSub < PAVEMENT.subgradeMinCBR.value) warnings.push(PAVEMENT.subgradeMinCBR.note);
  const cbrSB = o.cbrSubbase ?? 20;
  const surf = minSurface(N);
  const R = surf.cm;
  const H20 = dnerThickness(N, Math.min(cbrSB, 20));
  const hasRef = o.cbrReinforcement != null && o.cbrReinforcement > cbrSub;
  const Hn = dnerThickness(N, hasRef ? o.cbrReinforcement : cbrSub);
  const Hm = dnerThickness(N, cbrSub);
  let B = Math.max(minLayer, ceilTo((H20 - R * kR) / kB, step));
  let h20 = Math.max(0, ceilTo((Hn - R * kR - B * kB) / kS, step));
  if (h20 > 0 && h20 < minLayer) h20 = minLayer;
  let hn = 0;
  if (hasRef) {
    hn = Math.max(0, ceilTo((Hm - R * kR - B * kB - h20 * kS) / kRef, step));
    if (hn > 0 && hn < minLayer) hn = minLayer;
  }
  const layers = [];
  if (R > 0) layers.push({ name: 'Revestimento', material: 'Concreto betuminoso (CBUQ)', thicknessCm: R, k: kR });
  else { layers.push({ name: 'Revestimento', material: 'Tratamento superficial', thicknessCm: 2.5, k: 1.2 }); warnings.push('N ≤ 10⁶: o método admite tratamento superficial como revestimento.'); }
  layers.push({ name: 'Base', material: 'Base granular (BGS/BGTC)', thicknessCm: B, k: kB });
  if (h20 > 0) layers.push({ name: 'Sub-base', material: 'Sub-base granular', thicknessCm: h20, k: kS });
  if (hn > 0) layers.push({ name: 'Reforço do subleito', material: 'Reforço do subleito', thicknessCm: hn, k: kRef });
  const total = layers.reduce((s, l) => s + l.thicknessCm, 0);
  return { layers, Ht: Hm, H20, Hn, total, surface: surf, warnings };
}
