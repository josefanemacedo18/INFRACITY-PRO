// URBIS - importação de pontos topográficos em texto (CSV, TXT, PRN)
// Formatos no padrão usual de levantamento: PNEZD, PENZD, NEZ, ENZ etc.

export const POINT_FORMATS = {
  PNEZD: ['name', 'y', 'x', 'z', 'desc'],
  PENZD: ['name', 'x', 'y', 'z', 'desc'],
  PNEZ: ['name', 'y', 'x', 'z'],
  PENZ: ['name', 'x', 'y', 'z'],
  NEZD: ['y', 'x', 'z', 'desc'],
  ENZD: ['x', 'y', 'z', 'desc'],
  NEZ: ['y', 'x', 'z'],
  ENZ: ['x', 'y', 'z'],
  PXYZD: ['name', 'x', 'y', 'z', 'desc'],
};

export const FORMAT_LABELS = {
  PNEZD: 'Ponto, Norte, Este, Cota, Descrição',
  PENZD: 'Ponto, Este, Norte, Cota, Descrição',
  PNEZ: 'Ponto, Norte, Este, Cota',
  PENZ: 'Ponto, Este, Norte, Cota',
  NEZD: 'Norte, Este, Cota, Descrição',
  ENZD: 'Este, Norte, Cota, Descrição',
  NEZ: 'Norte, Este, Cota',
  ENZ: 'Este, Norte, Cota',
  PXYZD: 'Ponto, X, Y, Z, Descrição',
};

function splitBy(line, delim) {
  if (delim === 'ws') return line.trim().split(/\s+/);
  // separador simples respeitando aspas
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === delim && !q) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toNum(s, decimal) {
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  if (decimal === ',') t = t.replace(/\./g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/** Detecta separador de campos e separador decimal. */
export function detectDialect(lines) {
  const sample = lines.filter((l) => l.trim()).slice(0, 40);
  const candidates = [
    { delim: '\t', decimal: '.' }, { delim: '\t', decimal: ',' },
    { delim: ';', decimal: ',' }, { delim: ';', decimal: '.' },
    { delim: ',', decimal: '.' },
    { delim: 'ws', decimal: '.' }, { delim: 'ws', decimal: ',' },
  ];
  let best = null, bestScore = -1;
  for (const c of candidates) {
    let score = 0;
    for (const l of sample) {
      const f = splitBy(l, c.delim);
      const nums = f.filter((v) => Number.isFinite(toNum(v, c.decimal))).length;
      if (nums >= 3) score += nums;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Sugere o formato a partir dos valores (faixa de Este UTM 100.000 a 900.000; Norte do hemisfério sul > 1.000.000). */
export function detectFormat(rows) {
  const numericCols = [];
  const ncol = Math.max(...rows.map((r) => r.length));
  for (let c = 0; c < ncol; c++) {
    const vals = rows.map((r) => r[c]).filter((v) => Number.isFinite(v));
    numericCols.push(vals.length >= rows.length * 0.8 ? vals : null);
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const isE = (m) => m >= 100000 && m <= 900000;
  const isNs = (m) => m > 1000000 && m <= 10000000;
  const meds = numericCols.map((v) => (v ? median(v) : null));
  const eIdx = meds.findIndex((m) => m != null && isE(m));
  const nIdx = meds.findIndex((m) => m != null && isNs(m));
  const hasName = meds[0] == null || (meds[0] != null && !isE(meds[0]) && !isNs(meds[0]) && ncol >= 4 && (eIdx > 0 || nIdx > 0));
  const hasDesc = ncol >= (hasName ? 5 : 4) && meds[ncol - 1] == null;
  if (eIdx >= 0 && nIdx >= 0) {
    const nFirst = nIdx < eIdx;
    const key = (hasName ? 'P' : '') + (nFirst ? 'NE' : 'EN') + 'Z' + (hasDesc ? 'D' : '');
    if (POINT_FORMATS[key]) return key;
  }
  return hasName ? (hasDesc ? 'PNEZD' : 'PNEZ') : (hasDesc ? 'NEZD' : 'NEZ');
}

/**
 * Lê arquivo texto de pontos.
 * @returns {{points:{name,x,y,z,desc}[], format, delimiter, decimal, skipped:number, total:number, errors:string[]}}
 */
export function parsePointsText(text, opts = {}) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const dialect = opts.delimiter && opts.delimiter !== 'auto'
    ? { delim: opts.delimiter, decimal: opts.decimal && opts.decimal !== 'auto' ? opts.decimal : (opts.delimiter === ',' ? '.' : ',') }
    : detectDialect(lines);
  if (opts.decimal && opts.decimal !== 'auto') dialect.decimal = opts.decimal;
  const rawRows = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*(#|\/\/)/.test(l)) continue;
    const f = splitBy(l, dialect.delim);
    rawRows.push({ line: i + 1, fields: f, nums: f.map((v) => toNum(v, dialect.decimal)) });
  }
  const dataRows = rawRows.filter((r) => r.nums.filter(Number.isFinite).length >= 3);
  const format = opts.format && opts.format !== 'auto' ? opts.format : detectFormat(dataRows.slice(0, 200).map((r) => r.nums));
  const cols = POINT_FORMATS[format] || POINT_FORMATS.PNEZD;
  const points = [];
  const errors = [];
  let skipped = rawRows.length - dataRows.length;
  for (const r of dataRows) {
    const p = {};
    let ok = true;
    cols.forEach((key, c) => {
      if (key === 'name' || key === 'desc') p[key] = r.fields[c] ?? '';
      else {
        const v = r.nums[c];
        if (!Number.isFinite(v)) ok = false;
        p[key] = v;
      }
    });
    if (cols.includes('desc') && r.fields.length > cols.length) p.desc = r.fields.slice(cols.length - 1).join(' ');
    if (!ok) { skipped++; if (errors.length < 20) errors.push(`Linha ${r.line}: valores inválidos.`); continue; }
    points.push(p);
  }
  return { points, format, delimiter: dialect.delim, decimal: dialect.decimal, skipped, total: rawRows.length, errors };
}

/** Exporta pontos em texto PNEZD (separador ;). */
export function pointsToText(points) {
  return points.map((p, i) => [p.name || i + 1, p.y.toFixed(3), p.x.toFixed(3), p.z.toFixed(3), p.desc || ''].join(';')).join('\r\n');
}
