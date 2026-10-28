import type { Content } from '@outlaw/data';
import { compileEncounter, compileTeam } from '@outlaw/engine';
import { pickTeam, randomBuild } from './builds';
import { average, lookahead, type Policy } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Rythme et difficulté : pour chaque donjon, des équipes jouables de `teamSize` héros tirées au
 * hasard (au plus deux du même rôle, `pickTeam` ; builds
 * aléatoires), au niveau conseillé et avec le retard de R2, jouées par la politique experte
 * (anticipation d'un coup) et par le joueur moyen (une décision sur quatre au hasard).
 * Les combats d'un donjon repartent à PV pleins : chacun est mesuré séparément.
 */
export interface PacingReport {
  readonly rows: ScenarioRow[];
  readonly problems: string[];
  readonly expertRate: number;
  readonly averageRate: number;
}

type Kind = 'expert' | 'average';

export function pacing(content: Content, runs: number, seed: number): PacingReport {
  const { targets } = content.balance;
  const { pacing: pace } = targets;
  const heroes = content.heroes.map((h) => h.id);
  const rows: ScenarioRow[] = [];
  const problems: string[] = [];
  const clearRates: Record<Kind, number[]> = { expert: [], average: [] };

  content.dungeons.forEach((dungeon, d) => {
    for (const [label, level] of [
      ['rec', dungeon.recommendedLevel],
      [`minus${targets.r2LevelGap}`, Math.max(1, dungeon.recommendedLevel - targets.r2LevelGap)],
    ] as const) {
      const rng = createRng(seed + 97 * d + (label === 'rec' ? 0 : 7));
      const fights: Record<Kind, BattleOutcome[][]> = {
        expert: dungeon.encounters.map(() => []),
        average: dungeon.encounters.map(() => []),
      };
      const clears: Record<Kind, BattleOutcome[]> = { expert: [], average: [] };
      for (let i = 0; i < runs; i++) {
        const team = pickTeam(content, rng.shuffle(heroes), content.balance.progression.teamSize);
        const builds = team.map((hero) => randomBuild(content, hero, level, rng));
        const party = compileTeam(content, builds, 'player', dungeon.modifier);
        for (const kind of ['expert', 'average'] as const) {
          let won = 0;
          let total = 0;
          dungeon.encounters.forEach((encounter, e) => {
            const policy: Policy = kind === 'expert' ? lookahead : average(seed + 1000 * i + e);
            const foes = compileEncounter(
              content,
              encounter.enemies,
              dungeon.recommendedLevel,
              dungeon.modifier,
              encounter.hpPct,
              encounter.atkPct,
            );
            const outcome = runBattle({ units: [...party, ...foes] }, content.balance, policy);
            fights[kind][e]?.push(outcome);
            if (outcome.result.winner === 'player') won++;
            total += outcome.playerActions ?? 0;
          });
          const cleared = won === dungeon.encounters.length;
          clears[kind].push({
            result: { winner: cleared ? 'player' : 'enemy', reason: 'annihilation' },
            actions: 0,
            playerActions: total,
          });
        }
      }
      for (const kind of ['expert', 'average'] as const) {
        const row = summarize(`pace_${dungeon.id}_${label}_${kind}`, clears[kind]);
        rows.push(row);
        if (label === 'rec') clearRates[kind].push(row.winRate);
        if (label !== 'rec' || kind !== 'expert') continue;
        // Durées : chaque combat, puis le donjon entier (combats gagnés de bout en bout).
        const max = d === 0 ? pace.firstDungeonMax : pace.dungeonMax;
        const won = clears.expert.filter((o) => o.result.winner === 'player');
        const avgTotal =
          won.length === 0 ? 0 : won.reduce((a, o) => a + (o.playerActions ?? 0), 0) / won.length;
        if (avgTotal > max)
          problems.push(`${dungeon.id} : ${avgTotal.toFixed(1)} actions > ${max}`);
        dungeon.encounters.forEach((encounter, e) => {
          const fightRow = summarize(`pace_${dungeon.id}_f${e + 1}`, fights.expert[e] ?? []);
          rows.push(fightRow);
          const boss = encounter.enemies.some((id) => content.enemyById.get(id)?.boss === true);
          const first = d === 0 && e === 0;
          const floor = first ? pace.firstFightFloor : pace.floor;
          const [lo, hi] = boss ? pace.boss : first ? [floor, pace.normal[1]] : pace.normal;
          const where = `${dungeon.id} combat ${e + 1}`;
          if (fightRow.avgPlayer < lo || fightRow.avgPlayer > hi) {
            problems.push(`${where} : ${fightRow.avgPlayer.toFixed(1)} hors de ${lo}-${hi}`);
          }
          if (fightRow.minPlayer < floor) {
            problems.push(`${where} : minimum ${fightRow.minPlayer} < ${floor}`);
          }
        });
      }
    }
  });

  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const expertRate = mean(clearRates.expert);
  const averageRate = mean(clearRates.average);
  const band = (name: string, rate: number, [lo, hi]: readonly [number, number]): void => {
    if (rate < lo || rate > hi) {
      problems.push(`${name} : ${(rate * 100).toFixed(0)} % hors de ${lo * 100}-${hi * 100} %`);
    }
  };
  band('expert au niveau conseillé', expertRate, targets.expertWinRate);
  band('joueur moyen au niveau conseillé', averageRate, targets.averageWinRate);
  // Courbe : facile au début, puis la difficulté monte sans redescendre brutalement.
  const curve = targets.averageCurve;
  clearRates.average.forEach((rate, i) => {
    const id = content.dungeons[i]?.id ?? String(i);
    if (i === 0 && rate < curve.first)
      problems.push(`courbe : ${id} (moyen) ${(rate * 100).toFixed(0)} % < ${curve.first * 100} %`);
    if (rate < curve.last)
      problems.push(`courbe : ${id} (moyen) ${(rate * 100).toFixed(0)} % < ${curve.last * 100} %`);
    const prev = clearRates.average[i - 1];
    if (prev !== undefined && rate > prev + curve.tolerance)
      problems.push(
        `courbe : ${id} (moyen) ${(rate * 100).toFixed(0)} % plus facile que le précédent (${(prev * 100).toFixed(0)} %)`,
      );
  });
  return { rows, problems, expertRate, averageRate };
}
