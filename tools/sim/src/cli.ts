/**
 * pnpm sim            → écrit tools/sim/out/results.csv et l'affiche
 * pnpm sim --check    → échoue si le résultat diffère de tools/sim/baseline.csv (test de régression)
 * pnpm sim --update   → remplace la référence (après un changement d'équilibrage voulu)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '@outlaw/data';
import { toCsv } from './run';
import { dungeonRows } from './dungeons';
import { pacing } from './pacing';
import { evaluateRules } from './rules';
import { randomBattles, sprint0Scenarios } from './scenarios';
import { tiers } from './tiers';
import { towerSim } from './tower';
import { awakenAll, awakeningGap, essenceSim } from './awakening';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'baseline.csv');
const outPath = join(root, 'out', 'results.csv');

const argv = process.argv.slice(2);
const args = new Set(argv);
const option = (name: string, fallback: number): number => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number(argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const content = loadContent();
const started = performance.now();
const rules = evaluateRules(content, option('--samples', 6), option('--seed', 1));
const pace = pacing(content, option('--pace-runs', 48), option('--seed', 1));
const tier = tiers(content, option('--tier-runs', 48), option('--seed', 1));
// 32 équipes par étage : 1 600 combats, une dizaine de secondes (sim:check doit rester rapide).
const tower = towerSim(content, option('--tower-runs', 32), option('--seed', 1));
// Éveil : écart d'un héros éveillé (16 équipes par donjon tardif), donjons d'essence, et les règles
// avec tous les héros éveillés (R1 sur 4 équipes : les duels coûtent cher).
const gap = awakeningGap(content, option('--awakening-runs', 16), option('--seed', 1));
const essence = essenceSim(content, option('--essence-runs', 32), option('--seed', 1));
const awake = evaluateRules(content, option('--samples', 6), option('--seed', 1), {
  dress: awakenAll,
  r1Teams: 4,
  prefix: 'awake_',
});
const csv = toCsv([
  ...sprint0Scenarios(content.balance),
  ...randomBattles(content, { battles: option('--battles', 1000), seed: option('--seed', 1) }),
  ...dungeonRows(content, option('--runs', 40), option('--seed', 1)),
  ...rules.rows,
  ...pace.rows,
  ...tier.rows,
  ...tower.rows,
  ...gap.rows,
  ...essence.rows,
  ...awake.rows,
]);
const { targets } = content.balance;
const verdicts: string[] = [
  `R1 ${rules.r1.ok ? 'tenue' : 'NON TENUE'} : meilleur build ${(rules.r1.rate * 100).toFixed(0)} % contre le pire (cible ≥ ${targets.r1MinWinRate * 100} %)`,
  `R2 ${rules.r2.ok ? 'tenue' : 'NON TENUE'} : pire donjon ${(rules.r2.worst * 100).toFixed(0)} % avec ${targets.r2LevelGap} niveaux de retard (cible > ${targets.r2MinWinRate * 100} %)`,
  `Aucun héros indispensable ${rules.dispensable.ok ? 'tenue' : 'NON TENUE'} : écart maximal ${rules.dispensable.gap.toFixed(0)} points (cible ≤ ${targets.dispensableMaxGapPoints})`,
];
const viable = [...rules.viability].sort((a, b) => a.best - b.best);
verdicts.push(
  `Meilleure équipe avec chaque héros : de ${(100 * (viable[0]?.best ?? 0)).toFixed(0)} % (${viable[0]?.hero ?? ''}) à ${(100 * (viable.at(-1)?.best ?? 0)).toFixed(0)} % (${viable.at(-1)?.hero ?? ''}), ${String(rules.teams)} équipes mesurées`,
);
verdicts.push(
  `Rythme et difficulté ${pace.problems.length === 0 ? 'tenus' : 'NON TENUS'} : expert ${(pace.expertRate * 100).toFixed(0)} %, joueur moyen ${(pace.averageRate * 100).toFixed(0)} % au niveau conseillé`,
  ...pace.problems.map((p) => `  - ${p}`),
  `Paliers ${tier.problems.length === 0 ? 'tenus' : 'NON TENUS'} : expert par donjon et palier ${Object.entries(
    tier.rates,
  )
    .map(([id, rates]) => `${id} ${rates.map((r) => (r * 100).toFixed(0)).join('/')}`)
    .join(', ')}`,
  ...tier.problems.map((p) => `  - ${p}`),
  `Tour ${tower.problems.length === 0 ? 'tenue' : 'NON TENUE'} : expert par étage ${tower.rates.map((r) => (r * 100).toFixed(0)).join('/')}`,
  ...tower.problems.map((p) => `  - ${p}`),
  `Éveil ${gap.problems.length === 0 ? 'tenu' : 'NON TENU'} : écart maximal ${gap.worst.gap.toFixed(0)} points (${gap.worst.hero}, cible ≤ ${String(targets.awakening.maxGapPoints)}), moyenne ${(gap.gaps.reduce((a, g) => a + g.gap, 0) / Math.max(1, gap.gaps.length)).toFixed(1)}`,
  ...gap.problems.map((p) => `  - ${p}`),
  `Donjons d'essence ${essence.problems.length === 0 ? 'tenus' : 'NON TENUS'} : expert par palier ${essence.rates.map((e) => `${e.id} ${e.rates.map((r) => (r * 100).toFixed(0)).join('/')}`).join(', ')}`,
  ...essence.problems.map((p) => `  - ${p}`),
  `Tous éveillés : R1 ${awake.r1.ok ? 'tenue' : 'NON TENUE'} (${(awake.r1.rate * 100).toFixed(0)} %), R2 ${awake.r2.ok ? 'tenue' : 'NON TENUE'} (${(awake.r2.worst * 100).toFixed(0)} %), aucun héros indispensable ${awake.dispensable.ok ? 'tenue' : 'NON TENUE'} (${awake.dispensable.gap.toFixed(0)} points)`,
);
// « Aucun héros indispensable » est mesuré et affiché mais ne bloque pas : l'écart vient des
// héros eux-mêmes, que ce lot ne doit pas toucher (voir docs/BALANCE.md).
const rulesOk =
  rules.r1.ok &&
  rules.r2.ok &&
  pace.problems.length === 0 &&
  tier.problems.length === 0 &&
  tower.problems.length === 0 &&
  gap.problems.length === 0 &&
  essence.problems.length === 0 &&
  awake.r1.ok &&
  awake.r2.ok &&
  awake.dispensable.ok;
const seconds = ((performance.now() - started) / 1000).toFixed(1);

if (args.has('--check')) {
  const baseline = readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
  if (baseline !== csv) {
    console.error('La simulation diffère de baseline.csv.');
    console.error('Résultat obtenu :\n' + csv);
    console.error('Si le changement est voulu : pnpm sim --update, puis commiter baseline.csv.');
    process.exit(1);
  }
  console.log(`Simulation conforme à baseline.csv (${seconds} s).`);
  for (const line of verdicts) console.log(line);
  if (!rulesOk) process.exit(1);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, csv);
  if (args.has('--update')) writeFileSync(baselinePath, csv);
  process.stdout.write(csv);
  for (const line of verdicts) console.error(line);
  console.error(`${seconds} s`);
}
