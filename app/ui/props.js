// URBIS - painel de propriedades do objeto selecionado
import { html } from 'htm/preact';
import { useRef, useEffect } from 'preact/hooks';
import { store } from './store.js';
import { Field, Num, Text, Select, Check, Section, Stat } from './widgets.js';
import { fmt, fmtPct, fmtStation, parseStation, fmtAz } from '../core/util.js';
import { ROAD_CLASSES, SIGN_CATALOG, geo } from '../core/norms/brasil.js';
import { COMPONENT_TYPES, makeComponent, templateWidths } from '../core/template.js';
import { applyRoadClass } from '../core/project.js';
import { subdivideBlock, splitDoubleFront, longestEdge } from '../core/lots.js';

const upd = (label, fn, coalesce) => store.update(label, fn, coalesce ? { coalesce } : {});
const roadUpd = (id, label, fn, coalesce) => upd(label, (p) => fn(p.roads.find((r) => r.id === id), p), coalesce ? `${id}:${coalesce}` : null);

function Checks({ checks, max = 30 }) {
  if (!checks || !checks.length) return html`<div class="note">Nenhuma pendência encontrada nas verificações normativas.</div>`;
  const order = { erro: 0, alerta: 1, info: 2 };
  const list = [...checks].sort((a, b) => order[a.level] - order[b.level]).slice(0, max);
  return html`<div class="checks">${list.map((c) => html`<div class=${'check-item ' + c.level + (c.s != null ? ' clickable' : '')} onClick=${() => { if (c.s != null) jumpToStation(c.s); }}>
    <i></i><div>${c.msg}<small>${c.group}${c.s != null ? ' · est. ' + fmtStation(c.s, store.project.settings.stationInterval) : ''}</small></div></div>`)}</div>`;
}

function jumpToStation(s) {
  const r = store.selectedRoad();
  if (!r) return;
  const res = store.roadResult(r.id);
  if (!res?.corridor) return;
  let best = 0;
  res.corridor.sections.forEach((sc, i) => { if (Math.abs(sc.s - s) < Math.abs(res.corridor.sections[best].s - s)) best = i; });
  store.setUI({ sectionIndex: best });
}

function Tabs({ id, tabs }) {
  const cur = store.ui.propTab[id] || tabs[0][0];
  return html`<div class="ptabs">${tabs.map(([k, label]) => html`<button class=${'ptab' + (k === cur ? ' on' : '')} onClick=${() => store.setUI({ propTab: { ...store.ui.propTab, [id]: k } })}>${label}</button>`)}</div>`;
}
function curTab(id, def) { return store.ui.propTab[id] || def; }

// ---------------------------------------------------------------- projeto
function ProjectPanel() {
  const p = store.project;
  const m = p.meta, st = p.settings;
  const roads = store.results.roads;
  const tot = roads.reduce((a, r) => { const t = r.corridor?.totals; if (t) { a.cut += t.cut; a.fill += t.fill; a.len += r.alignment.length; } return a; }, { cut: 0, fill: 0, len: 0 });
  const errs = roads.reduce((s, r) => s + (r.checks || []).filter((c) => c.level === 'erro').length, 0);
  const alerts = roads.reduce((s, r) => s + (r.checks || []).filter((c) => c.level === 'alerta').length, 0);
  const setMeta = (k) => (v) => upd('Dados do projeto', (pp) => { pp.meta[k] = v; }, 'meta');
  const setSt = (k) => (v) => upd('Configurações', (pp) => { pp.settings[k] = v; }, 'settings');
  return html`
    <div class="props-head"><div class="kind">Projeto</div><h3>${m.name || 'Sem nome'}</h3></div>
    <${Section} title="Resumo">
      <div class="stat-grid">
        <${Stat} label="Vias" value=${p.roads.length} />
        <${Stat} label="Extensão total" value=${fmt(tot.len, 1) + ' m'} />
        <${Stat} label="Corte" value=${fmt(tot.cut, 0) + ' m³'} cls="cut" />
        <${Stat} label="Aterro" value=${fmt(tot.fill, 0) + ' m³'} cls="fill" />
      </div>
      <div class="row-actions">
        <span class=${'badge ' + (errs ? 'erro' : 'ok')}>${errs} erro(s)</span>
        <span class=${'badge ' + (alerts ? 'alerta' : 'ok')}>${alerts} alerta(s)</span>
        <span class="badge">cálculo em ${fmt(store.computeMs || 0, 0)} ms</span>
      </div>
    </${Section}>
    <${Section} title="Identificação">
      <${Field} label="Nome do projeto"><${Text} value=${m.name} onChange=${setMeta('name')} /></${Field}>
      <${Field} label="Cliente / contratante"><${Text} value=${m.client} onChange=${setMeta('client')} /></${Field}>
      <${Field} label="Local"><${Text} value=${m.location} onChange=${setMeta('location')} /></${Field}>
      <${Field} label="Empresa / escritório"><${Text} value=${m.company} onChange=${setMeta('company')} /></${Field}>
      <${Field} label="Responsável técnico"><${Text} value=${m.author} onChange=${setMeta('author')} /></${Field}>
      <${Field} label="CREA/CAU"><${Text} value=${m.crea} onChange=${setMeta('crea')} /></${Field}>
      <${Field} label="ART/RRT"><${Text} value=${m.art} onChange=${setMeta('art')} /></${Field}>
    </${Section}>
    <${Section} title="Georreferenciamento">
      <${Field} label="Datum"><input value="SIRGAS 2000" disabled /></${Field}>
      <${Field} label="Fuso UTM"><${Num} value=${m.zone} dec=${0} min=${18} max=${25} onChange=${setMeta('zone')} /></${Field}>
      <${Field} label="Hemisfério"><${Select} value=${m.hemisphere} options=${[{ value: 'S', label: 'Sul' }, { value: 'N', label: 'Norte' }]} onChange=${setMeta('hemisphere')} /></${Field}>
    </${Section}>
    <${Section} title="Configurações de cálculo">
      <${Field} label="Intervalo de estacas"><${Num} value=${st.stationInterval} dec=${0} unit="m" min=${5} onChange=${setSt('stationInterval')} /></${Field}>
      <${Field} label="Intervalo das seções"><${Num} value=${st.sectionInterval} dec=${0} unit="m" min=${5} onChange=${setSt('sectionInterval')} /></${Field}>
      <${Field} label="Fator de homogeneização (Fh)" title="Multiplica os volumes de aterro para compensação com o corte"><${Num} value=${st.fh} dec=${2} onChange=${setSt('fh')} /></${Field}>
      <${Field} label="Camada vegetal removida"><${Num} value=${st.topsoil} dec=${2} unit="m" onChange=${setSt('topsoil')} /></${Field}>
      <${Field} label="Curvas de nível a cada"><${Num} value=${st.contourInterval} dec=${2} unit="m" min=${0.1} onChange=${setSt('contourInterval')} /></${Field}>
      <${Field} label="Curva mestra a cada"><${Num} value=${st.contourMajor} dec=${0} unit="curvas" min=${1} onChange=${setSt('contourMajor')} /></${Field}>
      <${Check} label="Área rural (placas com dimensões de rodovia)" checked=${st.rural} onChange=${setSt('rural')} />
    </${Section}>
    <${Section} title="Chuvas intensas (drenagem)">
      <${DrainageParams} />
    </${Section}>
    <${Section} title="Versões">
      <div class="row-actions">
        <button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'saveVersion' } })}>Salvar versão atual</button>
        <button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'versions' } })}>Comparar versões</button>
      </div>
    </${Section}>`;
}

function DrainageParams() {
  const d = store.project.drainage;
  const set = (k) => (v) => upd('Parâmetros de chuva', (pp) => { pp.drainage[k] = v; }, 'drain');
  const setIdf = (k) => (v) => upd('Equação IDF', (pp) => { pp.drainage.idf = { ...pp.drainage.idf, [k]: v }; }, 'idf');
  return html`
    <div class="note" style="margin-bottom:6px">i = K·T^a / (t + b)^c  (mm/h; T em anos; t em min)</div>
    <div class="cols" style="gap:6px">
      <${Field} label="K"><${Num} value=${d.idf.K} dec=${2} onChange=${setIdf('K')} /></${Field}>
      <${Field} label="a"><${Num} value=${d.idf.a} dec=${4} onChange=${setIdf('a')} /></${Field}>
      <${Field} label="b"><${Num} value=${d.idf.b} dec=${3} onChange=${setIdf('b')} /></${Field}>
      <${Field} label="c"><${Num} value=${d.idf.c} dec=${4} onChange=${setIdf('c')} /></${Field}>
    </div>
    <${Field} label="Fonte da equação"><${Text} value=${d.idf.source} onChange=${setIdf('source')} /></${Field}>
    <${Field} label="Tempo de recorrência"><${Num} value=${d.T} dec=${0} unit="anos" min=${1} onChange=${set('T')} /></${Field}>
    <${Field} label="Tempo de concentração inicial"><${Num} value=${d.tcMin} dec=${0} unit="min" min=${5} onChange=${set('tcMin')} /></${Field}>
    <${Field} label="Recobrimento mínimo"><${Num} value=${d.cover} dec=${2} unit="m" onChange=${set('cover')} /></${Field}>
    <${Field} label="Declividade mínima das galerias"><${Num} value=${d.sMin} pct dec=${2} unit="%" onChange=${set('sMin')} /></${Field}>
    <${Field} label="Manning (tubos)"><${Num} value=${d.n} dec=${3} onChange=${set('n')} /></${Field}>`;
}

// ---------------------------------------------------------------- via
function RoadPanel({ road }) {
  const r = store.roadResult(road.id);
  const tab = curTab('road', 'geral');
  return html`
    <div class="props-head"><div class="kind">Via · ${ROAD_CLASSES[road.classKey]?.label || ''}</div><h3><span class="swatch" style=${'background:' + road.color}></span>${road.name}</h3></div>
    <${Tabs} id="road" tabs=${[['geral', 'Geral'], ['eixo', 'Eixo'], ['greide', 'Greide'], ['secao', 'Seção tipo'], ['sinal', 'Sinalização'], ['dren', 'Drenagem'], ['result', 'Resultados']]} />
    ${tab === 'geral' ? html`<${RoadGeneral} road=${road} r=${r} />` : null}
    ${tab === 'eixo' ? html`<${RoadAxis} road=${road} r=${r} />` : null}
    ${tab === 'greide' ? html`<${RoadProfile} road=${road} r=${r} />` : null}
    ${tab === 'secao' ? html`<${RoadTemplate} road=${road} r=${r} />` : null}
    ${tab === 'sinal' ? html`<${RoadSignage} road=${road} r=${r} />` : null}
    ${tab === 'dren' ? html`<${RoadDrainage} road=${road} r=${r} />` : null}
    ${tab === 'result' ? html`<${RoadResults} road=${road} r=${r} />` : null}`;
}

function RoadGeneral({ road, r }) {
  const id = road.id;
  const t = r?.corridor?.totals;
  const classOpts = Object.entries(ROAD_CLASSES).map(([k, v]) => ({ value: k, label: v.label }));
  const supOpts = store.project.surfaces.map((s) => ({ value: s.id, label: s.name }));
  const rmin = geo.rMin(road.V, road.superelevation?.enabled ? road.superelevation.emax : -0.02);
  return html`
    <${Section} title="Identificação e classe">
      <${Field} label="Nome"><${Text} value=${road.name} onChange=${(v) => roadUpd(id, 'Renomear via', (rd) => { rd.name = v; })} /></${Field}>
      <${Field} label="Classe da via"><${Select} value=${road.classKey} options=${classOpts} onChange=${(v) => roadUpd(id, 'Alterar classe da via', (rd) => applyRoadClass(rd, v))} /></${Field}>
      <${Field} label="Velocidade diretriz"><${Num} value=${road.V} dec=${0} unit="km/h" min=${20} max=${120} step=${10} onChange=${(v) => roadUpd(id, 'Velocidade diretriz', (rd) => { rd.V = v; })} /></${Field}>
      <${Check} label="Aplicar superelevação nas curvas" checked=${road.superelevation?.enabled} onChange=${(v) => roadUpd(id, 'Superelevação', (rd) => { rd.superelevation.enabled = v; })} />
      ${road.superelevation?.enabled ? html`<${Field} label="Superelevação máxima"><${Num} value=${road.superelevation.emax} pct dec=${1} unit="%" min=${0.02} max=${0.12} onChange=${(v) => roadUpd(id, 'Superelevação máxima', (rd) => { rd.superelevation.emax = v; })} /></${Field}>` : null}
      <div class="note">Raio mínimo para ${road.V} km/h: <b>${fmt(rmin, 1)} m</b> (R = V²/127(e+f), f = ${fmt(geo.fmax(road.V), 2)}). K mín.: convexa ${fmt(geo.kCrest(road.V), 0)}, côncava ${fmt(geo.kSag(road.V), 0)}.</div>
    </${Section}>
    <${Section} title="Terreno e estaqueamento">
      <${Field} label="Superfície"><${Select} value=${road.surfaceId || ''} options=${[{ value: '', label: '(nenhuma)' }, ...supOpts]} onChange=${(v) => roadUpd(id, 'Superfície da via', (rd) => { rd.surfaceId = v || null; })} /></${Field}>
      <${Field} label="Estaca inicial"><${Num} value=${road.startStation} dec=${2} unit="m" onChange=${(v) => roadUpd(id, 'Estaca inicial', (rd) => { rd.startStation = v; })} /></${Field}>
      <${Field} label="Cor"><input type="color" value=${road.color} onChange=${(e) => roadUpd(id, 'Cor da via', (rd) => { rd.color = e.target.value; })} /></${Field}>
    </${Section}>
    ${r?.alignment ? html`<${Section} title="Resumo">
      <div class="stat-grid">
        <${Stat} label="Extensão" value=${fmt(r.alignment.length, 2) + ' m'} />
        <${Stat} label="Curvas horizontais" value=${r.alignment.curves.length} />
        <${Stat} label="Corte" value=${t ? fmt(t.cut, 0) + ' m³' : '-'} cls="cut" />
        <${Stat} label="Aterro" value=${t ? fmt(t.fill, 0) + ' m³' : '-'} cls="fill" />
      </div>
    </${Section}>` : null}
    <${Section} title="Verificações normativas"><${Checks} checks=${r?.checks} /></${Section}>
    <${Section}><div class="row-actions">
      <button class="btn small danger" onClick=${() => { if (confirm(`Excluir a via "${road.name}"?`)) { upd(`Excluir via: ${road.name}`, (p) => { p.roads = p.roads.filter((x) => x.id !== id); }); store.setUI({ selection: null }); } }}>Excluir via</button>
    </div></${Section}>`;
}

function RoadAxis({ road, r }) {
  const id = road.id;
  const iv = store.project.settings.stationInterval;
  const pis = r?.pis || road.pis;
  const setPi = (i, k, v) => roadUpd(id, 'Editar PI', (rd) => {
    rd.pis[i][k] = v;
    if (k === 'R' || k === 'Ls') rd.pis[i].autoR = false;
  }, 'pi' + i + k);
  const al = r?.alignment;
  return html`
    <${Section} title="PIs do eixo (coordenadas UTM)">
      <div class="scroll"><table class="grid">
        <thead><tr><th>PI</th><th>Este (E)</th><th>Norte (N)</th><th>Raio</th><th>Espiral</th><th></th></tr></thead>
        <tbody>${pis.map((p, i) => {
          const inner = i > 0 && i < pis.length - 1;
          const selPi = store.ui.selection?.pi === i;
          return html`<tr class=${selPi ? 'sel' : ''} onClick=${() => store.setUI({ selection: { kind: 'road', id, pi: i } })}>
            <td>${i === 0 ? 'PP' : i === pis.length - 1 ? 'PF' : 'PI-' + i}</td>
            <td><${Num} value=${road.pis[i].x} dec=${3} onChange=${(v) => setPi(i, 'x', v)} /></td>
            <td><${Num} value=${road.pis[i].y} dec=${3} onChange=${(v) => setPi(i, 'y', v)} /></td>
            <td>${inner ? html`<${Num} value=${p.R} dec=${1} onChange=${(v) => setPi(i, 'R', v)} />` : '-'}</td>
            <td>${inner ? html`<${Num} value=${p.Ls} dec=${1} onChange=${(v) => setPi(i, 'Ls', v)} />` : '-'}</td>
            <td>${inner ? html`<input type="checkbox" title="Raio automático" checked=${road.pis[i].autoR} onChange=${(e) => roadUpd(id, 'Raio automático', (rd) => { rd.pis[i].autoR = e.target.checked; if (e.target.checked) rd.pis[i].R = 0; })} />` : null}</td>
          </tr>`;
        })}</tbody></table></div>
      <div class="note">Marque a caixa para o raio ser escolhido automaticamente (entre Rmin e 2,5·Rmin, cabendo nas tangentes). Clique duas vezes sobre o eixo na planta para inserir PI; Delete remove o PI selecionado.</div>
    </${Section}>
    ${al ? html`<${Section} title="Quadro de curvas horizontais">
      <div class="scroll"><table class="grid">
        <thead><tr><th>C</th><th>Δ</th><th>R</th><th>Ls</th><th>T</th><th>D</th><th>Início</th><th>Fim</th></tr></thead>
        <tbody>${al.curves.map((c) => html`<tr>
          <td>${c.number}${c.side}</td><td class="n">${fmt(c.I * 180 / Math.PI, 3)}°</td><td class="n">${fmt(c.R, 1)}</td><td class="n">${fmt(c.Ls, 1)}</td>
          <td class="n">${fmt(c.T, 2)}</td><td class="n">${fmt(c.total, 2)}</td><td class="n">${fmtStation(c.staTS, iv)}</td><td class="n">${fmtStation(c.staST, iv)}</td></tr>`)}
        </tbody></table></div>
      <div class="kv" style="margin-top:8px"><span>Extensão do eixo</span><b>${fmt(al.length, 3)} m</b><span>Estaca final</span><b>${fmtStation(al.endStation, iv)}</b>
        ${al.tangents.map((t, i) => html`<span>Tangente ${i + 1} (azimute ${fmtAz(t.az)})</span><b>${fmt(t.free, 2)} m</b>`)}
      </div>
    </${Section}>` : null}`;
}

function RoadProfile({ road, r }) {
  const id = road.id;
  const iv = store.project.settings.stationInterval;
  const pr = r?.profile;
  if (!pr) return html`<${Section}><div class="note">Greide indisponível.</div></${Section}>`;
  const pvis = pr.pvis;
  const setPv = (i, k, v) => roadUpd(id, 'Editar PIV', (rd) => {
    const list = (rd.profile.auto ? pvis : rd.profile.pvis).map((p) => ({ ...p }));
    list[i][k] = v;
    rd.profile = { pvis: list, auto: false };
  }, 'pv' + i + k);
  return html`
    <${Section} title="Greide">
      <${Check} label="Greide automático (segue o terreno respeitando rampa máxima e K)" checked=${road.profile.auto} onChange=${(v) => roadUpd(id, v ? 'Greide automático' : 'Fixar greide', (rd) => { rd.profile = v ? { pvis: [], auto: true } : { pvis: pvis.map((p) => ({ ...p })), auto: false }; })} />
      <div class="scroll"><table class="grid">
        <thead><tr><th>PIV</th><th>Estaca</th><th>Cota</th><th>L curva</th></tr></thead>
        <tbody>${pvis.map((p, i) => html`<tr>
          <td>${i}</td>
          <td><input value=${fmtStation(p.s, iv)} onBlur=${(e) => { const s = parseStation(e.target.value, iv); if (Number.isFinite(s) && Math.abs(s - p.s) > 1e-6) setPv(i, 's', s); }} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} /></td>
          <td><${Num} value=${p.z} dec=${3} onChange=${(v) => setPv(i, 'z', v)} /></td>
          <td>${i > 0 && i < pvis.length - 1 ? html`<${Num} value=${p.L} dec=${1} onChange=${(v) => setPv(i, 'L', v)} />` : '-'}</td>
        </tr>`)}</tbody></table></div>
      <div class="note">Arraste os PIVs na aba Perfil; clique duas vezes para inserir; Delete remove.</div>
    </${Section}>
    <${Section} title="Rampas">
      <div class="kv">${pr.grades.map((g, i) => html`<span>PIV ${i} → ${i + 1}</span><b>${fmtPct(g)}</b>`)}</div>
    </${Section}>
    <${Section} title="Quadro de curvas verticais">
      <div class="scroll"><table class="grid">
        <thead><tr><th>PIV</th><th>Tipo</th><th>L</th><th>K</th><th>Flecha</th><th>PCV</th><th>PTV</th></tr></thead>
        <tbody>${pr.curves.map((c) => html`<tr><td>${c.pviIndex}</td><td>${c.type}</td><td class="n">${fmt(c.L, 1)}</td><td class="n">${fmt(c.K, 1)}</td><td class="n">${fmt(Math.abs(c.e), 3)}</td><td class="n">${fmtStation(c.sPCV, iv)}</td><td class="n">${fmtStation(c.sPTV, iv)}</td></tr>`)}</tbody>
      </table></div>
    </${Section}>`;
}

function RoadTemplate({ road }) {
  const id = road.id;
  const tpl = road.template;
  const side = tpl.symmetric ? 'right' : (store.ui.propTab.tplSide || 'right');
  const comps = tpl[side];
  const setT = (label, fn, key) => roadUpd(id, label, (rd) => { fn(rd.template); if (rd.template.symmetric) rd.template.left = rd.template.right.map((c) => ({ ...c })); }, key);
  const w = templateWidths(tpl);
  const typeOpts = Object.entries(COMPONENT_TYPES).map(([k, v]) => ({ value: k, label: v.label }));
  return html`
    <${Section} title="Composição (do eixo para fora)">
      <${Check} label="Seção simétrica" checked=${tpl.symmetric} onChange=${(v) => setT('Simetria da seção', (t) => { t.symmetric = v; })} />
      ${!tpl.symmetric ? html`<div class="row-actions" style="margin-bottom:6px">${['left', 'right'].map((s) => html`<button class=${'btn small' + (s === side ? ' primary' : '')} onClick=${() => store.setUI({ propTab: { ...store.ui.propTab, tplSide: s } })}>${s === 'left' ? 'Lado esquerdo' : 'Lado direito'}</button>`)}</div>` : null}
      <${Field} label="Canteiro central (largura total)"><${Num} value=${tpl.median} dec=${2} unit="m" min=${0} onChange=${(v) => setT('Canteiro central', (t) => { t.median = v; }, 'median')} /></${Field}>
      <table class="grid">
        <thead><tr><th>Componente</th><th>Largura (m)</th><th>Declividade / altura</th><th></th></tr></thead>
        <tbody>${comps.map((c, i) => html`<tr>
          <td><${Select} value=${c.type} options=${typeOpts} onChange=${(v) => setT('Tipo de componente', (t) => { t[side][i] = makeComponent(v, { width: c.width }); })} /></td>
          <td><${Num} value=${c.width} dec=${2} min=${0} onChange=${(v) => setT('Largura do componente', (t) => { t[side][i].width = v; }, 'w' + i)} /></td>
          <td>${c.type === 'meiofio' ? html`<span title="Altura do meio-fio (m)"><${Num} value=${c.height} dec=${2} unit="h m" onChange=${(v) => setT('Altura do meio-fio', (t) => { t[side][i].height = v; }, 'h' + i)} /></span>` : html`<${Num} value=${c.slope} pct dec=${1} unit="%" onChange=${(v) => setT('Declividade', (t) => { t[side][i].slope = v; }, 's' + i)} />`}</td>
          <td style="white-space:nowrap">
            <button class="btn small icon" title="Subir" onClick=${() => setT('Reordenar componentes', (t) => { if (i > 0) { const a = t[side]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } })}>↑</button>
            <button class="btn small icon" title="Remover" onClick=${() => setT('Remover componente', (t) => { t[side].splice(i, 1); })}>✕</button>
          </td></tr>`)}
        </tbody></table>
      <div class="row-actions">
        ${['pista', 'acostamento', 'sarjeta', 'meiofio', 'passeio', 'canteiro', 'ciclovia'].map((k) => html`<button class="btn small" onClick=${() => setT('Adicionar componente', (t) => { t[side].push(makeComponent(k)); })}>+ ${COMPONENT_TYPES[k].label.split(' ')[0]}</button>`)}
      </div>
      <div class="note">Declividade positiva sobe para fora do eixo. Altura do meio-fio em metros. Plataforma: ${fmt(w.total, 2)} m · pista: ${fmt(w.carriageway, 2)} m.</div>
    </${Section}>
    <${SectionPreview} tpl=${tpl} />
    <${Section} title="Taludes">
      <${Field} label="Corte (H:V)"><${Num} value=${tpl.cut.slope} dec=${2} unit="H:1V" min=${0.1} onChange=${(v) => setT('Talude de corte', (t) => { t.cut.slope = v; }, 'cut')} /></${Field}>
      <${Field} label="Aterro (H:V)"><${Num} value=${tpl.fill.slope} dec=${2} unit="H:1V" min=${0.1} onChange=${(v) => setT('Talude de aterro', (t) => { t.fill.slope = v; }, 'fill')} /></${Field}>
      <${Check} label="Valeta de pé de corte (sarjeta de corte)" checked=${!!tpl.cut.ditch} onChange=${(v) => setT('Valeta de corte', (t) => { t.cut.ditch = v ? { width: 1.0, depth: 0.3 } : null; })} />
      ${tpl.cut.ditch ? html`<${Field} label="Largura / profundidade"><span class="unit"><${Num} value=${tpl.cut.ditch.width} dec=${2} onChange=${(v) => setT('Valeta', (t) => { t.cut.ditch.width = v; }, 'dw')} /><${Num} value=${tpl.cut.ditch.depth} dec=${2} onChange=${(v) => setT('Valeta', (t) => { t.cut.ditch.depth = v; }, 'dd')} /><em>m</em></span></${Field}>` : null}
      <${Field} label="Largura máxima de busca do terreno"><${Num} value=${tpl.maxWidth} dec=${0} unit="m" min=${20} onChange=${(v) => setT('Largura de busca', (t) => { t.maxWidth = v; })} /></${Field}>
    </${Section}>
    <${Section} title="Pavimento" actions=${html`<button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'pavement', roadId: id } })}>Dimensionar (DNER)</button>`}>
      <table class="grid"><thead><tr><th>Camada</th><th>Espessura (cm)</th><th></th></tr></thead>
        <tbody>${tpl.pavement.layers.map((l, i) => html`<tr>
          <td><input value=${l.name} onBlur=${(e) => setT('Camada de pavimento', (t) => { t.pavement.layers[i].name = e.target.value; })} style="text-align:left" /></td>
          <td><${Num} value=${l.thickness * 100} dec=${1} onChange=${(v) => setT('Espessura de camada', (t) => { t.pavement.layers[i].thickness = v / 100; }, 'l' + i)} /></td>
          <td><button class="btn small icon" onClick=${() => setT('Remover camada', (t) => { t.pavement.layers.splice(i, 1); })}>✕</button></td></tr>`)}
        </tbody></table>
      <div class="row-actions"><button class="btn small" onClick=${() => setT('Adicionar camada', (t) => { t.pavement.layers.push({ name: 'Nova camada', material: 'Base granular (BGS/BGTC)', thickness: 0.15 }); })}>+ Camada</button></div>
      <${Field} label="Espessura do passeio"><${Num} value=${tpl.sidewalkThickness} dec=${2} unit="m" onChange=${(v) => setT('Espessura do passeio', (t) => { t.sidewalkThickness = v; })} /></${Field}>
      <${Field} label="Profundidade do meio-fio"><${Num} value=${tpl.curbDepth} dec=${2} unit="m" onChange=${(v) => setT('Profundidade do meio-fio', (t) => { t.curbDepth = v; })} /></${Field}>
    </${Section}>`;
}

/** Desenho esquemático da seção tipo. */
function SectionPreview({ tpl }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const d = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = 110;
    c.width = W * d; c.height = H * d;
    const ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, W, H);
    const w = templateWidths(tpl);
    const span = Math.max(w.left, w.right) * 2 + 4;
    const k = (W - 20) / span;
    const X = (o) => W / 2 + o * k, Y = (z) => H * 0.55 - z * k * 4;
    const colors = { pista: '#5b616b', acostamento: '#70767e', sarjeta: '#b0b0b0', meiofio: '#eee', passeio: '#c8b994', canteiro: '#4f7d3c', ciclovia: '#a04848', estacionamento: '#666d76', generico: '#888' };
    for (const side of ['left', 'right']) {
      const sg = side === 'left' ? -1 : 1;
      const comps = tpl.symmetric ? tpl.right : tpl[side];
      let o = (tpl.median || 0) / 2, z = 0;
      if (o > 0) { ctx.fillStyle = '#4f7d3c'; ctx.fillRect(Math.min(X(0), X(sg * o)), Y(0), Math.abs(X(sg * o) - X(0)), 6); }
      for (const cp of comps) {
        const w2 = cp.width || 0;
        let z2 = z;
        if (cp.type === 'meiofio') {
          ctx.fillStyle = colors.meiofio; const h = cp.height || 0.15;
          ctx.fillRect(Math.min(X(sg * o), X(sg * (o + w2))), Y(z + h), Math.abs(X(sg * (o + w2)) - X(sg * o)), (Y(z) - Y(z + h)) + 6);
          z2 = z + h;
        } else {
          z2 = z + (cp.slope || 0) * w2 * (cp.type === 'pista' ? 1 : 1);
          ctx.fillStyle = colors[cp.type] || '#888';
          ctx.beginPath(); ctx.moveTo(X(sg * o), Y(z)); ctx.lineTo(X(sg * (o + w2)), Y(z2)); ctx.lineTo(X(sg * (o + w2)), Y(z2) + 6); ctx.lineTo(X(sg * o), Y(z) + 6); ctx.closePath(); ctx.fill();
        }
        o += w2; z = z2;
      }
    }
    ctx.strokeStyle = '#ff5a4a'; ctx.setLineDash([6, 3, 2, 3]); ctx.beginPath(); ctx.moveTo(X(0), 8); ctx.lineTo(X(0), H - 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#9aa6b6'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(`${fmt(w.total, 2)} m`, W / 2, H - 6);
  });
  return html`<div class="section" style="padding-top:4px"><canvas ref=${ref} style="width:100%;height:110px;display:block;border-radius:4px"></canvas></div>`;
}

function RoadSignage({ road, r }) {
  const id = road.id;
  const sg = road.signage;
  const iv = store.project.settings.stationInterval;
  const set = (label, fn) => roadUpd(id, label, (rd) => fn(rd.signage));
  return html`
    <${Section} title="Sinalização horizontal">
      <${Field} label="Linha do eixo"><${Select} value=${sg.center} options=${[{ value: 'auto', label: 'Automática' }, { value: 'LFO1', label: 'LFO-1 contínua simples' }, { value: 'LFO2', label: 'LFO-2 seccionada' }, { value: 'LFO3', label: 'LFO-3 dupla contínua' }, { value: 'none', label: 'Sem linha central' }]} onChange=${(v) => set('Linha central', (s) => { s.center = v; })} /></${Field}>
      <${Field} label="Linhas de bordo (LBO)"><${Select} value=${String(sg.edgeLines)} options=${[{ value: 'auto', label: 'Automático' }, { value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]} onChange=${(v) => set('Linhas de bordo', (s) => { s.edgeLines = v === 'auto' ? 'auto' : v === 'true'; })} /></${Field}>
      ${r?.markings ? html`<table class="grid"><thead><tr><th>Linha</th><th>Afast.</th><th>Extensão</th><th>Área</th></tr></thead>
        <tbody>${r.markings.lines.map((l) => html`<tr><td>${l.code}</td><td class="n">${fmt(l.offset, 2)}</td><td class="n">${fmt(l.length, 1)} m</td><td class="n">${fmt(l.area, 2)} m²</td></tr>`)}</tbody></table>
        <div class="note">Largura das linhas ${fmt(r.markings.width, 2)} m · cadência ${r.markings.dash.dash}/${r.markings.dash.gap} m (MBST Vol. IV).</div>` : null}
      <div class="row-actions"><button class=${'btn small' + (store.ui.tool === 'crosswalk' ? ' primary' : '')} onClick=${() => store.setUI({ tool: 'crosswalk', view: 'planta' })}>+ Faixa de pedestres (clicar na via)</button></div>
      ${sg.crosswalks.length ? html`<table class="grid" style="margin-top:6px"><tbody>${sg.crosswalks.map((c, i) => html`<tr><td>Faixa de pedestres</td><td class="n">${fmtStation(c.s, iv)}</td><td><button class="btn small icon" onClick=${() => set('Remover faixa de pedestres', (s) => { s.crosswalks.splice(i, 1); })}>✕</button></td></tr>`)}</tbody></table>` : null}
    </${Section}>
    <${Section} title="Sinalização vertical">
      <${Check} label="Sugerir placas automaticamente (velocidade e curvas)" checked=${sg.autoSigns} onChange=${(v) => set('Placas automáticas', (s) => { s.autoSigns = v; })} />
      <${Field} label="Placa para inserir"><${Select} value=${store.ui.signCode} options=${SIGN_CATALOG.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} onChange=${(v) => store.setUI({ signCode: v })} /></${Field}>
      <div class="row-actions"><button class=${'btn small' + (store.ui.tool === 'sign' ? ' primary' : '')} onClick=${() => store.setUI({ tool: 'sign', view: 'planta' })}>+ Inserir placa (clicar ao lado da via)</button></div>
      ${r?.signs?.length ? html`<div class="scroll" style="margin-top:6px"><table class="grid"><thead><tr><th>Placa</th><th>Estaca</th><th>Lado</th><th>Dim.</th><th></th></tr></thead>
        <tbody>${r.signs.map((s) => {
          const manualIdx = sg.signs.indexOf(sg.signs.find((m) => m.code === s.code && Math.abs(m.s - s.s) < 1e-6));
          return html`<tr><td>${s.code}${s.param ? ' ' + s.param : ''}${s.auto ? html` <span class="badge">auto</span>` : ''}</td><td class="n">${fmtStation(s.s, iv)}</td><td>${(s.offset ?? 0) < 0 ? 'LE' : 'LD'}</td><td class="n">${fmt(s.dim, 2)}</td>
          <td>${!s.auto && manualIdx >= 0 ? html`<button class="btn small icon" onClick=${() => set('Remover placa', (x) => { x.signs.splice(manualIdx, 1); })}>✕</button>` : null}</td></tr>`;
        })}</tbody></table></div>` : null}
    </${Section}>`;
}

function RoadDrainage({ road, r }) {
  const id = road.id;
  const dr = road.drainage;
  const set = (label, fn, key) => roadUpd(id, label, (rd) => fn(rd.drainage), key);
  const d = r?.drainage;
  const iv = store.project.settings.stationInterval;
  return html`
    <${Section} title="Microdrenagem ao longo da via">
      <${Check} label="Calcular rede de galerias e sarjetas" checked=${dr.enabled} onChange=${(v) => set('Drenagem da via', (x) => { x.enabled = v; })} />
      <${Field} label="Posição da rede"><${Select} value=${dr.side} options=${[{ value: 'R', label: 'Lado direito' }, { value: 'L', label: 'Lado esquerdo' }, { value: 'both', label: 'Eixo (atende os dois lados)' }]} onChange=${(v) => set('Posição da rede', (x) => { x.side = v; })} /></${Field}>
      <${Field} label="Espaçamento máximo dos PVs"><${Num} value=${dr.spacing} dec=${0} unit="m" min=${10} onChange=${(v) => set('Espaçamento de PVs', (x) => { x.spacing = v; }, 'sp')} /></${Field}>
      <${Field} label="Coeficiente de escoamento C"><${Num} value=${dr.C} dec=${2} min=${0.05} max=${1} onChange=${(v) => set('Coeficiente C', (x) => { x.C = v; }, 'c')} /></${Field}>
      <${Field} label="Faixa externa contribuinte"><${Num} value=${dr.extraWidth} dec=${1} unit="m" min=${0} onChange=${(v) => set('Faixa contribuinte', (x) => { x.extraWidth = v; }, 'ew')} /></${Field}>
      <div class="note">Chuva: equação IDF e tempo de recorrência ficam nos dados do projeto (clique no fundo da planta).</div>
    </${Section}>
    ${d ? html`<${Section} title=${`Galerias (i = ${fmt(d.intensity, 1)} mm/h no tc inicial)`}>
      <div class="scroll"><table class="grid">
        <thead><tr><th>Trecho</th><th>L</th><th>Q (L/s)</th><th>Ø (mm)</th><th>i (%)</th><th>V (m/s)</th><th>y/D</th></tr></thead>
        <tbody>${d.pipes.map((p) => html`<tr title=${p.warnings.join(' ')}><td>${p.from}→${p.to}</td><td class="n">${fmt(p.length, 1)}</td><td class="n">${fmt(p.Q * 1000, 1)}</td><td class="n">${Math.round(p.D * 1000)}</td><td class="n">${fmt(p.S * 100, 2)}</td><td class="n">${p.V ? fmt(p.V, 2) : '-'}</td><td class="n">${p.yD ? fmt(p.yD, 2) : '-'}</td></tr>`)}</tbody>
      </table></div>
    </${Section}>
    <${Section} title="Sarjetas (Izzard)">
      <table class="grid"><thead><tr><th>Trecho</th><th>Rampa</th><th>Q adm (L/s)</th><th>L crítico</th><th>Captações</th></tr></thead>
        <tbody>${d.gutter.map((g) => html`<tr><td>${fmtStation(g.s0, iv)} - ${fmtStation(g.s1, iv)}</td><td class="n">${fmtPct(g.grade)}</td><td class="n">${fmt(g.Qadm * 1000, 1)}</td><td class="n">${Number.isFinite(g.Lcrit) ? fmt(g.Lcrit, 0) + ' m' : '-'}</td><td class="n">${g.inlets}</td></tr>`)}</tbody></table>
    </${Section}>` : null}`;
}

function RoadResults({ road, r }) {
  const c = r?.corridor;
  if (!c || !c.totals) return html`<${Section}><div class="note">Sem resultados de corredor (verifique eixo, greide e terreno).</div></${Section}>`;
  const t = c.totals;
  const items = [...(r.quantities || []), ...(r.signageItems || [])];
  return html`
    <${Section} title="Terraplenagem">
      <div class="stat-grid">
        <${Stat} label="Corte" value=${fmt(t.cut, 1) + ' m³'} cls="cut" />
        <${Stat} label="Aterro" value=${fmt(t.fill, 1) + ' m³'} cls="fill" />
        <${Stat} label=${`Aterro × Fh (${fmt(t.fh, 2)})`} value=${fmt(t.fillCorr, 1) + ' m³'} />
        <${Stat} label=${t.balance >= 0 ? 'Excedente (bota-fora)' : 'Déficit (empréstimo)'} value=${fmt(Math.abs(t.balance), 1) + ' m³'} />
      </div>
      <${Bruckner} volumes=${c.volumes} />
    </${Section}>
    <${Section} title="Quantitativos" actions=${html`<button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'export' } })}>Exportar</button>`}>
      <div class="scroll" style="max-height:340px"><table class="grid">
        <thead><tr><th>Item</th><th>Un.</th><th>Quant.</th></tr></thead>
        <tbody>${items.map((q) => html`<tr title=${q.note || ''}><td>${q.description}</td><td>${q.unit}</td><td class="n">${fmt(q.qty, 2)}</td></tr>`)}</tbody>
      </table></div>
    </${Section}>`;
}

function Bruckner({ volumes }) {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current; if (!cv || !volumes.length) return;
    const d = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = 120;
    cv.width = W * d; cv.height = H * d;
    const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, W, H);
    const s0 = volumes[0].s, s1 = volumes[volumes.length - 1].s;
    let mn = 0, mx = 0; for (const v of volumes) { mn = Math.min(mn, v.mass); mx = Math.max(mx, v.mass); }
    const pad = Math.max(1, (mx - mn) * 0.1);
    const X = (s) => 8 + ((s - s0) / Math.max(1, s1 - s0)) * (W - 16), Y = (m) => H - 14 - ((m - mn + pad) / (mx - mn + 2 * pad)) * (H - 26);
    ctx.strokeStyle = '#3a4555'; ctx.beginPath(); ctx.moveTo(8, Y(0)); ctx.lineTo(W - 8, Y(0)); ctx.stroke();
    ctx.strokeStyle = '#2fb9a8'; ctx.lineWidth = 2; ctx.beginPath();
    volumes.forEach((v, i) => (i ? ctx.lineTo(X(v.s), Y(v.mass)) : ctx.moveTo(X(v.s), Y(v.mass))));
    ctx.stroke();
    ctx.fillStyle = '#9aa6b6'; ctx.font = '10px Segoe UI'; ctx.fillText('Diagrama de Brückner (m³)', 10, 12);
    ctx.textAlign = 'right'; ctx.fillText(fmt(volumes[volumes.length - 1].mass, 0), W - 10, Y(volumes[volumes.length - 1].mass) - 4);
  });
  return html`<canvas ref=${ref} style="width:100%;height:120px;display:block;margin-top:8px;border-radius:4px"></canvas>`;
}

// ---------------------------------------------------------------- superfície
function SurfacePanel({ sdef }) {
  const sf = store.model.surface(store.project, sdef.id);
  const st = sf?.stats;
  const L = store.ui.layers;
  const setL = (k) => (v) => store.setUI({ layers: { ...L, [k]: v } });
  return html`
    <div class="props-head"><div class="kind">Superfície (MDT)</div><h3>${sdef.name}</h3></div>
    <${Section} title="Dados">
      <${Field} label="Nome"><${Text} value=${sdef.name} onChange=${(v) => upd('Renomear superfície', (p) => { const s = p.surfaces.find((x) => x.id === sdef.id); p.surfaces = p.surfaces.map((x) => (x === s ? { ...s, name: v } : x)); })} /></${Field}>
      ${st ? html`<div class="kv">
        <span>Pontos</span><b>${fmt(st.points, 0)}</b>
        <span>Triângulos</span><b>${fmt(st.triangles, 0)}</b>
        <span>Linhas de quebra (segmentos)</span><b>${fmt(st.breaklineSegments || 0, 0)}</b>
        <span>Área 2D</span><b>${fmt(st.area / 10000, 4)} ha</b>
        <span>Cota mínima</span><b>${fmt(st.minZ, 3)}</b>
        <span>Cota máxima</span><b>${fmt(st.maxZ, 3)}</b>
        <span>Origem</span><b>${sdef.source || '-'}</b>
      </div>` : null}
      ${sf?.warnings?.length ? html`<div class="checks" style="margin-top:8px">${sf.warnings.map((w) => html`<div class="check-item alerta"><i></i><div>${w}</div></div>`)}</div>` : null}
    </${Section}>
    <${Section} title="Triangulação">
      <${Field} label="Aresta máxima na borda" title="Remove triângulos longos da borda (concavidades sem levantamento). 0 = não remove."><${Num} value=${sdef.maxEdge || 0} dec=${1} unit="m" min=${0} onChange=${(v) => upd('Aresta máxima da superfície', (p) => { p.surfaces = p.surfaces.map((x) => (x.id === sdef.id ? { ...x, maxEdge: v, rev: (x.rev || 0) + 1 } : x)); })} /></${Field}>
    </${Section}>
    <${Section} title="Exibição">
      <${Check} label="Curvas de nível" checked=${L.contours} onChange=${setL('contours')} />
      <${Check} label="Pontos" checked=${L.points} onChange=${setL('points')} />
      <${Check} label="Triângulos" checked=${L.triangles} onChange=${setL('triangles')} />
      <${Field} label="Equidistância"><${Num} value=${store.project.settings.contourInterval} dec=${2} unit="m" min=${0.1} onChange=${(v) => upd('Equidistância das curvas', (p) => { p.settings.contourInterval = v; })} /></${Field}>
    </${Section}>
    <${Section}><div class="row-actions"><button class="btn small danger" onClick=${() => { if (confirm('Excluir esta superfície?')) { upd('Excluir superfície', (p) => { p.surfaces = p.surfaces.filter((x) => x.id !== sdef.id); for (const r of p.roads) if (r.surfaceId === sdef.id) r.surfaceId = p.surfaces[0]?.id || null; }); store.setUI({ selection: null }); } }}>Excluir superfície</button></div></${Section}>`;
}

// ---------------------------------------------------------------- loteamento
/** Arestas da quadra voltadas para uma via (ponto médio junto ao bordo de alguma via). */
function streetEdges(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (const r of store.results.roads) {
      if (!r.alignment?.ok) continue;
      const so = r.alignment.stationOffset(m.x, m.y);
      const w = templateWidths(r.road.template);
      const half = so.offset < 0 ? w.left : w.right;
      if (Math.abs(so.dist - half) < 1.5 && so.station > r.alignment.startStation + 0.5 && so.station < r.alignment.endStation - 0.5) { out.push({ i, len, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } }); break; }
    }
  }
  return out;
}

export function generateLots() {
  const res = store.results.parcels;
  if (!res || !res.blocks.length) { store.toast('Desenhe a gleba e as vias que a cortam para formar as quadras.', 'err'); return; }
  const P = store.project.parcels;
  const lots = [];
  res.blocks.forEach((b, bi) => {
    const streets = streetEdges(b.polygon).sort((x, y) => y.len - x.len);
    const front = streets.length ? streets[0].i : longestEdge(b.polygon);
    let parts = [{ polygon: b.polygon, front }];
    // duas frentes só quando há outra via aproximadamente paralela do lado oposto
    const opposite = streets.length > 1 && streets.slice(1).some((s) => Math.abs(s.dir.x * streets[0].dir.x + s.dir.y * streets[0].dir.y) > 0.8 && s.len > streets[0].len * 0.4);
    if (P.doubleFront && opposite) {
      const sp = splitDoubleFront(b.polygon, front, P.minDepth);
      if (sp) parts = sp;
    }
    let n = 0;
    for (const part of parts) {
      for (const l of subdivideBlock(part.polygon, { front: P.front, frontIdx: part.front })) {
        lots.push({ polygon: l.polygon, block: bi + 1, number: ++n, front: P.front });
      }
    }
  });
  upd(`Gerar ${lots.length} lotes`, (p) => { p.parcels.lots = lots; });
  store.toast(`${lots.length} lotes gerados em ${res.blocks.length} quadra(s).`);
}

function ParcelsPanel() {
  const P = store.project.parcels;
  const res = store.results.parcels;
  const set = (k) => (v) => upd('Parâmetros do loteamento', (p) => { p.parcels[k] = v; }, 'parc' + k);
  const issues = res?.lots?.filter((l) => l.issues.length) || [];
  return html`
    <div class="props-head"><div class="kind">Loteamento</div><h3>Gleba e quadras</h3></div>
    <${Section} title="Gleba">
      ${P.gleba ? html`<div class="kv"><span>Área da gleba</span><b>${fmt(res?.glebaArea || 0, 2)} m²</b><span>Quadras formadas</span><b>${res?.blocks?.length || 0}</b><span>Lotes</span><b>${res?.lots?.length || 0}</b></div>`
        : html`<div class="note">Use a ferramenta "Gleba" e clique os vértices na planta (duplo clique fecha).</div>`}
      <div class="row-actions">
        <button class=${'btn small' + (store.ui.tool === 'gleba' ? ' primary' : '')} onClick=${() => store.setUI({ tool: 'gleba', view: 'planta' })}>${P.gleba ? 'Redesenhar gleba' : 'Desenhar gleba'}</button>
        <button class="btn small" onClick=${() => store.setUI({ tool: 'green', view: 'planta' })}>+ Área verde</button>
        <button class="btn small" onClick=${() => store.setUI({ tool: 'institutional', view: 'planta' })}>+ Área institucional</button>
      </div>
    </${Section}>
    <${Section} title="Parcelamento (Lei 6.766/1979)">
      <${Field} label="Frente dos lotes"><${Num} value=${P.front} dec=${2} unit="m" min=${5} onChange=${set('front')} /></${Field}>
      <${Field} label="Profundidade mínima"><${Num} value=${P.minDepth} dec=${2} unit="m" min=${5} onChange=${set('minDepth')} /></${Field}>
      <${Check} label="Dividir quadras profundas em duas frentes" checked=${P.doubleFront} onChange=${set('doubleFront')} />
      <div class="row-actions">
        <button class="btn small primary" onClick=${generateLots} disabled=${!res?.blocks?.length}>Gerar lotes nas quadras</button>
        <button class="btn small" onClick=${() => upd('Limpar lotes', (p) => { p.parcels.lots = []; })} disabled=${!P.lots?.length}>Limpar lotes</button>
      </div>
      <div class="note">Mínimos federais: lote ≥ 125 m² e frente ≥ 5 m (art. 4º, II). Lotes fora do mínimo aparecem em vermelho na planta.</div>
      ${issues.length ? html`<div class="checks" style="margin-top:6px"><div class="check-item erro"><i></i><div>${issues.length} lote(s) abaixo dos mínimos da Lei 6.766/1979.</div></div></div>` : null}
    </${Section}>
    ${res?.table ? html`<${Section} title="Quadro de áreas">
      <table class="grid"><thead><tr><th>Uso</th><th>Área (m²)</th><th>%</th></tr></thead>
        <tbody>${res.table.rows.map((rw) => html`<tr><td>${rw.item}</td><td class="n">${fmt(rw.area, 2)}</td><td class="n">${fmtPct(rw.pct, 2)}</td></tr>`)}
        <tr><td><b>Total (gleba)</b></td><td class="n"><b>${fmt(res.table.total, 2)}</b></td><td class="n">100%</td></tr></tbody></table>
    </${Section}>` : null}
    ${P.gleba ? html`<${Section}><div class="row-actions"><button class="btn small danger" onClick=${() => { if (confirm('Excluir a gleba e os lotes?')) upd('Excluir gleba', (p) => { p.parcels.gleba = null; p.parcels.lots = []; }); }}>Excluir gleba</button></div></${Section}>` : null}`;
}

function LotPanel({ index }) {
  const res = store.results.parcels;
  const l = res?.lots?.[index];
  if (!l) return html`<${ProjectPanel} />`;
  return html`
    <div class="props-head"><div class="kind">Lote</div><h3>Quadra ${l.block} · Lote ${l.number}</h3></div>
    <${Section} title="Dados">
      <div class="kv"><span>Área</span><b>${fmt(l.area, 2)} m²</b><span>Perímetro</span><b>${fmt(l.perimeter, 2)} m</b><span>Frente (projeto)</span><b>${fmt(l.front, 2)} m</b></div>
      ${l.issues.length ? html`<div class="checks" style="margin-top:6px">${l.issues.map((m) => html`<div class="check-item erro"><i></i><div>${m}</div></div>`)}</div>` : html`<div class="note">Atende aos mínimos da Lei 6.766/1979.</div>`}
    </${Section}>
    <${Section} title="Memorial (vértices, azimutes e distâncias)">
      <table class="grid"><thead><tr><th>Lado</th><th>Azimute</th><th>Distância</th></tr></thead>
        <tbody>${l.sides.map((s) => html`<tr><td>V${s.from}-V${s.to}</td><td class="n">${fmtAz(s.az)}</td><td class="n">${fmt(s.length, 2)} m</td></tr>`)}</tbody></table>
    </${Section}>`;
}

// ---------------------------------------------------------------- raiz
export function Properties() {
  const s = store.ui.selection;
  let body;
  if (s?.kind === 'road') {
    const road = store.road(s.id);
    body = road ? html`<${RoadPanel} road=${road} />` : html`<${ProjectPanel} />`;
  } else if (s?.kind === 'surface') {
    const sdef = store.project.surfaces.find((x) => x.id === s.id);
    body = sdef ? html`<${SurfacePanel} sdef=${sdef} />` : html`<${ProjectPanel} />`;
  } else if (s?.kind === 'parcels') body = html`<${ParcelsPanel} />`;
  else if (s?.kind === 'lot') body = html`<${LotPanel} index=${s.index} />`;
  else body = html`<${ProjectPanel} />`;
  return html`<aside class="props">${body}</aside>`;
}
