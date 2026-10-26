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
import { sprint0Scenarios } from './scenarios';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'baseline.csv');
const outPath = join(root, 'out', 'results.csv');

const args = new Set(process.argv.slice(2));
const csv = toCsv(sprint0Scenarios(loadContent().balance));

if (args.has('--check')) {
  const baseline = readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
  if (baseline !== csv) {
    console.error('La simulation diffère de baseline.csv.');
    console.error('Résultat obtenu :\n' + csv);
    console.error('Si le changement est voulu : pnpm sim --update, puis commiter baseline.csv.');
    process.exit(1);
  }
  console.log('Simulation conforme à baseline.csv.');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, csv);
  if (args.has('--update')) writeFileSync(baselinePath, csv);
  process.stdout.write(csv);
}
