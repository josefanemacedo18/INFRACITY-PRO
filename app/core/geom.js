// URBIS - geometria plana (coordenadas E = x, N = y; azimute a partir do Norte, sentido horário)

export function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

/** Azimute de a para b, em radianos [0, 2PI). */
export function azimuth(a, b) {
  let az = Math.atan2(b.x - a.x, b.y - a.y);
  if (az < 0) az += 2 * Math.PI;
  return az;
}

/** Vetor unitário na direção do azimute. */
export function dirVec(az) { return { x: Math.sin(az), y: Math.cos(az) }; }
/** Normal à direita do sentido de caminhamento. */
export function rightVec(az) { return { x: Math.cos(az), y: -Math.sin(az) }; }
/** Normal à esquerda do sentido de caminhamento. */
export function leftVec(az) { return { x: -Math.cos(az), y: Math.sin(az) }; }

export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function mul(a, k) { return { x: a.x * k, y: a.y * k }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y; }
export function cross(a, b) { return a.x * b.y - a.y * b.x; }
export function moveAz(p, az, d) { return { x: p.x + Math.sin(az) * d, y: p.y + Math.cos(az) * d }; }

/** Área com sinal (positiva no sentido anti-horário). Aceita [{x,y}] ou [[x,y]]. */
export function signedArea(poly) {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ax = a.x ?? a[0], ay = a.y ?? a[1], bx = b.x ?? b[0], by = b.y ?? b[1];
    s += ax * by - bx * ay;
  }
  return s / 2;
}
export function polygonArea(poly) { return Math.abs(signedArea(poly)); }

export function polygonPerimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += Math.hypot((b.x ?? b[0]) - (a.x ?? a[0]), (b.y ?? b[1]) - (a.y ?? a[1]));
  }
  return s;
}

export function polygonCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  const n = poly.length;
  // referência local para precisão numérica com coordenadas UTM
  const ox = poly[0].x ?? poly[0][0], oy = poly[0].y ?? poly[0][1];
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const px = (p.x ?? p[0]) - ox, py = (p.y ?? p[1]) - oy;
    const qx = (q.x ?? q[0]) - ox, qy = (q.y ?? q[1]) - oy;
    const c = px * qy - qx * py;
    a += c; cx += (px + qx) * c; cy += (py + qy) * c;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x ?? p[0]; sy += p.y ?? p[1]; }
    return { x: sx / n, y: sy / n };
  }
  a /= 2;
  return { x: ox + cx / (6 * a), y: oy + cy / (6 * a) };
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  const x = pt.x, y = pt.y;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x ?? poly[i][0], yi = poly[i].y ?? poly[i][1];
    const xj = poly[j].x ?? poly[j][0], yj = poly[j].y ?? poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Interseção de segmentos p1-p2 e p3-p4. Retorna {x,y,t,u} ou null. */
export function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-15) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-12 || u > 1 + 1e-12) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y, t, u };
}

/** Interseção de retas (infinitas). */
export function lineIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-15) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y, t };
}

/** Ponto mais próximo em segmento a-b. */
export function closestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + t * dx, y = a.y + t * dy;
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    const x = p.x ?? p[0], y = p.y ?? p[1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Distância de ponto a polilinha (aberta). */
export function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const c = closestOnSegment(p, pts[i - 1], pts[i]);
    if (c.d < best) best = c.d;
  }
  return best;
}

/** Garante orientação anti-horária. */
export function ensureCCW(poly) { return signedArea(poly) < 0 ? poly.slice().reverse() : poly; }

/** Remove vértices duplicados/colineares de um polígono. */
export function cleanPolygon(poly, tol = 1e-6) {
  const out = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > tol) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop();
  // colineares
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      if (l > 0 && Math.abs(cr) / l < tol * 10) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}
