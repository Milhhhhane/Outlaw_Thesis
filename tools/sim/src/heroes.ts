/**
 * Force de chaque héros : pour chaque héros, `runs` équipes qui le contiennent (les trois autres
 * tirés au hasard, builds au hasard), chaque donjon joué avec r2LevelGap niveaux de retard par le
 * joueur moyen (la mesure de « aucun héros indispensable »), et au niveau conseillé par l'expert.
 * Donne la part de donjons terminés par héros, l'écart à la moyenne des héros communs, la durée
 * moyenne des combats de boss et le nombre de combats ordinaires finis sous le plancher de durée.
 * Lecture seule, ne touche pas à `baseline.csv`.
 * `pnpm --filter @outlaw/sim heroes [runs] [héros…]`
 */
import { loadContent } from '@outlaw/data';
import { compileEncounter, compileTeam } from '@outlaw/engine';
import { randomBuild } from './builds';
import { runDungeon } from './dungeons';
import { average, lookahead } from './policy';
import { createRng } from './rng';
import { runBattle } from './run';

const content = loadContent();
const runs = Number(process.argv[2] ?? 12);
const only = new Set(process.argv.slice(3));
const ids = content.heroes.map((h) => h.id);
const size = content.balance.progression.teamSize;
const gap = content.balance.targets.r2LevelGap;
const floor = content.balance.targets.pacing.floor;

interface Line {
  readonly hero: string;
  readonly tier: number;
  readonly late: number;
  readonly expert: number;
  /** Actions de joueur moyennes contre un boss (expert, niveau conseillé). */
  readonly boss: number;
  /** Combats ordinaires gagnés sous le plancher de durée (`pacing.floor`). */
  readonly fast: number;
}

const lines: Line[] = [];
content.heroes.forEach((hero, h) => {
  if (only.size > 0 && !only.has(hero.id)) return;
  let late = 0;
  let expert = 0;
  let tests = 0;
  let bossActions = 0;
  let bosses = 0;
  let fast = 0;
  content.dungeons.forEach((dungeon, d) => {
    const rng = createRng(1 + 131 * d + 7 * h);
    for (let i = 0; i < runs; i++) {
      const others = rng.shuffle(ids.filter((id) => id !== hero.id)).slice(0, size - 1);
      const team = rng.shuffle([hero.id, ...others]);
      const behind = Math.max(1, dungeon.recommendedLevel - gap);
      const builds = team.map((id) => randomBuild(content, id, behind, rng));
      if (runDungeon(content, dungeon.id, builds, average(1000 * d + i)).cleared) late++;
      const rec = team.map((id) => randomBuild(content, id, dungeon.recommendedLevel, rng));
      // Rythme : chaque combat à PV pleins, comme `pacing` ; durée des boss, combats trop courts.
      const party = compileTeam(content, rec, 'player', dungeon.modifier);
      let won = 0;
      dungeon.encounters.forEach((encounter) => {
        const foes = compileEncounter(
          content,
          encounter.enemies,
          dungeon.recommendedLevel,
          dungeon.modifier,
          encounter.hpPct,
          encounter.atkPct,
        );
        const outcome = runBattle({ units: [...party, ...foes] }, content.balance, lookahead);
        const actions = outcome.playerActions ?? 0;
        if (outcome.result.winner === 'player') won++;
        if (encounter.enemies.some((id) => content.enemyById.get(id)?.boss === true)) {
          bossActions += actions;
          bosses++;
        } else if (actions < floor) fast++;
      });
      if (won === dungeon.encounters.length) expert++;
      tests++;
    }
  });
  lines.push({
    hero: hero.id,
    tier: hero.tier,
    late: late / tests,
    expert: expert / tests,
    boss: bossActions / Math.max(1, bosses),
    fast,
  });
});

const commons = lines.filter((l) => l.tier === 1);
const mean = commons.reduce((a, l) => a + l.late, 0) / Math.max(1, commons.length);
const pct = (x: number): string => `${(100 * x).toFixed(0).padStart(4)} %`;
console.log('héros       rareté  retard (moyen)  écart  conseillé (expert)  boss  trop courts');
for (const l of [...lines].sort((a, b) => b.late - a.late)) {
  const delta = (100 * (l.late - mean)).toFixed(0);
  console.log(
    `${l.hero.padEnd(12)}${String(l.tier).padStart(4)}    ${pct(l.late)}        ${delta.padStart(4)}   ${pct(l.expert)}          ${l.boss.toFixed(1).padStart(5)}  ${String(l.fast).padStart(5)}`,
  );
}
console.log(`moyenne des communs : ${pct(mean)} (${runs} équipes par héros et par donjon)`);
