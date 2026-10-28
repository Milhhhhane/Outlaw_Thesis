/**
 * pnpm sim:pvp                         → mesure l'équilibrage du PVP et propose des ajustements
 * pnpm sim:pvp --samples 4 --mirror-samples 60 --seed 1
 *                                      → jeux de builds croisés, builds miroirs par composition, graine
 * pnpm sim:pvp --level 20              → niveau des héros (30 par défaut)
 * pnpm sim:pvp --teams 24              → compositions mesurées (échantillon à graine fixe au-delà)
 *
 * Aucun fichier n'est écrit et rien n'est appliqué : c'est un rapport, pas un test de régression.
 */
import { loadContent } from '@outlaw/data';
import { evaluatePvp, formatReport } from './pvp';

const argv = process.argv.slice(2);
const option = (name: string, fallback: number): number => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number(argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const content = loadContent();
const started = performance.now();
const report = evaluatePvp(content, {
  samples: option('--samples', 4),
  teams: option('--teams', 24),
  mirrorSamples: option('--mirror-samples', 60),
  seed: option('--seed', 1),
  level: option('--level', content.balance.progression.maxLevel),
});
process.stdout.write(formatReport(report));
console.error(`${((performance.now() - started) / 1000).toFixed(1)} s`);
