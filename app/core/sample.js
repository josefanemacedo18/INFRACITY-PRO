// URBIS - projeto exemplo (terreno sintético em UTM 23S, SIRGAS 2000)

import { newProject, newRoad } from './project.js';
import { uid } from './util.js';

export const SAMPLE_ORIGIN = { E: 684200, N: 7466300 };

/** Terreno ondulado com um vale (córrego) atravessando a área. */
export function sampleTerrainPoints(opts = {}) {
  const { E, N } = SAMPLE_ORIGIN;
  const W = opts.width ?? 700, H = opts.height ?? 560, step = opts.step ?? 10;
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const z = (x, y) => {
    const base = 812 + 0.018 * x + 0.010 * y;
    const hill1 = 14 * Math.exp(-(((x - 180) ** 2) / (2 * 120 ** 2) + ((y - 380) ** 2) / (2 * 110 ** 2)));
    const hill2 = 9 * Math.exp(-(((x - 560) ** 2) / (2 * 90 ** 2) + ((y - 150) ** 2) / (2 * 100 ** 2)));
    const valleyY = 260 + 40 * Math.sin(x / 140);
    const valley = -7 * Math.exp(-((y - valleyY) ** 2) / (2 * 35 ** 2));
    const ripple = 0.6 * Math.sin(x / 23) * Math.cos(y / 31);
    return base + hill1 + hill2 + valley + ripple;
  };
  const pts = [];
  let k = 1;
  for (let x = 0; x <= W; x += step) {
    for (let y = 0; y <= H; y += step) {
      const jx = (rnd() - 0.5) * step * 0.6, jy = (rnd() - 0.5) * step * 0.6;
      const px = x + jx, py = y + jy;
      pts.push({ name: String(k++), x: E + px, y: N + py, z: Math.round(z(px, py) * 1000) / 1000, desc: 'TN' });
    }
  }
  return pts;
}

export function sampleProject() {
  const p = newProject({ meta: { name: 'Projeto exemplo - Avenida e loteamento', client: 'Cliente exemplo', location: 'Área de teste (terreno sintético)', company: 'Escritório', author: '', zone: 23, hemisphere: 'S' } });
  const pts = sampleTerrainPoints();
  const flat = [];
  for (const q of pts) flat.push(q.x, q.y, q.z);
  const sid = uid('sup');
  p.surfaces.push({ id: sid, rev: 1, name: 'Terreno natural (exemplo)', maxEdge: 25, points: flat, breaklines: [], source: 'Exemplo sintético' });
  const { E, N } = SAMPLE_ORIGIN;
  const av = newRoad(p, {
    name: 'Avenida Principal', classKey: 'arterial', surfaceId: sid,
    pis: [{ x: E + 30, y: N + 50 }, { x: E + 220, y: N + 195 }, { x: E + 500, y: N + 230 }, { x: E + 690, y: N + 420 }],
  });
  p.roads.push(av);
  const rua = newRoad(p, {
    name: 'Rua A', classKey: 'local', surfaceId: sid,
    pis: [{ x: E + 326, y: N + 556 }, { x: E + 345, y: N + 330 }, { x: E + 360, y: N + 228 }],
  });
  p.roads.push(rua);
  p.roads.push(newRoad(p, {
    name: 'Rua B', classKey: 'local', surfaceId: sid,
    pis: [{ x: E + 455, y: N + 556 }, { x: E + 470, y: N + 241 }],
  }));
  p.roads.push(newRoad(p, {
    name: 'Rua C', classKey: 'local', surfaceId: sid,
    pis: [{ x: E + 339, y: N + 425 }, { x: E + 605, y: N + 432 }],
  }));
  av.drainage.enabled = true;
  av.signage.crosswalks.push({ s: 240 });
  p.parcels.gleba = [
    { x: E + 280, y: N + 260 }, { x: E + 560, y: N + 300 }, { x: E + 600, y: N + 540 }, { x: E + 300, y: N + 545 },
  ].map((q) => ({ x: q.x, y: q.y }));
  return p;
}
