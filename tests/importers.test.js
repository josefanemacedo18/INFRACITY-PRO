import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePointsText } from '../app/core/importers/points.js';
import { parseDxf, extractTopography, suggestLayerUse, decodeDxfBytes } from '../app/core/importers/dxf.js';
import { Surface } from '../app/core/surface.js';

test('CSV PNEZD com vírgula decimal e ponto e vírgula', () => {
  const txt = 'PONTO;NORTE;ESTE;COTA;DESCRICAO\n1;7470012,345;690001,100;812,450;TN\n2;7470020,000;690010,000;813,000;MF\n';
  const r = parsePointsText(txt);
  assert.equal(r.format, 'PNEZD');
  assert.equal(r.delimiter, ';');
  assert.equal(r.points.length, 2);
  assert.equal(r.points[0].x, 690001.1);
  assert.equal(r.points[0].y, 7470012.345);
  assert.equal(r.points[0].z, 812.45);
  assert.equal(r.points[1].desc, 'MF');
  assert.equal(r.skipped, 1, 'cabeçalho ignorado');
});

test('CSV ENZ com vírgula como separador e ponto decimal', () => {
  const txt = '690001.1,7470012.345,812.45\n690010,7470020,813\n';
  const r = parsePointsText(txt);
  assert.equal(r.format, 'ENZ');
  assert.equal(r.points.length, 2);
  assert.equal(r.points[1].y, 7470020);
});

test('TXT separado por espaços/tabulação no formato PENZD', () => {
  const txt = '10\t690001.100\t7470012.345\t812.450\tBORDO\n11\t690002.000\t7470013.000\t812.600\tBORDO\n';
  const r = parsePointsText(txt);
  assert.equal(r.format, 'PENZD');
  assert.equal(r.points[0].name, '10');
  assert.equal(r.points[0].x, 690001.1);
});

test('formato forçado pelo usuário', () => {
  const r = parsePointsText('1 100 200 10\n2 110 210 11\n3 120 205 12\n', { format: 'PENZ' });
  assert.equal(r.points.length, 3);
  assert.equal(r.points[0].x, 100);
  assert.equal(r.points[0].y, 200);
});

function dxf(entities) {
  return ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
}

test('DXF: pontos, blocos com atributo de cota, textos, curvas e 3D polyline', () => {
  const ents = [
    '0', 'POINT', '8', 'PONTOS', '10', '100.0', '20', '200.0', '30', '50.5',
    '0', 'INSERT', '8', 'BLOCOS', '2', 'PT', '66', '1', '10', '110.0', '20', '200.0', '30', '0.0',
    '0', 'ATTRIB', '8', 'BLOCOS', '2', 'NUM', '1', '15', '10', '110', '20', '200', '30', '0',
    '0', 'ATTRIB', '8', 'BLOCOS', '2', 'COTA', '1', '51,25', '10', '110', '20', '200', '30', '0',
    '0', 'SEQEND', '8', 'BLOCOS',
    '0', 'TEXT', '8', 'COTAS_TXT', '10', '120', '20', '205', '30', '0', '40', '1', '1', '52.10',
    '0', 'TEXT', '8', 'COTAS_TXT', '10', '125', '20', '205', '30', '0', '40', '1', '1', '52,30',
    '0', 'LWPOLYLINE', '8', 'CURVAS', '90', '3', '70', '0', '38', '50.0', '10', '90', '20', '190', '10', '130', '20', '190', '10', '130', '20', '230',
    '0', 'POLYLINE', '8', 'BORDOS', '66', '1', '70', '8', '10', '0', '20', '0', '30', '0',
    '0', 'VERTEX', '8', 'BORDOS', '10', '95', '20', '210', '30', '51.0', '70', '32',
    '0', 'VERTEX', '8', 'BORDOS', '10', '128', '20', '212', '30', '52.0', '70', '32',
    '0', 'SEQEND', '8', 'BORDOS',
    '0', 'LINE', '8', 'LIMITE', '10', '0', '20', '0', '30', '0', '11', '10', '21', '10', '31', '0',
  ];
  const parsed = parseDxf(dxf(ents));
  assert.equal(parsed.layers.PONTOS.points, 1);
  assert.equal(parsed.layers.BLOCOS.inserts, 1);
  assert.equal(parsed.layers.COTAS_TXT.numericTexts, 2);
  assert.equal(parsed.layers.BORDOS.polylines3d, 1);
  const use = suggestLayerUse(parsed.layers);
  assert.equal(use.PONTOS.use, true);
  assert.equal(use.BLOCOS.use, true, 'bloco com atributo de cota');
  assert.equal(use.COTAS_TXT.texts, true);
  assert.equal(use.LIMITE.use, false, 'linha 2D sem cota');
  const topo = extractTopography(parsed, { layers: use, weed: 0 });
  const zs = topo.points.map((p) => p.z).sort();
  assert.deepEqual(zs, [50.5, 51.25, 52.1, 52.3]);
  const blockPt = topo.points.find((p) => p.z === 51.25);
  assert.equal(blockPt.name, '15');
  assert.equal(topo.breaklines.length, 2, 'curva de nível + 3D polyline');
  assert.equal(topo.contours, 1);
  const s = new Surface({ points: topo.points, breaklines: topo.breaklines });
  assert.ok(s.stats.triangles > 0);
});

test('decodificação de DXF em Windows-1252', () => {
  const bytes = new Uint8Array([0x38, 0x0a, 0x43, 0xc7, 0x41]); // "8\nCÇA" em cp1252
  const t = decodeDxfBytes(bytes);
  assert.equal(t, '8\nCÇA');
});

test('DWG 2018: leitura e conversão de entidades', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseDwg } = await import('../app/core/importers/dwg.js');
  const bytes = readFileSync(new URL('./fixtures/example_2018.dwg', import.meta.url));
  const r = await parseDwg(bytes, { wasmDir: './node_modules/@mlightcad/libredwg-web/wasm/', moduleSpecifier: '@mlightcad/libredwg-web' });
  const types = new Set(r.entities.map((e) => e.type));
  for (const t of ['POINT', 'LINE', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'INSERT', '3DFACE']) assert.ok(types.has(t), 'tipo ' + t);
  const p3d = r.entities.find((e) => e.type === 'POLYLINE' && e.is3d);
  assert.deepEqual(p3d.vertices.map((v) => v.z), [0, 0, 5, 0]);
  const ins = r.entities.find((e) => e.type === 'INSERT' && e.attribs.length);
  assert.equal(ins.attribs[0].tag, 'ETIKEDO');
  assert.ok(r.layers['Tavolo 3'].total > 0);
  const topo = extractTopography(r, { layers: { 'Tavolo 3': { use: true } } });
  assert.ok(topo.breaklines.length >= 1, '3D polyline vira linha de quebra');
});
