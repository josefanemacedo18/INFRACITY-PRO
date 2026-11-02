import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { Model } from '../app/core/model.js';
import { sampleProject } from '../app/core/sample.js';
import { buildSheets, buildTables, buildMemorialPdf, buildBudgetPdf } from '../app/core/report/pdf.js';
import { buildWorkbook } from '../app/core/report/xlsx.js';
import { collectBudget } from '../app/core/report/budget.js';
import { subdivideBlock, longestEdge, splitDoubleFront } from '../app/core/lots.js';

function sampleWithLots() {
  const p = sampleProject();
  const m = new Model();
  let r = m.computeAll(p);
  const lots = [];
  r.parcels.blocks.forEach((b, bi) => {
    let parts = [{ polygon: b.polygon, front: longestEdge(b.polygon) }];
    const sp = splitDoubleFront(b.polygon, parts[0].front, 25);
    if (sp) parts = sp;
    let n = 0;
    for (const part of parts) for (const l of subdivideBlock(part.polygon, { front: 12, frontIdx: part.front })) lots.push({ polygon: l.polygon, block: bi + 1, number: ++n, front: 12 });
  });
  p.parcels.lots = lots;
  p.budget.prices = { 'TER-03': 18.5, 'PAV-02': 42.0, 'OBC-01': 38.9 };
  r = m.computeAll(p);
  return { p, m, r };
}

const OUT = process.env.URBIS_OUT || null;

test('documentos: pranchas, quadros, memorial, orçamento e planilha', async () => {
  const { p, m, r } = sampleWithLots();
  assert.ok(r.parcels.lots.length > 50, 'lotes gerados');
  const ctx = { project: p, results: r, model: m };
  const { doc, pages } = buildSheets(jsPDF, ctx, { paper: 'A1', planScale: 1000, vScale: 100, sectionScale: 200, sheets: true, sections: true, parcels: true });
  assert.ok(pages >= 4, `pranchas: ${pages}`);
  const tables = buildTables(jsPDF, ctx);
  const mem = buildMemorialPdf(jsPDF, ctx);
  const bud = buildBudgetPdf(jsPDF, ctx);
  for (const d of [doc, tables, mem, bud]) assert.ok(d.output('arraybuffer').byteLength > 2000);
  const xbuf = await buildWorkbook(ExcelJS, p, r);
  assert.ok(xbuf.byteLength > 10000);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xbuf);
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ['Resumo', 'Quantitativos', 'Orçamento', 'Lotes', 'Quadro de áreas']) assert.ok(names.includes(n), 'aba ' + n);
  assert.ok(names.some((n) => n.startsWith('Nota serviço')));
  const b = collectBudget(p, r);
  assert.ok(b.direct > 0 && Math.abs(b.total - b.direct * 1.25) < 1e-6);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/pranchas.pdf`, Buffer.from(doc.output('arraybuffer')));
    writeFileSync(`${OUT}/quadros.pdf`, Buffer.from(tables.output('arraybuffer')));
    writeFileSync(`${OUT}/memorial.pdf`, Buffer.from(mem.output('arraybuffer')));
    writeFileSync(`${OUT}/orcamento.pdf`, Buffer.from(bud.output('arraybuffer')));
    writeFileSync(`${OUT}/planilhas.xlsx`, Buffer.from(xbuf));
  }
});
