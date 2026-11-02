// URBIS - quantitativos consolidados e orçamento

const GROUP_ORDER = ['Terraplenagem', 'Pavimentação', 'Drenagem superficial', 'Drenagem profunda', 'Obras complementares', 'Sinalização horizontal', 'Sinalização vertical', 'Loteamento'];

/** Quantitativos da rede de galerias. */
export function drainageQuantities(dr, road) {
  const items = [];
  if (!dr || !dr.pipes?.length) return items;
  const byD = new Map();
  let exc = 0, backfill = 0, bedding = 0;
  for (const p of dr.pipes) {
    byD.set(p.D, (byD.get(p.D) || 0) + p.length);
    const w = p.D + 0.6;
    const h = (p.depthUp + p.depthDn) / 2;
    exc += p.length * w * h;
    backfill += p.length * w * h - p.length * Math.PI * ((p.D + 0.1) ** 2) / 4;
    bedding += p.length * w * 0.10;
  }
  for (const [D, L] of [...byD.entries()].sort((a, b) => a[0] - b[0])) {
    items.push({ group: 'Drenagem profunda', code: `DRP-T${Math.round(D * 1000)}`, description: `Tubo de concreto para águas pluviais Ø ${Math.round(D * 1000)} mm (NBR 8890), assentado`, unit: 'm', qty: L });
  }
  const nPV = dr.network.nodes.length;
  const avgDepth = dr.pipes.reduce((s, p) => s + (p.depthUp + p.depthDn) / 2, 0) / dr.pipes.length;
  items.push({ group: 'Drenagem profunda', code: 'DRP-PV', description: `Poço de visita (PV) com tampão, profundidade média ${avgDepth.toFixed(2).replace('.', ',')} m`, unit: 'un', qty: nPV });
  const inlets = Math.max(nPV - 1, 0) * (road?.drainage?.side === 'both' ? 2 : 1);
  items.push({ group: 'Drenagem profunda', code: 'DRP-BL', description: 'Boca de lobo simples com grelha, ligada ao PV', unit: 'un', qty: inlets });
  items.push({ group: 'Drenagem profunda', code: 'DRP-EXC', description: 'Escavação mecânica de vala', unit: 'm³', qty: exc });
  items.push({ group: 'Drenagem profunda', code: 'DRP-LAS', description: 'Lastro de brita para assentamento (e = 10 cm)', unit: 'm³', qty: bedding });
  items.push({ group: 'Drenagem profunda', code: 'DRP-REA', description: 'Reaterro compactado de vala', unit: 'm³', qty: Math.max(0, backfill) });
  return items;
}

/** Itens de quantitativo de todas as vias (por via). */
export function collectItems(project, results) {
  const out = [];
  for (const r of results.roads || []) {
    const via = r.road.name;
    for (const q of r.quantities || []) out.push({ ...q, via });
    for (const q of r.signageItems || []) out.push({ ...q, via });
    for (const q of drainageQuantities(r.drainage, r.road)) out.push({ ...q, via });
  }
  const P = results.parcels;
  if (P && P.lots && P.lots.length) {
    out.push({ group: 'Loteamento', code: 'LOT-01', description: 'Demarcação de lotes com marcos de concreto (vértices)', unit: 'un', qty: P.lots.reduce((s, l) => s + l.sides.length, 0), via: 'Loteamento' });
  }
  return out;
}

/** Orçamento: agrega itens iguais e aplica preços unitários e BDI. */
export function collectBudget(project, results) {
  const items = collectItems(project, results);
  const map = new Map();
  for (const it of items) {
    const key = `${it.code}|${it.description}|${it.unit}`;
    const cur = map.get(key) || { group: it.group, code: it.code, description: it.description, unit: it.unit, qty: 0 };
    cur.qty += it.qty;
    map.set(key, cur);
  }
  const prices = project.budget?.prices || {};
  const groups = [];
  const all = [...map.values()].map((it) => ({ ...it, price: +prices[it.code] || 0 })).map((it) => ({ ...it, total: it.qty * it.price }));
  const names = [...new Set(all.map((i) => i.group))].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99 * (GROUP_ORDER.indexOf(a) < 0)) - (GROUP_ORDER.indexOf(b) + 99 * (GROUP_ORDER.indexOf(b) < 0)));
  for (const name of names) {
    const its = all.filter((i) => i.group === name);
    groups.push({ name, items: its, subtotal: its.reduce((s, i) => s + i.total, 0) });
  }
  const direct = groups.reduce((s, g) => s + g.subtotal, 0);
  const bdi = project.budget?.bdi ?? 0;
  return { groups, direct, bdi, total: direct * (1 + bdi), items: all };
}
