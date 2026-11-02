// URBIS - importação de CAD arrastado para a janela
import { store } from './store.js';
import { parseDxf, decodeDxfBytes } from '../core/importers/dxf.js';
import { parseDwg } from '../core/importers/dwg.js';

export async function importCadFile(f) {
  const isDwg = /\.dwg$/i.test(f.name);
  try {
    const parsed = await store.withBusy(isDwg ? 'Lendo DWG…' : 'Lendo DXF…', async () => (isDwg ? parseDwg(f.data, { wasmDir: 'vendor/libredwg/wasm/' }) : parseDxf(decodeDxfBytes(f.data))));
    store.setUI({ dialog: { kind: 'importCad', file: { name: f.name }, parsed } });
  } catch (err) {
    store.toast('Não foi possível ler o arquivo: ' + err.message, 'err', 8000);
  }
}
