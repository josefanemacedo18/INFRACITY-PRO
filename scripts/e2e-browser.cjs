const { chromium } = require('playwright');
const fs = require('fs');
// Teste de ponta a ponta no navegador (requer Playwright e 'npm run serve' em outro terminal).
// Uso: node scripts/e2e-browser.cjs [pasta-de-saida]
const path = require('path');
const os = require('os');
const DIR = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'urbis-e2e-'));
const ROOT = path.join(__dirname, '..');
const OUT = DIR + '/shots';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DIR + '/downloads', { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('ok -', m); };

async function makeCsv() {
  const { sampleTerrainPoints } = await import(path.join(ROOT, 'app/core/sample.js'));
  const lines = ['PONTO;NORTE;ESTE;COTA;DESC'];
  for (const p of sampleTerrainPoints()) lines.push([p.name, p.y.toFixed(3).replace('.', ','), p.x.toFixed(3).replace('.', ','), p.z.toFixed(3).replace('.', ','), p.desc].join(';'));
  fs.writeFileSync(DIR + '/levantamento.csv', lines.join('\r\n'));
}

(async () => {
  await makeCsv();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
  page.on('dialog', (d) => d.accept());
  const downloads = [];
  page.on('download', async (d) => { const p = DIR + '/downloads/' + d.suggestedFilename(); await d.saveAs(p); downloads.push(p); });
  await page.goto('http://localhost:8090/', { waitUntil: 'networkidle' });
  const S = () => page.evaluate(() => { const s = window.__urbis; return { roads: s.project.roads.length, surfaces: s.project.surfaces.length, hist: s.history.length, idx: s.index, pis: s.project.roads[0]?.pis.map((p) => [p.x, p.y]), pvis: s.project.roads[0]?.profile.pvis.length, lots: s.project.parcels.lots.length }; });

  // 1) importar CSV
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.empty-card button:has-text("Importar pontos")')]);
  await fc.setFiles(DIR + '/levantamento.csv');
  await page.waitForSelector('.modal-head:has-text("Importar pontos")');
  await page.screenshot({ path: OUT + '/01-import-csv.png' });
  await page.click('.modal-foot button.primary');
  await page.waitForTimeout(1500);
  let st = await S();
  assert(st.surfaces === 1, 'superfície criada a partir do CSV');
  await page.screenshot({ path: OUT + '/02-superficie.png' });

  // 2) desenhar via com cliques
  await page.selectOption('.tools select', 'coletora');
  await page.click('.tool:has-text("Desenhar via")');
  const box = await page.locator('.canvas-wrap canvas').first().boundingBox();
  const P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [[0.18, 0.78], [0.42, 0.45], [0.7, 0.55]]) { const [x, y] = P(fx, fy); await page.mouse.move(x, y); await page.mouse.click(x, y); await page.waitForTimeout(120); }
  const [x3, y3] = P(0.86, 0.2);
  await page.mouse.move(x3, y3);
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/03-desenhando.png' });
  await page.mouse.dblclick(x3, y3);
  await page.waitForTimeout(1500);
  st = await S();
  assert(st.roads === 1, 'via criada por cliques');
  assert(st.pis.length === 4, 'via com 4 PIs (duplo clique conclui)');
  await page.screenshot({ path: OUT + '/04-via-criada.png' });

  // 3) arrastar PI-1
  const piScreen = await page.evaluate(() => { const v = window.__plan; const p = window.__urbis.project.roads[0].pis[1]; return v.w2s(p.x, p.y); });
  const before = st.pis[1];
  await page.mouse.move(box.x + piScreen[0], box.y + piScreen[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + piScreen[0] + 40, box.y + piScreen[1] - 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  st = await S();
  assert(Math.hypot(st.pis[1][0] - before[0], st.pis[1][1] - before[1]) > 5, 'PI arrastado');
  await page.screenshot({ path: OUT + '/05-pi-arrastado.png' });

  // 4) desfazer / refazer
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  st = await S();
  assert(Math.abs(st.pis[1][0] - before[0]) < 1e-6, 'Ctrl+Z desfaz o arraste');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(800);
  st = await S();
  assert(Math.abs(st.pis[1][0] - before[0]) > 1, 'Ctrl+Y refaz');

  // 5) perfil: inserir PIV com duplo clique
  await page.click('.vtab:has-text("Perfil")');
  await page.waitForTimeout(800);
  const pv0 = st.pvis;
  const pbox = await page.locator('.canvas-wrap canvas').first().boundingBox();
  const target = await page.evaluate(() => {
    const pv = window.__urbis.roadResult(window.__urbis.project.roads[0].id).profile.pvis;
    return { s: (pv[0].s + pv[1].s) / 2 };
  });
  void target;
  await page.mouse.dblclick(pbox.x + pbox.width * 0.3, pbox.y + pbox.height * 0.5);
  await page.waitForTimeout(1200);
  st = await S();
  assert(st.pvis >= 3 && (pv0 === 0 || st.pvis === pv0 + 1), `PIV inserido (agora ${st.pvis})`);
  await page.screenshot({ path: OUT + '/06-perfil-editado.png' });

  // 6) aba Seção tipo e aba Resultados
  await page.click('.vtab:has-text("Planta")');
  await page.click('.ptab:has-text("Seção tipo")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/07-secao-tipo.png' });
  await page.click('.ptab:has-text("Resultados")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/08-resultados.png' });

  // 7) salvar projeto (download) e reabrir
  await page.click('.topbar button:has-text("Salvar como")');
  await page.waitForTimeout(1500);
  const urbisFile = downloads.find((d) => d.endsWith('.urbis'));
  assert(!!urbisFile, 'projeto salvo (.urbis)');

  // 8) exportar documentos
  downloads.length = 0;
  await page.click('.tool:has-text("Pranchas, memorial e planilhas")');
  await page.waitForSelector('.modal-head:has-text("Documentação técnica")');
  await page.screenshot({ path: OUT + '/09-exportar.png' });
  await page.click('.modal-foot button.primary');
  await page.waitForTimeout(6000);
  console.log('toast:', await page.evaluate(() => JSON.stringify(window.__urbis.ui.toast)));
  console.log('arquivos gerados:', downloads.map((d) => d.split('/').pop()).join(' | '));
  assert(downloads.filter((d) => d.endsWith('.pdf')).length >= 3, 'PDFs gerados');
  assert(downloads.some((d) => d.endsWith('.xlsx')), 'planilha Excel gerada');

  // 9) abrir o projeto salvo
  await page.evaluate(() => { window.__urbis.dirty = false; });
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.tool:has-text("Abrir")')]);
  await fc2.setFiles(urbisFile);
  await page.waitForTimeout(1500);
  st = await S();
  assert(st.roads === 1 && st.surfaces === 1, 'projeto reaberto com via e superfície');

  // 10) importar DWG (camadas)
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('.tool:has-text("Importar DWG/DXF")')]);
  await fc3.setFiles(path.join(ROOT, 'tests/fixtures/example_2018.dwg'));
  await page.waitForSelector('.modal-head:has-text("Importar CAD")', { timeout: 30000 });
  await page.screenshot({ path: OUT + '/10-dwg-camadas.png' });
  await page.click('.modal-head button:has-text("Fechar")');

  // 11) exemplo completo com lotes
  await page.evaluate(() => { window.__urbis.dirty = false; });
  await page.click('.tool:has-text("Exemplo")');
  await page.waitForTimeout(3000);
  st = await S();
  assert(st.lots > 20, `lotes gerados no exemplo (${st.lots})`);
  await page.screenshot({ path: OUT + '/11-exemplo-lotes.png' });
  await page.click('.tool:has-text("Quadro de áreas")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/12-quadro-areas.png' });
  await page.click('.tool:has-text("Orçamento")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/13-orcamento.png' });
  await page.click('.modal-head button:has-text("Fechar")');
  await page.click('.tool:has-text("Normas aplicadas")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/14-normas.png' });
  await page.click('.modal-head button:has-text("Fechar")');

  // 12) versões: salvar, alterar, comparar e restaurar
  await page.click('.timeline button:has-text("Salvar versão")');
  await page.waitForSelector('.modal-head:has-text("Salvar versão")');
  await page.fill('.modal-body input', 'Alternativa A');
  await page.click('.modal-foot button.primary');
  await page.waitForTimeout(600);
  const nv = await page.evaluate(() => window.__urbis.project.versions.length);
  assert(nv === 1, 'versão salva sem prompt do navegador');
  const name0 = await page.evaluate(() => window.__urbis.project.roads[0].name);
  await page.evaluate(() => window.__urbis.update('Renomear via', (p) => { p.roads[0].name = 'Avenida alterada'; }));
  await page.click('.timeline button:has-text("Versões")');
  await page.waitForSelector('.modal-head:has-text("Versões e alternativas")');
  await page.screenshot({ path: OUT + '/15-versoes.png' });
  await page.click('.modal-body button:has-text("Restaurar")');
  await page.waitForTimeout(800);
  const name1 = await page.evaluate(() => window.__urbis.project.roads[0].name);
  assert(name1 === name0, 'versão restaurada');

  console.log('ERROS DE PÁGINA:\n' + (errors.join('\n') || '(nenhum)'));
  console.log('Capturas em ' + OUT);
  if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
