// URBIS - componente raiz: layout com viewport, ferramentas, propriedades e linha do tempo
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { store } from './store.js';
import { ToolPanel } from './tools.js';
import { Properties } from './props.js';
import { Dialogs, startImportPoints, startImportCad } from './dialogs.js';
import { PlanView } from './plan.js';
import { ProfileView } from './profileView.js';
import { SectionView } from './sectionView.js';
import { actNew, actOpen, actSave, actSample, titleUpdate, scheduleAutosave } from './actions.js';
import { fmt, fmtStation } from '../core/util.js';
import { utmToGeo, fmtLatLon } from '../core/utm.js';
import { readAutosave, isDesktop } from './host.js';

const MODES = [['conceitual', 'Conceitual'], ['tecnico', 'Técnico'], ['apresentacao', 'Apresentação']];
const VIEWS = [['planta', 'Planta'], ['perfil', 'Perfil longitudinal'], ['secoes', 'Seções transversais'], ['3d', 'Vista 3D']];

function useCanvasView(Klass) {
  const ref = useRef();
  const inst = useRef();
  useEffect(() => {
    const c = document.createElement('canvas');
    ref.current.insertBefore(c, ref.current.firstChild);
    inst.current = new Klass(c);
    const off = store.subscribe(() => inst.current.render());
    return () => { off(); inst.current.destroy(); c.remove(); };
  }, []);
  return [ref, inst];
}

function PlanPane() {
  const [ref, inst] = useCanvasView(PlanView);
  useEffect(() => { window.__plan = inst.current; }, []);
  const ui = store.ui;
  const L = ui.layers;
  const setL = (k) => (e) => store.setUI({ layers: { ...L, [k]: e.target.checked } });
  const hints = {
    road: html`<b>Desenhar via:</b> clique os pontos do eixo sobre o terreno. Duplo clique ou Enter conclui · Backspace desfaz · Esc cancela.`,
    gleba: html`<b>Gleba:</b> clique os vértices do perímetro. Duplo clique fecha o polígono.`,
    green: html`<b>Área verde:</b> clique os vértices; duplo clique fecha.`,
    institutional: html`<b>Área institucional:</b> clique os vértices; duplo clique fecha.`,
    sign: html`<b>Placa ${ui.signCode}:</b> clique ao lado da via onde a placa será instalada.`,
    crosswalk: html`<b>Faixa de pedestres:</b> clique sobre a via na estaca desejada.`,
    measure: html`<b>Medir:</b> clique dois pontos para distância e azimute.`,
  };
  const empty = !store.project.surfaces.length && !store.project.roads.length && !store.project.parcels.gleba;
  return html`<div class="canvas-wrap" ref=${ref}>
    <div class="overlay-tl">
      <div class="chipbar">
        <label><input type="checkbox" checked=${L.contours} onChange=${setL('contours')} />Curvas</label>
        <label><input type="checkbox" checked=${L.points} onChange=${setL('points')} />Pontos</label>
        <label><input type="checkbox" checked=${L.triangles} onChange=${setL('triangles')} />TIN</label>
        <label><input type="checkbox" checked=${L.slopes} onChange=${setL('slopes')} />Taludes</label>
        <label><input type="checkbox" checked=${L.signage} onChange=${setL('signage')} />Sinalização</label>
        <label><input type="checkbox" checked=${L.drainage} onChange=${setL('drainage')} />Drenagem</label>
        <label><input type="checkbox" checked=${L.lots} onChange=${setL('lots')} />Lotes</label>
        <label><input type="checkbox" checked=${L.labels} onChange=${setL('labels')} />Rótulos</label>
        <label><input type="checkbox" checked=${L.grid} onChange=${setL('grid')} />Grade</label>
      </div>
      ${hints[ui.tool] ? html`<div class="hint">${hints[ui.tool]}</div>` : null}
    </div>
    <div class="overlay-tr" style="top:96px">
      <button class="btn small" onClick=${() => inst.current?.fit()} title="Enquadrar (F)">Enquadrar</button>
    </div>
    <div class="overlay-bl"><div class="legend">
      <i style="background:#3b414b"></i>Pista <i style="background:#a39b8b;margin-left:8px"></i>Passeio <i style="background:rgba(196,110,70,0.8);margin-left:8px"></i>Corte <i style="background:rgba(110,160,80,0.8);margin-left:8px"></i>Aterro <i style="background:#3aa0ff;margin-left:8px"></i>Galeria
    </div></div>
    ${empty ? html`<div class="empty-state"><div class="empty-card">
      <h2>Bem-vindo ao URBIS</h2>
      <p>Comece importando o levantamento topográfico ou abra o projeto exemplo para conhecer as ferramentas.</p>
      <div class="row">
        <button class="btn primary" onClick=${startImportPoints}>Importar pontos (CSV/TXT)</button>
        <button class="btn" onClick=${startImportCad}>Importar DWG/DXF</button>
        <button class="btn" onClick=${actOpen}>Abrir projeto</button>
        <button class="btn" onClick=${actSample}>Projeto exemplo</button>
      </div>
      <${Recover} />
    </div></div>` : null}
  </div>`;
}

function Recover() {
  const [txt, setTxt] = useState(null);
  useEffect(() => { readAutosave().then((t) => setTxt(t)); }, []);
  if (!txt) return null;
  return html`<p class="note" style="margin-top:14px"><a href="#" style="color:var(--accent)" onClick=${(e) => { e.preventDefault(); import('./actions.js').then((m) => m.openProjectText(txt, { name: 'Recuperado.urbis' })); }}>Recuperar o último trabalho não salvo</a></p>`;
}

function ProfilePane() {
  const [ref] = useCanvasView(ProfileView);
  return html`<div class="canvas-wrap" ref=${ref}></div>`;
}

function SectionPane() {
  const [ref] = useCanvasView(SectionView);
  const road = store.selectedRoad() || store.project.roads[0];
  const r = road ? store.roadResult(road.id) : null;
  const n = r?.corridor?.sections.length || 0;
  const i = Math.min(store.ui.sectionIndex || 0, Math.max(0, n - 1));
  return html`<div class="canvas-wrap" ref=${ref}>
    ${n ? html`<div class="overlay-bl" style="display:flex;gap:6px;align-items:center;background:rgba(18,22,28,.88);border:1px solid var(--line2);border-radius:6px;padding:4px 8px">
      <button class="btn small" onClick=${() => store.setUI({ sectionIndex: Math.max(0, i - 1) })}>◀</button>
      <input type="range" min="0" max=${n - 1} value=${i} style="width:260px" onInput=${(e) => store.setUI({ sectionIndex: +e.target.value })} />
      <button class="btn small" onClick=${() => store.setUI({ sectionIndex: Math.min(n - 1, i + 1) })}>▶</button>
      <span class="note" style="margin:0">Est. ${fmtStation(r.corridor.sections[i].s, store.project.settings.stationInterval)}</span>
    </div>` : null}
  </div>`;
}

function View3DPane() {
  const ref = useRef();
  const inst = useRef();
  const [err, setErr] = useState(null);
  useEffect(() => {
    let off = null, alive = true;
    import('./view3d.js').then(({ View3D }) => {
      if (!alive) return;
      try {
        inst.current = new View3D(ref.current);
        inst.current.update();
        window.__view3d = inst.current;
        off = store.subscribe(() => inst.current?.update());
      } catch (e) { setErr(e.message); }
    }).catch((e) => setErr(e.message));
    return () => { alive = false; off && off(); inst.current?.destroy(); };
  }, []);
  return html`<div class="canvas-wrap" ref=${ref}>
    ${err ? html`<div class="empty-state"><div class="empty-card"><h2>Vista 3D indisponível</h2><p>${err}</p></div></div>` : null}
    <div class="overlay-tr"><button class="btn small" onClick=${() => inst.current?.fit()}>Enquadrar</button></div>
    <div class="overlay-bl"><div class="hint">Botão esquerdo gira · direito desloca · roda aproxima${store.ui.mode !== 'apresentacao' ? ' · ative o modo Apresentação para iluminação, sombras e vegetação' : ''}</div></div>
  </div>`;
}

function Viewport() {
  const v = store.ui.view;
  return html`<main class="view">
    <div class="vtabs">${VIEWS.map(([k, label]) => html`<button class=${'vtab' + (v === k ? ' on' : '')} onClick=${() => store.setUI({ view: k })}>${label}</button>`)}</div>
    <div class="vbody">
      ${v === 'planta' ? html`<${PlanPane} />` : null}
      ${v === 'perfil' ? html`<${ProfilePane} />` : null}
      ${v === 'secoes' ? html`<${SectionPane} />` : null}
      ${v === '3d' ? html`<${View3DPane} />` : null}
    </div>
  </main>`;
}

function TopBar() {
  const ui = store.ui;
  const m = store.project.meta;
  return html`<header class="topbar">
    <div class="logo">URBIS<small>projeto urbano e viário</small></div>
    <div class="projname"><b>${m.name}</b>${store.dirty ? ' •' : ''} ${store.fileName ? html`<span style="color:var(--dim)">— ${store.fileName}</span>` : ''}</div>
    <div class="spacer"></div>
    <div class="seg" title="Modo de trabalho">${MODES.map(([k, label]) => html`<button class=${ui.mode === k ? 'on' : ''} onClick=${() => store.setUI({ mode: k, view: k === 'apresentacao' ? '3d' : ui.view === '3d' && k !== 'apresentacao' ? ui.view : ui.view })}>${label}</button>`)}</div>
    <div class="spacer"></div>
    <button class="btn icon" title="Desfazer (Ctrl+Z)" disabled=${!store.canUndo()} onClick=${() => store.undo()}>↶</button>
    <button class="btn icon" title="Refazer (Ctrl+Y)" disabled=${!store.canRedo()} onClick=${() => store.redo()}>↷</button>
    <button class="btn" onClick=${() => actSave(false)} title="Salvar (Ctrl+S)">Salvar</button>
    <button class="btn" onClick=${() => actSave(true)}>Salvar como</button>
    <button class="btn" onClick=${() => store.setUI({ dialog: { kind: 'help' } })}>Ajuda</button>
  </header>`;
}

function Timeline() {
  const h = store.history, idx = store.index;
  const trackRef = useRef();
  useEffect(() => { const t = trackRef.current; if (t) t.scrollLeft = t.scrollWidth; }, [h.length]);
  const time = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return html`<footer class="timeline">
    <span class="tl-label">Linha do tempo</span>
    <div class="tl-track" ref=${trackRef}>
      ${h.map((e, i) => html`<button class=${'tl-item' + (i === idx ? ' cur' : '') + (i > idx ? ' future' : '') + (e.label.startsWith('Versão') ? ' version' : '')} title=${`${e.label} — ${new Date(e.time).toLocaleString('pt-BR')}`} onClick=${() => store.goto(i)}>${time(e.time)} · ${e.label}</button>`)}
    </div>
    <div class="tl-sep"></div>
    <button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'saveVersion' } })}>Salvar versão</button>
    <button class="btn small" onClick=${() => store.setUI({ dialog: { kind: 'versions' } })}>Versões (${store.project.versions.length})</button>
  </footer>`;
}

function StatusBar() {
  const c = store.ui.cursor;
  const m = store.project.meta;
  let geo = null;
  if (c && c.x > 100000 && c.x < 900000) { try { geo = utmToGeo(c.x, c.y, m.zone, m.hemisphere); } catch { geo = null; } }
  return html`<div class="statusbar">
    <span>SIRGAS 2000 / UTM ${m.zone}${m.hemisphere}</span>
    ${c ? html`<span>E <b>${fmt(c.x, 3)}</b>  N <b>${fmt(c.y, 3)}</b>${c.z != null ? html`  Z <b>${fmt(c.z, 3)}</b>` : ''}</span>` : null}
    ${geo ? html`<span>${fmtLatLon(geo.lat, true)}  ${fmtLatLon(geo.lon, false)}</span>` : null}
    ${c?.road ? html`<span>${c.road.name}: est. <b>${fmtStation(c.road.s, store.project.settings.stationInterval)}</b> afast. <b>${fmt(c.road.o, 2)} m</b></span>` : null}
    <span style="flex:1"></span>
    <span>${isDesktop ? 'Aplicativo desktop' : 'Navegador'} · modo ${store.ui.mode}</span>
  </div>`;
}

export function App() {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => { force((n) => n + 1); titleUpdate(); scheduleAutosave(); }), []);
  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); actSave(e.shiftKey); }
        else if (k === 'o') { e.preventDefault(); actOpen(); }
        else if (k === 'n') { e.preventDefault(); actNew(); }
        else if (!typing && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
        else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
      }
    };
    window.addEventListener('keydown', onKey);
    const onBefore = (e) => { if (store.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBefore);
    // arrastar e soltar arquivos
    const onDrop = async (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'urbis') { const { openProjectText } = await import('./actions.js'); openProjectText(await f.text(), { name: f.name, path: f.path }); }
      else if (ext === 'dxf' || ext === 'dwg') { const { readDroppedFile } = await import('./host.js'); const file = await readDroppedFile(f, true); const mod = await import('./dropcad.js'); mod.importCadFile(file); }
      else if (['csv', 'txt', 'prn', 'xyz'].includes(ext)) store.setUI({ dialog: { kind: 'importPoints', file: { name: f.name, data: await f.text() } } });
    };
    const onOver = (e) => e.preventDefault();
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onOver);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onBefore); window.removeEventListener('drop', onDrop); window.removeEventListener('dragover', onOver); };
  }, []);
  const ui = store.ui;
  return html`<div class=${'shell mode-' + ui.mode}>
    <${TopBar} />
    <${ToolPanel} />
    <${Viewport} />
    <${Properties} />
    <${Timeline} />
    <${StatusBar} />
    <${Dialogs} />
    ${ui.toast ? html`<div class=${'toast' + (ui.toast.kind === 'err' ? ' err' : '')}>${ui.toast.msg}</div>` : null}
    ${ui.busy ? html`<div class="busy">${ui.busy}</div>` : null}
  </div>`;
}
