// URBIS - utilitários gerais (formatação pt-BR, estacas, ângulos)

export const EPS = 1e-9;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

let _uidCounter = 0;
export function uid(prefix = 'id') {
  _uidCounter = (_uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${_uidCounter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Normaliza ângulo para o intervalo (-PI, PI]. */
export function normAngle(a) {
  a = a % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  else if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** Normaliza azimute para [0, 2PI). */
export function normAz(a) {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

/** Lê número aceitando vírgula ou ponto como separador decimal. */
export function parseNum(v, fallback = NaN) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (v == null) return fallback;
  let s = String(v).trim();
  if (!s) return fallback;
  s = s.replace(/\s/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // o último separador é o decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Formata número no padrão brasileiro. */
export function fmt(v, dec = 2, opts = {}) {
  if (!isNum(v)) return opts.empty ?? '-';
  const s = v.toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: opts.group ?? true,
  });
  return s === '-0' || /^-0,0*$/.test(s) ? s.slice(1) : s;
}

/** Formata percentual a partir de valor decimal (0.025 -> "2,50%"). */
export function fmtPct(v, dec = 2) {
  if (!isNum(v)) return '-';
  return fmt(v * 100, dec, { group: false }) + '%';
}

/** Estaca no formato brasileiro: 245.4 m -> "12 + 5,40" (estacas de 20 m). */
export function fmtStation(s, interval = 20, dec = 2) {
  if (!isNum(s)) return '-';
  const neg = s < 0;
  let a = Math.abs(s);
  let est = Math.floor((a + 1e-7) / interval);
  let rest = a - est * interval;
  if (rest < 0) rest = 0;
  // evita "12 + 20,00" por arredondamento
  const p = Math.pow(10, dec);
  if (Math.round(rest * p) / p >= interval) { est += 1; rest = 0; }
  return `${neg ? '-' : ''}${est} + ${fmt(rest, dec, { group: false })}`;
}

/** Lê estaca "12+5,40", "12 + 5.4" ou metros simples "245,4". */
export function parseStation(text, interval = 20) {
  if (typeof text === 'number') return text;
  const s = String(text ?? '').trim();
  if (!s) return NaN;
  const m = s.match(/^(-?)\s*(\d+)\s*\+\s*([\d.,]+)$/);
  if (m) {
    const est = Number(m[2]);
    const rest = parseNum(m[3]);
    const v = est * interval + rest;
    return m[1] === '-' ? -v : v;
  }
  return parseNum(s);
}

/** Ângulo em graus, minutos e segundos: 123°45'06,2" */
export function fmtDMS(rad, secDec = 1, signed = false) {
  if (!isNum(rad)) return '-';
  const neg = rad < 0;
  let d = Math.abs(rad) / DEG;
  let deg = Math.floor(d);
  let minF = (d - deg) * 60;
  let min = Math.floor(minF);
  let sec = (minF - min) * 60;
  const p = Math.pow(10, secDec);
  sec = Math.round(sec * p) / p;
  if (sec >= 60) { sec -= 60; min += 1; }
  if (min >= 60) { min -= 60; deg += 1; }
  const secStr = fmt(sec, secDec, { group: false }).padStart(secDec > 0 ? 3 + secDec : 2, '0');
  return `${neg && signed ? '-' : ''}${deg}°${String(min).padStart(2, '0')}'${secStr}"`;
}

/** Azimute (rad) formatado em DMS no intervalo 0-360. */
export function fmtAz(rad) { return fmtDMS(normAz(rad), 1); }

export function deepClone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

/** Busca binária: maior índice i tal que arr[i][key] <= v */
export function bisectRight(arr, v, key) {
  let lo = 0, hi = arr.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][key] <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Interpolação linear em tabela [[x,y],...] ordenada por x (com extrapolação limitada). */
export function interpTable(table, x) {
  if (!table.length) return NaN;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return NaN;
}

export function sum(arr, fn = (v) => v) { let s = 0; for (const v of arr) s += fn(v); return s; }

export function roundTo(v, step) { return Math.round(v / step) * step; }
