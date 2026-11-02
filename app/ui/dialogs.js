// URBIS - diálogos: importação, normas, versões, pavimento, orçamento, exportação
import { html } from 'htm/preact';
import { useState, useMemo } from 'preact/hooks';
import { store } from './store.js';
import { Modal, Field, Num, Text, Select, Check, StatusBadge } from './widgets.js';
import { openFile } from './host.js';
import { addSurface, saveVersion, restoreVersion } from './actions.js';
import { parsePointsText, FORMAT_LABELS } from '../core/importers/points.js';
import { parseDxf, decodeDxfBytes, extractTopography, suggestLayerUse, extractPolylines } from '../core/importers/dxf.js';
import { parseDwg } from '../core/importers/dwg.js';
import { normTable, SOURCES } from '../core/norms/brasil.js';
import { dnerDesign, computeN } from '../core/pavement.js';
import { fmt, fmtPct } from '../core/util.js';
import { Model } from '../core/model.js';
import { restoreDesign } from '../core/project.js';
import { collectBudget } from '../core/report/budget.js';
import { exportDocuments } from './exporter.js';

// ---------------------------------------------------------------- importação de pontos
export async function startImportPoints() {
  const f = await openFile({ accept: ['.csv', '.txt', '.prn', '.xyz', '.pnezd'], title: 'Importar pontos topográficos' });
  if (!f) return;
  store.setUI({ dialog: { kind: 'importPoints', file: f } });
}

function ImportPointsDialog({ file }) {
  const [opts, setOpts] = useState({ format: 'auto', delimiter: 'auto', decimal: 'auto' });
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [maxEdge, setMaxEdge] = useState(0);
  const res = useMemo(() => parsePointsText(file.data, opts), [file, opts]);
  const prev = res.points.slice(0, 12);
  const formats = [{ value: 'auto', label: `Automático (${res.format})` }, ...Object.entries(FORMAT_LABELS).map(([k, v]) => ({ value: k, label: `${k} — ${v}` }))];
  const zs = res.points.map((p) => p.z);
  const ok = () => {
    if (!res.points.length) return;
    store.setUI({ dialog: null });
    store.withBusy('Gerando superfície…', () => addSurface({ name, points: res.points, maxEdge, source: file.name })).then(() => store.toast(`${fmt(res.points.length, 0)} pontos importados.`));
  };
  return html`<${Modal} title=${'Importar pontos — ' + file.name} onClose=${() => store.setUI({ dialog: null })} wide
    foot=${html`<button class="btn" onClick=${() => store.setUI({ dialog: null })}>Cancelar</button><button class="btn primary" disabled=${!res.points.length} onClick=${ok}>Criar superfície com ${fmt(res.points.length, 0)} pontos</button>`}>
    <div class="cols">
      <div>
        <${Field} label="Formato das colunas"><${Select} value=${opts.format} options=${formats} onChange=${(v) => setOpts({ ...opts, format: v })} /></${Field}>
        <${Field} label="Separador de campos"><${Select} value=${opts.delimiter} options=${[{ value: 'auto', label: 'Automático' }, { value: ';', label: 'Ponto e vírgula' }, { value: ',', label: 'Vírgula' }, { value: '\t', label: 'Tabulação' }, { value: 'ws', label: 'Espaços' }]} onChange=${(v) => setOpts({ ...opts, delimiter: v })} /></${Field}>
        <${Field} label="Separador decimal"><${Select} value=${opts.decimal} options=${[{ value: 'auto', label: 'Automático' }, { value: ',', label: 'Vírgula' }, { value: '.', label: 'Ponto' }]} onChange=${(v) => setOpts({ ...opts, decimal: v })} /></${Field}>
        <${Field} label="Nome da superfície"><input value=${name} onInput=${(e) => setName(e.target.value)} /></${Field}>
        <${Field} label="Aresta máxima na borda (0 = sem limite)"><${Num} value=${maxEdge} dec=${1} unit="m" onChange=${setMaxEdge} /></${Field}>
      </div>
      <div class="kv">
        <span>Linhas lidas</span><b>${fmt(res.total, 0)}</b>
        <span>Pontos válidos</span><b>${fmt(res.points.length, 0)}</b>
        <span>Linhas ignoradas</span><b>${fmt(res.skipped, 0)}</b>
        <span>Formato detectado</span><b>${res.format}</b>
        <span>Separador / decimal</span><b>${res.delimiter === '\t' ? 'tab' : res.delimiter === 'ws' ? 'espaço' : res.delimiter} / ${res.decimal}</b>
        <span>Cota mínima / máxima</span><b>${zs.length ? fmt(Math.min(...zs), 3) + ' / ' + fmt(Math.max(...zs), 3) : '-'}</b>
      </div>
    </div>
    <p class="note">Coordenadas em SIRGAS 2000 / UTM. Confira se Este e Norte estão nas colunas corretas na prévia abaixo (Este entre 100.000 e 900.000).</p>
    <table class="grid"><thead><tr><th>Ponto</th><th>Este (E)</th><th>Norte (N)</th><th>Cota</th><th>Descrição</th></tr></thead>
      <tbody>${prev.map((p) => html`<tr><td>${p.name || ''}</td><td class="n">${fmt(p.x, 3)}</td><td class="n">${fmt(p.y, 3)}</td><td class="n">${fmt(p.z, 3)}</td><td>${p.desc || ''}</td></tr>`)}</tbody></table>
    ${res.errors.length ? html`<p class="note">${res.errors.slice(0, 5).join(' ')}</p>` : null}
  </${Modal}>`;
}

// ---------------------------------------------------------------- importação DWG/DXF
export async function startImportCad() {
  const f = await openFile({ accept: ['.dxf', '.dwg'], binary: true, title: 'Importar DWG ou DXF' });
  if (!f) return;
  const isDwg = /\.dwg$/i.test(f.name);
  try {
    const parsed = await store.withBusy(isDwg ? 'Lendo DWG (LibreDWG)…' : 'Lendo DXF…', async () => (isDwg ? parseDwg(f.data, { wasmDir: 'vendor/libredwg/wasm/' }) : parseDxf(decodeDxfBytes(f.data))));
    store.setUI({ dialog: { kind: 'importCad', file: { name: f.name }, parsed } });
  } catch (err) {
    console.error(err);
    store.toast('Não foi possível ler o arquivo: ' + err.message, 'err', 8000);
  }
}

function ImportCadDialog({ file, parsed }) {
  const [use, setUse] = useState(() => suggestLayerUse(parsed.layers));
  const [weed, setWeed] = useState(0.5);
  const [asBreak, setAsBreak] = useState(true);
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [maxEdge, setMaxEdge] = useState(0);
  const [glebaLayer, setGlebaLayer] = useState('');
  const topo = useMemo(() => extractTopography(parsed, { layers: use, weed, contourBreaklines: asBreak }), [parsed, use, weed, asBreak]);
  const layers = Object.values(parsed.layers).sort((a, b) => b.withZ - a.withZ || a.name.localeCompare(b.name));
  const closed = useMemo(() => extractPolylines(parsed).filter((pl) => pl.closed && pl.pts.length >= 3), [parsed]);
  const closedLayers = [...new Set(closed.map((c) => c.layer))];
  const toggle = (n, k) => setUse({ ...use, [n]: { ...use[n], [k]: !use[n]?.[k] } });
  const nPts = topo.points.length + topo.breaklines.reduce((s, b) => s + b.length, 0);
  const ok = () => {
    store.setUI({ dialog: null });
    store.withBusy('Gerando superfície…', () => {
      if (nPts >= 3) addSurface({ name, points: topo.points, breaklines: topo.breaklines, maxEdge, source: file.name });
      if (glebaLayer) {
        const cand = closed.filter((c) => c.layer === glebaLayer);
        if (cand.length) {
          const big = cand.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a));
          store.update('Gleba importada do CAD', (p) => { p.parcels.gleba = big.pts; p.parcels.lots = []; });
        }
      }
    }).then(() => store.toast(`Importado: ${fmt(topo.points.length, 0)} pontos e ${topo.breaklines.length} linhas de quebra.`));
  };
  return html`<${Modal} title=${'Importar CAD — ' + file.name} onClose=${() => store.setUI({ dialog: null })} wide
    foot=${html`<button class="btn" onClick=${() => store.setUI({ dialog: null })}>Cancelar</button><button class="btn primary" disabled=${nPts < 3 && !glebaLayer} onClick=${ok}>Importar</button>`}>
    <p class="note" style="margin-top:0">Escolha as camadas que formam o terreno. Camadas com cotas (pontos 3D, blocos com atributo de cota, curvas de nível com elevação, 3D polylines) já vêm marcadas. Textos numéricos podem ser usados como cota quando o desenho é 2D.</p>
    <div class="scroll" style="max-height:330px"><table class="grid">
      <thead><tr><th>Usar</th><th>Textos = cota</th><th>Camada</th><th>Pontos</th><th>Blocos</th><th>Textos num.</th><th>Polilinhas</th><th>3D poly</th><th>Linhas</th><th>Faixa de cotas</th></tr></thead>
      <tbody>${layers.map((L) => html`<tr>
        <td><input type="checkbox" checked=${!!use[L.name]?.use} onChange=${() => toggle(L.name, 'use')} /></td>
        <td><input type="checkbox" checked=${!!use[L.name]?.texts} disabled=${!L.numericTexts} onChange=${() => toggle(L.name, 'texts')} /></td>
        <td>${L.name}</td><td class="n">${L.points}</td><td class="n">${L.inserts}</td><td class="n">${L.numericTexts}</td><td class="n">${L.polylines}</td><td class="n">${L.polylines3d}</td><td class="n">${L.lines}</td>
        <td class="n">${L.withZ ? fmt(L.zMin, 2) + ' a ' + fmt(L.zMax, 2) : '-'}</td></tr>`)}</tbody></table></div>
    <div class="cols" style="margin-top:10px">
      <div>
        <${Check} label="Curvas de nível e polilinhas como linhas de quebra" checked=${asBreak} onChange=${setAsBreak} />
        <${Field} label="Simplificar vértices a cada"><${Num} value=${weed} dec=${2} unit="m" min=${0} onChange=${setWeed} /></${Field}>
        <${Field} label="Nome da superfície"><input value=${name} onInput=${(e) => setName(e.target.value)} /></${Field}>
        <${Field} label="Aresta máxima na borda"><${Num} value=${maxEdge} dec=${1} unit="m" onChange=${setMaxEdge} /></${Field}>
        <${Field} label="Gleba (polilinha fechada)"><${Select} value=${glebaLayer} options=${[{ value: '', label: 'Não importar' }, ...closedLayers.map((l) => ({ value: l, label: `Camada ${l}` }))]} onChange=${setGlebaLayer} /></${Field}>
      </div>
      <div class="kv">
        <span>Entidades lidas</span><b>${fmt(parsed.entities.length, 0)}</b>
        <span>Pontos do terreno</span><b>${fmt(topo.points.length, 0)}</b>
        <span>Linhas de quebra</span><b>${fmt(topo.breaklines.length, 0)}</b>
        <span>Curvas de nível</span><b>${fmt(topo.contours, 0)}</b>
        ${parsed.warnings.map((w) => html`<span>Aviso</span><b>${w}</b>`)}
      </div>
    </div>
  </${Modal}>`;
}

function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s / 2); }

// ---------------------------------------------------------------- normas
function NormsDialog() {
  const rows = normTable();
  return html`<${Modal} title="Normas e leis federais aplicadas" onClose=${() => store.setUI({ dialog: null })} wide>
    <p class="note" style="margin-top:0">Cada parâmetro indica a fonte e o status: <span class="badge confirmado">confirmado</span> conferido em pesquisa; <span class="badge referencia">referência</span> valor da norma a conferir no documento oficial; <span class="badge pratica">prática</span> prática corrente de projeto, ajustável.</p>
    <table class="grid"><thead><tr><th>Grupo</th><th>Parâmetro</th><th>Valor</th><th>Fonte</th><th>Status</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr title=${r.nota}><td>${r.grupo}</td><td>${r.nome}</td><td>${r.valor}</td><td>${r.fonte}</td><td><${StatusBadge} status=${r.status} /></td></tr>`)}</tbody></table>
    <h4>Referências</h4>
    <ul>${Object.values(SOURCES).map((s) => html`<li class="note">${s}</li>`)}</ul>
  </${Modal}>`;
}

// ---------------------------------------------------------------- versões
function VersionsDialog() {
  const p = store.project;
  const [name, setName] = useState(`Alternativa ${p.versions.length + 1}`);
  const rows = useMemo(() => {
    const m = new Model();
    m.surfaces = store.model.surfaces;
    const metrics = (proj) => {
      const r = m.computeAll(proj);
      const t = r.roads.reduce((a, x) => { const tt = x.corridor?.totals; if (tt) { a.cut += tt.cut; a.fill += tt.fill; a.len += x.alignment.length; a.bal += tt.balance; } a.err += (x.checks || []).filter((c) => c.level === 'erro').length; return a; }, { cut: 0, fill: 0, len: 0, bal: 0, err: 0 });
      const b = collectBudget(proj, r);
      return { ...t, cost: b.total, lots: r.parcels?.lots?.length || 0 };
    };
    return [{ name: 'Atual (em edição)', cur: true, ...metrics(p) }, ...p.versions.map((v) => ({ v, name: v.name, date: v.date, ...metrics(restoreDesign(p, v.data)) }))];
  }, [p]);
  return html`<${Modal} title="Versões e alternativas de projeto" onClose=${() => store.setUI({ dialog: null })} wide
    foot=${html`<input value=${name} onInput=${(e) => setName(e.target.value)} style="background:var(--bg2);border:1px solid var(--line2);border-radius:4px;padding:5px" /><button class="btn primary" onClick=${() => { saveVersion(name); setName(`Alternativa ${p.versions.length + 2}`); }}>Salvar estado atual como versão</button>`}>
    <table class="grid"><thead><tr><th>Versão</th><th>Data</th><th>Extensão (m)</th><th>Corte (m³)</th><th>Aterro (m³)</th><th>Saldo (m³)</th><th>Lotes</th><th>Custo estimado</th><th>Erros</th><th></th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class=${r.cur ? 'sel' : ''}><td>${r.name}</td><td>${r.date ? new Date(r.date).toLocaleString('pt-BR') : '-'}</td>
        <td class="n">${fmt(r.len, 1)}</td><td class="n">${fmt(r.cut, 0)}</td><td class="n">${fmt(r.fill, 0)}</td><td class="n">${fmt(r.bal, 0)}</td><td class="n">${r.lots}</td>
        <td class="n">${r.cost > 0 ? 'R$ ' + fmt(r.cost, 2) : '-'}</td><td class="n">${r.err}</td>
        <td>${r.v ? html`<button class="btn small" onClick=${() => { restoreVersion(r.v); store.setUI({ dialog: null }); }}>Restaurar</button>` : null}</td></tr>`)}</tbody></table>
    <p class="note">As versões guardam o projeto (vias, seções, loteamento, parâmetros) sobre o mesmo terreno. O custo usa os preços unitários do orçamento.</p>
  </${Modal}>`;
}

// ---------------------------------------------------------------- pavimento (DNER)
function PavementDialog({ roadId }) {
  const [t, setT] = useState({ vmdc: 300, years: 10, growth: 0.03, fv: 2.0, fr: 1.0, fd: 0.5, cbr: 6, cbrRef: 0, useN: false, N: 1e6 });
  const N = t.useN ? t.N : computeN({ vmdc: t.vmdc, years: t.years, growth: t.growth, fv: t.fv, fr: t.fr, fd: t.fd });
  const d = dnerDesign({ N, cbrSubgrade: t.cbr, cbrReinforcement: t.cbrRef > 0 ? t.cbrRef : null });
  const set = (k) => (v) => setT({ ...t, [k]: v });
  const apply = () => {
    store.update('Aplicar dimensionamento DNER', (p) => {
      const rd = p.roads.find((r) => r.id === roadId);
      rd.template.pavement.layers = d.layers.map((l) => ({ name: `${l.name} - ${l.material}`, material: l.material, thickness: l.thicknessCm / 100 }));
      rd.template.pavement.design = { method: 'DNER/1981', N, cbr: t.cbr };
    });
    store.setUI({ dialog: null });
  };
  return html`<${Modal} title="Dimensionamento do pavimento flexível — método do DNER (1981)" onClose=${() => store.setUI({ dialog: null })}
    foot=${html`<button class="btn" onClick=${() => store.setUI({ dialog: null })}>Cancelar</button><button class="btn primary" onClick=${apply}>Aplicar na seção tipo</button>`}>
    <div class="cols">
      <div>
        <${Check} label="Informar o número N diretamente" checked=${t.useN} onChange=${set('useN')} />
        ${t.useN ? html`<${Field} label="Número N"><${Num} value=${t.N} dec=${0} onChange=${set('N')} /></${Field}>` : html`
          <${Field} label="VMD comercial (ano 1, sentido)"><${Num} value=${t.vmdc} dec=${0} unit="veíc" onChange=${set('vmdc')} /></${Field}>
          <${Field} label="Período de projeto"><${Num} value=${t.years} dec=${0} unit="anos" onChange=${set('years')} /></${Field}>
          <${Field} label="Crescimento anual"><${Num} value=${t.growth} pct dec=${1} unit="%" onChange=${set('growth')} /></${Field}>
          <${Field} label="Fator de veículo (FV)"><${Num} value=${t.fv} dec=${2} onChange=${set('fv')} /></${Field}>
          <${Field} label="Fator climático regional (FR)"><${Num} value=${t.fr} dec=${2} onChange=${set('fr')} /></${Field}>
          <${Field} label="Fator de distribuição direcional"><${Num} value=${t.fd} dec=${2} onChange=${set('fd')} /></${Field}>`}
        <${Field} label="CBR do subleito"><${Num} value=${t.cbr} dec=${1} unit="%" onChange=${set('cbr')} /></${Field}>
        <${Field} label="CBR do reforço (0 = sem reforço)"><${Num} value=${t.cbrRef} dec=${1} unit="%" onChange=${set('cbrRef')} /></${Field}>
      </div>
      <div>
        <div class="kv"><span>Número N</span><b>${N.toExponential(2).replace('.', ',')}</b><span>Espessura total Ht (subleito)</span><b>${fmt(d.Ht, 1)} cm</b><span>H20 (sobre sub-base)</span><b>${fmt(d.H20, 1)} cm</b></div>
        <table class="grid" style="margin-top:8px"><thead><tr><th>Camada</th><th>Material</th><th>e (cm)</th><th>K</th></tr></thead>
          <tbody>${d.layers.map((l) => html`<tr><td>${l.name}</td><td>${l.material}</td><td class="n">${fmt(l.thicknessCm, 1)}</td><td class="n">${fmt(l.k, 1)}</td></tr>`)}</tbody></table>
        ${d.warnings.map((w) => html`<p class="note">${w}</p>`)}
        <p class="note">Ht = 77,67·N^0,0482·CBR^-0,598. Condições: R·KR + B·KB ≥ H20 e R·KR + B·KB + h20·KS ≥ Hn. Para rodovias federais o DNIT adota o método MeDiNa; use este resultado como pré-dimensionamento.</p>
      </div>
    </div>
  </${Modal}>`;
}

// ---------------------------------------------------------------- orçamento
function BudgetDialog() {
  const p = store.project;
  const b = collectBudget(p, store.results);
  const setPrice = (code, v) => store.update('Preço unitário', (pp) => { pp.budget.prices = { ...pp.budget.prices, [code]: v }; }, { coalesce: 'price' + code });
  return html`<${Modal} title="Orçamento estimativo" onClose=${() => store.setUI({ dialog: null })} wide
    foot=${html`<span class="note" style="margin-right:auto">Total com BDI: <b style="color:var(--text);font-size:14px">R$ ${fmt(b.total, 2)}</b></span><button class="btn primary" onClick=${() => store.setUI({ dialog: { kind: 'export' } })}>Exportar orçamento</button>`}>
    <div class="cols" style="margin-bottom:8px">
      <${Field} label="BDI"><${Num} value=${p.budget.bdi} pct dec=${2} unit="%" onChange=${(v) => store.update('BDI', (pp) => { pp.budget.bdi = v; })} /></${Field}>
      <${Field} label="Referência de preços"><${Text} value=${p.budget.reference} onChange=${(v) => store.update('Referência de preços', (pp) => { pp.budget.reference = v; })} /></${Field}>
    </div>
    <div class="scroll" style="max-height:52vh"><table class="grid">
      <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Quantidade</th><th>Preço unit. (R$)</th><th>Total (R$)</th></tr></thead>
      <tbody>${b.groups.map((g) => html`
        <tr><td colspan="6" style="color:var(--accent);font-weight:600;padding-top:8px">${g.name}</td></tr>
        ${g.items.map((it) => html`<tr><td>${it.code}</td><td>${it.description}</td><td>${it.unit}</td><td class="n">${fmt(it.qty, 2)}</td>
          <td style="width:120px"><${Num} value=${it.price} dec=${2} onChange=${(v) => setPrice(it.code, v)} /></td><td class="n">${fmt(it.total, 2)}</td></tr>`)}
        <tr><td></td><td colspan="4" style="text-align:right;color:var(--muted)">Subtotal ${g.name}</td><td class="n"><b>${fmt(g.subtotal, 2)}</b></td></tr>`)}
      </tbody></table></div>
    <div class="kv" style="margin-top:8px"><span>Custo direto</span><b>R$ ${fmt(b.direct, 2)}</b><span>BDI (${fmtPct(p.budget.bdi, 2)})</span><b>R$ ${fmt(b.direct * p.budget.bdi, 2)}</b><span>Total</span><b>R$ ${fmt(b.total, 2)}</b></div>
    <p class="note">Informe os preços unitários da base adotada (SINAPI, SICRO ou composição própria) na data-base do orçamento. Os preços ficam salvos no projeto.</p>
  </${Modal}>`;
}

// ---------------------------------------------------------------- exportação
function ExportDialog() {
  const p = store.project;
  const [o, setO] = useState({ sheets: true, sections: true, tables: true, memorial: true, budget: true, parcels: !!p.parcels.gleba, excel: true, paper: 'A1', planScale: 1000, sectionScale: 200, vScale: 100 });
  const set = (k) => (v) => setO({ ...o, [k]: v });
  const go = async () => {
    store.setUI({ dialog: null });
    try {
      const n = await store.withBusy('Gerando documentos…', () => exportDocuments(o));
      store.toast(`${n} arquivo(s) gerado(s).`);
    } catch (err) {
      console.error(err);
      store.toast('Falha ao gerar documentos: ' + err.message, 'err', 8000);
    }
  };
  return html`<${Modal} title="Documentação técnica" onClose=${() => store.setUI({ dialog: null })}
    foot=${html`<button class="btn" onClick=${() => store.setUI({ dialog: null })}>Cancelar</button><button class="btn primary" onClick=${go} disabled=${!store.results.roads.length && !p.parcels.gleba}>Gerar documentos</button>`}>
    <div class="cols">
      <div>
        <h4 style="margin-top:0">PDF</h4>
        <${Check} label="Pranchas de planta e perfil" checked=${o.sheets} onChange=${set('sheets')} />
        <${Check} label="Pranchas de seções transversais" checked=${o.sections} onChange=${set('sections')} />
        <${Check} label="Quadros (curvas, notas de serviço, volumes)" checked=${o.tables} onChange=${set('tables')} />
        <${Check} label="Planta do loteamento e quadro de áreas" checked=${o.parcels} onChange=${set('parcels')} />
        <${Check} label="Memorial descritivo" checked=${o.memorial} onChange=${set('memorial')} />
        <${Check} label="Orçamento" checked=${o.budget} onChange=${set('budget')} />
        <h4>Excel</h4>
        <${Check} label="Planilha completa (quantitativos, volumes, notas de serviço, drenagem, orçamento)" checked=${o.excel} onChange=${set('excel')} />
      </div>
      <div>
        <h4 style="margin-top:0">Formato</h4>
        <${Field} label="Formato das pranchas"><${Select} value=${o.paper} options=${['A0', 'A1', 'A2', 'A3'].map((x) => ({ value: x, label: x }))} onChange=${set('paper')} /></${Field}>
        <${Field} label="Escala horizontal (planta/perfil)"><${Select} value=${o.planScale} options=${[250, 500, 1000, 2000, 5000].map((x) => ({ value: x, label: '1:' + x }))} onChange=${(v) => set('planScale')(+v)} /></${Field}>
        <${Field} label="Escala vertical do perfil"><${Select} value=${o.vScale} options=${[50, 100, 200, 500].map((x) => ({ value: x, label: '1:' + x }))} onChange=${(v) => set('vScale')(+v)} /></${Field}>
        <${Field} label="Escala das seções"><${Select} value=${o.sectionScale} options=${[100, 200, 250, 500].map((x) => ({ value: x, label: '1:' + x }))} onChange=${(v) => set('sectionScale')(+v)} /></${Field}>
        <p class="note">O carimbo usa os dados do projeto (responsável técnico, CREA, ART). O campo de assinatura fica em branco para assinatura do responsável.</p>
      </div>
    </div>
  </${Modal}>`;
}

// ---------------------------------------------------------------- dados iniciais do projeto
function ProjectDialog() {
  const m = store.project.meta;
  const set = (k) => (v) => store.update('Dados do projeto', (p) => { p.meta[k] = v; }, { coalesce: 'meta' });
  return html`<${Modal} title="Novo projeto" onClose=${() => store.setUI({ dialog: null })}
    foot=${html`<button class="btn primary" onClick=${() => store.setUI({ dialog: null })}>Começar</button>`}>
    <${Field} label="Nome do projeto"><${Text} value=${m.name} onChange=${set('name')} /></${Field}>
    <${Field} label="Cliente"><${Text} value=${m.client} onChange=${set('client')} /></${Field}>
    <${Field} label="Local"><${Text} value=${m.location} onChange=${set('location')} /></${Field}>
    <${Field} label="Responsável técnico"><${Text} value=${m.author} onChange=${set('author')} /></${Field}>
    <${Field} label="CREA/CAU"><${Text} value=${m.crea} onChange=${set('crea')} /></${Field}>
    <${Field} label="Fuso UTM (SIRGAS 2000)"><${Num} value=${m.zone} dec=${0} min=${18} max=${25} onChange=${set('zone')} /></${Field}>
    <p class="note">Próximo passo: importe o levantamento topográfico (CSV/TXT, DXF ou DWG) no módulo 01.</p>
  </${Modal}>`;
}

function HelpDialog() {
  const rows = [
    ['Desenhar via', 'Clique os pontos do eixo; duplo clique ou Enter conclui; Backspace desfaz o último ponto; Esc cancela'],
    ['Editar eixo', 'Selecione a via e arraste os PIs; duplo clique no eixo insere PI; Delete remove o PI selecionado'],
    ['Navegar', 'Roda do mouse aproxima; botão direito ou do meio arrasta; F enquadra tudo'],
    ['Perfil', 'Arraste os PIVs; duplo clique insere; Delete remove; Shift + roda altera o exagero vertical'],
    ['Seções', 'Setas ← → navegam entre as seções; Home/End vão ao início e ao fim'],
    ['Desfazer / refazer', 'Ctrl+Z / Ctrl+Y (ou clique na linha do tempo)'],
    ['Arquivo', 'Ctrl+S salva; Ctrl+O abre; Ctrl+N novo projeto'],
    ['Modos', 'Conceitual: experimentar · Técnico: cotas, estacas e verificações · Apresentação: 3D realista'],
  ];
  return html`<${Modal} title="Atalhos e uso" onClose=${() => store.setUI({ dialog: null })}>
    <table class="grid"><tbody>${rows.map(([a, b]) => html`<tr><td style="width:150px"><b>${a}</b></td><td>${b}</td></tr>`)}</tbody></table>
  </${Modal}>`;
}

export function Dialogs() {
  const d = store.ui.dialog;
  if (!d) return null;
  switch (d.kind) {
    case 'importPoints': return html`<${ImportPointsDialog} file=${d.file} />`;
    case 'importCad': return html`<${ImportCadDialog} file=${d.file} parsed=${d.parsed} />`;
    case 'norms': return html`<${NormsDialog} />`;
    case 'versions': return html`<${VersionsDialog} />`;
    case 'pavement': return html`<${PavementDialog} roadId=${d.roadId} />`;
    case 'budget': return html`<${BudgetDialog} />`;
    case 'export': return html`<${ExportDialog} />`;
    case 'project': return html`<${ProjectDialog} />`;
    case 'help': return html`<${HelpDialog} />`;
    default: return null;
  }
}
