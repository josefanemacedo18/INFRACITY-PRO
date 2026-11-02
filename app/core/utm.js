// URBIS - conversão UTM <-> geográficas, elipsoide GRS80 (SIRGAS 2000)
// Série de Krüger (precisão milimétrica dentro do fuso).

const a = 6378137.0;
const f = 1 / 298.257222101; // GRS80
const k0 = 0.9996;
const E0 = 500000;
const N0_SOUTH = 10000000;

const n = f / (2 - f);
const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
const alpha = [
  n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180,
  13 * n * n / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440,
  61 * n ** 3 / 240 - 103 * n ** 4 / 140,
  49561 * n ** 4 / 161280,
];
const beta = [
  n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96 - n ** 4 / 360,
  n * n / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440,
  17 * n ** 3 / 480 - 37 * n ** 4 / 840,
  4397 * n ** 4 / 161280,
];
const delta = [
  2 * n - 2 * n * n / 3 - 2 * n ** 3 + 116 * n ** 4 / 45,
  7 * n * n / 3 - 8 * n ** 3 / 5 - 227 * n ** 4 / 45,
  56 * n ** 3 / 15 - 136 * n ** 4 / 35,
  4279 * n ** 4 / 630,
];
const e = 2 * Math.sqrt(n) / (1 + n); // excentricidade

export function centralMeridian(zone) { return (zone * 6 - 183) * Math.PI / 180; }

export function zoneFromLon(lonDeg) { return Math.floor((lonDeg + 180) / 6) + 1; }

/** Geográficas (graus) -> UTM. hemisphere: 'S' ou 'N'. */
export function geoToUtm(latDeg, lonDeg, zone = zoneFromLon(lonDeg), hemisphere = latDeg < 0 ? 'S' : 'N') {
  const phi = latDeg * Math.PI / 180;
  const lam = lonDeg * Math.PI / 180 - centralMeridian(zone);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xiP = Math.atan2(t, Math.cos(lam));
  const etaP = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xiP, eta = etaP;
  for (let j = 1; j <= 4; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += alpha[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  const E = E0 + k0 * A * eta;
  const N = (hemisphere === 'S' ? N0_SOUTH : 0) + k0 * A * xi;
  return { E, N, zone, hemisphere };
}

/** UTM -> geográficas (graus). */
export function utmToGeo(E, N, zone, hemisphere = 'S') {
  const xi = (N - (hemisphere === 'S' ? N0_SOUTH : 0)) / (k0 * A);
  const eta = (E - E0) / (k0 * A);
  let xiP = xi, etaP = eta;
  for (let j = 1; j <= 4; j++) {
    xiP -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  let phi = chi;
  for (let j = 1; j <= 4; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  const lam = centralMeridian(zone) + Math.atan2(Math.sinh(etaP), Math.cos(xiP));
  return { lat: phi * 180 / Math.PI, lon: lam * 180 / Math.PI };
}

/** Fator de escala aproximado no ponto (útil para relatórios). */
export function pointScaleFactor(E) {
  const x = (E - E0) / (k0 * a);
  return k0 * (1 + x * x / 2 + x ** 4 / 24);
}

export function fmtLatLon(deg, isLat) {
  const hemi = isLat ? (deg < 0 ? 'S' : 'N') : (deg < 0 ? 'W' : 'E');
  let d = Math.abs(deg);
  const D = Math.floor(d);
  const M = Math.floor((d - D) * 60);
  const S = ((d - D) * 60 - M) * 60;
  return `${D}°${String(M).padStart(2, '0')}'${S.toFixed(3).replace('.', ',').padStart(6, '0')}" ${hemi}`;
}
