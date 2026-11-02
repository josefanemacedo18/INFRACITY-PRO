// URBIS - planilha Excel (ExcelJS): quantitativos, notas de serviço, volumes, drenagem, lotes e orçamento

import { fmtStation, fmtDMS, fmtAz } from '../util.js';
import { collectItems, collectBudget } from './budget.js';
import { ROAD_CLASSES } from '../norms/brasil.js';

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F59' } };
const SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2F0' } };
const N2 = '#,##0.00';
const N3 = '#,##0.000';

function safeName(name, used) {
  let n = String(name).replace(/[\\/*?:[\]]/g, '-').slice(0, 31);
  let k = 2;
  const base = n;
  while (used.has(n)) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n);
  return n;
}

function header(ws, cols) {
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: c.fmt ? { numFmt: c.fmt } : {} }));
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEAD_FILL;
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function title(ws, text, row = 1) {
  ws.getCell(row, 1).value = text;
  ws.getCell(row, 1).font = { bold: true, size: 13, color: { argb: 'FF1F5F59' } };
}

/**
 * @param {*} ExcelJS biblioteca ExcelJS
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildWorkbook(ExcelJS, project, results) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'URBIS';
  wb.created = new Date();
  const used = new Set();
  const m = project.meta;
  const iv = project.settings.stationInterval || 20;

  // Resumo
  const ws0 = wb.addWorksheet(safeName('Resumo', used));
  title(ws0, `URBIS — ${m.name}`);
  const info = [['Cliente', m.client], ['Local', m.location], ['Empresa', m.company], ['Responsável técnico', m.author], ['CREA/CAU', m.crea], ['ART/RRT', m.art], ['Sistema de referência', `SIRGAS 2000 / UTM fuso ${m.zone}${m.hemisphere}`], ['Data de emissão', new Date().toLocaleDateString('pt-BR')]];
  info.forEach(([k, v], i) => { ws0.getCell(3 + i, 1).value = k; ws0.getCell(3 + i, 1).font = { bold: true }; ws0.getCell(3 + i, 2).value = v || '-'; });
  let r0 = 4 + info.length;
  const cols = ['Via', 'Classe', 'V (km/h)', 'Extensão (m)', 'Curvas', 'Corte (m³)', 'Aterro (m³)', 'Aterro×Fh (m³)', 'Saldo (m³)', 'Erros', 'Alertas'];
  cols.forEach((c, i) => { const cell = ws0.getCell(r0, i + 1); cell.value = c; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = HEAD_FILL; });
  for (const r of results.roads) {
    r0++;
    const t = r.corridor?.totals;
    const vals = [r.road.name, ROAD_CLASSES[r.road.classKey]?.label, r.road.V, r.alignment?.length, r.alignment?.curves.length, t?.cut, t?.fill, t?.fillCorr, t?.balance, (r.checks || []).filter((c) => c.level === 'erro').length, (r.checks || []).filter((c) => c.level === 'alerta').length];
    vals.forEach((v, i) => { const cell = ws0.getCell(r0, i + 1); cell.value = v ?? null; if (typeof v === 'number' && i >= 3 && i <= 8) cell.numFmt = N2; });
  }
  ws0.columns.forEach((c, i) => { c.width = i === 0 ? 26 : i === 1 ? 24 : 15; });

  for (const r of results.roads) {
    if (!r.alignment?.ok) continue;
    const name = r.road.name;
    const al = r.alignment, pr = r.profile, cor = r.corridor;
    // Eixo
    const wsA = wb.addWorksheet(safeName(`Eixo ${name}`, used));
    header(wsA, [{ h: 'PI', k: 'pi', w: 8 }, { h: 'Este (m)', k: 'e', w: 15, fmt: N3 }, { h: 'Norte (m)', k: 'n', w: 15, fmt: N3 }, { h: 'Estaca', k: 'est', w: 12 }, { h: 'Deflexão', k: 'd', w: 14 }, { h: 'Lado', k: 'lado', w: 6 }, { h: 'R (m)', k: 'R', fmt: N2 }, { h: 'Ls (m)', k: 'Ls', fmt: N2 }, { h: 'T (m)', k: 'T', fmt: N3 }, { h: 'Desenv. (m)', k: 'D', fmt: N3 }, { h: 'Início', k: 'ini', w: 12 }, { h: 'Fim', k: 'fim', w: 12 }, { h: 'G20', k: 'g', w: 12 }]);
    r.pis.forEach((p, i) => {
      const c = al.curves.find((x) => x.piIndex === i);
      wsA.addRow({ pi: i === 0 ? 'PP' : i === r.pis.length - 1 ? 'PF' : `PI-${i}`, e: p.x, n: p.y, est: fmtStation(al.piStations[i], iv), d: c ? fmtDMS(c.I) : '', lado: c ? c.side : '', R: c ? c.R : null, Ls: c ? c.Ls : null, T: c ? c.T : null, D: c ? c.total : null, ini: c ? fmtStation(c.staTS, iv) : '', fim: c ? fmtStation(c.staST, iv) : '', g: c && c.G20 ? fmtDMS(c.G20 * Math.PI / 180) : '' });
    });
    wsA.addRow({});
    const kp = wsA.addRow({ pi: 'Pontos notáveis' }); kp.font = { bold: true };
    for (const k of al.keyPoints()) {
      const q = al.pointAt(k.s);
      wsA.addRow({ pi: k.label + (k.curve || ''), e: q.x, n: q.y, est: fmtStation(k.s, iv), d: fmtAz(q.az) });
    }
    // Greide
    const wsG = wb.addWorksheet(safeName(`Greide ${name}`, used));
    header(wsG, [{ h: 'PIV', k: 'i', w: 6 }, { h: 'Estaca', k: 'est', w: 12 }, { h: 'Distância (m)', k: 's', fmt: N2 }, { h: 'Cota (m)', k: 'z', fmt: N3 }, { h: 'Rampa anterior (%)', k: 'g1', fmt: '0.000' }, { h: 'Rampa posterior (%)', k: 'g2', fmt: '0.000' }, { h: 'L (m)', k: 'L', fmt: N2 }, { h: 'K', k: 'K', fmt: '0.0' }, { h: 'Tipo', k: 't', w: 10 }, { h: 'Flecha (m)', k: 'e', fmt: N3 }, { h: 'PCV', k: 'pcv', w: 12 }, { h: 'Cota PCV', k: 'zpcv', fmt: N3 }, { h: 'PTV', k: 'ptv', w: 12 }, { h: 'Cota PTV', k: 'zptv', fmt: N3 }]);
    pr.pvis.forEach((p, i) => {
      const c = pr.curves.find((x) => x.pviIndex === i);
      wsG.addRow({ i, est: fmtStation(p.s, iv), s: p.s, z: p.z, g1: i > 0 ? pr.grades[i - 1] * 100 : null, g2: i < pr.grades.length ? pr.grades[i] * 100 : null, L: c ? c.L : null, K: c ? c.K : null, t: c ? c.type : '', e: c ? Math.abs(c.e) : null, pcv: c ? fmtStation(c.sPCV, iv) : '', zpcv: c ? c.zPCV : null, ptv: c ? fmtStation(c.sPTV, iv) : '', zptv: c ? c.zPTV : null });
    });
    if (!cor || !cor.totals) continue;
    // Nota de serviço
    const wsN = wb.addWorksheet(safeName(`Nota serviço ${name}`, used));
    header(wsN, [{ h: 'Estaca', k: 'est', w: 12 }, { h: 'Distância (m)', k: 's', fmt: N2 }, { h: 'Cota terreno', k: 'zg', fmt: N3 }, { h: 'Cota greide', k: 'zc', fmt: N3 }, { h: 'Corte no eixo (m)', k: 'hc', fmt: N3 }, { h: 'Aterro no eixo (m)', k: 'ha', fmt: N3 }, { h: 'Decliv. LE (%)', k: 'dl', fmt: '0.00' }, { h: 'Decliv. LD (%)', k: 'dr', fmt: '0.00' }, { h: 'Bordo LE cota', k: 'bl', fmt: N3 }, { h: 'Bordo LD cota', k: 'br', fmt: N3 }, { h: 'Offset LE (m)', k: 'ol', fmt: N2 }, { h: 'Cota offset LE', k: 'zl', fmt: N3 }, { h: 'Talude LE', k: 'tl', w: 9 }, { h: 'Offset LD (m)', k: 'or', fmt: N2 }, { h: 'Cota offset LD', k: 'zr', fmt: N3 }, { h: 'Talude LD', k: 'tr', w: 9 }]);
    for (const sc of cor.sections) {
      const dlL = sc.left.daylight.pts, dlR = sc.right.daylight.pts;
      const lanesL = sc.left.top.filter((p) => /^pista/.test(p.code)), lanesR = sc.right.top.filter((p) => /^pista/.test(p.code));
      wsN.addRow({
        est: fmtStation(sc.s, iv), s: sc.s, zg: sc.zg, zc: sc.zc,
        hc: sc.height != null && sc.height < 0 ? -sc.height : null, ha: sc.height != null && sc.height >= 0 ? sc.height : null,
        dl: sc.slopes.L * 100, dr: sc.slopes.R * 100,
        bl: lanesL.length ? lanesL[lanesL.length - 1].z : null, br: lanesR.length ? lanesR[lanesR.length - 1].z : null,
        ol: dlL.length ? dlL[dlL.length - 1].o : null, zl: dlL.length ? dlL[dlL.length - 1].z : null, tl: sc.slopeType.L || '',
        or: dlR.length ? dlR[dlR.length - 1].o : null, zr: dlR.length ? dlR[dlR.length - 1].z : null, tr: sc.slopeType.R || '',
      });
    }
    // Volumes
    const wsV = wb.addWorksheet(safeName(`Volumes ${name}`, used));
    header(wsV, [{ h: 'Estaca', k: 'est', w: 12 }, { h: 'Distância parcial (m)', k: 'd', fmt: N2 }, { h: 'Área corte (m²)', k: 'ac', fmt: N2 }, { h: 'Área aterro (m²)', k: 'aa', fmt: N2 }, { h: 'Volume corte (m³)', k: 'vc', fmt: N2 }, { h: 'Volume aterro (m³)', k: 'va', fmt: N2 }, { h: `Aterro × Fh ${project.settings.fh}`, k: 'vac', fmt: N2 }, { h: 'Corte acumulado (m³)', k: 'cc', fmt: N2 }, { h: 'Aterro acumulado (m³)', k: 'ca', fmt: N2 }, { h: 'Ordenada de Brückner (m³)', k: 'b', fmt: N2 }]);
    for (const v of cor.volumes) wsV.addRow({ est: fmtStation(v.s, iv), d: v.dist, ac: v.cutArea, aa: v.fillArea, vc: v.cutVol, va: v.fillVol, vac: v.fillVolCorr, cc: v.cutCum, ca: v.fillCum, b: v.mass });
    const tr = wsV.addRow({ est: 'TOTAL', vc: cor.totals.cut, va: cor.totals.fill, vac: cor.totals.fillCorr, b: cor.totals.balance });
    tr.font = { bold: true }; tr.fill = SUB_FILL;
    // Drenagem
    if (r.drainage) {
      const wsD = wb.addWorksheet(safeName(`Drenagem ${name}`, used));
      header(wsD, [{ h: 'Trecho', k: 'id', w: 8 }, { h: 'Montante', k: 'm', w: 9 }, { h: 'Jusante', k: 'j', w: 9 }, { h: 'Extensão (m)', k: 'L', fmt: N2 }, { h: 'Área × C acum. (m²)', k: 'a', fmt: N2 }, { h: 'tc (min)', k: 'tc', fmt: '0.00' }, { h: 'i (mm/h)', k: 'i', fmt: N2 }, { h: 'Q (L/s)', k: 'q', fmt: N2 }, { h: 'Declividade (%)', k: 's', fmt: '0.000' }, { h: 'Ø (mm)', k: 'D', fmt: '0' }, { h: 'y/D', k: 'yd', fmt: '0.00' }, { h: 'V (m/s)', k: 'v', fmt: '0.00' }, { h: 'Q plena y/D máx (L/s)', k: 'qc', fmt: N2 }, { h: 'Cota fundo montante', k: 'cm', fmt: N3 }, { h: 'Cota fundo jusante', k: 'cj', fmt: N3 }, { h: 'Prof. montante (m)', k: 'pm', fmt: N2 }, { h: 'Prof. jusante (m)', k: 'pj', fmt: N2 }, { h: 'Observações', k: 'obs', w: 34 }]);
      for (const p of r.drainage.pipes) wsD.addRow({ id: p.id, m: p.from, j: p.to, L: p.length, a: p.areaAcc, tc: p.tc, i: p.i, q: p.Q * 1000, s: p.S * 100, D: p.D * 1000, yd: p.yD, v: p.V, qc: p.Qcap * 1000, cm: p.invUp, cj: p.invDn, pm: p.depthUp, pj: p.depthDn, obs: p.warnings.join(' ') });
      wsD.addRow({});
      const h2 = wsD.addRow({ id: 'Sarjetas (Izzard)' }); h2.font = { bold: true };
      const hh = wsD.addRow({ id: 'Início', m: 'Fim', j: 'Rampa %', L: 'Q adm (L/s)', a: 'q (L/s/m)', tc: 'L crítico (m)', i: 'Captações' }); hh.font = { bold: true };
      for (const g of r.drainage.gutter) wsD.addRow({ id: fmtStation(g.s0, iv), m: fmtStation(g.s1, iv), j: +(g.grade * 100).toFixed(3), L: g.Qadm * 1000, a: g.qUnit * 1000, tc: Number.isFinite(g.Lcrit) ? g.Lcrit : null, i: g.inlets });
    }
  }

  // Quantitativos por via
  const wsQ = wb.addWorksheet(safeName('Quantitativos', used));
  header(wsQ, [{ h: 'Via / área', k: 'via', w: 22 }, { h: 'Grupo', k: 'g', w: 22 }, { h: 'Código', k: 'c', w: 11 }, { h: 'Descrição', k: 'd', w: 62 }, { h: 'Unidade', k: 'u', w: 8 }, { h: 'Quantidade', k: 'q', w: 15, fmt: N2 }, { h: 'Observação', k: 'o', w: 30 }]);
  for (const it of collectItems(project, results)) wsQ.addRow({ via: it.via, g: it.group, c: it.code, d: it.description, u: it.unit, q: it.qty, o: it.note || '' });
  wsQ.autoFilter = { from: 'A1', to: 'G1' };

  // Loteamento
  const P = results.parcels;
  if (P && P.lots) {
    const wsL = wb.addWorksheet(safeName('Lotes', used));
    header(wsL, [{ h: 'Quadra', k: 'q', w: 8 }, { h: 'Lote', k: 'l', w: 8 }, { h: 'Área (m²)', k: 'a', fmt: N2 }, { h: 'Perímetro (m)', k: 'p', fmt: N2 }, { h: 'Frente (m)', k: 'f', fmt: N2 }, { h: 'Situação (Lei 6.766)', k: 's', w: 60 }]);
    for (const l of P.lots) wsL.addRow({ q: l.block, l: l.number, a: l.area, p: l.perimeter, f: l.front, s: l.issues.length ? l.issues.join(' ') : 'Atende' });
    const wsT = wb.addWorksheet(safeName('Quadro de áreas', used));
    header(wsT, [{ h: 'Uso', k: 'u', w: 46 }, { h: 'Área (m²)', k: 'a', w: 16, fmt: N2 }, { h: '%', k: 'p', w: 10, fmt: '0.00%' }]);
    for (const rw of P.table.rows) wsT.addRow({ u: rw.item, a: rw.area, p: rw.pct });
    const t = wsT.addRow({ u: 'Área total da gleba', a: P.table.total, p: 1 }); t.font = { bold: true };
    // vértices
    const wsVx = wb.addWorksheet(safeName('Vértices dos lotes', used));
    header(wsVx, [{ h: 'Quadra', k: 'q', w: 8 }, { h: 'Lote', k: 'l', w: 8 }, { h: 'Vértice', k: 'v', w: 8 }, { h: 'Este (m)', k: 'e', w: 15, fmt: N3 }, { h: 'Norte (m)', k: 'n', w: 15, fmt: N3 }, { h: 'Azimute', k: 'az', w: 14 }, { h: 'Distância (m)', k: 'd', fmt: N2 }]);
    for (const l of P.lots) for (const s of l.sides) wsVx.addRow({ q: l.block, l: l.number, v: `V${s.from}`, e: s.p.x, n: s.p.y, az: fmtAz(s.az), d: s.length });
  }

  // Orçamento com fórmulas
  const b = collectBudget(project, results);
  const wsB = wb.addWorksheet(safeName('Orçamento', used));
  title(wsB, `Orçamento estimativo — ${m.name}`);
  wsB.getCell(2, 1).value = `Referência de preços: ${project.budget.reference || '-'}`;
  const hdr = ['Código', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário (R$)', 'Total (R$)'];
  hdr.forEach((h, i) => { const c = wsB.getCell(4, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL; });
  let rowN = 5;
  const subRows = [];
  for (const g of b.groups) {
    const gr = wsB.getRow(rowN++); gr.getCell(1).value = g.name; gr.font = { bold: true }; gr.fill = SUB_FILL;
    const first = rowN;
    for (const it of g.items) {
      const rw = wsB.getRow(rowN);
      rw.getCell(1).value = it.code; rw.getCell(2).value = it.description; rw.getCell(3).value = it.unit;
      rw.getCell(4).value = it.qty; rw.getCell(4).numFmt = N2;
      rw.getCell(5).value = it.price; rw.getCell(5).numFmt = N2;
      rw.getCell(6).value = { formula: `D${rowN}*E${rowN}`, result: it.total }; rw.getCell(6).numFmt = N2;
      rowN++;
    }
    const sr = wsB.getRow(rowN);
    sr.getCell(5).value = `Subtotal ${g.name}`; sr.getCell(6).value = { formula: `SUM(F${first}:F${rowN - 1})`, result: g.subtotal }; sr.getCell(6).numFmt = N2; sr.font = { bold: true };
    subRows.push(rowN);
    rowN += 2;
  }
  const dRow = rowN;
  wsB.getCell(dRow, 5).value = 'Custo direto'; wsB.getCell(dRow, 6).value = { formula: subRows.length ? subRows.map((r) => `F${r}`).join('+') : '0', result: b.direct };
  wsB.getCell(dRow + 1, 4).value = 'BDI'; wsB.getCell(dRow + 1, 5).value = project.budget.bdi; wsB.getCell(dRow + 1, 5).numFmt = '0.00%';
  wsB.getCell(dRow + 1, 6).value = { formula: `F${dRow}*E${dRow + 1}`, result: b.direct * project.budget.bdi };
  wsB.getCell(dRow + 2, 5).value = 'TOTAL GERAL'; wsB.getCell(dRow + 2, 6).value = { formula: `F${dRow}+F${dRow + 1}`, result: b.total };
  for (const rr of [dRow, dRow + 1, dRow + 2]) { wsB.getCell(rr, 6).numFmt = N2; wsB.getRow(rr).font = { bold: true }; }
  wsB.columns = [{ width: 12 }, { width: 66 }, { width: 9 }, { width: 15 }, { width: 20 }, { width: 18 }];
  return wb.xlsx.writeBuffer();
}
