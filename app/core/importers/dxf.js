// URBIS - leitor de DXF (ASCII) focado em topografia
// Lê POINT, INSERT (+ATTRIB), TEXT, MTEXT, LINE, LWPOLYLINE, POLYLINE/VERTEX e 3DFACE.

/** Decodifica bytes de DXF: UTF-8 ou Windows-1252. */
export function decodeDxfBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 22));
  if (head.startsWith('AutoCAD Binary DXF')) throw new Error('DXF binário não suportado. Salve como DXF ASCII.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

function readPairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) { i -= 1; continue; } // tenta ressincronizar
    pairs.push([code, lines[i + 1]]);
  }
  return pairs;
}

function cleanMText(s) {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .trim();
}

/** Converte texto em número de cota, se for numérico (aceita vírgula). */
export function textToElevation(s) {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/\s/g, '');
  const m = t.match(/^[-+]?\d+(?:[.,]\d+)?$/);
  if (!m) return NaN;
  return Number(t.replace(',', '.'));
}

/**
 * Faz a leitura do DXF.
 * @returns {{entities: object[], layers: Record<string, object>, warnings: string[]}}
 */
export function parseDxf(text) {
  const pairs = readPairs(text);
  const entities = [];
  const warnings = [];
  let i = 0;
  // localiza seção ENTITIES
  let inEntities = false;
  const N = pairs.length;
  while (i < N) {
    const [c, v] = pairs[i];
    if (c === 0 && v.trim() === 'SECTION') {
      const name = pairs[i + 1] && pairs[i + 1][0] === 2 ? pairs[i + 1][1].trim() : '';
      inEntities = name === 'ENTITIES';
      i += 2;
      continue;
    }
    if (c === 0 && v.trim() === 'ENDSEC') { inEntities = false; i++; continue; }
    if (!inEntities || c !== 0) { i++; continue; }
    // entidade
    const type = v.trim();
    const groups = [];
    i++;
    while (i < N && pairs[i][0] !== 0) { groups.push(pairs[i]); i++; }
    const ent = parseEntity(type, groups);
    if (type === 'POLYLINE') {
      ent.vertices = [];
      while (i < N && pairs[i][0] === 0 && pairs[i][1].trim() === 'VERTEX') {
        const vg = [];
        i++;
        while (i < N && pairs[i][0] !== 0) { vg.push(pairs[i]); i++; }
        const vx = parseEntity('VERTEX', vg);
        if (!(vx.flags & 128) || (vx.flags & 64)) ent.vertices.push(vx.p);
      }
      if (i < N && pairs[i][1].trim() === 'SEQEND') { i++; while (i < N && pairs[i][0] !== 0) i++; }
    } else if (type === 'INSERT') {
      ent.attribs = [];
      while (i < N && pairs[i][0] === 0 && pairs[i][1].trim() === 'ATTRIB') {
        const ag = [];
        i++;
        while (i < N && pairs[i][0] !== 0) { ag.push(pairs[i]); i++; }
        const at = parseEntity('ATTRIB', ag);
        ent.attribs.push({ tag: at.tag, value: at.text, p: at.p });
      }
      if (i < N && pairs[i][1].trim() === 'SEQEND') { i++; while (i < N && pairs[i][0] !== 0) i++; }
    }
    if (ent.type) entities.push(ent);
  }
  const layers = summarizeLayers(entities);
  if (!entities.length) warnings.push('Nenhuma entidade encontrada na seção ENTITIES.');
  return { entities, layers, warnings };
}

/** Resumo por camada (contagens e faixa de cotas). */
export function summarizeLayers(entities) {
  const layers = {};
  for (const e of entities) {
    const L = layers[e.layer] || (layers[e.layer] = { name: e.layer, points: 0, inserts: 0, texts: 0, numericTexts: 0, lines: 0, polylines: 0, polylines3d: 0, faces: 0, withZ: 0, total: 0, zMin: Infinity, zMax: -Infinity });
    L.total++;
    const zs = [];
    switch (e.type) {
      case 'POINT': L.points++; zs.push(e.p.z); break;
      case 'INSERT': L.inserts++; zs.push(e.p.z); for (const a of e.attribs || []) { const z = textToElevation(a.value); if (Number.isFinite(z)) zs.push(z); } break;
      case 'TEXT': case 'MTEXT': L.texts++; if (Number.isFinite(textToElevation(e.text))) { L.numericTexts++; } break;
      case 'LINE': L.lines++; zs.push(e.p1.z, e.p2.z); break;
      case 'LWPOLYLINE': L.polylines++; zs.push(e.elevation); break;
      case 'POLYLINE': if (e.is3d) L.polylines3d++; else L.polylines++; for (const v of e.vertices) zs.push(e.is3d ? v.z : e.elevation); break;
      case '3DFACE': L.faces++; for (const v of e.pts) zs.push(v.z); break;
    }
    const nz = zs.filter((z) => Number.isFinite(z) && Math.abs(z) > 1e-9);
    if (nz.length) { L.withZ++; for (const z of nz) { if (z < L.zMin) L.zMin = z; if (z > L.zMax) L.zMax = z; } }
  }
  return layers;
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

function parseEntity(type, groups) {
  const e = { type, layer: '0' };
  const get = (code) => { for (const [c, v] of groups) if (c === code) return v; return undefined; };
  e.layer = (get(8) ?? '0').trim();
  switch (type) {
    case 'POINT':
      e.p = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      break;
    case 'VERTEX':
      e.p = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      e.flags = parseInt(get(70) ?? '0', 10) || 0;
      break;
    case 'INSERT':
      e.block = (get(2) ?? '').trim();
      e.p = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      break;
    case 'ATTRIB':
      e.tag = (get(2) ?? '').trim();
      e.text = (get(1) ?? '').trim();
      e.p = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      break;
    case 'TEXT': {
      e.text = (get(1) ?? '').trim();
      const h = parseInt(get(72) ?? '0', 10) || 0, vv = parseInt(get(73) ?? '0', 10) || 0;
      const has11 = get(11) !== undefined;
      e.p = (h || vv) && has11 ? { x: num(get(11)), y: num(get(21)), z: num(get(31)) } : { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      break;
    }
    case 'MTEXT': {
      let t = '';
      for (const [c, v] of groups) if (c === 3 || c === 1) t += v;
      e.text = cleanMText(t);
      e.p = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      break;
    }
    case 'LINE':
      e.p1 = { x: num(get(10)), y: num(get(20)), z: num(get(30)) };
      e.p2 = { x: num(get(11)), y: num(get(21)), z: num(get(31)) };
      break;
    case 'LWPOLYLINE': {
      e.elevation = num(get(38));
      e.closed = ((parseInt(get(70) ?? '0', 10) || 0) & 1) === 1;
      e.vertices = [];
      let cur = null;
      for (const [c, v] of groups) {
        if (c === 10) { cur = { x: num(v), y: 0 }; e.vertices.push(cur); } else if (c === 20 && cur) cur.y = num(v);
      }
      break;
    }
    case 'POLYLINE': {
      const flags = parseInt(get(70) ?? '0', 10) || 0;
      e.is3d = (flags & 8) === 8;
      e.isMesh = (flags & 16) === 16 || (flags & 64) === 64;
      e.closed = (flags & 1) === 1;
      e.elevation = num(get(30));
      break;
    }
    case '3DFACE':
      e.pts = [0, 1, 2, 3].map((k) => ({ x: num(get(10 + k)), y: num(get(20 + k)), z: num(get(30 + k)) }));
      break;
    default:
      return {}; // ignora outras entidades
  }
  return e;
}

/** Sugestão de uso por camada: camadas com dados 3D entram por padrão. */
export function suggestLayerUse(layers) {
  const out = {};
  for (const [name, L] of Object.entries(layers)) {
    out[name] = {
      use: L.withZ > 0,
      texts: L.numericTexts > 0 && L.withZ === 0 && L.numericTexts >= L.texts * 0.8,
    };
  }
  return out;
}

/**
 * Extrai pontos e linhas de quebra do DXF lido.
 * @param {*} parsed resultado de parseDxf
 * @param {{layers?: Record<string,{use:boolean, texts?:boolean}>, contourBreaklines?: boolean, weed?: number}} opts
 */
export function extractTopography(parsed, opts = {}) {
  const use = opts.layers || suggestLayerUse(parsed.layers);
  const weed = opts.weed ?? 0.5;
  const contourBreaklines = opts.contourBreaklines ?? true;
  const points = [];
  const breaklines = [];
  let contours = 0;
  const weedLine = (pts) => {
    if (weed <= 0 || pts.length < 3) return pts;
    const out = [pts[0]];
    for (let k = 1; k < pts.length - 1; k++) {
      const q = out[out.length - 1];
      if (Math.hypot(pts[k].x - q.x, pts[k].y - q.y) >= weed) out.push(pts[k]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const addLine = (pts, closed) => {
    let p = weedLine(pts);
    if (closed && p.length > 2) p = [...p, p[0]];
    if (contourBreaklines) breaklines.push(p);
    else for (const v of p) points.push({ x: v.x, y: v.y, z: v.z });
  };
  for (const e of parsed.entities) {
    const u = use[e.layer];
    if (!u || (!u.use && !u.texts)) continue;
    switch (e.type) {
      case 'POINT':
        if (u.use) points.push({ x: e.p.x, y: e.p.y, z: e.p.z, desc: e.layer });
        break;
      case 'INSERT': {
        if (!u.use) break;
        let z = e.p.z;
        if (!(Math.abs(z) > 1e-9)) {
          const pref = (e.attribs || []).find((a) => /cota|elev|alt|^z$/i.test(a.tag) && Number.isFinite(textToElevation(a.value)));
          const any = pref || (e.attribs || []).find((a) => Number.isFinite(textToElevation(a.value)) && !/^(n|num|ponto|pt|id)$/i.test(a.tag));
          if (any) z = textToElevation(any.value);
        }
        const nameAttr = (e.attribs || []).find((a) => /^(n|num|ponto|pt|id|nome)$/i.test(a.tag));
        if (Math.abs(z) > 1e-9) points.push({ x: e.p.x, y: e.p.y, z, name: nameAttr ? nameAttr.value : undefined, desc: e.block });
        break;
      }
      case 'TEXT': case 'MTEXT': {
        if (!u.texts) break;
        const z = textToElevation(e.text);
        if (Number.isFinite(z)) points.push({ x: e.p.x, y: e.p.y, z, desc: 'texto' });
        break;
      }
      case 'LINE':
        if (u.use && Math.abs(e.p1.z) > 1e-9 && Math.abs(e.p2.z) > 1e-9) breaklines.push([e.p1, e.p2]);
        break;
      case 'LWPOLYLINE':
        if (u.use && Math.abs(e.elevation) > 1e-9 && e.vertices.length >= 2) {
          addLine(e.vertices.map((v) => ({ x: v.x, y: v.y, z: e.elevation })), e.closed);
          contours++;
        }
        break;
      case 'POLYLINE':
        if (!u.use || e.isMesh || e.vertices.length < 2) break;
        if (e.is3d) breaklines.push(e.closed ? [...e.vertices, e.vertices[0]] : e.vertices);
        else if (Math.abs(e.elevation) > 1e-9) { addLine(e.vertices.map((v) => ({ x: v.x, y: v.y, z: e.elevation })), e.closed); contours++; }
        break;
      case '3DFACE':
        if (u.use) for (const v of e.pts) points.push({ x: v.x, y: v.y, z: v.z });
        break;
    }
  }
  return { points, breaklines, contours };
}

/** Polilinhas 2D (para contorno de gleba, eixos etc.). */
export function extractPolylines(parsed, layerFilter) {
  const out = [];
  for (const e of parsed.entities) {
    if (layerFilter && !layerFilter(e.layer)) continue;
    if (e.type === 'LWPOLYLINE') out.push({ layer: e.layer, closed: e.closed, pts: e.vertices.map((v) => ({ x: v.x, y: v.y })) });
    else if (e.type === 'POLYLINE' && !e.isMesh) out.push({ layer: e.layer, closed: e.closed, pts: e.vertices.map((v) => ({ x: v.x, y: v.y })) });
    else if (e.type === 'LINE') out.push({ layer: e.layer, closed: false, pts: [{ x: e.p1.x, y: e.p1.y }, { x: e.p2.x, y: e.p2.y }] });
  }
  return out;
}
