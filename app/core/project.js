// URBIS - modelo de dados do projeto (arquivo .urbis)

import { uid } from './util.js';
import { defaultTemplate } from './template.js';
import { ROAD_CLASSES } from './norms/brasil.js';

export const FORMAT = 'urbis-project';
export const FORMAT_VERSION = 1;

export function newProject(over = {}) {
  const now = new Date().toISOString();
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: {
      name: 'Novo projeto', client: '', location: '', company: '', author: '', crea: '', art: '',
      zone: 23, hemisphere: 'S', datum: 'SIRGAS 2000', created: now, modified: now,
      ...over.meta,
    },
    settings: {
      stationInterval: 20, sectionInterval: 20, fh: 1.30, topsoil: 0.20,
      contourInterval: 1, contourMajor: 5, rural: false,
      ...over.settings,
    },
    surfaces: [],
    roads: [],
    drainage: {
      idf: { K: 1200, a: 0.15, b: 10, c: 0.80, source: 'Exemplo genérico - substitua pela equação IDF do local (ex.: Plúvio 2.1/UFV)' },
      T: 10, tcMin: 10, cover: 1.0, sMin: 0.005, n: 0.013, nGutter: 0.016,
      ...over.drainage,
    },
    parcels: { gleba: null, blocks: [], lots: [], green: [], institutional: [], front: 12, minDepth: 25, doubleFront: true, ...over.parcels },
    budget: { bdi: 0.25, prices: {}, reference: 'Preços unitários informados pelo usuário (ex.: SINAPI/SICRO na data-base do orçamento)', ...over.budget },
    versions: [],
  };
}

const ROAD_COLORS = ['#e8a33d', '#4cb3e8', '#e8574c', '#7bd36a', '#c77ce8', '#e8d34c'];

export function newRoad(project, o = {}) {
  const classKey = o.classKey || 'local';
  const rc = ROAD_CLASSES[classKey] || ROAD_CLASSES.local;
  const n = project.roads.length + 1;
  return {
    id: uid('via'),
    name: o.name || `Via ${n}`,
    classKey,
    V: o.V || rc.V,
    pis: (o.pis || []).map((p) => ({ x: p.x, y: p.y, R: p.R ?? 0, Ls: p.Ls ?? 0, autoR: p.autoR ?? true })),
    startStation: o.startStation ?? 0,
    profile: { pvis: [], auto: true },
    template: defaultTemplate(classKey),
    superelevation: { enabled: rc.superelevation, emax: rc.emax },
    surfaceId: o.surfaceId ?? (project.surfaces[0]?.id || null),
    signage: { center: 'auto', edgeLines: 'auto', autoSigns: true, signs: [], crosswalks: [] },
    drainage: { enabled: false, side: 'R', spacing: 50, C: 0.85, extraWidth: 10 },
    color: ROAD_COLORS[(n - 1) % ROAD_COLORS.length],
    visible: true,
  };
}

/** Aplica nova classe de via (velocidade, seção tipo e superelevação). */
export function applyRoadClass(road, classKey) {
  const rc = ROAD_CLASSES[classKey];
  if (!rc) return road;
  road.classKey = classKey;
  road.V = rc.V;
  road.template = defaultTemplate(classKey);
  road.superelevation = { enabled: rc.superelevation, emax: rc.emax };
  for (const p of road.pis) if (p.autoR) p.R = 0;
  return road;
}

export function serializeProject(project) {
  const p = { ...project, meta: { ...project.meta, modified: new Date().toISOString() } };
  return JSON.stringify(p);
}

export function parseProject(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new Error('Arquivo inválido: não é um projeto URBIS.'); }
  if (!p || p.format !== FORMAT) throw new Error('Arquivo inválido: não é um projeto URBIS.');
  const base = newProject();
  return {
    ...base, ...p,
    meta: { ...base.meta, ...p.meta },
    settings: { ...base.settings, ...p.settings },
    drainage: { ...base.drainage, ...p.drainage },
    parcels: { ...base.parcels, ...p.parcels },
    budget: { ...base.budget, ...p.budget },
    surfaces: p.surfaces || [], roads: p.roads || [], versions: p.versions || [],
  };
}

/** Parte do projeto que forma uma "versão" de projeto (alternativa): tudo menos superfícies e versões. */
export function designSnapshot(project) {
  const { surfaces, versions, ...rest } = project;
  return JSON.stringify(rest);
}

export function restoreDesign(project, snapshotText) {
  const d = JSON.parse(snapshotText);
  return { ...project, ...d, surfaces: project.surfaces, versions: project.versions };
}
