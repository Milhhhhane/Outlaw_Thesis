import type { Content } from '@outlaw/data';
import { compileEncounter, compileTeam, type HeroBuild } from '@outlaw/engine';
import { randomBuild } from './builds';
import { lookahead, novice, type Policy } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

export interface DungeonOutcome {
  readonly cleared: boolean;
  /** Combats gagnés avant la défaite (3 si le donjon est terminé). */
  readonly won: number;
  readonly actions: number;
}

/**
 * Un donjon : 3 combats d'affilée, PV et réserve remis à zéro à chaque combat, modificateur
 * appliqué aux deux camps. Les ennemis sont au niveau recommandé du donjon.
 */
export function runDungeon(
  content: Content,
  dungeonId: string,
  builds: readonly HeroBuild[],
  policy: Policy,
): DungeonOutcome {
  const dungeon = content.dungeonById.get(dungeonId);
  if (dungeon === undefined) throw new Error(`donjon inconnu : ${dungeonId}`);
  const heroes = compileTeam(content, builds, 'player', dungeon.modifier);
  let won = 0;
  let actions = 0;
  for (const encounter of dungeon.encounters) {
    const enemies = compileEncounter(
      content,
      encounter.enemies,
      dungeon.recommendedLevel,
      dungeon.modifier,
      encounter.hpPct,
    );
    const outcome = runBattle({ units: [...heroes, ...enemies] }, content.balance, policy);
    actions += outcome.actions;
    if (outcome.result.winner !== 'player') return { cleared: false, won, actions };
    won += 1;
  }
  return { cleared: true, won, actions };
}

/** Taux de réussite de chaque donjon, builds tirés au hasard, au niveau recommandé et 3 niveaux sous. */
export function dungeonRows(content: Content, runs: number, seed: number): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  const gap = content.balance.targets.r2LevelGap;
  for (const dungeon of content.dungeons) {
    for (const [label, level] of [
      ['rec', dungeon.recommendedLevel],
      [`minus${gap}`, Math.max(1, dungeon.recommendedLevel - gap)],
    ] as const) {
      const rng = createRng(seed);
      const outcomes: BattleOutcome[] = [];
      for (let i = 0; i < runs; i++) {
        const builds = content.heroes
          .slice(0, 3)
          .map((hero) => randomBuild(content, hero.id, level, rng));
        const run = runDungeon(content, dungeon.id, builds, lookahead);
        outcomes.push({
          result: { winner: run.cleared ? 'player' : 'enemy', reason: 'annihilation' },
          actions: run.actions,
        });
      }
      rows.push(summarize(`dungeon_${dungeon.id}_${label}`, outcomes));
    }
    // Débutant : sans talent, ultime ou attaque de base. Le premier donjon doit lui rester ouvert.
    const plain = content.heroes.slice(0, 3).map((hero) => ({
      hero: hero.id,
      level: dungeon.recommendedLevel,
      talents: [],
      items: [],
    }));
    const run = runDungeon(content, dungeon.id, plain, novice);
    rows.push(
      summarize(`dungeon_${dungeon.id}_novice`, [
        {
          result: { winner: run.cleared ? 'player' : 'enemy', reason: 'annihilation' },
          actions: run.actions,
        },
      ]),
    );
  }
  return rows;
}
