// URBIS - cálculo do projeto: transforma os dados (projeto) em resultados (geometria, volumes, verificações)

import { Alignment } from './alignment.js';
import { Profile, autoProfile } from './profile.js';
import { Surface } from './surface.js';
import { computeCorridor, featureLines } from './corridor.js';
import { corridorQuantities } from './quantities.js';
import { horizontalMarkings, suggestVerticalSigns, signageQuantities, crosswalk, signDimension } from './signage.js';
import { networkAlongAlignment, designNetwork, gutterCheck, idfIntensity } from './drainage.js';
import { templateWidths, sideComponents } from './template.js';
import { geo, ROAD_CLASSES, CROSS_SECTION, GEOMETRIC, DRAINAGE } from './norms/brasil.js';
import { fmt, fmtPct, fmtStation } from './util.js';
import { roadPolygon, blocksFromRoads, lotDescription, checkLot, areaTable } from './lots.js';
import { polygonArea } from './geom.js';

/** Comprimento de espiral sugerido (Shortt/Barnett, C = 0,6 m/s³): Ls = 0,036 V³/R, mínimo 30 m. */
export function autoSpiral(V, R) {
  if (!(R > 0)) return 0;
  return Math.max(30, Math.ceil((0.036 * V ** 3) / R / 10) * 10);
}

/**
 * Raio automático: o maior raio entre Rmin e 2,5·Rmin (múltiplo de 5 m) cuja tangente,
 * somada ao trecho de transição da superelevação que fica na tangente, cabe no espaço
 * disponível (metade do alinhamento entre PIs internos; 90% nos extremos).
 * @param {{superelevation?:boolean, width?:number, crown?:number, spiral?:boolean}} o
 */
export function autoRadius(pis, i, V, emax, o = {}) {
  const rmin = geo.rMin(V, emax);
  const p = pis[i - 1], q = pis[i], r = pis[i + 1];
  const a1 = Math.atan2(q.x - p.x, q.y - p.y), a2 = Math.atan2(r.x - q.x, r.y - q.y);
  let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const I = Math.abs(d);
  if (I < 1e-6) return { R: 0, Ls: 0 };
  const lin = Math.hypot(q.x - p.x, q.y - p.y) * (i - 1 === 0 ? 0.9 : 0.5);
  const lout = Math.hypot(r.x - q.x, r.y - q.y) * (i + 1 === pis.length - 1 ? 0.9 : 0.5);
  const avail = Math.min(lin, lout);
  const crown = o.crown ?? 0.02, w = o.width ?? 3.5;
  const rg = geo.relGradeMax(V);
  const need = (R) => {
    const Ls = o.spiral ? Math.min(autoSpiral(V, R), R * 0.5) : 0;
    const T = Ls / 2 + (R + (Ls * Ls) / (24 * R)) * Math.tan(I / 2);
    if (!o.superelevation) return { T, Ls, total: T };
    const e = geo.superelevation(V, R, emax, crown);
    if (!(e > 0)) return { T, Ls, total: T };
    const Lt = (w * crown) / rg;
    const onTangent = Ls > 0 ? Lt : (2 / 3) * ((w * e) / rg) + Lt;
    return { T, Ls, total: T + onTangent };
  };
  const rMinR = Math.ceil(rmin / 5) * 5;
  for (let R = Math.floor((rmin * 2.5) / 5) * 5; R >= rMinR; R -= 5) {
    const n = need(R);
    if (n.total <= avail) return { R, Ls: n.Ls };
  }
  const n = need(rMinR);
  return { R: rMinR, Ls: n.Ls };
}

/** Preenche raios automáticos (PIs com autoR). Retorna nova lista. */
export function resolvePis(road) {
  const rc = ROAD_CLASSES[road.classKey] || ROAD_CLASSES.local;
  // sem superelevação a curva trabalha com declive adverso do abaulamento (e = -2%)
  const supOn = !!road.superelevation?.enabled;
  const emax = supOn ? (road.superelevation?.emax ?? rc.emax) : -0.02;
  const useSpiral = rc.group === 'rodovia' || (road.V >= 70 && supOn);
  const w = templateWidths(road.template);
  const opts = { superelevation: supOn, width: Math.max(w.lanesLeft, w.lanesRight) + (+road.template.median || 0) / 2, crown: 0.02, spiral: useSpiral };
  const pis = road.pis.map((p) => ({ ...p }));
  for (let i = 1; i < pis.length - 1; i++) {
    if (pis[i].autoR || !(pis[i].R > 0)) {
      const a = autoRadius(pis, i, road.V, emax, opts);
      pis[i].R = a.R;
      if (pis[i].autoR) pis[i].Ls = a.Ls;
    }
  }
  return pis;
}

export class Model {
  constructor() {
    this.surfaces = new Map(); // id -> {key, surface}
    this.roadCache = new Map();
  }

  surface(project, id) {
    const s = project.surfaces.find((x) => x.id === id);
    if (!s) return null;
    const key = `${s.id}@${s.rev || 0}`;
    const c = this.surfaces.get(id);
    if (c && c.key === key) return c.surface;
    const surf = Surface.fromJSON(s);
    surf.id = s.id;
    this.surfaces.set(id, { key, surface: surf });
    return surf;
  }

  /** Geometria rápida da via (para arrastar PIs em tempo real). */
  roadGeometry(project, road) {
    const pis = resolvePis(road);
    const alignment = new Alignment({ pis, startStation: road.startStation, name: road.name });
    return { pis, alignment };
  }

  /** Cálculo completo de uma via. */
  computeRoad(project, road, opts = {}) {
    const res = { road, checks: [] };
    const { pis, alignment } = this.roadGeometry(project, road);
    res.pis = pis;
    res.alignment = alignment;
    const surface = road.surfaceId ? this.surface(project, road.surfaceId) : (project.surfaces[0] ? this.surface(project, project.surfaces[0].id) : null);
    res.surface = surface;
    if (!alignment.ok || alignment.length < 1) {
      res.checks.push(...alignment.errors.map((m) => ({ level: 'erro', group: 'Eixo', msg: m })));
      return res;
    }
    // perfil do terreno
    if (surface) {
      const poly = alignment.sample(2, 0.002);
      res.ground = surface.profileAlong(poly);
    } else res.ground = [];
    // greide
    const rc = ROAD_CLASSES[road.classKey] || ROAD_CLASSES.local;
    let pvis = road.profile?.pvis || [];
    const needAuto = road.profile?.auto || pvis.length < 2;
    if (needAuto) {
      const g = res.ground.filter((p) => p.z != null);
      if (g.length >= 2) {
        const lift = rc.group === 'urbana' ? 0.10 : 0.30;
        pvis = autoProfile(g, { maxGrade: rc.maxGrade, minGrade: GEOMETRIC.minGrade.value, kCrest: geo.kCrest(road.V, true), kSag: geo.kSag(road.V, true), minL: Math.ceil(geo.lVertMin(road.V) / 10) * 10, lift }).pvis;
        pvis[0].s = alignment.startStation; pvis[pvis.length - 1].s = alignment.endStation;
      } else {
        pvis = [{ s: alignment.startStation, z: 0, L: 0 }, { s: alignment.endStation, z: 0, L: 0 }];
        res.checks.push({ level: 'alerta', group: 'Greide', msg: 'Sem terreno sob o eixo: greide provisório em cota 0. Importe a topografia.' });
      }
      res.autoPvis = pvis;
    }
    // ajusta extremos do greide ao eixo
    const pv = pvis.map((p) => ({ ...p }));
    if (pv.length >= 2) {
      if (Math.abs(pv[pv.length - 1].s - alignment.endStation) > 0.01 && pv[pv.length - 1].s < alignment.endStation) {
        res.checks.push({ level: 'alerta', group: 'Greide', msg: `O greide termina na estaca ${fmtStation(pv[pv.length - 1].s)} antes do fim do eixo (${fmtStation(alignment.endStation)}).` });
      }
    }
    const profile = new Profile({ pvis: pv });
    res.profile = profile;
    if (opts.light) return res;
    // corredor
    const tpl = road.template;
    res.corridor = computeCorridor({
      alignment, profile, template: tpl, surface,
      superelevation: { enabled: road.superelevation?.enabled, V: road.V, emax: road.superelevation?.emax },
      interval: project.settings.sectionInterval || 20,
      fh: project.settings.fh,
    });
    res.features = featureLines(res.corridor, alignment);
    res.quantities = corridorQuantities(res.corridor, tpl, { topsoil: project.settings.topsoil });
    // sinalização
    const center = road.signage?.center === 'auto' ? undefined : road.signage?.center;
    const edge = road.signage?.edgeLines === 'auto' ? undefined : road.signage?.edgeLines;
    res.markings = horizontalMarkings({ alignment, template: tpl, V: road.V, center, edgeLines: edge });
    const rural = rc.group === 'rodovia' || project.settings.rural;
    const autoSigns = road.signage?.autoSigns ? suggestVerticalSigns({ alignment, V: road.V, rural, offset: templateWidths(tpl).right + 0.5 }) : [];
    res.signs = [...autoSigns, ...(road.signage?.signs || []).map((s) => ({ ...s, dim: s.dim || signDimension(s.code, rural) }))];
    const cw = templateWidths(tpl).carriageway;
    res.crosswalks = (road.signage?.crosswalks || []).map((c) => crosswalk({ s: c.s, carriageway: cw, length: c.length }));
    res.signageItems = signageQuantities({ horizontal: res.markings.lines, crosswalks: res.crosswalks, signs: res.signs, rural });
    // drenagem
    if (road.drainage?.enabled) res.drainage = this.computeDrainage(project, road, res);
    res.checks.push(...this.checkRoad(project, road, res));
    return res;
  }

  computeDrainage(project, road, res) {
    const d = project.drainage;
    const tpl = road.template;
    const w = templateWidths(tpl);
    const comps = sideComponents(tpl, 'R');
    let gutterOff = 0;
    for (const c of comps) { if (c.type === 'sarjeta') { gutterOff += c.width / 2; break; } gutterOff += +c.width || 0; }
    const sideSign = road.drainage.side === 'L' ? -1 : 1;
    const contrib = w.right + (road.drainage.extraWidth || 0);
    // trechos do greide (tangentes) para sarjetas
    const segs = [];
    const pv = res.profile.pvis;
    for (let i = 0; i < pv.length - 1; i++) segs.push({ s0: pv[i].s, s1: pv[i + 1].s, grade: res.profile.grades[i] });
    const i10 = idfIntensity(d.idf, d.T, d.tcMin);
    const gutterComp = comps.find((c) => c.type === 'sarjeta');
    const gutter = gutterCheck({
      segments: segs, crossSlope: Math.abs(gutterComp?.slope ?? -0.05) || 0.05, n: d.nGutter,
      yMax: Math.min(DRAINAGE.gutterMaxDepth.value, (comps.find((c) => c.type === 'meiofio')?.height ?? 0.15) - 0.02),
      widthContrib: contrib, C: road.drainage.C, i: i10,
    });
    const net = networkAlongAlignment(res.alignment, res.profile, res.surface, {
      spacing: road.drainage.spacing, offset: sideSign * Math.max(0, gutterOff), widthContrib: road.drainage.side === 'both' ? w.total + 2 * (road.drainage.extraWidth || 0) : contrib, C: road.drainage.C,
      flowToEnd: res.profile.elevationAt(res.alignment.startStation) >= res.profile.elevationAt(res.alignment.endStation),
    });
    const pipes = designNetwork(net, { idf: d.idf, T: d.T, tcMin: d.tcMin, cover: d.cover, sMin: d.sMin, n: d.n });
    return { gutter, network: net, pipes, intensity: i10 };
  }

  checkRoad(project, road, res) {
    const out = [];
    const rc = ROAD_CLASSES[road.classKey] || ROAD_CLASSES.local;
    const V = road.V;
    const al = res.alignment, pr = res.profile;
    for (const m of al.errors) out.push({ level: 'erro', group: 'Eixo', msg: m });
    for (const m of al.warnings) out.push({ level: 'alerta', group: 'Eixo', msg: m });
    const emax = road.superelevation?.enabled ? road.superelevation.emax : -0.02; // sem superelevação: declive adverso
    const rmin = geo.rMin(V, emax);
    for (const c of al.curves) {
      if (c.R < rmin - 1e-6) out.push({ level: 'erro', group: 'Eixo', s: c.staPI, msg: `Curva ${c.number}: R = ${fmt(c.R, 1)} m menor que o mínimo de ${fmt(rmin, 1)} m para ${V} km/h (e = ${fmtPct(emax, 0)}, f = ${fmt(geo.fmax(V), 2)}).`, ref: 'DNER706' });
    }
    for (let i = 1; i < al.tangents.length - 1; i++) {
      const t = al.tangents[i];
      const cPrev = al.curves.find((c) => c.piIndex === t.from), cNext = al.curves.find((c) => c.piIndex === t.to);
      if (cPrev && cNext && cPrev.dir !== cNext.dir && t.free < 0.6 * V / 3.6 * 2 && cPrev.Ls === 0 && cNext.Ls === 0 && t.free >= 0) {
        out.push({ level: 'alerta', group: 'Eixo', msg: `Curvas reversas ${cPrev.number} e ${cNext.number} com tangente intermediária curta (${fmt(t.free)} m).` });
      }
    }
    for (const m of pr.errors) out.push({ level: 'erro', group: 'Greide', msg: m });
    const maxG = rc.maxGrade;
    pr.grades.forEach((g, i) => {
      if (Math.abs(g) > maxG + 1e-9) out.push({ level: 'erro', group: 'Greide', s: pr.pvis[i].s, msg: `Rampa ${fmtPct(g)} entre PIV-${i} e PIV-${i + 1} acima da máxima de ${fmtPct(maxG, 1)} (${rc.label}).`, ref: 'DNIT740' });
      const hasGutter = sideComponents(road.template, 'R').some((c) => c.type === 'sarjeta');
      if (hasGutter && Math.abs(g) < GEOMETRIC.minGrade.value - 5e-5) out.push({ level: 'alerta', group: 'Greide', s: pr.pvis[i].s, msg: `Rampa ${fmtPct(g)} abaixo de ${fmtPct(GEOMETRIC.minGrade.value, 1)}: drenagem superficial deficiente.`, ref: 'DNER706' });
    });
    for (const c of pr.curves) {
      const kMin = c.type === 'convexa' ? geo.kCrest(V) : geo.kSag(V);
      if (c.K < kMin - 1e-6) out.push({ level: 'erro', group: 'Greide', s: c.s, msg: `Curva vertical ${c.number} (${c.type}): K = ${fmt(c.K, 1)} menor que o mínimo de ${fmt(kMin, 1)} para ${V} km/h.`, ref: 'DNER706' });
      const lmin = geo.lVertMin(V);
      if (c.L < lmin - 1e-6) out.push({ level: 'alerta', group: 'Greide', s: c.s, msg: `Curva vertical ${c.number}: L = ${fmt(c.L, 1)} m menor que 0,6·V = ${fmt(lmin, 1)} m.`, ref: 'DNER706' });
    }
    for (const side of ['L', 'R']) {
      for (const c of sideComponents(road.template, side)) {
        if (c.type === 'passeio') {
          if (c.width < CROSS_SECTION.sidewalkFreeMin.value) out.push({ level: 'erro', group: 'Seção', msg: `Passeio com ${fmt(c.width)} m: a faixa livre mínima é ${fmt(CROSS_SECTION.sidewalkFreeMin.value)} m (NBR 9050).`, ref: 'NBR9050' });
          else if (c.width < CROSS_SECTION.sidewalkFreeMin.value + CROSS_SECTION.sidewalkServiceMin.value) out.push({ level: 'alerta', group: 'Seção', msg: `Passeio com ${fmt(c.width)} m não comporta faixa livre (1,20 m) e faixa de serviço (0,70 m).`, ref: 'NBR9050' });
          if (Math.abs(c.slope) > CROSS_SECTION.sidewalkCrossMax.value + 1e-9) out.push({ level: 'erro', group: 'Seção', msg: `Inclinação transversal do passeio ${fmtPct(Math.abs(c.slope), 1)} acima de 3% (NBR 9050).`, ref: 'NBR9050' });
        }
      }
      if (road.template.symmetric) break;
    }
    if (res.corridor) for (const m of res.corridor.warnings) out.push({ level: 'alerta', group: 'Corredor', msg: m });
    if (res.drainage) {
      for (const g of res.drainage.gutter) if (g.needsInlet) out.push({ level: 'info', group: 'Drenagem', s: g.s0, msg: `Sarjeta entre ${fmtStation(g.s0)} e ${fmtStation(g.s1)}: capacidade atingida a cada ${fmt(g.Lcrit, 0)} m; prever ${g.inlets} captação(ões).` });
      for (const p of res.drainage.pipes) for (const w of p.warnings) out.push({ level: 'alerta', group: 'Drenagem', msg: `${p.id}: ${w}` });
    }
    return out;
  }

  /** Loteamento: quadras, lotes e quadro de áreas. */
  computeParcels(project, roadResults) {
    const P = project.parcels;
    if (!P.gleba || P.gleba.length < 3) return null;
    const glebaArea = polygonArea(P.gleba);
    const roadPolys = [];
    for (const r of roadResults) {
      if (!r.alignment?.ok) continue;
      const w = templateWidths(r.road.template);
      roadPolys.push(roadPolygon(r.alignment, w.left, w.right, 2));
    }
    const blocks = blocksFromRoads(P.gleba, roadPolys);
    const blocksArea = blocks.reduce((s, b) => s + b.area, 0);
    const lots = (P.lots || []).map((l, i) => {
      const d = lotDescription(l.polygon);
      const issues = checkLot({ area: d.area, front: l.front });
      return { ...l, number: l.number ?? i + 1, area: d.area, perimeter: d.perimeter, sides: d.sides, centroid: d.centroid, issues };
    });
    const lotsArea = lots.reduce((s, l) => s + l.area, 0);
    const greenArea = (P.green || []).reduce((s, g) => s + polygonArea(g.polygon), 0);
    const instArea = (P.institutional || []).reduce((s, g) => s + polygonArea(g.polygon), 0);
    const table = areaTable({ glebaArea, lotsArea, roadsArea: Math.max(0, glebaArea - blocksArea), greenArea, institutionalArea: instArea });
    return { glebaArea, blocks, lots, table, roadPolys };
  }

  computeAll(project) {
    const roads = project.roads.filter((r) => r.pis.length >= 2).map((r) => {
      try { return this.computeRoad(project, r); } catch (err) {
        return { road: r, error: err, checks: [{ level: 'erro', group: 'Cálculo', msg: 'Falha no cálculo: ' + err.message }] };
      }
    });
    let parcels = null;
    try { parcels = this.computeParcels(project, roads); } catch (err) { parcels = { error: err }; }
    return { roads, parcels };
  }
}
