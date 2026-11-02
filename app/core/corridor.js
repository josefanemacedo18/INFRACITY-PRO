// URBIS - corredor: seções transversais, taludes, áreas e volumes de terraplenagem

import { sideComponents, componentThickness, templateWidths } from './template.js';
import { buildSuperelevation } from './superelevation.js';
import { fmt, fmtStation } from './util.js';

/** Estacas das seções: regulares + pontos notáveis do eixo, greide e superelevação. */
export function corridorStations(alignment, profile, interval = 20, extra = [], opts = {}) {
  const s0 = alignment.startStation, s1 = alignment.endStation;
  const list = [];
  const first = Math.ceil((s0 - 1e-9) / interval) * interval;
  for (let s = first; s <= s1 + 1e-9; s += interval) list.push(s);
  list.push(s0, s1);
  if (opts.keyPoints !== false) {
    for (const k of alignment.keyPoints()) list.push(k.s);
    if (profile) for (const k of profile.keyPoints()) if (k.s >= s0 && k.s <= s1) list.push(k.s);
  }
  for (const s of extra) if (s >= s0 && s <= s1) list.push(s);
  list.sort((a, b) => a - b);
  const out = [];
  for (const s of list) {
    const v = Math.min(s1, Math.max(s0, s));
    if (!out.length || v - out[out.length - 1] > 0.01) out.push(v);
  }
  return out;
}

/** Monta a superfície de projeto de um lado (offsets sem sinal). */
function designSide(tpl, side, zc, slopes) {
  const comps = sideComponents(tpl, side);
  const m = (+tpl.median || 0) / 2;
  const top = [{ o: 0, z: zc, code: 'EIXO' }];
  const datum = [];
  let o = 0, z = zc;
  if (m > 0) {
    datum.push({ o: 0, z: zc - 0.0 }, { o: m, z: zc });
    o = m;
    top.push({ o, z, code: 'CANTEIRO_CENTRAL' });
  }
  const laneSlope = slopes[side];
  const bands = [];
  comps.forEach((c, i) => {
    const w = Math.max(0, +c.width || 0);
    const t = componentThickness(tpl, c);
    const code = `${c.type}${i}`;
    const o0 = o, z0 = z;
    switch (c.type) {
      case 'pista': {
        o += w; z += laneSlope * w;
        top.push({ o, z, code });
        datum.push({ o: o0, z: z0 - t }, { o, z: z - t });
        break;
      }
      case 'acostamento': {
        let sl = +c.slope;
        if (laneSlope < sl) sl = laneSlope; // lado baixo da superelevação acompanha a pista
        o += w; z += sl * w;
        top.push({ o, z, code });
        datum.push({ o: o0, z: z0 - t }, { o, z: z - t });
        break;
      }
      case 'meiofio': {
        const h = +c.height || 0.15;
        const depth = Math.max(+tpl.curbDepth || 0.30, h);
        top.push({ o, z: z + h, code: code + '_FACE' });
        datum.push({ o, z: z + h - depth });
        o += w; z += h;
        top.push({ o, z, code });
        datum.push({ o, z: z - depth });
        break;
      }
      default: {
        const sl = +c.slope || 0;
        o += w; z += sl * w;
        top.push({ o, z, code });
        datum.push({ o: o0, z: z0 - t }, { o, z: z - t });
      }
    }
    bands.push({ type: c.type, index: i, o0, o1: o, z0, z1: z, width: o - o0, thickness: t, height: c.height });
  });
  return { top, datum, edge: { o, z }, bands };
}

/** Função de terreno de um lado: polilinha {o,z} (offsets sem sinal, crescentes) com lacunas (z = null). */
function sideGround(groundSigned, side) {
  const pts = [];
  if (side === 'R') {
    for (const p of groundSigned) pts.push(p.z == null ? { o: NaN, z: null } : { o: p.o, z: p.z });
  } else {
    for (let i = groundSigned.length - 1; i >= 0; i--) {
      const p = groundSigned[i];
      pts.push(p.z == null ? { o: NaN, z: null } : { o: -p.o, z: p.z });
    }
  }
  return pts;
}

function groundAtSide(gs, o) {
  for (let i = 1; i < gs.length; i++) {
    const a = gs[i - 1], b = gs[i];
    if (a.z == null || b.z == null) continue;
    if (o >= a.o - 1e-9 && o <= b.o + 1e-9) {
      if (b.o - a.o < 1e-12) return a.z;
      return a.z + ((b.z - a.z) * (o - a.o)) / (b.o - a.o);
    }
  }
  return null;
}

/** Intersecção do talude com o terreno a partir de (o0,z0) com inclinação k = dz/do. */
function slopeIntersect(gs, o0, z0, k, maxO) {
  for (let i = 1; i < gs.length; i++) {
    const a = gs[i - 1], b = gs[i];
    if (a.z == null || b.z == null) continue;
    if (b.o <= o0 + 1e-9) continue;
    const ao = Math.max(a.o, o0);
    const az = ao === a.o ? a.z : a.z + ((b.z - a.z) * (ao - a.o)) / (b.o - a.o);
    const fa = az - (z0 + k * (ao - o0));
    const fb = b.z - (z0 + k * (b.o - o0));
    if (fa === 0) return { o: ao, z: az };
    if ((fa < 0) !== (fb < 0) || fb === 0) {
      const t = fa / (fa - fb);
      const o = ao + t * (b.o - ao);
      return { o, z: z0 + k * (o - o0) };
    }
  }
  return { o: maxO, z: z0 + k * (maxO - o0), open: true };
}

function daylightSide(tpl, edge, gs, maxO) {
  const zg = groundAtSide(gs, edge.o);
  if (zg == null) return { type: null, pts: [], noGround: true };
  if (Math.abs(zg - edge.z) < 1e-4) return { type: 'nulo', pts: [{ o: edge.o, z: edge.z, code: 'OFFSET' }] };
  const isCut = zg > edge.z;
  const pts = [];
  let o0 = edge.o, z0 = edge.z;
  if (isCut && tpl.cut?.ditch && tpl.cut.ditch.width > 0) {
    const dw = +tpl.cut.ditch.width, dd = +tpl.cut.ditch.depth || 0.3;
    pts.push({ o: o0 + dw / 2, z: z0 - dd, code: 'VALETA_FUNDO' });
    o0 += dw;
    pts.push({ o: o0, z: z0, code: 'VALETA' });
    const zg2 = groundAtSide(gs, o0);
    if (zg2 != null && zg2 <= z0) {
      pts.push({ o: o0, z: z0, code: 'OFFSET' });
      return { type: 'corte', pts };
    }
  }
  const hv = isCut ? Math.max(0.01, +tpl.cut?.slope || 1) : Math.max(0.01, +tpl.fill?.slope || 1.5);
  const k = isCut ? 1 / hv : -1 / hv;
  const hit = slopeIntersect(gs, o0, z0, k, maxO);
  pts.push({ o: hit.o, z: hit.z, code: 'OFFSET', open: !!hit.open });
  return { type: isCut ? 'corte' : 'aterro', pts, open: !!hit.open, height: Math.abs(hit.z - z0) };
}

/** Integra (datum - terreno): retorna áreas de aterro (positivo) e corte (negativo). */
function integrateAreas(datum, ground) {
  let fill = 0, cut = 0;
  const g = ground.filter((p) => p.z != null);
  const gAt = (o) => {
    // interpolação no terreno com lacunas
    for (let i = 1; i < ground.length; i++) {
      const a = ground[i - 1], b = ground[i];
      if (a.z == null || b.z == null) continue;
      if (o >= a.o - 1e-9 && o <= b.o + 1e-9) return b.o - a.o < 1e-12 ? a.z : a.z + ((b.z - a.z) * (o - a.o)) / (b.o - a.o);
    }
    return null;
  };
  for (let i = 1; i < datum.length; i++) {
    const P = datum[i - 1], Q = datum[i];
    if (Q.o - P.o < 1e-9) continue;
    const xs = [P.o];
    for (const p of g) if (p.o > P.o + 1e-9 && p.o < Q.o - 1e-9) xs.push(p.o);
    xs.push(Q.o);
    for (let k = 1; k < xs.length; k++) {
      const a = xs[k - 1], b = xs[k];
      const ga = gAt(a), gb = gAt(b);
      if (ga == null || gb == null) continue;
      const da = P.z + ((Q.z - P.z) * (a - P.o)) / (Q.o - P.o);
      const db = P.z + ((Q.z - P.z) * (b - P.o)) / (Q.o - P.o);
      const fa = da - ga, fb = db - gb;
      if ((fa >= 0) === (fb >= 0)) {
        const area = ((fa + fb) / 2) * (b - a);
        if (area >= 0) fill += area; else cut -= area;
      } else {
        const t = fa / (fa - fb);
        const x0 = a + t * (b - a);
        const a1 = (fa / 2) * (x0 - a), a2 = (fb / 2) * (b - x0);
        if (a1 >= 0) fill += a1; else cut -= a1;
        if (a2 >= 0) fill += a2; else cut -= a2;
      }
    }
  }
  return { fill, cut };
}

/**
 * Calcula o corredor completo.
 * @param {{alignment, profile, template, surface, superelevation?:{enabled,V,emax}, interval?:number, extraStations?:number[], fh?:number}} o
 */
export function computeCorridor(o) {
  const { alignment, profile, template: tpl, surface } = o;
  const warnings = [];
  if (!alignment || !alignment.ok) return { sections: [], volumes: [], totals: null, warnings: ['Eixo inválido.'] };
  if (!profile || !profile.ok) return { sections: [], volumes: [], totals: null, warnings: ['Greide inválido.'] };
  const widths = templateWidths(tpl);
  const sup = buildSuperelevation(alignment, {
    enabled: !!o.superelevation?.enabled,
    V: o.superelevation?.V || 60,
    emax: o.superelevation?.emax ?? 0.08,
    crown: Math.abs(sideComponents(tpl, 'R').find((c) => c.type === 'pista')?.slope ?? -0.02),
    widthLeft: widths.lanesLeft + (+tpl.median || 0) / 2,
    widthRight: widths.lanesRight + (+tpl.median || 0) / 2,
  });
  warnings.push(...sup.warnings);
  const interval = o.interval || 20;
  const stations = corridorStations(alignment, profile, interval, [...(o.extraStations || []), ...sup.keyStations()]);
  const W = Math.max(+tpl.maxWidth || 60, Math.max(widths.left, widths.right) + 20);
  const sections = [];
  let noGround = 0, openSlopes = 0, outsideProfile = 0;
  for (const s of stations) {
    if (s < profile.startStation - 1e-6 || s > profile.endStation + 1e-6) { outsideProfile++; continue; }
    const zc = profile.elevationAt(s);
    const sl = sup.slopeAt(s);
    const L = designSide(tpl, 'L', zc, sl);
    const R = designSide(tpl, 'R', zc, sl);
    // terreno na seção
    let groundSigned = [];
    let zgAxis = null;
    if (surface) {
      const pL = alignment.offsetPoint(s, -W), pR = alignment.offsetPoint(s, W);
      const pieces = surface.intersectSegment(pL.x, pL.y, pR.x, pR.y);
      pieces.forEach((pc, k) => {
        if (k > 0) groundSigned.push({ o: NaN, z: null });
        for (const p of pc) groundSigned.push({ o: p.d - W, z: p.z });
      });
      const pa = alignment.pointAt(s);
      zgAxis = surface.elevationAt(pa.x, pa.y);
    }
    const gsL = sideGround(groundSigned, 'L');
    const gsR = sideGround(groundSigned, 'R');
    const dlL = surface ? daylightSide(tpl, L.edge, gsL, W) : { type: null, pts: [] };
    const dlR = surface ? daylightSide(tpl, R.edge, gsR, W) : { type: null, pts: [] };
    if (dlL.noGround || dlR.noGround) noGround++;
    if (dlL.open || dlR.open) openSlopes++;
    // polilinhas completas (offsets com sinal)
    const neg = (p) => ({ ...p, o: -p.o });
    const top = [
      ...[...dlL.pts].reverse().map(neg),
      ...[...L.top].reverse().map(neg),
      ...R.top.slice(1),
      ...dlR.pts,
    ];
    const edgeL = { o: -L.edge.o, z: L.edge.z }, edgeR = { o: R.edge.o, z: R.edge.z };
    const datum = [
      ...[...dlL.pts].reverse().map(neg),
      edgeL,
      ...[...L.datum].reverse().map(neg),
      ...R.datum,
      edgeR,
      ...dlR.pts,
    ];
    let areas = { cut: 0, fill: 0 };
    if (surface && groundSigned.length) areas = integrateAreas(datum, groundSigned);
    const oL = dlL.pts.length ? -dlL.pts[dlL.pts.length - 1].o : -L.edge.o;
    const oR = dlR.pts.length ? dlR.pts[dlR.pts.length - 1].o : R.edge.o;
    const linkLen = (edge, pts) => {
      let len = 0, prev = edge;
      for (const p of pts) { len += Math.hypot(p.o - prev.o, p.z - prev.z); prev = p; }
      return len;
    };
    const pa = alignment.pointAt(s);
    sections.push({
      s, zc, zg: zgAxis, az: pa.az,
      slopes: sl,
      left: { ...L, daylight: dlL },
      right: { ...R, daylight: dlR },
      top, datum, ground: groundSigned,
      cutArea: areas.cut, fillArea: areas.fill,
      clearing: oR - oL,
      slopeLen: { L: linkLen(L.edge, dlL.pts), R: linkLen(R.edge, dlR.pts) },
      slopeType: { L: dlL.type, R: dlR.type },
      height: zgAxis != null ? zc - zgAxis : null,
    });
  }
  if (noGround) warnings.push(`${noGround} seção(ões) sem terreno em parte da largura (fora da superfície).`);
  if (openSlopes) warnings.push(`${openSlopes} seção(ões) com talude que não encontrou o terreno dentro de ${fmt(W, 0)} m do eixo.`);
  if (outsideProfile) warnings.push(`${outsideProfile} estaca(s) fora do greide foram ignoradas.`);

  // volumes (médias das áreas) e Brückner
  const fh = o.fh ?? 1.3;
  const volumes = [];
  let cutCum = 0, fillCum = 0, mass = 0, clearing = 0, slopeCut = 0, slopeFill = 0;
  for (let i = 0; i < sections.length; i++) {
    const sc = sections[i];
    let dist = 0, vc = 0, vf = 0;
    if (i > 0) {
      const p = sections[i - 1];
      dist = sc.s - p.s;
      vc = ((p.cutArea + sc.cutArea) / 2) * dist;
      vf = ((p.fillArea + sc.fillArea) / 2) * dist;
      clearing += ((p.clearing + sc.clearing) / 2) * dist;
      for (const side of ['L', 'R']) {
        const len = ((p.slopeLen[side] + sc.slopeLen[side]) / 2) * dist;
        const t = sc.slopeType[side] || p.slopeType[side];
        if (t === 'corte') slopeCut += len; else if (t === 'aterro') slopeFill += len;
      }
    }
    cutCum += vc; fillCum += vf;
    mass += vc - vf * fh;
    volumes.push({ s: sc.s, dist, cutArea: sc.cutArea, fillArea: sc.fillArea, cutVol: vc, fillVol: vf, fillVolCorr: vf * fh, cutCum, fillCum, mass });
  }
  const totals = {
    cut: cutCum, fill: fillCum, fillCorr: fillCum * fh, balance: cutCum - fillCum * fh, fh,
    clearingArea: clearing, slopeAreaCut: slopeCut, slopeAreaFill: slopeFill,
    length: sections.length ? sections[sections.length - 1].s - sections[0].s : 0,
  };
  return { sections, volumes, totals, warnings, superelevation: sup, widths, maxWidth: W, interval };
}

/**
 * Linhas longitudinais do corredor (para planta e 3D): por código e lado.
 * Retorna [{key, side, code, pts:[{s,o,z,x,y}]}]
 */
export function featureLines(corridor, alignment) {
  const map = new Map();
  const add = (key, side, code, s, p) => {
    if (!map.has(key)) map.set(key, { key, side, code, pts: [] });
    const q = alignment.offsetPoint(s, side === 'L' ? -p.o : p.o);
    map.get(key).pts.push({ s, o: side === 'L' ? -p.o : p.o, z: p.z, x: q.x, y: q.y, type: p.type });
  };
  for (const sc of corridor.sections) {
    for (const side of ['L', 'R']) {
      const d = side === 'L' ? sc.left : sc.right;
      for (const p of d.top) if (p.code !== 'EIXO') add(side + ':' + p.code, side, p.code, sc.s, p);
      const dl = d.daylight;
      if (dl && dl.pts.length) {
        const last = dl.pts[dl.pts.length - 1];
        add(side + ':OFFSET', side, 'OFFSET', sc.s, { ...last, type: dl.type });
      }
    }
  }
  return [...map.values()];
}

/** Resumo textual de uma seção. */
export function describeSection(sc, interval = 20) {
  return `Est. ${fmtStation(sc.s, interval)}: greide ${fmt(sc.zc, 3)}, terreno ${sc.zg == null ? '-' : fmt(sc.zg, 3)}, corte ${fmt(sc.cutArea)} m², aterro ${fmt(sc.fillArea)} m²`;
}
