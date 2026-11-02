// URBIS - processo principal do aplicativo desktop (Electron)
const { app, BrowserWindow, protocol, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const APP_DIR = path.join(__dirname, '..', 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const FILTERS = {
  '.urbis': { name: 'Projeto URBIS', extensions: ['urbis'] },
  '.json': { name: 'JSON', extensions: ['json'] },
  '.csv': { name: 'Pontos (CSV/TXT)', extensions: ['csv', 'txt', 'prn', 'xyz', 'pnezd'] },
  '.dxf': { name: 'Desenho CAD (DWG/DXF)', extensions: ['dwg', 'dxf'] },
  '.pdf': { name: 'PDF', extensions: ['pdf'] },
  '.xlsx': { name: 'Planilha Excel', extensions: ['xlsx'] },
};

let win = null;
let pendingFile = null;

function filtersFor(accept = []) {
  const out = [];
  const seen = new Set();
  for (const a of accept) {
    const f = FILTERS[a] || (a === '.txt' || a === '.prn' || a === '.xyz' || a === '.pnezd' ? FILTERS['.csv'] : a === '.dwg' ? FILTERS['.dxf'] : null);
    if (f && !seen.has(f.name)) { seen.add(f.name); out.push(f); }
  }
  out.push({ name: 'Todos os arquivos', extensions: ['*'] });
  return out;
}

function fileFromArgs(argv) {
  return argv.slice(1).find((a) => /\.urbis$/i.test(a) && fs.existsSync(a)) || null;
}

function sendOpenFile(filePath) {
  if (!win || !filePath) return;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    win.webContents.send('host:open-file', { name: path.basename(filePath), path: filePath, data });
  } catch (err) {
    dialog.showErrorBox('URBIS', `Não foi possível abrir ${filePath}:\n${err.message}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1100, minHeight: 680,
    backgroundColor: '#12161c', title: 'URBIS', show: false,
    icon: path.join(__dirname, '..', 'app', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://urbis/index.html');
  win.webContents.on('did-finish-load', () => { if (pendingFile) { sendOpenFile(pendingFile); pendingFile = null; } });
  if (process.env.URBIS_SMOKE) smokeTest(win, process.env.URBIS_SMOKE);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  let closing = false;
  win.on('close', async (e) => {
    if (closing) return;
    e.preventDefault();
    let dirty = false;
    try { dirty = await win.webContents.executeJavaScript('!!(window.__urbis && window.__urbis.dirty)'); } catch { dirty = false; }
    if (dirty) {
      const r = await dialog.showMessageBox(win, {
        type: 'warning', buttons: ['Sair sem salvar', 'Cancelar'], defaultId: 1, cancelId: 1,
        title: 'URBIS', message: 'Há alterações não salvas no projeto.', detail: 'Deseja sair mesmo assim? As alterações não salvas serão perdidas (uma cópia de recuperação fica disponível na próxima abertura).',
      });
      if (r.response !== 0) return;
    }
    closing = true;
    win.close();
  });
}

/** Teste automático do aplicativo empacotado (só com a variável URBIS_SMOKE = pasta de saída). */
function smokeTest(w, outDir) {
  w.webContents.once('did-finish-load', async () => {
    const report = {};
    try {
      await new Promise((r) => setTimeout(r, 1500));
      report.page = await w.webContents.executeJavaScript(`(async () => {
        const s = window.__urbis;
        const a = await import('./ui/actions.js');
        s.dirty = false;
        await a.actSample();
        const dwg = await import('./core/importers/dwg.js');
        const lib = await dwg.loadLibreDwg('vendor/libredwg/wasm/');
        return { host: !!window.urbisHost, roads: s.project.roads.length, lots: s.project.parcels.lots.length, jspdf: !!window.jspdf, exceljs: !!window.ExcelJS, libredwg: !!lib.lib, title: document.title };
      })()`);
      await new Promise((r) => setTimeout(r, 1500));
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'electron-smoke.png'), img.toPNG());
    } catch (err) {
      report.error = String(err && err.stack || err);
    }
    fs.writeFileSync(path.join(outDir, 'electron-smoke.json'), JSON.stringify(report, null, 2));
    w.destroy();
    app.quit();
  });
}

function buildMenu() {
  const send = (cmd) => () => win && win.webContents.send('host:menu', cmd);
  const template = [
    { label: 'Arquivo', submenu: [
      { label: 'Novo projeto', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: send('open') },
      { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { label: 'Salvar como…', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') },
      { type: 'separator' },
      { label: 'Sair', role: 'quit' },
    ] },
    { label: 'Editar', submenu: [
      { label: 'Recortar', role: 'cut' }, { label: 'Copiar', role: 'copy' }, { label: 'Colar', role: 'paste' }, { label: 'Selecionar tudo', role: 'selectAll' },
    ] },
    { label: 'Exibir', submenu: [
      { label: 'Tela cheia', role: 'togglefullscreen' },
      { label: 'Aumentar zoom da interface', role: 'zoomIn' }, { label: 'Diminuir zoom da interface', role: 'zoomOut' }, { label: 'Zoom padrão', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Recarregar', role: 'reload' },
      { label: 'Ferramentas de desenvolvimento', role: 'toggleDevTools' },
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Sobre o URBIS', click: () => dialog.showMessageBox(win, { type: 'info', title: 'URBIS', message: `URBIS ${app.getVersion()}`, detail: 'Projeto de vias urbanas, rodovias, loteamentos, drenagem e sinalização.\nUso interno.\n\nLeitura de DWG: LibreDWG (GPL-3.0).' }) },
      { label: 'Pasta de dados (recuperação)', click: () => shell.openPath(app.getPath('userData')) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = fileFromArgs(argv);
    if (f) sendOpenFile(f);
  });
  pendingFile = fileFromArgs(process.argv);

  app.whenReady().then(() => {
    protocol.handle('app', async (req) => {
      const url = new URL(req.url);
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(APP_DIR, p));
      if (!file.startsWith(APP_DIR)) return new Response('proibido', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
      } catch {
        return new Response('não encontrado', { status: 404 });
      }
    });

    ipcMain.handle('open-file', async (_e, o = {}) => {
      const r = await dialog.showOpenDialog(win, { title: o.title || 'Abrir', properties: ['openFile'], filters: filtersFor(o.accept) });
      if (r.canceled || !r.filePaths.length) return null;
      const fp = r.filePaths[0];
      const buf = await fs.promises.readFile(fp);
      return { name: path.basename(fp), path: fp, binary: !!o.binary, data: o.binary ? new Uint8Array(buf) : buf.toString('utf8') };
    });

    ipcMain.handle('save-file', async (_e, o = {}) => {
      let fp = o.path;
      if (!fp) {
        const r = await dialog.showSaveDialog(win, { title: 'Salvar', defaultPath: path.join(app.getPath('documents'), o.name || 'arquivo'), filters: filtersFor(o.accept) });
        if (r.canceled || !r.filePath) return null;
        fp = r.filePath;
      }
      const d = o.data;
      const buf = typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d instanceof ArrayBuffer ? new Uint8Array(d) : d);
      await fs.promises.writeFile(fp, buf);
      return fp;
    });

    const autosavePath = () => path.join(app.getPath('userData'), 'recuperacao.urbis');
    ipcMain.handle('autosave', async (_e, text) => { await fs.promises.writeFile(autosavePath(), text, 'utf8'); return true; });
    ipcMain.handle('read-autosave', async () => { try { return await fs.promises.readFile(autosavePath(), 'utf8'); } catch { return null; } });
    ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(String(t)); });

    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
