import type { Content } from '@outlaw/data';
import {
  compileEncounter,
  compileTeam,
  tierCount,
  tierEncounterPct,
  tierLevel,
  tierTargetLevel,
  type HeroBuild,
} from '@outlaw/engine';
import { randomBuild, pickTeam } from './builds';
import { lookahead } from './policy';
import { createRng, type Rng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Paliers de donjon : pour chaque donjon et chaque palier, des équipes jouables de `teamSize` héros tirées
 * au hasard (builds aléatoires) au niveau visé par le palier (celui des ennemis, borné au niveau
 * maximum) et avec l'équipement visé (`tierGear` : aucun objet au palier I, deux objets bruts au
 * palier II, deux objets au niveau maximum au dernier palier), jouées par la politique experte.
 * Deux règles : chaque palier reste gagnable par l'expert (`targets.tiers.expertMin`), et un
 * palier n'est jamais nettement plus facile que le précédent du même donjon
 * (`targets.tiers.tolerance`).
 */

/** Équipement visé par un palier : nombre d'objets portés et leur niveau d'amélioration. */
export function tierGear(content: Content, tier: number): { items: number; upgrade: number } {
  const { count } = content.balance.tiers;
  const { slots, maxUpgradeLevel } = content.balance.progression.items;
  if (tier <= 1) return { items: 0, upgrade: 0 };
  const steps = Math.max(1, count - 2);
  return { items: slots, upgrade: Math.round(((tier - 2) / steps) * maxUpgradeLevel) };
}

/** Deux objets distincts tirés au hasard, au niveau d'amélioration demandé. */
export function randomItems(
  content: Content,
  gear: { items: number; upgrade: number },
  rng: Rng,
): HeroBuild['items'] {
  const pool = content.items.map((i) => i.id);
  const picked: string[] = [];
  while (picked.length < gear.items && pool.length > 0) {
    const id = rng.pick(pool);
    pool.splice(pool.indexOf(id), 1);
    picked.push(id);
  }
  return picked.map((id) => ({ id, upgrade: gear.upgrade }));
}
export interface TiersReport {
  readonly rows: ScenarioRow[];
  readonly problems: string[];
  /** Taux de réussite expert par donjon puis par palier. */
  readonly rates: Readonly<Record<string, readonly number[]>>;
}

export function tiers(content: Content, runs: number, seed: number): TiersReport {
  const { tiers: targets } = content.balance.targets;
  const heroes = content.heroes.map((h) => h.id);
  const rows: ScenarioRow[] = [];
  const problems: string[] = [];
  const rates: Record<string, number[]> = {};
  content.dungeons.forEach((dungeon, d) => {
    const perTier: number[] = [];
    for (let tier = 1; tier <= tierCount(content); tier++) {
      const level = tierTargetLevel(content, dungeon, tier);
      const enemyLevel = tierLevel(content, dungeon, tier);
      const gear = tierGear(content, tier);
      const rng = createRng(seed + 131 * d + 17 * tier);
      const clears: BattleOutcome[] = [];
      for (let i = 0; i < runs; i++) {
        const team = pickTeam(content, rng.shuffle(heroes), content.balance.progression.teamSize);
        const builds = team.map((hero) => ({
          ...randomBuild(content, hero, level, rng),
          items: randomItems(content, gear, rng),
        }));
        const party = compileTeam(content, builds, 'player', dungeon.modifier);
        let won = 0;
        let actions = 0;
        for (const encounter of dungeon.encounters) {
          const pct = tierEncounterPct(content, tier, encounter.hpPct, encounter.atkPct);
          const foes = compileEncounter(
            content,
            encounter.enemies,
            enemyLevel,
            dungeon.modifier,
            pct.hpPct,
            pct.atkPct,
          );
          const outcome = runBattle({ units: [...party, ...foes] }, content.balance, lookahead);
          actions += outcome.playerActions ?? 0;
          if (outcome.result.winner !== 'player') break;
          won++;
        }
        clears.push({
          result: {
            winner: won === dungeon.encounters.length ? 'player' : 'enemy',
            reason: 'annihilation',
          },
          actions: 0,
          playerActions: actions,
        });
      }
      const row = summarize(`tier_${dungeon.id}_${String(tier)}_expert`, clears);
      rows.push(row);
      perTier.push(row.winRate);
      const pct = (row.winRate * 100).toFixed(0);
      if (row.winRate < targets.expertMin) {
        problems.push(
          `palier ${String(tier)} de ${dungeon.id} : expert ${pct} % < ${String(targets.expertMin * 100)} % au niveau ${String(level)}`,
        );
      }
      const previous = perTier[tier - 2];
      if (previous !== undefined && row.winRate > previous + targets.tolerance) {
        problems.push(
          `palier ${String(tier)} de ${dungeon.id} : expert ${pct} % plus facile que le palier ${String(tier - 1)} (${(previous * 100).toFixed(0)} %)`,
        );
      }
    }
    rates[dungeon.id] = perTier;
  });
  return { rows, problems, rates };
}
