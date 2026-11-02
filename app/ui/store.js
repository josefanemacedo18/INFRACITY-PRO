// URBIS - estado da aplicação: projeto, histórico (desfazer/refazer), resultados e interface

import { Model } from '../core/model.js';
import { newProject } from '../core/project.js';

const MAX_HISTORY = 200;

function snap(project) {
  const { surfaces, ...rest } = project;
  return { json: JSON.stringify(rest), surfaces: surfaces.slice() };
}
function unsnap(s) {
  const p = JSON.parse(s.json);
  p.surfaces = s.surfaces.slice();
  return p;
}

class Store {
  constructor() {
    this.listeners = new Set();
    this.model = new Model();
    this.ui = {
      mode: 'conceitual', // conceitual | tecnico | apresentacao
      view: 'planta', // planta | perfil | secoes | 3d
      tool: 'select',
      selection: null, // {kind:'road', id, pi?} | {kind:'surface', id} | {kind:'parcels'} | {kind:'lot', index}
      sectionIndex: 0,
      dialog: null,
      toast: null,
      busy: null,
      layers: { contours: true, points: false, triangles: false, labels: true, slopes: true, signage: true, drainage: true, lots: true, grid: true },
      newRoadClass: 'local',
      signCode: 'R-19',
      propTab: {},
      cursor: null,
      fitRequest: 0,
    };
    this.filePath = null;
    this.fileName = null;
    this.dirty = false;
    this.load(newProject(), 'Projeto novo');
    this.dirty = false;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  /** Carrega um projeto (zera o histórico). */
  load(project, label = 'Projeto aberto', file = {}) {
    this.project = project;
    this.history = [{ label, time: Date.now(), state: snap(project) }];
    this.index = 0;
    this.filePath = file.path ?? null;
    this.fileName = file.name ?? null;
    this.dirty = false;
    this.ui.selection = null;
    this.ui.sectionIndex = 0;
    this.ui.cursor = null;
    this.ui.fitRequest++;
    this.recompute();
  }

  /**
   * Altera o projeto e registra no histórico.
   * @param {string} label descrição da alteração (linha do tempo)
   * @param {(p:object)=>void} fn mutação
   * @param {{coalesce?: string}} opts agrupa alterações contínuas com a mesma chave
   */
  update(label, fn, opts = {}) {
    fn(this.project);
    const now = Date.now();
    const last = this.history[this.index];
    const entry = { label, time: now, state: snap(this.project), key: opts.coalesce };
    if (opts.coalesce && last && last.key === opts.coalesce && now - last.time < 2500 && this.index === this.history.length - 1 && this.index > 0) {
      this.history[this.index] = entry;
    } else {
      this.history = this.history.slice(0, this.index + 1);
      this.history.push(entry);
      if (this.history.length > MAX_HISTORY) this.history.splice(1, this.history.length - MAX_HISTORY);
      this.index = this.history.length - 1;
    }
    this.dirty = true;
    this.recompute();
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.history.length - 1; }
  undo() { if (this.canUndo()) this.goto(this.index - 1); }
  redo() { if (this.canRedo()) this.goto(this.index + 1); }
  goto(i) {
    if (i < 0 || i >= this.history.length) return;
    this.index = i;
    this.project = unsnap(this.history[i].state);
    this.dirty = true;
    this._fixSelection();
    this.recompute();
  }

  _fixSelection() {
    const s = this.ui.selection;
    if (s && s.kind === 'road' && !this.project.roads.find((r) => r.id === s.id)) this.ui.selection = null;
    if (s && s.kind === 'surface' && !this.project.surfaces.find((r) => r.id === s.id)) this.ui.selection = null;
  }

  setUI(patch) {
    Object.assign(this.ui, typeof patch === 'function' ? patch(this.ui) : patch);
    this.emit();
  }

  toast(msg, kind = 'ok', ms = 4000) {
    clearTimeout(this._toastT);
    this.ui.toast = { msg, kind };
    this.emit();
    this._toastT = setTimeout(() => { this.ui.toast = null; this.emit(); }, ms);
  }

  async withBusy(msg, fn) {
    this.setUI({ busy: msg });
    await new Promise((r) => setTimeout(r, 30));
    try { return await fn(); } finally { this.setUI({ busy: null }); }
  }

  recompute() {
    try {
      const t0 = performance.now();
      this.results = this.model.computeAll(this.project);
      this.computeMs = performance.now() - t0;
    } catch (err) {
      console.error(err);
      this.results = { roads: [], parcels: null, error: err };
    }
    this.roadResults = new Map(this.results.roads.map((r) => [r.road.id, r]));
    this.emit();
  }

  road(id) { return this.project.roads.find((r) => r.id === id); }
  roadResult(id) { return this.roadResults.get(id); }
  selectedRoad() { const s = this.ui.selection; return s && (s.kind === 'road') ? this.road(s.id) : null; }
}

export const store = new Store();
if (typeof window !== 'undefined') window.__urbis = store;
