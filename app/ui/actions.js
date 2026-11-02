// URBIS - ações de arquivo e importação
import { store } from './store.js';
import { openFile, saveFile, autosave, setWindowTitle } from './host.js';
import { newProject, serializeProject, parseProject, designSnapshot, restoreDesign } from '../core/project.js';
import { sampleProject } from '../core/sample.js';
import { uid } from '../core/util.js';

export function titleUpdate() {
  const name = store.fileName || store.project.meta.name || 'Projeto';
  setWindowTitle(`${store.dirty ? '• ' : ''}${name} — URBIS`);
}

export async function confirmDiscard() {
  if (!store.dirty) return true;
  return window.confirm('Há alterações não salvas. Deseja continuar e descartar as alterações?');
}

export async function actNew() {
  if (!(await confirmDiscard())) return;
  store.load(newProject(), 'Projeto novo');
  store.setUI({ dialog: { kind: 'project' } });
  titleUpdate();
}

export async function actSample() {
  if (!(await confirmDiscard())) return;
  await store.withBusy('Montando o projeto exemplo…', () => store.load(sampleProject(), 'Projeto exemplo'));
  const { generateLots } = await import('./props.js');
  generateLots();
  store.dirty = false;
  store.setUI({ selection: { kind: 'road', id: store.project.roads[0].id } });
  store.toast('Projeto exemplo carregado: avenida, rua local, drenagem e loteamento sobre terreno sintético.');
  titleUpdate();
}

export async function actOpen() {
  if (!(await confirmDiscard())) return;
  const f = await openFile({ accept: ['.urbis', '.json'], title: 'Abrir projeto URBIS' });
  if (!f) return;
  try {
    const p = parseProject(f.data);
    await store.withBusy('Abrindo projeto…', () => store.load(p, 'Projeto aberto', { path: f.path, name: f.name }));
    store.toast(`Projeto "${p.meta.name}" aberto.`);
  } catch (err) {
    store.toast(err.message, 'err', 6000);
  }
  titleUpdate();
}

export async function openProjectText(text, file = {}) {
  const p = parseProject(text);
  store.load(p, 'Projeto aberto', file);
  titleUpdate();
}

export async function actSave(as = false) {
  const text = serializeProject(store.project);
  const base = (store.project.meta.name || 'projeto').replace(/[\\/:*?"<>|]+/g, '-');
  const path = await saveFile({ name: store.fileName || `${base}.urbis`, data: text, mime: 'application/json', accept: ['.urbis'], path: as ? null : store.filePath });
  if (!path) return false;
  store.filePath = typeof path === 'string' && /[\\/]/.test(path) ? path : store.filePath;
  store.fileName = typeof path === 'string' ? path.split(/[\\/]/).pop() : store.fileName;
  store.dirty = false;
  store.emit();
  store.toast('Projeto salvo.');
  titleUpdate();
  return true;
}

let _autoT = null;
export function scheduleAutosave() {
  clearTimeout(_autoT);
  _autoT = setTimeout(() => { if (store.dirty) autosave(serializeProject(store.project)); }, 4000);
}

/** Cria superfície a partir de pontos e linhas de quebra. */
export function addSurface({ name, points, breaklines = [], maxEdge = 0, source = '' }) {
  const flat = [];
  for (const q of points) flat.push(round3(q.x), round3(q.y), round3(q.z));
  const id = uid('sup');
  const codes = points.some((q) => q.name || q.desc) ? points.map((q) => [q.name || '', q.desc || '']) : undefined;
  const bl = breaklines.map((b) => b.flatMap((v) => [round3(v.x), round3(v.y), round3(v.z)]));
  store.update(`Importar superfície: ${name}`, (p) => {
    p.surfaces.push({ id, rev: 1, name, maxEdge, points: flat, codes, breaklines: bl, source });
    for (const r of p.roads) if (!r.surfaceId) r.surfaceId = id;
  });
  store.setUI({ selection: { kind: 'surface', id }, fitRequest: store.ui.fitRequest + 1 });
  return id;
}

function round3(v) { return Math.round(v * 1000) / 1000; }

export function saveVersion(name) {
  store.update(`Versão salva: ${name}`, (p) => {
    p.versions.push({ id: uid('ver'), name, date: new Date().toISOString(), data: designSnapshot(p) });
  });
  store.toast(`Versão "${name}" registrada na linha do tempo.`);
}

export function restoreVersion(v) {
  store.update(`Restaurar versão: ${v.name}`, (p) => {
    const r = restoreDesign(p, v.data);
    Object.assign(p, r);
  });
}
