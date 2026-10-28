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
const csv = toCsv([
  ...sprint0Scenarios(content.balance),
  ...randomBattles(content, { battles: option('--battles', 1000), seed: option('--seed', 1) }),
  ...dungeonRows(content, option('--runs', 40), option('--seed', 1)),
  ...rules.rows,
  ...pace.rows,
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
);
// « Aucun héros indispensable » est mesuré et affiché mais ne bloque pas : l'écart vient des
// héros eux-mêmes, que ce lot ne doit pas toucher (voir docs/BALANCE.md).
const rulesOk = rules.r1.ok && rules.r2.ok && pace.problems.length === 0;
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
