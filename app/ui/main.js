// URBIS - inicialização
import { html, render } from 'htm/preact';
import { App } from './app.js';
import { store } from './store.js';
import { onHostEvent } from './host.js';
import { openProjectText, actSave, actOpen, actNew } from './actions.js';

render(html`<${App} />`, document.getElementById('app'));

// eventos do aplicativo desktop (menu e abertura por duplo clique em .urbis)
onHostEvent('open-file', (file) => { try { openProjectText(file.data, { path: file.path, name: file.name }); } catch (e) { store.toast(e.message, 'err'); } });
onHostEvent('menu', (cmd) => { if (cmd === 'save') actSave(false); else if (cmd === 'saveAs') actSave(true); else if (cmd === 'open') actOpen(); else if (cmd === 'new') actNew(); });
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
