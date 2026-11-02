// URBIS - superelevação (rotação da pista em torno do eixo)
// Taxa pelo critério do DNER e transição pela rampa relativa máxima.

import { geo } from './norms/brasil.js';
import { fmt } from './util.js';

/**
 * @param {import('./alignment.js').Alignment} alignment
 * @param {{enabled:boolean, V:number, emax:number, crown?:number, widthLeft:number, widthRight:number}} opts
 */
export function buildSuperelevation(alignment, opts) {
  const crown = opts.crown ?? 0.02;
  const zones = [];
  const warnings = [];
  const normal = { L: -crown, R: -crown };
  if (opts.enabled && alignment && alignment.curves) {
    const V = opts.V || 60;
    const emax = opts.emax ?? 0.08;
    const rg = geo.relGradeMax(V);
    for (const c of alignment.curves) {
      const e = geo.superelevation(V, c.R, emax, crown);
      if (!(e > 0)) continue;
      const outer = c.dir > 0 ? 'L' : 'R';
      const w = Math.max(0.5, outer === 'L' ? opts.widthLeft : opts.widthRight);
      const LrCalc = (w * e) / rg;
      const Lt = (w * crown) / rg;
      let b, c1, c2, d, Lr;
      if (c.Ls > 0) {
        Lr = c.Ls;
        b = c.staTS; c1 = c.staSC; c2 = c.staCS; d = c.staST;
        if (c.Ls + 1e-6 < LrCalc) warnings.push(`Curva ${c.number}: espiral de ${fmt(c.Ls)} m menor que a transição recomendada de ${fmt(LrCalc)} m (rampa relativa ${fmt(rg * 100, 2)}%).`);
      } else {
        Lr = Math.max(LrCalc, 0);
        b = c.staTS - (2 / 3) * Lr; c1 = b + Lr;
        d = c.staST + (2 / 3) * Lr; c2 = d - Lr;
        if (c1 > c2) {
          const mid = (c.staTS + c.staST) / 2;
          c1 = c2 = mid;
          warnings.push(`Curva ${c.number}: curva circular curta; a superelevação plena ocorre só no meio da curva.`);
        }
      }
      zones.push({ curve: c.number, e, outer, a: b - Lt, b, c1, c2, d, f: d + Lt, Lr, Lt, R: c.R });
    }
    zones.sort((z1, z2) => z1.a - z2.a);
    for (let i = 1; i < zones.length; i++) {
      if (zones[i].a < zones[i - 1].f - 1e-6) {
        warnings.push(`Transições de superelevação das curvas ${zones[i - 1].curve} e ${zones[i].curve} se sobrepõem (${fmt(zones[i - 1].f - zones[i].a)} m). Verifique a tangente entre as curvas.`);
      }
    }
  }

  function outerSlope(z, s) {
    const lin = (s0, s1, v0, v1) => (s1 - s0 < 1e-9 ? v1 : v0 + ((v1 - v0) * (s - s0)) / (s1 - s0));
    if (s <= z.b) return lin(z.a, z.b, -crown, 0);
    if (s <= z.c1) return lin(z.b, z.c1, 0, z.e);
    if (s <= z.c2) return z.e;
    if (s <= z.d) return lin(z.c2, z.d, z.e, 0);
    return lin(z.d, z.f, 0, -crown);
  }

  function slopeAt(s) {
    let best = null, bestDist = Infinity;
    for (const z of zones) {
      if (s < z.a - 1e-9 || s > z.f + 1e-9) continue;
      const mid = (z.c1 + z.c2) / 2;
      const dd = Math.abs(s - mid);
      if (dd < bestDist) { bestDist = dd; best = z; }
    }
    if (!best) return { ...normal, e: 0 };
    const p = outerSlope(best, s);
    const inner = p > crown ? -p : -crown;
    return best.outer === 'L' ? { L: p, R: inner, e: p, curve: best.curve } : { L: inner, R: p, e: p, curve: best.curve };
  }

  /** Estacas notáveis da superelevação (para incluir seções). */
  function keyStations() {
    const out = [];
    for (const z of zones) out.push(z.a, z.b, z.c1, z.c2, z.d, z.f);
    return out;
  }

  return { zones, warnings, slopeAt, keyStations, crown };
}
