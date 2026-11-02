// URBIS - vista 3D (Three.js): terreno, corredores, sinalização e entorno

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { store } from './store.js';
import { sideComponents, templateWidths } from '../core/template.js';
import { signInfo } from '../core/signage.js';

const MAT_COLORS = {
  pista: 0x3c4148, acostamento: 0x50565e, estacionamento: 0x464b52, ciclovia: 0x8a3b3b, sarjeta: 0x9a9a9a,
  meiofio: 0xd8d8d8, passeio: 0xb9b0a0, canteiro: 0x4f7d3c, generico: 0x707780, median: 0x4f7d3c,
  cut: 0x9b6a45, fill: 0x7f8f4d, ditch: 0x7a7a7a,
};

function pip(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.insertBefore(this.renderer.domElement, container.firstChild);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4030, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-300, 500, 200);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this._built = null;
    this._alive = true;
    this.resize();
    const loop = () => {
      if (!this._alive) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  destroy() {
    this._alive = false;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.controls.dispose();
    this._clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _clear() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  /** Reconstrói a cena quando o projeto/modo muda. */
  update() {
    const key = store.results;
    const mode = store.ui.mode;
    if (this._built === key && this._mode === mode) return;
    const first = this._built == null;
    this._built = key; this._mode = mode;
    this._clear();
    const pres = mode === 'apresentacao';
    this.renderer.shadowMap.enabled = pres;
    this.scene.background = new THREE.Color(pres ? 0xa9cdee : 0x10141a);
    this.scene.fog = pres ? new THREE.Fog(0xa9cdee, 900, 4000) : null;
    const p = store.project;
    // origem local
    let G = null;
    const sdef = p.surfaces[0];
    const sf = sdef ? store.model.surface(p, sdef.id) : null;
    if (sf && sf.stats.triangles) G = { x: (sf.stats.minX + sf.stats.maxX) / 2, y: (sf.stats.minY + sf.stats.maxY) / 2, z: sf.stats.minZ };
    else if (p.roads[0]?.pis[0]) G = { x: p.roads[0].pis[0].x, y: p.roads[0].pis[0].y, z: 0 };
    if (!G) return;
    this.G = G;
    const L = (x, y, z) => new THREE.Vector3(x - G.x, z - G.z, -(y - G.y));
    // pegadas dos corredores (para recortar o terreno)
    const footprints = [];
    for (const r of store.results.roads) {
      if (!r.corridor || !r.corridor.sections.length) continue;
      const al = r.alignment;
      const left = [], right = [];
      for (const sc of r.corridor.sections) {
        const dl = sc.left.daylight.pts, dr = sc.right.daylight.pts;
        const oL = dl.length ? dl[dl.length - 1].o : sc.left.edge.o;
        const oR = dr.length ? dr[dr.length - 1].o : sc.right.edge.o;
        left.push(al.offsetPoint(sc.s, -oL)); right.push(al.offsetPoint(sc.s, oR));
      }
      footprints.push([...right, ...left.reverse()]);
    }
    if (sf && sf.stats.triangles) this._terrain(sf, L, footprints, pres);
    for (const r of store.results.roads) if (r.corridor) this._corridor(r, L, pres);
    this._parcels(sf, L);
    // enquadramento inicial
    if (first || this._needFit) {
      this._needFit = false;
      const b = sf && sf.stats.triangles ? sf.stats : null;
      const span = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 400;
      const zc = b ? (b.minZ + b.maxZ) / 2 - G.z : 0;
      this.controls.target.set(0, zc, 0);
      this.camera.position.set(-span * 0.55, span * 0.55, span * 0.75);
      this.camera.far = span * 20;
      this.camera.updateProjectionMatrix();
      this.sun.position.set(-span * 0.6, span, span * 0.4);
      const sc = this.sun.shadow.camera;
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.far = span * 4;
      this.sun.shadow.mapSize.set(2048, 2048);
    }
    this.sun.castShadow = pres;
  }

  fit() { this._needFit = true; this._built = null; this.update(); }

  _terrain(sf, L, footprints, pres) {
    const T = sf.triangles, C = sf.coords, Z = sf.z;
    const pos = [], col = [];
    const zmin = sf.stats.minZ, zmax = sf.stats.maxZ, dz = Math.max(1, zmax - zmin);
    const c = new THREE.Color();
    const hyp = (z) => {
      const t = (z - zmin) / dz;
      if (pres) return c.setHSL(0.27 - t * 0.05, 0.42, 0.33 + t * 0.12);
      return c.setHSL(0.33 - t * 0.28, 0.45, 0.30 + t * 0.15);
    };
    for (let t = 0; t < sf.active.length; t++) {
      if (!sf.active[t]) continue;
      const a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
      let hidden = false;
      for (const fp of footprints) {
        if (pip(C[2 * a] + sf.ox, C[2 * a + 1] + sf.oy, fp) && pip(C[2 * b] + sf.ox, C[2 * b + 1] + sf.oy, fp) && pip(C[2 * d] + sf.ox, C[2 * d + 1] + sf.oy, fp)) { hidden = true; break; }
      }
      if (hidden) continue;
      for (const v of [a, d, b]) {
        const q = L(C[2 * v] + sf.ox, C[2 * v + 1] + sf.oy, Z[v]);
        pos.push(q.x, q.y, q.z);
        hyp(Z[v]);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = pres;
    this.group.add(mesh);
  }

  _corridor(r, L, pres) {
    const al = r.alignment;
    const secs = r.corridor.sections;
    const keysOf = (sc) => sc.top.map((p) => ({ key: p.code === 'EIXO' ? 'EIXO' : (p.o < 0 ? 'L:' : 'R:') + p.code, p }));
    const pos = [], col = [];
    const c = new THREE.Color();
    const typeOf = (code) => code.replace(/^[LR]:/, '').replace(/[0-9]+(_FACE)?$/, '');
    for (let i = 1; i < secs.length; i++) {
      const A = keysOf(secs[i - 1]), B = keysOf(secs[i]);
      const bIndex = new Map(B.map((k, j) => [k.key, j]));
      for (let j = 1; j < A.length; j++) {
        const k1 = A[j - 1].key, k2 = A[j].key;
        const j1 = bIndex.get(k1), j2 = bIndex.get(k2);
        if (j1 == null || j2 == null || j2 !== j1 + 1) continue;
        const outer = A[j].p.o > 0 || k2 === 'EIXO' ? k2 : k1;
        let t = typeOf(outer === 'EIXO' ? k1 : outer);
        let colr = MAT_COLORS[t];
        if (t === 'OFFSET') {
          const side = outer.startsWith('L:') ? 'L' : 'R';
          colr = secs[i].slopeType[side] === 'corte' ? MAT_COLORS.cut : MAT_COLORS.fill;
        } else if (t.startsWith('VALETA')) colr = MAT_COLORS.ditch;
        else if (t === 'CANTEIRO_CENTRAL' || (k1 === 'EIXO' && typeOf(k2) === 'CANTEIRO_CENTRAL') || (k2 === 'EIXO' && typeOf(k1) === 'CANTEIRO_CENTRAL')) colr = MAT_COLORS.median;
        if (colr == null) colr = MAT_COLORS.generico;
        c.setHex(colr);
        const sa = secs[i - 1].s, sb = secs[i].s;
        const P = (s, q) => { const w = al.offsetPoint(s, q.o); return L(w.x, w.y, q.z); };
        const a1 = P(sa, A[j - 1].p), a2 = P(sa, A[j].p), b1 = P(sb, B[j1].p), b2 = P(sb, B[j2].p);
        for (const v of [a1, b1, a2, a2, b1, b2]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = pres; mesh.receiveShadow = pres;
    this.group.add(mesh);
    // sinalização horizontal
    if (r.markings && store.ui.layers.signage) {
      for (const ln of r.markings.lines) {
        const pts = [];
        const offs = ln.double ? [ln.offset - 0.12, ln.offset + 0.12] : [ln.offset];
        for (const o of offs) {
          const seg = [];
          for (const q of al.offsetLine(o, 4)) {
            const z = r.profile.elevationAt(q.s) + 0.03 + slopeAtOffset(r, q.s, o);
            seg.push(L(q.x, q.y, z));
          }
          pts.push(seg);
        }
        const color = ln.color === 'amarela' ? 0xf5c400 : 0xf2f2f2;
        for (const seg of pts) {
          const geo = new THREE.BufferGeometry().setFromPoints(seg);
          const mat = ln.dashed ? new THREE.LineDashedMaterial({ color, dashSize: ln.dash.dash, gapSize: ln.dash.gap }) : new THREE.LineBasicMaterial({ color });
          const line = new THREE.Line(geo, mat);
          if (ln.dashed) line.computeLineDistances();
          this.group.add(line);
        }
      }
    }
    // placas
    if (r.signs && store.ui.layers.signage) {
      const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6);
      for (const sg of r.signs) {
        const w = al.offsetPoint(sg.s, sg.offset ?? 5);
        const zt = r.profile.elevationAt(sg.s) + 0.15;
        const base = L(w.x, w.y, zt);
        const pm = new THREE.Mesh(pole, new THREE.MeshLambertMaterial({ color: 0x9a9a9a }));
        pm.position.set(base.x, base.y + 1.3, base.z);
        this.group.add(pm);
        const info = signInfo(sg.code);
        const dim = sg.dim || 0.5;
        const shape = info.shape;
        const geo = shape === 'circulo' ? new THREE.CircleGeometry(dim / 2, 24) : shape === 'octogono' ? new THREE.CircleGeometry(dim * 1.2, 8) : new THREE.PlaneGeometry(dim, dim);
        const color = shape === 'losango' ? 0xf5c400 : shape === 'octogono' ? 0xd32f2f : shape === 'retangulo' ? 0x1565c0 : 0xffffff;
        const plate = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
        plate.position.set(base.x, base.y + 2.7, base.z);
        plate.rotation.y = -w.az + Math.PI;
        if (shape === 'losango') plate.rotation.z = Math.PI / 4;
        this.group.add(plate);
      }
    }
    // árvores nos passeios (apresentação)
    if (pres) {
      const comps = sideComponents(r.road.template, 'R');
      if (comps.some((c2) => c2.type === 'passeio')) {
        const w = templateWidths(r.road.template);
        const off = w.right - 0.8;
        const trunk = new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6);
        const crown = new THREE.IcosahedronGeometry(1.8, 0);
        const tm = new THREE.MeshLambertMaterial({ color: 0x6b4f2e });
        const cm = new THREE.MeshLambertMaterial({ color: 0x3f7a35 });
        for (let s = al.startStation + 6; s < al.endStation - 6; s += 12) {
          for (const sgn of [-1, 1]) {
            const q = al.offsetPoint(s, sgn * off);
            const z = r.profile.elevationAt(s) + 0.17;
            const b = L(q.x, q.y, z);
            const t1 = new THREE.Mesh(trunk, tm); t1.position.set(b.x, b.y + 1.1, b.z); t1.castShadow = true; this.group.add(t1);
            const t2 = new THREE.Mesh(crown, cm); t2.position.set(b.x, b.y + 3.2, b.z); t2.castShadow = true; this.group.add(t2);
          }
        }
      }
    }
  }

  _parcels(sf, L) {
    const res = store.results.parcels;
    if (!res || !store.ui.layers.lots) return;
    const drape = (pts, color, lift = 0.4) => {
      const seg = [];
      const ring = [...pts, pts[0]];
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
          const z = (sf && sf.elevationAt(x, y)) ?? this.G.z;
          seg.push(L(x, y, z + lift));
        }
      }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color })));
    };
    for (const l of res.lots || []) drape(l.polygon, 0xffffff, 0.3);
    if (store.project.parcels.gleba) drape(store.project.parcels.gleba, 0xd46bd8, 0.6);
  }

  screenshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
}

function slopeAtOffset(r, s, o) {
  // aproximação da cota da superfície de projeto no afastamento (declividade da pista)
  const sl = r.corridor?.superelevation?.slopeAt(s);
  if (!sl) return -0.02 * Math.abs(o);
  return (o < 0 ? sl.L : sl.R) * Math.abs(o);
}
