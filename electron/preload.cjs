// URBIS - ponte segura entre a interface e o sistema de arquivos
const { contextBridge, ipcRenderer } = require('electron');

function toArrayBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

contextBridge.exposeInMainWorld('urbisHost', {
  openFile: async (o) => {
    const r = await ipcRenderer.invoke('open-file', o);
    if (r && r.binary && r.data) return { ...r, data: toArrayBuffer(r.data) };
    return r;
  },
  saveFile: (o) => ipcRenderer.invoke('save-file', o),
  autosave: (text) => ipcRenderer.invoke('autosave', text),
  readAutosave: () => ipcRenderer.invoke('read-autosave'),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  on: (name, fn) => ipcRenderer.on('host:' + name, (_e, payload) => fn(payload)),
});
