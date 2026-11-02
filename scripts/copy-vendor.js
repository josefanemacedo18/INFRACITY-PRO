// Copia as bibliotecas de node_modules para app/vendor (uso 100% offline).
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'app', 'vendor');

const files = [
  ['delaunator/index.js', 'delaunator/index.js'],
  ['robust-predicates/index.js', 'robust-predicates/index.js'],
  ['robust-predicates/esm', 'robust-predicates/esm'],
  ['@kninnug/constrainautor/lib/Constrainautor.mjs', 'constrainautor/Constrainautor.mjs'],
  ['polygon-clipping/dist/polygon-clipping.esm.js', 'polygon-clipping/polygon-clipping.esm.js'],
  ['splaytree/dist/splaytree.js', 'splaytree/splaytree.js'],
  ['preact/dist/preact.module.js', 'preact/preact.module.js'],
  ['preact/hooks/dist/hooks.module.js', 'preact/hooks.module.js'],
  ['htm/dist/htm.module.js', 'htm/htm.module.js'],
  ['htm/preact/index.module.js', 'htm/preact.module.js'],
  ['three/build/three.module.js', 'three/three.module.js'],
  ['three/build/three.core.js', 'three/three.core.js'],
  ['three/examples/jsm/controls/OrbitControls.js', 'three/addons/OrbitControls.js'],
  ['jspdf/dist/jspdf.umd.min.js', 'jspdf/jspdf.umd.min.js'],
  ['exceljs/dist/exceljs.min.js', 'exceljs/exceljs.min.js'],
  ['@mlightcad/libredwg-web/dist/libredwg-web.js', 'libredwg/dist/libredwg-web.js'],
  ['@mlightcad/libredwg-web/wasm/libredwg-web.js', 'libredwg/wasm/libredwg-web.js'],
  ['@mlightcad/libredwg-web/wasm/libredwg-web.wasm', 'libredwg/wasm/libredwg-web.wasm'],
];

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
let n = 0;
for (const [src, dst] of files) {
  const s = join(nm, src), d = join(out, dst);
  if (!existsSync(s)) { console.error('Ausente:', src); process.exitCode = 1; continue; }
  mkdirSync(dirname(d), { recursive: true });
  cpSync(s, d, { recursive: true });
  n++;
}
console.log(`URBIS: ${n} bibliotecas copiadas para app/vendor`);
