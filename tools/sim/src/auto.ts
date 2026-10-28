/**
 * Force du bouton « Auto » : pour chaque donjon, au niveau conseillé, des équipes tirées au hasard
 * jouées par l'expert (anticipation d'un coup), par le joueur moyen et par `autoAction`. Chaque
 * ligne donne la part d'équipes qui terminent le donjon (tous les combats gagnés, PV pleins à chaque
 * combat comme dans `pacing`). Lecture seule, ne touche pas à `baseline.csv`.
 * `pnpm --filter @outlaw/sim auto [runs]`
 */
import { loadContent } from '@outlaw/data';
import { autoAction, compileEncounter, compileTeam } from '@outlaw/engine';
import { randomBuild } from './builds';
import { average, lookahead, type Policy } from './policy';
import { createRng } from './rng';
import { runBattle } from './run';

/** Taille des équipes mesurées : à changer avec le moteur (voir docs/BALANCE.md). */
const TEAM_SIZE = 3;

const content = loadContent();
const runs = Number(process.argv[2] ?? 40);
const kinds = ['expert', 'moyen', 'auto'] as const;
const totals = { expert: 0, moyen: 0, auto: 0 };

console.log('donjon              niv  expert  moyen   auto');
content.dungeons.forEach((dungeon, d) => {
  const rng = createRng(1 + 97 * d);
  const heroes = content.heroes.map((h) => h.id);
  const cleared = { expert: 0, moyen: 0, auto: 0 };
  for (let i = 0; i < runs; i++) {
    const team = rng.shuffle(heroes).slice(0, TEAM_SIZE);
    const builds = team.map((hero) => randomBuild(content, hero, dungeon.recommendedLevel, rng));
    const party = compileTeam(content, builds, 'player', dungeon.modifier);
    for (const kind of kinds) {
      let won = 0;
      dungeon.encounters.forEach((encounter, e) => {
        const policy: Policy =
          kind === 'expert' ? lookahead : kind === 'moyen' ? average(1 + 1000 * i + e) : autoAction;
        const foes = compileEncounter(
          content,
          encounter.enemies,
          dungeon.recommendedLevel,
          dungeon.modifier,
          encounter.hpPct,
          encounter.atkPct,
        );
        const outcome = runBattle({ units: [...party, ...foes] }, content.balance, policy);
        if (outcome.result.winner === 'player') won++;
      });
      if (won === dungeon.encounters.length) cleared[kind]++;
    }
  }
  const pct = (kind: (typeof kinds)[number]): string =>
    `${((100 * cleared[kind]) / runs).toFixed(0).padStart(4)} %`;
  for (const kind of kinds) totals[kind] += cleared[kind] / runs;
  console.log(
    `${dungeon.id.padEnd(20)}${String(dungeon.recommendedLevel).padStart(3)}  ${pct('expert')}  ${pct('moyen')}  ${pct('auto')}`,
  );
});
const mean = (kind: (typeof kinds)[number]): string =>
  `${((100 * totals[kind]) / content.dungeons.length).toFixed(0)} %`;
console.log(
  `moyenne : expert ${mean('expert')}, moyen ${mean('moyen')}, auto ${mean('auto')} (${runs} équipes par donjon)`,
);
