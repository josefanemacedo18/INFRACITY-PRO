import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Model } from '../app/core/model.js';
import { sampleProject } from '../app/core/sample.js';
import { serializeProject, parseProject, designSnapshot, restoreDesign } from '../app/core/project.js';

test('projeto exemplo: cálculo completo sem erros de execução', () => {
  const p = sampleProject();
  const m = new Model();
  const t0 = Date.now();
  const r = m.computeAll(p);
  const ms = Date.now() - t0;
  assert.equal(r.roads.length, 4);
  for (const rr of r.roads) {
    assert.ok(!rr.error, rr.error?.stack);
    assert.ok(rr.alignment.ok, rr.alignment.errors.join('; '));
    assert.ok(rr.profile.ok, rr.profile.errors.join('; '));
    assert.ok(rr.corridor.sections.length > 5);
    assert.ok(rr.corridor.totals.cut + rr.corridor.totals.fill > 0, 'há movimentação de terra');
    assert.ok(rr.quantities.length > 5);
  }
  const av = r.roads[0];
  assert.ok(av.drainage && av.drainage.pipes.length > 0, 'rede de drenagem');
  assert.ok(av.signs.length >= 2, 'placas sugeridas');
  assert.ok(r.parcels && r.parcels.blocks.length >= 1, 'quadras geradas a partir das vias');
  // erros de projeto gerados pelo greide automático/raios automáticos devem ser nulos
  const errors = r.roads.flatMap((rr) => rr.checks.filter((c) => c.level === 'erro').map((c) => `${rr.road.name}: ${c.msg}`));
  assert.deepEqual(errors, [], 'o exemplo deve sair sem erros normativos');
  assert.ok(ms < 8000, `tempo de cálculo ${ms} ms`);
});

test('arquivo .urbis: ida e volta e versões de projeto', () => {
  const p = sampleProject();
  const text = serializeProject(p);
  const q = parseProject(text);
  assert.equal(q.roads.length, 4);
  assert.equal(q.surfaces[0].points.length, p.surfaces[0].points.length);
  const snap = designSnapshot(q);
  q.roads[0].name = 'Alterada';
  const back = restoreDesign(q, snap);
  assert.equal(back.roads[0].name, 'Avenida Principal');
  assert.equal(back.surfaces, q.surfaces, 'superfícies preservadas');
  assert.throws(() => parseProject('{"x":1}'));
});
