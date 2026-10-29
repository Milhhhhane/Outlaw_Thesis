/**
 * Montée des sorts : écart de puissance entre « tous les sorts au maximum » et « tous au niveau 1 »,
 * à niveau de héros égal. Mêmes équipes que les règles (`sampleTeams`), mêmes builds et même joueur
 * moyen des deux côtés : seule la montée des sorts change.
 *  - donjons : part terminée avec r2LevelGap niveaux de retard (la mesure de « aucun héros
 *    indispensable », qui n'est pas saturée) et au niveau conseillé ;
 *  - duels : la même équipe, sorts au maximum contre sorts au niveau 1 (politique d'anticipation,
 *    dans les deux sens).
 * La cible (`targets.spellLevelsMaxGapPoints`) borne l'écart des donjons en retard, en points.
 */
import type { Content } from '@outlaw/data';
import { compileTeam, type HeroBuild } from '@outlaw/engine';
import { randomBuild, withSpellLevel } from './builds';
import { runDungeon } from './dungeons';
import { average, lookahead } from './policy';
import { createRng } from './rng';
import { runBattle } from './run';
import { R1_TEAMS, sampleTeams, TEAM_SAMPLE } from './rules';

export interface SpellGapReport {
  /** Part des donjons terminés en retard : sorts au niveau 1, au maximum, écart en points. */
  readonly late: { readonly base: number; readonly max: number; readonly gap: number };
  /** Même mesure au niveau conseillé. */
  readonly rec: { readonly base: number; readonly max: number; readonly gap: number };
  /** Duels de la même équipe : part gagnée par les sorts au maximum. */
  readonly duel: number;
  readonly runs: number;
  readonly ok: boolean;
}

const rate = (n: number, total: number): number => (total === 0 ? 0 : n / total);

export function spellGap(
  content: Content,
  seed: number,
  teamCount = TEAM_SAMPLE,
  buildsPerTeam = 2,
): SpellGapReport {
  const { targets, spellLevels } = content.balance;
  const all = sampleTeams(content, TEAM_SAMPLE, seed).slice(0, teamCount);
  const count = { late: [0, 0], rec: [0, 0], lateRuns: 0, recRuns: 0, duels: 0, duelWins: 0 };
  // Chapitre 1 (index dans tout le fichier, comme les règles) : la mesure de référence.
  content.dungeons.forEach((dungeon, d) => {
    if (dungeon.map.chapter !== 1) return;
    const behind = dungeon.recommendedLevel - targets.r2LevelGap;
    all.forEach((team, t) => {
      const rng = createRng(seed + 9000 * d + t);
      for (let k = 0; k < buildsPerTeam; k++) {
        for (const [key, level] of [
          ['late', behind],
          ['rec', dungeon.recommendedLevel],
        ] as const) {
          if (level < 1) continue;
          const base = team.map((hero) => randomBuild(content, hero, level, rng));
          const max = base.map((b) => withSpellLevel(b, spellLevels.max));
          const policySeed = seed + 11000 * d + 37 * t + k;
          const pair = count[key];
          if (runDungeon(content, dungeon.id, base, average(policySeed)).cleared)
            pair[0] = (pair[0] ?? 0) + 1;
          if (runDungeon(content, dungeon.id, max, average(policySeed)).cleared)
            pair[1] = (pair[1] ?? 0) + 1;
          if (key === 'late') count.lateRuns++;
          else count.recRuns++;
          // Duels miroirs sur les premières équipes, au niveau conseillé.
          if (key === 'rec' && t < R1_TEAMS && k === 0) {
            if (duel(content, max, base)) count.duelWins++;
            if (!duel(content, base, max)) count.duelWins++;
            count.duels += 2;
          }
        }
      }
    });
  });
  const summary = (pair: number[], runs: number) => {
    const base = rate(pair[0] ?? 0, runs);
    const max = rate(pair[1] ?? 0, runs);
    return { base, max, gap: (max - base) * 100 };
  };
  const late = summary(count.late, count.lateRuns);
  return {
    late,
    rec: summary(count.rec, count.recRuns),
    duel: rate(count.duelWins, count.duels),
    runs: count.lateRuns + count.recRuns,
    ok: late.gap <= targets.spellLevelsMaxGapPoints,
  };
}

function duel(content: Content, a: readonly HeroBuild[], b: readonly HeroBuild[]): boolean {
  const setup = {
    units: [...compileTeam(content, a, 'player'), ...compileTeam(content, b, 'enemy')],
  };
  return runBattle(setup, content.balance, lookahead).result.winner === 'player';
}
