import type { Content, Dungeon } from '@outlaw/data';
import { compileTeam, type HeroBuild } from '@outlaw/engine';
import { pickTeam, randomBuild } from './builds';
import { runDungeon } from './dungeons';
import { average, lookahead } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Règles d'équilibre du rapport, mesurées sur un échantillon d'équipes (`sampleTeams`, toutes les
 * équipes possibles tant qu'il y en a au plus `TEAM_SAMPLE`, R1 sur les `R1_TEAMS` premières) :
 *  - R1 : à niveau égal, le meilleur build bat le pire build de la même équipe (duels miroirs,
 *    chaque camp joué par la politique d'anticipation, dans les deux sens) dans ≥ r1MinWinRate.
 *  - R2 : avec r2LevelGap niveaux de retard, le meilleur build termine le donjon pour plus de
 *    r2MinWinRate des équipes, pour chaque donjon où ce retard est possible.
 *  - Aucun héros indispensable : la meilleure équipe sans un héros donné reste à moins de
 *    dispensableMaxGapPoints points de la meilleure équipe. Mesure : part des donjons terminés
 *    avec r2LevelGap niveaux de retard, builds au hasard, joués par le joueur moyen (cette
 *    mesure sépare les équipes, contrairement aux victoires au niveau conseillé, toutes à 100 %).
 * « Meilleur » et « pire » build : parmi `samples` builds tirés au hasard, classés par combats
 * gagnés dans le donjon puis par rapidité.
 */

/** Toutes les équipes possibles : combinaisons de `teamSize` héros parmi ceux du jeu. */
export function teams(content: Content): string[][] {
  const ids = content.heroes.map((h) => h.id);
  const size = content.balance.progression.teamSize;
  const result: string[][] = [];
  const walk = (start: number, picked: string[]): void => {
    if (picked.length === size) {
      result.push(picked);
      return;
    }
    for (let i = start; i < ids.length; i++) walk(i + 1, [...picked, ids[i] as string]);
  };
  walk(0, []);
  return result;
}

/**
 * Équipes mesurées par les règles. 25 héros font 12 650 équipes de quatre : trop pour la CI. Au-delà
 * de `TEAM_SAMPLE` équipes possibles, on en tire `TEAM_SAMPLE` avec une graine fixe, par tours : à
 * chaque tour, les héros sont mélangés puis groupés en équipes jouables (`pickTeam` : au plus deux du
 * même rôle), si bien que chaque héros figure dans à peu près autant d'équipes que les autres. Même
 * contenu, mêmes équipes.
 * R2 et « aucun héros indispensable » portent sur tout l'échantillon (8 équipes par héros) ; R1,
 * dont les duels font l'essentiel du temps de calcul et qui compare des builds d'une même équipe,
 * sur les `R1_TEAMS` premières (deux tours de mélange : chaque héros y figure).
 */
export const TEAM_SAMPLE = 50;
export const R1_TEAMS = 12;

export function sampleTeams(content: Content, count: number, seed: number): string[][] {
  const all = teams(content);
  if (all.length <= count) return all;
  const ids = content.heroes.map((h) => h.id);
  const size = content.balance.progression.teamSize;
  const rng = createRng(seed);
  const seen = new Set<string>();
  const result: string[][] = [];
  while (result.length < count) {
    let order = rng.shuffle(ids);
    while (order.length >= size && result.length < count) {
      const picked = pickTeam(content, order, size);
      if (picked.length < size) break;
      order = order.filter((id) => !picked.includes(id));
      const team = picked.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
      const key = team.join('+');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(team);
    }
  }
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

/** Builds par équipe et par donjon pour la mesure « aucun héros indispensable ». */
const TEAM_SAMPLES = 6;

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
  /** Meilleur score d'une équipe échantillonnée qui contient chaque héros. */
  readonly viability: readonly { readonly hero: string; readonly best: number }[];
  /** Nombre d'équipes mesurées. */
  readonly teams: number;
}

const outcome = (won: boolean): BattleOutcome => ({
  result: { winner: won ? 'player' : 'enemy', reason: 'annihilation' },
  actions: 0,
});

export function evaluateRules(content: Content, samples: number, seed: number): RulesReport {
  const { targets } = content.balance;
  const all = sampleTeams(content, TEAM_SAMPLE, seed);
  const duels: BattleOutcome[] = [];
  const r1Rows: ScenarioRow[] = [];
  const r2Rows: ScenarioRow[] = [];
  // Score d'une équipe : donjons terminés en retard, par le joueur moyen.
  const clears = new Map<string, number>();
  const tests = new Map<string, number>();

  content.dungeons.forEach((dungeon, d) => {
    const level = dungeon.recommendedLevel;
    const behind = level - targets.r2LevelGap;
    const r2: BattleOutcome[] = [];
    const local: BattleOutcome[] = [];
    all.forEach((team, t) => {
      const key = team.join('+');
      // R1 : meilleur et pire build jugés au duel, contre un groupe de référence qu'ils ne
      // rencontrent qu'une fois classés ; puis ils s'affrontent dans les deux sens.
      const pair =
        t < R1_TEAMS ? duelExtremes(content, team, level, samples, seed + 3000 * d + t) : null;
      if (pair !== null) {
        local.push(outcome(duel(content, pair.best, pair.worst)));
        local.push(outcome(!duel(content, pair.worst, pair.best)));
      }
      if (behind >= 1) {
        const late = rank(content, dungeon, team, behind, samples, seed + 1000 * d + t + 500)[0];
        r2.push(outcome(late?.cleared === true));
        const rng = createRng(seed + 5000 * d + t);
        for (let k = 0; k < TEAM_SAMPLES; k++) {
          const builds = team.map((hero) => randomBuild(content, hero, behind, rng));
          const run = runDungeon(
            content,
            dungeon.id,
            builds,
            average(seed + 7000 * d + 31 * t + k),
          );
          tests.set(key, (tests.get(key) ?? 0) + 1);
          clears.set(key, (clears.get(key) ?? 0) + (run.cleared ? 1 : 0));
        }
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
    // Viabilité : la meilleure équipe échantillonnée qui contient ce héros.
    const within = Math.max(
      0,
      ...scores.filter((s) => s.team.includes(hero.id)).map((s) => s.rate),
    );
    return {
      hero: hero.id,
      without,
      within,
      row: asRow(`best_team_without_${hero.id}`, without),
      withRow: asRow(`best_team_with_${hero.id}`, within),
    };
  });
  const worstGap = heroRows.reduce(
    (acc, h) =>
      (best - h.without) * 100 > acc.gap ? { gap: (best - h.without) * 100, hero: h.hero } : acc,
    { gap: 0, hero: '' },
  );
  const r2Worst = Math.min(...r2Rows.map((r) => r.winRate));

  return {
    rows: [
      r1Row,
      ...r1Rows,
      ...r2Rows,
      asRow('best_team', best),
      ...heroRows.map((h) => h.row),
      ...heroRows.map((h) => h.withRow),
    ],
    viability: heroRows.map((h) => ({ hero: h.hero, best: h.within })),
    teams: all.length,
    r1: { rate: r1Row.winRate, ok: r1Row.winRate >= targets.r1MinWinRate },
    r2: { worst: r2Worst, ok: r2Worst > targets.r2MinWinRate },
    dispensable: { ...worstGap, ok: worstGap.gap <= targets.dispensableMaxGapPoints },
  };
}
