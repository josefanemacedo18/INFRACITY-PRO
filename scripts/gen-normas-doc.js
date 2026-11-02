// Gera docs/NORMAS.md a partir do perfil normativo (app/core/norms/brasil.js)
import { writeFileSync } from 'node:fs';
import { normTable, SOURCES, ROAD_CLASSES, SIGN_SIZES } from '../app/core/norms/brasil.js';

const status = { confirmado: 'confirmado', referencia: 'referência', pratica: 'prática' };
const lines = [];
lines.push('# Normas e parâmetros do URBIS', '');
lines.push('Documento gerado automaticamente a partir de `app/core/norms/brasil.js` (`node scripts/gen-normas-doc.js`).', '');
lines.push('Status: **confirmado** (conferido em pesquisa durante o desenvolvimento), **referência** (valor da norma citada, a conferir no documento oficial), **prática** (prática corrente de projeto, ajustável).', '');
lines.push('## Parâmetros', '');
lines.push('| Grupo | Parâmetro | Valor | Fonte | Status |', '|---|---|---|---|---|');
for (const r of normTable()) lines.push(`| ${r.grupo} | ${r.nome} | ${r.valor} | ${r.fonte} | ${status[r.status] || r.status} |`);
lines.push('', '## Classes de via (valores padrão)', '');
lines.push('| Classe | V (km/h) | Faixa (m) | Faixas por sentido | Acostamento (m) | emax | Rampa máx. | Passeio (m) |', '|---|---|---|---|---|---|---|---|');
for (const c of Object.values(ROAD_CLASSES)) lines.push(`| ${c.label} | ${c.V} | ${c.lane.toFixed(2)} | ${c.lanes[1]} | ${c.shoulder.toFixed(2)} | ${(c.emax * 100).toFixed(0)}% | ${(c.maxGrade * 100).toFixed(1)}% | ${c.sidewalk.toFixed(2)} |`);
lines.push('', '## Placas (dimensão característica, m)', '');
lines.push('| Forma | Urbana | Rodovia | Mínimo urbano | Mínimo rodovia | Status |', '|---|---|---|---|---|---|');
for (const s of Object.values(SIGN_SIZES)) lines.push(`| ${s.label} (${s.dim}) | ${s.urban.toFixed(2)} | ${s.rural.toFixed(2)} | ${s.minUrban.toFixed(2)} | ${s.minRural.toFixed(2)} | ${status[s.status]} |`);
lines.push('', '## Referências', '');
for (const s of Object.values(SOURCES)) lines.push(`- ${s}`);
lines.push('', '## Observações', '');
lines.push('- Durante o desenvolvimento, os sites gov.br e dos DERs estavam bloqueados no ambiente de pesquisa. Por isso, parte dos valores está como "referência" e deve ser conferida nos manuais oficiais (DNIT IPR-706, IPR-740, IPR-724; CONTRAN MBST).');
lines.push('- Todos os valores podem ser ajustados no código do perfil normativo. Exigências estaduais ou municipais mais restritivas prevalecem.');
lines.push('');
writeFileSync(new URL('../docs/NORMAS.md', import.meta.url), lines.join('\n'));
console.log('docs/NORMAS.md gerado');
