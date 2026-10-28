/**
 * Montée des sorts : écart « tous les sorts au maximum » contre « niveau 1 » (`spellGap`), puis,
 * avec `--rules`, R1, R2 et « aucun héros indispensable » rejoués avec tous les sorts au maximum.
 * Lecture seule, ne touche pas à `baseline.csv`.
 * `pnpm --filter @outlaw/sim skillups [--rules] [--teams N] [--builds N]`
 */
import { loadContent } from '@outlaw/data';
import { evaluateRules, TEAM_SAMPLE } from './rules';
import { withSpellLevel } from './builds';
import { spellGap } from './skillups';

const argv = process.argv.slice(2);
const option = (name: string, fallback: number): number => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number(argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
const content = loadContent();
const { targets, spellLevels } = content.balance;
const pct = (x: number): string => `${(100 * x).toFixed(1)} %`;
const started = performance.now();

const gap = spellGap(content, 1, option('--teams', TEAM_SAMPLE), option('--builds', 2));
console.log(
  `Sorts au niveau ${String(spellLevels.max)} contre niveau 1 (${String(gap.runs)} donjons) :`,
);
console.log(
  `  en retard (${String(targets.r2LevelGap)} niveaux, joueur moyen) : ${pct(gap.late.base)} → ${pct(gap.late.max)}, écart ${gap.late.gap.toFixed(1)} points (cible ≤ ${String(targets.spellLevelsMaxGapPoints)}) ${gap.ok ? 'tenue' : 'NON TENUE'}`,
);
console.log(
  `  niveau conseillé (joueur moyen) : ${pct(gap.rec.base)} → ${pct(gap.rec.max)}, écart ${gap.rec.gap.toFixed(1)} points`,
);
console.log(`  duels de la même équipe : les sorts au maximum gagnent ${pct(gap.duel)}`);

if (argv.includes('--rules')) {
  const rules = evaluateRules(content, 6, 1, {
    dress: (builds) => builds.map((b) => withSpellLevel(b, spellLevels.max)),
  });
  console.log(`Règles, tous les sorts au niveau ${String(spellLevels.max)} :`);
  console.log(
    `  R1 ${rules.r1.ok ? 'tenue' : 'NON TENUE'} : ${pct(rules.r1.rate)} (cible ≥ ${String(targets.r1MinWinRate * 100)} %)`,
  );
  console.log(`  R2 ${rules.r2.ok ? 'tenue' : 'NON TENUE'} : pire donjon ${pct(rules.r2.worst)}`);
  console.log(
    `  Aucun héros indispensable ${rules.dispensable.ok ? 'tenue' : 'NON TENUE'} : écart ${rules.dispensable.gap.toFixed(0)} points (${rules.dispensable.hero})`,
  );
}
console.log(`${((performance.now() - started) / 1000).toFixed(1)} s`);
