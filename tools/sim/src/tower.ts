import { ELEMENTS, type Content } from '@outlaw/data';
import { compileEncounter, compileTeam, towerFloor, towerFloors } from '@outlaw/engine';
import { pickTeam, randomBuild } from './builds';
import { lookahead } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';
import { randomItems } from './tiers';

/**
 * Tour à étages : pour chaque étage, des équipes jouables tirées au hasard (builds aléatoires) au
 * niveau visé de l'étage et avec l'équipement visé (`balance.tower.gear`), jouées par la politique
 * experte sur l'unique combat de l'étage. Règles (`targets.tower`) : chaque étage reste gagnable
 * par l'expert (`expertMin`) et la courbe est monotone, au bruit de mesure près (`tolerance`) :
 * un groupe de trois étages ordinaires n'est jamais plus facile que le groupe d'avant, un boss
 * jamais plus facile que les étages qui le précèdent ni que le boss précédent.
 */
export interface TowerSimReport {
  readonly rows: ScenarioRow[];
  readonly problems: string[];
  /** Taux de réussite expert par étage (index 0 : étage 1). */
  readonly rates: readonly number[];
}

const mean = (list: readonly number[]): number | null =>
  list.length === 0 ? null : list.reduce((sum, x) => sum + x, 0) / list.length;

/** Dernier groupe complet d'étages ordinaires avant `block` (le groupe en cours s'il est entamé). */
function previousBlock(done: readonly number[][], block: readonly number[]): readonly number[] {
  if (block.length > 0 && block.length < ELEMENTS.length) return block;
  return done.findLast((b) => b.length > 0) ?? [];
}

export function towerSim(content: Content, runs: number, seed: number): TowerSimReport {
  const { tower: targets } = content.balance.targets;
  const heroes = content.heroes.map((h) => h.id);
  const rows: ScenarioRow[] = [];
  const problems: string[] = [];
  const rates: number[] = [];
  // Étages ordinaires groupés par trois (une rotation complète des éléments, ce qui gomme l'effet
  // de l'élément et triple l'échantillon) : la moyenne d'un groupe ne dépasse jamais celle du
  // groupe précédent de plus de `tolerance`.
  const blocks: number[][] = [];
  let current: number[] = [];
  let lastBoss: number | null = null;
  const checkBlock = (done: readonly number[][], block: readonly number[], floor: number): void => {
    const before = mean(previousBlock(done, block));
    const now = mean(block);
    if (before !== null && now !== null && now > before + targets.tolerance) {
      problems.push(
        `étages ${String(floor - block.length + 1)} à ${String(floor)} : expert ${(now * 100).toFixed(0)} % plus facile que les trois d'avant (${(before * 100).toFixed(0)} %)`,
      );
    }
  };
  for (let floor = 1; floor <= towerFloors(content); floor++) {
    const f = towerFloor(content, floor);
    if (f === null) continue;
    const rng = createRng(seed + 7919 * floor);
    const outcomes: BattleOutcome[] = [];
    for (let i = 0; i < runs; i++) {
      const team = pickTeam(content, rng.shuffle(heroes), content.balance.progression.teamSize);
      const builds = team.map((hero) => ({
        ...randomBuild(content, hero, f.level, rng),
        items: randomItems(content, f.gear, rng),
      }));
      const party = compileTeam(content, builds, 'player', f.modifier);
      const foes = compileEncounter(content, f.enemies, f.level, f.modifier, f.hpPct, f.atkPct);
      outcomes.push(runBattle({ units: [...party, ...foes] }, content.balance, lookahead));
    }
    const row = summarize(`tower_${String(floor)}_expert`, outcomes);
    rows.push(row);
    const pct = (row.winRate * 100).toFixed(0);
    if (row.winRate < targets.expertMin) {
      problems.push(
        `étage ${String(floor)} : expert ${pct} % < ${String(targets.expertMin * 100)} % au niveau ${String(f.level)}`,
      );
    }
    if (f.boss) {
      // Un boss n'est jamais plus facile que les étages qui le précèdent…
      const before = mean(previousBlock(blocks, current));
      if (before !== null && row.winRate > before + targets.tolerance) {
        problems.push(
          `étage ${String(floor)} (boss) : expert ${pct} % plus facile que les étages d'avant (${(before * 100).toFixed(0)} %)`,
        );
      }
      // Ni plus facile que le boss précédent.
      if (lastBoss !== null && row.winRate > lastBoss + targets.tolerance) {
        problems.push(
          `étage ${String(floor)} (boss) : expert ${pct} % plus facile que le boss précédent (${(lastBoss * 100).toFixed(0)} %)`,
        );
      }
      lastBoss = row.winRate;
      current = [];
    } else {
      current.push(row.winRate);
      if (current.length === ELEMENTS.length) {
        checkBlock(blocks, current, floor);
        blocks.push(current);
        current = [];
      }
    }
    rates.push(row.winRate);
  }
  return { rows, problems, rates };
}
