/**
 * pnpm --filter @outlaw/sim boss [équipes] : dégâts infligés au boss de la semaine par difficulté
 * (lecture seule) : quantiles 10/25/50/75/90 % par joueur, part des combats qui atteignent chaque
 * palier, et les règles de `targets.boss`.
 */
import { loadContent } from '@outlaw/data';
import { bossSim, quantile, reach } from './boss';

const content = loadContent();
const runs = Number(process.argv[2] ?? 16);
const started = performance.now();
const report = bossSim(content, Number.isInteger(runs) && runs > 0 ? runs : 16, 1);
console.log(
  'diff. | joueur           | q10 / q25 / q50 / q75 / q90          | paliers atteints (%)  | boss tombé',
);
for (const s of report.samples) {
  const d = content.balance.boss.difficulties[s.difficulty - 1];
  const q = [0.1, 0.25, 0.5, 0.75, 0.9].map((x) => String(quantile(s.damage, x)).padStart(6));
  const tiers = (d?.thresholds ?? []).map((t) => (reach(s, t) * 100).toFixed(0).padStart(3));
  console.log(
    `${String(s.difficulty).padStart(5)} | ${s.who.padEnd(16)} | ${q.join(' /')} | ${tiers.join(' /')} | ${String(s.kills)}/${String(s.damage.length)}`,
  );
}
console.log(report.problems.length === 0 ? 'Règles du boss tenues.' : report.problems.join('\n'));
console.log(`${((performance.now() - started) / 1000).toFixed(1)} s`);
