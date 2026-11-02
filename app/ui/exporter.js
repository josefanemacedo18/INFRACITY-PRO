// URBIS - geração e gravação dos documentos (PDF e Excel)
import { store } from './store.js';
import { saveFile } from './host.js';
import { buildSheets, buildTables, buildMemorialPdf, buildBudgetPdf } from '../core/report/pdf.js';
import { buildWorkbook } from '../core/report/xlsx.js';

const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function baseName() {
  return plain(store.project.meta.name || 'projeto').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}

export async function exportDocuments(o) {
  const jsPDF = window.jspdf?.jsPDF;
  const ExcelJS = window.ExcelJS;
  if (!jsPDF) throw new Error('Biblioteca de PDF não carregada.');
  const ctx = { project: store.project, results: store.results, model: store.model };
  const base = baseName();
  let n = 0;
  const pdf = async (doc, suffix) => {
    const data = doc.output('arraybuffer');
    const ok = await saveFile({ name: plain(`${base} - ${suffix}.pdf`), data, mime: 'application/pdf', accept: ['.pdf'] });
    if (ok) n++;
  };
  if (o.sheets || o.sections || o.parcels) {
    const { doc, pages } = buildSheets(jsPDF, ctx, o);
    if (pages > 0) await pdf(doc, `Pranchas ${o.paper}`);
  }
  if (o.tables) await pdf(buildTables(jsPDF, ctx), 'Quadros técnicos');
  if (o.memorial) await pdf(buildMemorialPdf(jsPDF, ctx), 'Memorial descritivo');
  if (o.budget) await pdf(buildBudgetPdf(jsPDF, ctx), 'Orçamento');
  if (o.excel) {
    if (!ExcelJS) throw new Error('Biblioteca de planilhas não carregada.');
    const buf = await buildWorkbook(ExcelJS, store.project, store.results);
    const ok = await saveFile({ name: `${base} - Planilhas.xlsx`, data: buf, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', accept: ['.xlsx'] });
    if (ok) n++;
  }
  return n;
}
