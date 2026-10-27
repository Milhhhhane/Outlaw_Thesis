import type { Content, Dungeon } from '@outlaw/data';
import { compileTeam, type HeroBuild } from '@outlaw/engine';
import { randomBuild } from './builds';
import { runDungeon } from './dungeons';
import { lookahead } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Règles d'équilibre du rapport, mesurées sur les 20 équipes possibles (3 héros parmi 6) :
 *  - R1 : à niveau égal, le meilleur build bat le pire build de la même équipe (duels miroirs,
 *    chaque camp joué par la politique d'anticipation, dans les deux sens) dans ≥ r1MinWinRate.
 *  - R2 : avec r2LevelGap niveaux de retard, le meilleur build termine le donjon pour plus de
 *    r2MinWinRate des équipes, pour chaque donjon où ce retard est possible.
 *  - Aucun héros indispensable : la meilleure équipe sans un héros donné reste à moins de
 *    dispensableMaxGapPoints points de la meilleure équipe (part des donjons terminés).
 * « Meilleur » et « pire » build : parmi `samples` builds tirés au hasard, classés par combats
 * gagnés dans le donjon puis par rapidité.
 */

export function teams(content: Content): string[][] {
  const ids = content.heroes.map((h) => h.id);
  const result: string[][] = [];
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++)
      for (let c = b + 1; c < ids.length; c++) result.push([ids[a], ids[b], ids[c]] as string[]);
  return result;
}

interface Ranked {
  readonly builds: HeroBuild[];
  readonly won: number;
  readonly cleared: boolean;
  readonly score: number;
}

function rank(
  content: Content,
  dungeon: Dungeon,
  team: readonly string[],
  level: number,
  samples: number,
  seed: number,
): Ranked[] {
  const rng = createRng(seed);
  const ranked: Ranked[] = [];
  for (let i = 0; i < samples; i++) {
    const builds = team.map((hero) => randomBuild(content, hero, level, rng));
    const run = runDungeon(content, dungeon.id, builds, lookahead);
    ranked.push({
      builds,
      won: run.won,
      cleared: run.cleared,
      score: run.won * 10000 - run.actions,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** Duel miroir : `a` côté héros contre `b` côté adverse ; vrai si `a` gagne. */
function duel(content: Content, a: readonly HeroBuild[], b: readonly HeroBuild[]): boolean {
  const setup = {
    units: [...compileTeam(content, a, 'player'), ...compileTeam(content, b, 'enemy')],
  };
  return runBattle(setup, content.balance, lookahead).result.winner === 'player';
}

/** Taille du groupe de référence des duels de R1. */
const REFERENCE = 4;

/** Meilleur et pire de `samples` builds, classés par victoires contre un groupe de référence. */
function duelExtremes(
  content: Content,
  team: readonly string[],
  level: number,
  samples: number,
  seed: number,
) {
  const rng = createRng(seed);
  const draw = (): HeroBuild[] => team.map((hero) => randomBuild(content, hero, level, rng));
  const reference = Array.from({ length: REFERENCE }, draw);
  const scored = Array.from({ length: samples }, () => {
    const builds = draw();
    let wins = 0;
    for (const other of reference) {
      if (duel(content, builds, other)) wins++;
      if (!duel(content, other, builds)) wins++;
    }
    return { builds, wins };
  }).sort((a, b) => b.wins - a.wins);
  const best = scored[0];
  const worst = scored.at(-1);
  if (best === undefined || worst === undefined || same(best.builds, worst.builds)) return null;
  return { best: best.builds, worst: worst.builds };
}

const same = (a: readonly HeroBuild[], b: readonly HeroBuild[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export interface RulesReport {
  readonly rows: ScenarioRow[];
  readonly r1: { readonly rate: number; readonly ok: boolean };
  readonly r2: { readonly worst: number; readonly ok: boolean };
  readonly dispensable: { readonly gap: number; readonly hero: string; readonly ok: boolean };
}

const outcome = (won: boolean): BattleOutcome => ({
  result: { winner: won ? 'player' : 'enemy', reason: 'annihilation' },
  actions: 0,
});

export function evaluateRules(content: Content, samples: number, seed: number): RulesReport {
  const { targets } = content.balance;
  const all = teams(content);
  const duels: BattleOutcome[] = [];
  const r1Rows: ScenarioRow[] = [];
  const r2Rows: ScenarioRow[] = [];
  // Score d'une équipe : donjons terminés au niveau conseillé et avec le retard de R2.
  const clears = new Map<string, number>();
  const tests = new Map<string, number>();

  content.dungeons.forEach((dungeon, d) => {
    const level = dungeon.recommendedLevel;
    const behind = level - targets.r2LevelGap;
    const r2: BattleOutcome[] = [];
    const local: BattleOutcome[] = [];
    all.forEach((team, t) => {
      const best = rank(content, dungeon, team, level, samples, seed + 1000 * d + t)[0];
      if (best === undefined) return;
      const key = team.join('+');
      tests.set(key, (tests.get(key) ?? 0) + 1);
      clears.set(key, (clears.get(key) ?? 0) + (best.cleared ? 1 : 0));
      // R1 : meilleur et pire build jugés au duel, contre un groupe de référence qu'ils ne
      // rencontrent qu'une fois classés ; puis ils s'affrontent dans les deux sens.
      const pair = duelExtremes(content, team, level, samples, seed + 3000 * d + t);
      if (pair !== null) {
        local.push(outcome(duel(content, pair.best, pair.worst)));
        local.push(outcome(!duel(content, pair.worst, pair.best)));
      }
      if (behind >= 1) {
        const late = rank(content, dungeon, team, behind, samples, seed + 1000 * d + t + 500)[0];
        r2.push(outcome(late?.cleared === true));
        tests.set(key, (tests.get(key) ?? 0) + 1);
        clears.set(key, (clears.get(key) ?? 0) + (late?.cleared === true ? 1 : 0));
      }
    });
    if (r2.length > 0) r2Rows.push(summarize(`r2_${dungeon.id}`, r2));
    if (local.length > 0) r1Rows.push(summarize(`r1_${dungeon.id}`, local));
    duels.push(...local);
  });

  const r1Row = summarize('r1_best_vs_worst_duels', duels);
  const scores = [...clears.entries()].map(([key, n]) => ({
    team: key.split('+'),
    rate: n / (tests.get(key) ?? 1),
  }));
  const total = Math.max(...tests.values());
  const asRow = (name: string, rate: number): ScenarioRow =>
    summarize(
      name,
      Array.from({ length: total }, (_, i) => outcome(i < Math.round(rate * total))),
    );
  const best = Math.max(...scores.map((s) => s.rate));
  const heroRows = content.heroes.map((hero) => {
    const without = Math.max(...scores.filter((s) => !s.team.includes(hero.id)).map((s) => s.rate));
    return { hero: hero.id, without, row: asRow(`best_team_without_${hero.id}`, without) };
  });
  const worstGap = heroRows.reduce(
    (acc, h) =>
      (best - h.without) * 100 > acc.gap ? { gap: (best - h.without) * 100, hero: h.hero } : acc,
    { gap: 0, hero: '' },
  );
  const r2Worst = Math.min(...r2Rows.map((r) => r.winRate));

  return {
    rows: [r1Row, ...r1Rows, ...r2Rows, asRow('best_team', best), ...heroRows.map((h) => h.row)],
    r1: { rate: r1Row.winRate, ok: r1Row.winRate >= targets.r1MinWinRate },
    r2: { worst: r2Worst, ok: r2Worst > targets.r2MinWinRate },
    dispensable: { ...worstGap, ok: worstGap.gap <= targets.dispensableMaxGapPoints },
  };
}
