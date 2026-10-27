/**
 * Réglage rapide : `pnpm --filter @outlaw/sim tune '{"enemyScale":{"hp":0.6,"atk":1.3}}'`
 * applique ces valeurs à balance.json en mémoire et affiche le rythme par donjon (sans écrire).
 */
import { loadContent } from '@outlaw/data';
import { pacing } from './pacing';

const content = loadContent();
const patch = JSON.parse(process.argv[2] ?? '{}') as Record<string, unknown>;
const balance = { ...content.balance, ...patch };
const tuned = { ...content, balance };
const report = pacing(tuned, Number(process.argv[3] ?? 12), 1);
if (process.argv[4] === 'brief') {
  const fights = report.rows.filter((r) => /_f\d$/.test(r.scenario));
  console.log(
    `${process.argv[2] ?? ''} expert ${(report.expertRate * 100).toFixed(0)} % moyen ${(report.averageRate * 100).toFixed(0)} % | ${fights.map((f) => f.avgPlayer.toFixed(0)).join(' ')} | pb ${report.problems.length}`,
  );
  process.exit(0);
}
for (const row of report.rows) {
  if (row.scenario.includes('minus')) continue;
  console.log(
    `${row.scenario.padEnd(40)} win ${(row.winRate * 100).toFixed(0).padStart(3)} %  joueur ${row.avgPlayer.toFixed(1).padStart(5)} [${row.minPlayer}-${row.maxPlayer}]`,
  );
}
console.log(
  `expert ${(report.expertRate * 100).toFixed(0)} %, moyen ${(report.averageRate * 100).toFixed(0)} %`,
);
console.log(report.problems.join('\n'));
