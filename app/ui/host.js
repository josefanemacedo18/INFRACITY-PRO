// URBIS - acesso a arquivos: aplicativo desktop (Electron) ou navegador

const host = typeof window !== 'undefined' ? window.urbisHost : null;
export const isDesktop = !!host;

/** Abre arquivo. Retorna {name, path, data} (texto ou ArrayBuffer) ou null. */
export async function openFile({ accept = [], binary = false, title } = {}) {
  if (host) return host.openFile({ accept, binary, title });
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const data = binary ? await f.arrayBuffer() : await f.text();
      resolve({ name: f.name, path: null, data });
    }, { once: true });
    input.click();
  });
}

/** Lê arquivo arrastado/selecionado do navegador. */
export async function readDroppedFile(file, binary) {
  return { name: file.name, path: file.path || null, data: binary ? await file.arrayBuffer() : await file.text() };
}

function toBlob(data, mime) {
  if (data instanceof Blob) return data;
  return new Blob([data], { type: mime || 'application/octet-stream' });
}

/** Salva arquivo. Retorna o caminho (desktop) ou o nome (navegador), ou null se cancelado. */
export async function saveFile({ name, data, mime, accept = [], path = null }) {
  if (host) {
    const payload = data instanceof Blob ? await data.arrayBuffer() : data;
    return host.saveFile({ name, data: payload, accept, path });
  }
  const url = URL.createObjectURL(toBlob(data, mime));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

export async function autosave(text) {
  try {
    if (host && host.autosave) return host.autosave(text);
    if (text.length < 4.5e6) localStorage.setItem('urbis.autosave', text);
  } catch { /* armazenamento indisponível */ }
  return null;
}

export async function readAutosave() {
  try {
    if (host && host.readAutosave) return host.readAutosave();
    return localStorage.getItem('urbis.autosave');
  } catch { return null; }
}

export function setWindowTitle(t) {
  document.title = t;
  if (host && host.setTitle) host.setTitle(t);
}

export function onHostEvent(name, fn) {
  if (host && host.on) host.on(name, fn);
}
