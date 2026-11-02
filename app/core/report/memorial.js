// URBIS - memorial descritivo gerado a partir do projeto
import { fmt, fmtPct, fmtStation, fmtDMS, fmtAz } from '../util.js';
import { ROAD_CLASSES, SOURCES, geo } from '../norms/brasil.js';
import { COMPONENT_TYPES, sideComponents, templateWidths, pavementThickness } from '../template.js';
import { collectBudget } from './budget.js';
import { utmToGeo, fmtLatLon } from '../utm.js';

function describeTemplate(tpl) {
  const parts = [];
  if (+tpl.median > 0) parts.push(`canteiro central com ${fmt(+tpl.median, 2)} m`);
  const sideTxt = (comps) => comps.map((c) => {
    const lab = (COMPONENT_TYPES[c.type]?.label || c.type).toLowerCase();
    if (c.type === 'meiofio') return `${lab} com ${fmt(c.height || 0.15, 2)} m de altura`;
    return `${lab} com ${fmt(c.width, 2)} m e declividade de ${fmtPct(Math.abs(c.slope || 0), 1)}`;
  }).join(', ');
  if (tpl.symmetric) parts.push(`em cada lado: ${sideTxt(sideComponents(tpl, 'R'))}`);
  else { parts.push(`lado esquerdo: ${sideTxt(sideComponents(tpl, 'L'))}`); parts.push(`lado direito: ${sideTxt(sideComponents(tpl, 'R'))}`); }
  return parts.join('; ');
}

/** @returns {{title:string, level?:number, paragraphs?:string[], table?:object, pageBreak?:boolean}[]} */
export function buildMemorial(project, results) {
  const m = project.meta;
  const st = project.settings;
  const iv = st.stationInterval || 20;
  const roads = results.roads.filter((r) => r.alignment?.ok);
  const out = [];
  const totalLen = roads.reduce((s, r) => s + r.alignment.length, 0);
  out.push({ title: '1. Identificação', paragraphs: [
    `Projeto: ${m.name}.`,
    `Contratante: ${m.client || 'não informado'}. Local: ${m.location || 'não informado'}.`,
    `Responsável técnico: ${m.author || 'não informado'}${m.crea ? `, CREA/CAU ${m.crea}` : ''}${m.art ? `, ART/RRT ${m.art}` : ''}.`,
    `Data de emissão: ${new Date().toLocaleDateString('pt-BR')}.`,
  ] });
  const what = [];
  if (roads.length) what.push(`${roads.length} via(s) com extensão total de ${fmt(totalLen, 2)} m`);
  if (results.parcels?.lots?.length) what.push(`parcelamento do solo com ${results.parcels.lots.length} lotes`);
  if (roads.some((r) => r.drainage)) what.push('rede de microdrenagem pluvial');
  out.push({ title: '2. Objeto', paragraphs: [
    `O presente memorial descreve o projeto de ${what.join(', ') || 'infraestrutura urbana'}, contemplando geometria horizontal e vertical, seções transversais, terraplenagem, pavimentação${roads.some((r) => r.drainage) ? ', drenagem' : ''} e sinalização viária, além dos quantitativos de serviços.`,
  ] });
  out.push({ title: '3. Referências normativas e legais', paragraphs: Object.values(SOURCES).map((s) => `- ${s}`) });
  // topografia
  const tp = [];
  for (const sdef of project.surfaces) {
    const n = sdef.points.length / 3;
    tp.push(`Superfície "${sdef.name}": ${fmt(n, 0)} pontos${sdef.breaklines?.length ? ` e ${sdef.breaklines.length} linhas de quebra` : ''}, origem ${sdef.source || 'importação'}.`);
  }
  let geoTxt = '';
  const firstPt = project.roads[0]?.pis[0];
  if (firstPt && firstPt.x > 100000 && firstPt.x < 900000) {
    const g = utmToGeo(firstPt.x, firstPt.y, m.zone, m.hemisphere);
    geoTxt = ` O início do primeiro eixo está nas coordenadas E ${fmt(firstPt.x, 3)} m e N ${fmt(firstPt.y, 3)} m (latitude ${fmtLatLon(g.lat, true)}, longitude ${fmtLatLon(g.lon, false)}).`;
  }
  out.push({ title: '4. Levantamento topográfico e modelo digital do terreno', paragraphs: [
    `As coordenadas estão no sistema geodésico SIRGAS 2000, projeção UTM, fuso ${m.zone}${m.hemisphere}, e as cotas em metros.${geoTxt}`,
    'O modelo digital do terreno foi gerado por triangulação de Delaunay (TIN), respeitando as linhas de quebra informadas. As cotas são interpoladas linearmente nas faces dos triângulos, e as seções transversais são obtidas pela interseção exata com as arestas do modelo.',
    ...tp,
    `Curvas de nível com equidistância de ${fmt(st.contourInterval, 2)} m e curvas mestras a cada ${st.contourMajor} curvas.`,
  ] });
  // vias
  let sec = 5;
  for (const r of roads) {
    const rd = r.road, al = r.alignment, pr = r.profile, cor = r.corridor;
    const rc = ROAD_CLASSES[rd.classKey];
    const w = templateWidths(rd.template);
    const emax = rd.superelevation?.enabled ? rd.superelevation.emax : -0.02;
    const rmin = geo.rMin(rd.V, emax);
    const minR = al.curves.length ? Math.min(...al.curves.map((c) => c.R)) : null;
    const grades = pr.grades.map(Math.abs);
    const crest = pr.curves.filter((c) => c.type === 'convexa'), sag = pr.curves.filter((c) => c.type === 'côncava');
    out.push({ title: `${sec}. ${rd.name}`, pageBreak: true, paragraphs: [
      `Classe: ${rc?.label || rd.classKey}. Velocidade diretriz: ${rd.V} km/h. Extensão: ${fmt(al.length, 2)} m, da estaca ${fmtStation(al.startStation, iv)} à estaca ${fmtStation(al.endStation, iv)}, com estaqueamento a cada ${iv} m.`,
    ] });
    out.push({ title: `${sec}.1 Seção transversal tipo`, level: 2, paragraphs: [
      `A plataforma tem ${fmt(w.total, 2)} m de largura total, com pista de rolamento de ${fmt(w.carriageway, 2)} m. Composição: ${describeTemplate(rd.template)}.`,
      `Taludes de corte com inclinação ${fmt(rd.template.cut.slope, 2)}H:1V e de aterro com ${fmt(rd.template.fill.slope, 2)}H:1V${rd.template.cut.ditch ? `, com valeta de pé de corte de ${fmt(rd.template.cut.ditch.width, 2)} m por ${fmt(rd.template.cut.ditch.depth, 2)} m` : ''}.`,
    ] });
    out.push({ title: `${sec}.2 Geometria horizontal`, level: 2, paragraphs: [
      `O eixo possui ${al.curves.length} curva(s) horizontal(is)${minR ? `, com raio mínimo adotado de ${fmt(minR, 2)} m` : ''}. O raio mínimo normativo para ${rd.V} km/h, com e = ${fmtPct(emax, 1)} e f = ${fmt(geo.fmax(rd.V), 2)}, é de ${fmt(rmin, 2)} m (R = V²/127(e + f)).`,
      rd.superelevation?.enabled ? `Foi aplicada superelevação pelo critério do DNER, e = emax(2Rmin/R - Rmin²/R²), com emax = ${fmtPct(rd.superelevation.emax, 1)}, rotação em torno do eixo e transição pela rampa relativa máxima.` : 'Não foi aplicada superelevação; as curvas mantêm o abaulamento da pista.',
    ],
    table: al.curves.length ? { cols: [{ h: 'Curva', k: 'c', w: 12 }, { h: 'AC', k: 'ac', w: 20 }, { h: 'R (m)', k: 'R', w: 14, align: 'right' }, { h: 'Ls (m)', k: 'Ls', w: 12, align: 'right' }, { h: 'T (m)', k: 'T', w: 14, align: 'right' }, { h: 'D (m)', k: 'D', w: 14, align: 'right' }, { h: 'Início', k: 'i', w: 18 }, { h: 'Fim', k: 'f', w: 18 }],
      rows: al.curves.map((c) => ({ c: `C${c.number}${c.side}`, ac: fmtDMS(c.I), R: c.R, Ls: c.Ls, T: c.T, D: c.total, i: fmtStation(c.staTS, iv), f: fmtStation(c.staST, iv) })) } : null });
    out.push({ title: `${sec}.3 Geometria vertical`, level: 2, paragraphs: [
      `O greide possui ${pr.pvis.length} PIVs, com rampas entre ${fmtPct(Math.min(...grades), 2)} e ${fmtPct(Math.max(...grades), 2)} (máxima admitida para a classe: ${fmtPct(rc?.maxGrade || 0, 1)}).`,
      `Curvas verticais parabólicas simétricas: ${crest.length} convexa(s)${crest.length ? ` com K mínimo de ${fmt(Math.min(...crest.map((c) => c.K)), 1)}` : ''} e ${sag.length} côncava(s)${sag.length ? ` com K mínimo de ${fmt(Math.min(...sag.map((c) => c.K)), 1)}` : ''}. Valores mínimos normativos para ${rd.V} km/h: K = ${fmt(geo.kCrest(rd.V), 0)} (convexa) e K = ${fmt(geo.kSag(rd.V), 0)} (côncava).`,
    ] });
    if (cor?.totals) {
      const t = cor.totals;
      out.push({ title: `${sec}.4 Terraplenagem`, level: 2, paragraphs: [
        `Os volumes foram calculados pelo método da média das áreas entre seções espaçadas de no máximo ${st.sectionInterval} m, com seções adicionais nos pontos notáveis. As áreas são medidas entre a linha de terraplenagem (base do pavimento e das estruturas) e o terreno natural.`,
        `Volume de corte: ${fmt(t.cut, 2)} m³. Volume de aterro compactado: ${fmt(t.fill, 2)} m³ (${fmt(t.fillCorr, 2)} m³ de corte equivalente com Fh = ${fmt(t.fh, 2)}). ${t.balance >= 0 ? `Excedente para bota-fora: ${fmt(t.balance, 2)} m³.` : `Necessidade de empréstimo: ${fmt(-t.balance, 2)} m³.`}`,
        `Área de limpeza da faixa: ${fmt(t.clearingArea, 2)} m², com remoção da camada vegetal de ${fmt(st.topsoil, 2)} m.`,
      ] });
    }
    const pav = rd.template.pavement;
    out.push({ title: `${sec}.5 Pavimentação`, level: 2, paragraphs: [
      `Estrutura do pavimento com espessura total de ${fmt(pavementThickness(rd.template) * 100, 1)} cm: ${pav.layers.map((l) => `${l.name} (${fmt(l.thickness * 100, 1)} cm)`).join('; ')}.${pav.design ? ` Pré-dimensionamento pelo método do DNER (1981), N = ${pav.design.N.toExponential(2).replace('.', ',')} e CBR do subleito de ${fmt(pav.design.cbr, 1)}%.` : ''}`,
    ] });
    if (r.drainage) {
      const d = project.drainage;
      const Ds = [...new Set(r.drainage.pipes.map((p) => Math.round(p.D * 1000)))].sort((a, b) => a - b);
      out.push({ title: `${sec}.6 Drenagem pluvial`, level: 2, paragraphs: [
        `As vazões foram determinadas pelo método racional, Q = C·i·A, com intensidade pela equação i = ${fmt(d.idf.K, 2)}·T^${fmt(d.idf.a, 4)}/(t + ${fmt(d.idf.b, 2)})^${fmt(d.idf.c, 4)} (${d.idf.source}), tempo de recorrência de ${d.T} anos e tempo de concentração inicial de ${d.tcMin} min.`,
        `A capacidade das sarjetas foi verificada pela fórmula de Izzard com lâmina máxima de 0,13 m junto ao meio-fio. As galerias foram dimensionadas pela fórmula de Manning (n = ${d.n}) com lâmina máxima de 85% do diâmetro, recobrimento mínimo de ${fmt(d.cover, 2)} m e diâmetros de ${Ds.join(', ')} mm, totalizando ${r.drainage.network.nodes.length} poços de visita.`,
      ] });
    }
    if (r.markings) {
      out.push({ title: `${sec}.7 Sinalização viária`, level: 2, paragraphs: [
        `Sinalização horizontal conforme o Manual Brasileiro de Sinalização de Trânsito, Vol. IV: ${r.markings.lines.map((l) => l.code).join(', ') || 'sem linhas longitudinais'}, com largura de ${fmt(r.markings.width, 2)} m${r.crosswalks.length ? ` e ${r.crosswalks.length} faixa(s) de travessia de pedestres` : ''}.`,
        `Sinalização vertical conforme os Volumes I e II: ${r.signs.length} placa(s) (${[...new Set(r.signs.map((s) => s.code))].join(', ')}).`,
      ] });
    }
    const pend = (r.checks || []).filter((c) => c.level !== 'info');
    if (pend.length) out.push({ title: `${sec}.8 Pendências apontadas nas verificações`, level: 2, paragraphs: pend.map((c) => `- [${c.level}] ${c.msg}`) });
    sec++;
  }
  // loteamento
  const P = results.parcels;
  if (P && P.table) {
    out.push({ title: `${sec}. Parcelamento do solo`, pageBreak: true, paragraphs: [
      `A gleba possui área de ${fmt(P.glebaArea, 2)} m². O parcelamento resulta em ${P.blocks.length} quadra(s) e ${P.lots.length} lote(s), observados os mínimos do art. 4º, II, da Lei 6.766/1979 (área de 125 m² e frente de 5 m).`,
    ], table: { cols: [{ h: 'Uso', k: 'u', w: 90 }, { h: 'Área (m²)', k: 'a', w: 30, align: 'right' }, { h: '%', k: 'p', w: 20, align: 'right' }], rows: [...P.table.rows.map((r) => ({ u: r.item, a: r.area, p: fmtPct(r.pct, 2) })), { __bold: true, u: 'Total da gleba', a: P.table.total, p: '100%' }] } });
    if (P.lots.length) {
      const lotPars = [];
      for (const l of P.lots) {
        const v = l.sides;
        const txt = [`Quadra ${l.block}, Lote ${l.number}: área de ${fmt(l.area, 2)} m² e perímetro de ${fmt(l.perimeter, 2)} m. Inicia-se no vértice V1, de coordenadas N ${fmt(v[0].p.y, 3)} m e E ${fmt(v[0].p.x, 3)} m`];
        for (const s of v) txt.push(`deste segue com azimute ${fmtAz(s.az)} e distância de ${fmt(s.length, 2)} m até o vértice V${s.to}${s.to === 1 ? ', ponto inicial da descrição' : `, de coordenadas N ${fmt(s.q.y, 3)} m e E ${fmt(s.q.x, 3)} m`}`);
        lotPars.push(txt.join('; ') + '.');
      }
      out.push({ title: `${sec}.1 Descrição perimétrica dos lotes`, level: 2, paragraphs: lotPars });
    }
    sec++;
  }
  const b = collectBudget(project, results);
  if (b.direct > 0) out.push({ title: `${sec}. Estimativa de custo`, paragraphs: [`Custo direto estimado de R$ ${fmt(b.direct, 2)}, com BDI de ${fmtPct(b.bdi, 2)}, totalizando R$ ${fmt(b.total, 2)}. ${project.budget.reference || ''}`] });
  out.push({ title: `${b.direct > 0 ? sec + 1 : sec}. Considerações finais`, paragraphs: [
    'Os parâmetros normativos adotados constam do perfil de normas federais do URBIS, com a fonte de cada valor. Exigências estaduais ou municipais mais restritivas prevalecem e devem ser verificadas pelo responsável técnico.',
  ] });
  return out;
}
