// URBIS - leitura de DWG (AutoCAD R14 a 2018+) via LibreDWG (WebAssembly)
// Converte as entidades para o mesmo formato do leitor DXF, para reutilizar extractTopography.

import { summarizeLayers } from './dxf.js';

let _libPromise = null;

/**
 * Carrega o módulo LibreDWG sob demanda (arquivo WebAssembly de ~10 MB).
 * @param {string} wasmDir pasta que contém libredwg-web.wasm
 * @param {string} moduleSpecifier especificador do módulo (mapa de importação no navegador)
 */
export async function loadLibreDwg(wasmDir, moduleSpecifier = 'libredwg-web') {
  if (!_libPromise) {
    _libPromise = (async () => {
      const mod = await import(moduleSpecifier);
      const lib = await mod.LibreDwg.create(wasmDir);
      return { lib, Dwg_File_Type: mod.Dwg_File_Type };
    })();
    _libPromise.catch(() => { _libPromise = null; });
  }
  return _libPromise;
}

const P = (p) => ({ x: +(p?.x ?? 0), y: +(p?.y ?? 0), z: +(p?.z ?? 0) });

/** Converte o banco de dados do LibreDWG em entidades no formato URBIS. */
export function dwgDatabaseToEntities(db) {
  const out = [];
  for (const e of db.entities || []) {
    const layer = String(e.layer ?? '0');
    switch (e.type) {
      case 'POINT':
        out.push({ type: 'POINT', layer, p: P(e.position) });
        break;
      case 'LINE':
        out.push({ type: 'LINE', layer, p1: P(e.startPoint), p2: P(e.endPoint) });
        break;
      case 'LWPOLYLINE':
        out.push({
          type: 'LWPOLYLINE', layer, elevation: +e.elevation || 0,
          closed: ((e.flag || 0) & 512) !== 0,
          vertices: (e.vertices || []).map((v) => ({ x: +v.x, y: +v.y })),
        });
        break;
      case 'POLYLINE3D':
        out.push({
          type: 'POLYLINE', layer, is3d: true, isMesh: false, closed: ((e.flag || 0) & 1) === 1, elevation: 0,
          vertices: (e.vertices || []).map(P),
        });
        break;
      case 'POLYLINE2D': {
        const verts = (e.vertices || []).map((v) => P(v.point ?? v));
        const elev = Number.isFinite(+e.elevation) ? +e.elevation : (verts[0]?.z || 0);
        out.push({ type: 'POLYLINE', layer, is3d: false, isMesh: false, closed: ((e.flag || 0) & 1) === 1, elevation: elev, vertices: verts });
        break;
      }
      case 'TEXT':
        out.push({ type: 'TEXT', layer, text: String(e.text ?? ''), p: P(e.startPoint) });
        break;
      case 'MTEXT':
        out.push({ type: 'MTEXT', layer, text: String(e.text ?? '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, ''), p: P(e.insertionPoint) });
        break;
      case 'INSERT':
        out.push({
          type: 'INSERT', layer, block: String(e.name ?? ''), p: P(e.insertionPoint),
          attribs: (e.attribs || []).map((a) => ({
            tag: String(a.tag ?? a.attrTag ?? ''),
            value: String(typeof a.text === 'object' ? a.text?.text ?? '' : a.text ?? ''),
          })),
        });
        break;
      case '3DFACE':
        out.push({ type: '3DFACE', layer, pts: [P(e.corner1), P(e.corner2), P(e.corner3), P(e.corner4)] });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Lê um DWG a partir dos bytes.
 * @returns {Promise<{entities, layers, warnings}>}
 */
export async function parseDwg(bytes, opts = {}) {
  const { lib, Dwg_File_Type } = await loadLibreDwg(opts.wasmDir || 'vendor/libredwg/wasm/', opts.moduleSpecifier);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dwg = lib.dwg_read_data(data, Dwg_File_Type.DWG);
  if (!dwg) throw new Error('Não foi possível ler o arquivo DWG (versão não suportada ou arquivo corrompido).');
  let db;
  try { db = lib.convert(dwg); } finally { try { lib.dwg_free(dwg); } catch { /* ignora */ } }
  const entities = dwgDatabaseToEntities(db);
  const warnings = [];
  if (!entities.length) warnings.push('Nenhuma entidade de interesse encontrada no DWG.');
  return { entities, layers: summarizeLayers(entities), warnings };
}
