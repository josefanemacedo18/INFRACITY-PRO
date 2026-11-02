// URBIS - painel de ferramentas (módulos)
import { html } from 'htm/preact';
import { store } from './store.js';
import { actNew, actOpen, actSave, actSample } from './actions.js';
import { startImportPoints, startImportCad } from './dialogs.js';
import { ROAD_CLASSES } from '../core/norms/brasil.js';
import { generateLots } from './props.js';
import { fmt } from '../core/util.js';

function Tool({ icon, label, on, onClick, wide, title, disabled }) {
  return html`<button class=${'tool' + (on ? ' on' : '') + (wide ? ' wide' : '')} title=${title || label} onClick=${onClick} disabled=${disabled}><span class="t-ico">${icon}</span><span>${label}</span></button>`;
}

function Group({ num, title, children }) {
  return html`<div class="tgroup"><h4>${num ? html`<span class="num">${num}</span>` : null}${title}</h4><div class="tgrid">${children}</div></div>`;
}

export function ToolPanel() {
  const ui = store.ui, p = store.project;
  const tool = ui.tool;
  const setTool = (t, extra = {}) => store.setUI({ tool: tool === t ? 'select' : t, view: 'planta', ...extra });
  const sel = store.selectedRoad();
  return html`<nav class="tools">
    <${Group} title="Projeto">
      <${Tool} icon="✚" label="Novo" onClick=${actNew} />
      <${Tool} icon="📂" label="Abrir" onClick=${actOpen} />
      <${Tool} icon="💾" label="Salvar" onClick=${() => actSave(false)} />
      <${Tool} icon="★" label="Exemplo" onClick=${actSample} title="Carrega um projeto exemplo completo" />
    </${Group}>
    <${Group} num="01" title="Terreno e topografia">
      <${Tool} icon="⋰" label="Importar pontos (CSV/TXT)" onClick=${startImportPoints} />
      <${Tool} icon="⌗" label="Importar DWG/DXF" onClick=${startImportCad} />
      ${p.surfaces.map((s) => html`<${Tool} wide icon="▦" label=${s.name} on=${ui.selection?.kind === 'surface' && ui.selection.id === s.id} onClick=${() => store.setUI({ selection: { kind: 'surface', id: s.id } })} />`)}
    </${Group}>
    <${Group} num="02" title="Sistema viário">
      <label class="field" style="grid-column: span 2; margin:0"><span>Classe da nova via</span>
        <select value=${ui.newRoadClass} onChange=${(e) => store.setUI({ newRoadClass: e.target.value })}>
          ${Object.entries(ROAD_CLASSES).map(([k, v]) => html`<option value=${k} selected=${k === ui.newRoadClass}>${v.label} (${v.V} km/h)</option>`)}
        </select></label>
      <${Tool} icon="〰" label="Desenhar via" on=${tool === 'road'} onClick=${() => setTool('road', { selection: null })} title="Clique os pontos do eixo; duplo clique ou Enter conclui" />
      <${Tool} icon="⬚" label="Selecionar e editar" on=${tool === 'select'} onClick=${() => store.setUI({ tool: 'select' })} />
      <${Tool} icon="📏" label="Medir distância" on=${tool === 'measure'} onClick=${() => setTool('measure')} />
      <${Tool} icon="⌒" label="Perfil do greide" onClick=${() => store.setUI({ view: 'perfil' })} />
      ${p.roads.map((r) => {
        const res = store.roadResult(r.id);
        const errs = (res?.checks || []).filter((c) => c.level === 'erro').length;
        return html`<${Tool} wide icon=${html`<span style=${'color:' + r.color}>■</span>`} label=${html`${r.name} <span style="color:var(--dim)">${res?.alignment ? fmt(res.alignment.length, 0) + ' m' : ''}</span>${errs ? html` <span class="badge erro">${errs}</span>` : ''}`} on=${ui.selection?.kind === 'road' && ui.selection.id === r.id} onClick=${() => store.setUI({ selection: { kind: 'road', id: r.id } })} />`;
      })}
    </${Group}>
    <${Group} num="03" title="Infraestrutura hidráulica">
      <${Tool} icon="💧" label=${sel ? (sel.drainage.enabled ? 'Rede ativa na via' : 'Rede na via selecionada') : 'Selecione uma via'} on=${sel?.drainage.enabled} disabled=${!sel} onClick=${() => { if (!sel) return; store.update(sel.drainage.enabled ? 'Desativar drenagem' : 'Ativar drenagem', (pp) => { const rd = pp.roads.find((x) => x.id === sel.id); rd.drainage.enabled = !rd.drainage.enabled; }); store.setUI({ propTab: { ...ui.propTab, road: 'dren' } }); }} />
      <${Tool} icon="☂" label="Chuvas (IDF)" onClick=${() => store.setUI({ selection: null })} title="Parâmetros da equação de chuvas no painel do projeto" />
    </${Group}>
    <${Group} num="04" title="Urbanismo e loteamento">
      <${Tool} icon="⬠" label="Desenhar gleba" on=${tool === 'gleba'} onClick=${() => setTool('gleba')} />
      <${Tool} icon="▤" label="Gerar lotes" onClick=${() => { generateLots(); store.setUI({ selection: { kind: 'parcels' } }); }} />
      <${Tool} icon="🌳" label="Área verde" on=${tool === 'green'} onClick=${() => setTool('green')} />
      <${Tool} icon="🏛" label="Área institucional" on=${tool === 'institutional'} onClick=${() => setTool('institutional')} />
      <${Tool} wide icon="▣" label="Quadro de áreas" onClick=${() => store.setUI({ selection: { kind: 'parcels' } })} />
    </${Group}>
    <${Group} num="05" title="Terraplenagem">
      <${Tool} icon="⊥" label="Seções transversais" onClick=${() => store.setUI({ view: 'secoes' })} />
      <${Tool} icon="∑" label="Volumes e Brückner" disabled=${!sel} onClick=${() => store.setUI({ propTab: { ...ui.propTab, road: 'result' } })} />
    </${Group}>
    <${Group} title="Sinalização viária">
      <${Tool} icon="⛔" label="Inserir placa" on=${tool === 'sign'} onClick=${() => setTool('sign')} />
      <${Tool} icon="▥" label="Faixa de pedestres" on=${tool === 'crosswalk'} onClick=${() => setTool('crosswalk')} />
    </${Group}>
    <${Group} num="06" title="Documentação técnica">
      <${Tool} icon="🗎" label="Pranchas, memorial e planilhas" wide onClick=${() => store.setUI({ dialog: { kind: 'export' } })} />
      <${Tool} icon="$" label="Orçamento" onClick=${() => store.setUI({ dialog: { kind: 'budget' } })} />
      <${Tool} icon="§" label="Normas aplicadas" onClick=${() => store.setUI({ dialog: { kind: 'norms' } })} />
    </${Group}>
  </nav>`;
}
