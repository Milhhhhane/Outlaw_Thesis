import type { Content } from '@outlaw/data';
import {
  compileEncounter,
  compileTeam,
  essenceEncounter,
  tierCount,
  tierTargetLevel,
  type HeroBuild,
} from '@outlaw/engine';
import { pickTeam, randomBuild } from './builds';
import { runDungeon } from './dungeons';
import { average, lookahead } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Éveil en simulation.
 *
 * Écart de puissance (règle `targets.awakening.maxGapPoints`, en CI) : pour chaque héros, `runs`
 * équipes jouables qui le contiennent jouent chaque donjon du chapitre 1 où l'éveil est possible
 * (niveau en retard ≥ `awakening.minLevel`) avec `r2LevelGap` niveaux de retard, par le joueur moyen (la
 * mesure de « aucun héros indispensable », qui sépare les équipes) : une fois le héros non éveillé,
 * une fois éveillé, mêmes builds et même politique. L'écart est la différence de part de donjons
 * terminés, en points.
 *
 * Donjons d'essence : part de victoires de l'expert à chaque palier, au niveau visé (lecture).
 */

const awake = (build: HeroBuild): HeroBuild => ({ ...build, awakened: true });

/** Tous les héros d'une équipe éveillés (règles « tous éveillés »). */
export function awakenAll(builds: readonly HeroBuild[]): HeroBuild[] {
  return builds.map(awake);
}

export interface AwakeningGap {
  readonly hero: string;
  readonly plain: number;
  readonly awake: number;
  /** En points de pourcentage. */
  readonly gap: number;
}

export interface AwakeningReport {
  readonly rows: ScenarioRow[];
  readonly gaps: readonly AwakeningGap[];
  readonly worst: AwakeningGap;
  readonly problems: readonly string[];
}

const outcome = (won: boolean): BattleOutcome => ({
  result: { winner: won ? 'player' : 'enemy', reason: 'annihilation' },
  actions: 0,
});

/** Donjons terminés sans et avec le héros éveillé, sur `runs` équipes par donjon. */
function measureHero(
  content: Content,
  heroIndex: number,
  runs: number,
  seed: number,
): { plain: BattleOutcome[]; woke: BattleOutcome[] } {
  const { targets, awakening, progression } = content.balance;
  const hero = content.heroes[heroIndex];
  const plain: BattleOutcome[] = [];
  const woke: BattleOutcome[] = [];
  if (hero === undefined) return { plain, woke };
  const ids = content.heroes.map((h) => h.id);
  // Chapitre 1 seulement : la mesure porte sur le héros, ses quatre donjons tardifs suffisent (et
  // un nouveau chapitre ne change pas les lignes `awakening_*` de la référence).
  const dungeons = content.dungeons.filter(
    (d) => d.map.chapter === 1 && d.recommendedLevel - targets.r2LevelGap >= awakening.minLevel,
  );
  dungeons.forEach((dungeon, d) => {
    const rng = createRng(seed + 977 * heroIndex + 31 * d);
    const behind = dungeon.recommendedLevel - targets.r2LevelGap;
    for (let i = 0; i < runs; i++) {
      const order = [hero.id, ...rng.shuffle(ids.filter((id) => id !== hero.id))];
      const team = pickTeam(content, order, progression.teamSize);
      const builds = team.map((id) => randomBuild(content, id, behind, rng));
      const policySeed = seed + 7919 * heroIndex + 101 * d + i;
      const base = runDungeon(content, dungeon.id, builds, average(policySeed));
      const boosted = runDungeon(
        content,
        dungeon.id,
        builds.map((b) => (b.hero === hero.id ? awake(b) : b)),
        average(policySeed),
      );
      plain.push(outcome(base.cleared));
      woke.push(outcome(boosted.cleared));
    }
  });
  return { plain, woke };
}

/** Passe de confirmation : un héros au-dessus de la cible est remesuré sur `CONFIRM` fois plus d'équipes. */
const CONFIRM = 3;

export function awakeningGap(content: Content, runs: number, seed: number): AwakeningReport {
  const { targets } = content.balance;
  const gaps: AwakeningGap[] = [];
  const rows: ScenarioRow[] = [];
  const rate = (xs: readonly BattleOutcome[]): number =>
    xs.filter((x) => x.result.winner === 'player').length / Math.max(1, xs.length);
  content.heroes.forEach((hero, h) => {
    const first = measureHero(content, h, runs, seed);
    let { plain, woke } = first;
    // Bruit : 25 héros mesurés sur quelques dizaines de donjons, le pire dépasse vite la cible par
    // hasard. Un héros au-dessus est remesuré sur d'autres équipes et l'écart est pris sur le tout.
    if (Math.abs(rate(woke) - rate(plain)) * 100 > targets.awakening.maxGapPoints) {
      const more = measureHero(content, h, runs * CONFIRM, seed + 104729);
      plain = [...plain, ...more.plain];
      woke = [...woke, ...more.woke];
    }
    const a = summarize(`awakening_${hero.id}_plain`, plain);
    const b = summarize(`awakening_${hero.id}_awake`, woke);
    rows.push(a, b);
    gaps.push({
      hero: hero.id,
      plain: a.winRate,
      awake: b.winRate,
      gap: (b.winRate - a.winRate) * 100,
    });
  });
  const worst = gaps.reduce((acc, g) => (Math.abs(g.gap) > Math.abs(acc.gap) ? g : acc), {
    hero: '',
    plain: 0,
    awake: 0,
    gap: 0,
  });
  const problems =
    Math.abs(worst.gap) > targets.awakening.maxGapPoints
      ? [
          `éveil : ${worst.hero} gagne ${worst.gap.toFixed(0)} points éveillé (cible ≤ ${String(targets.awakening.maxGapPoints)})`,
        ]
      : [];
  return { rows, gaps, worst, problems };
}

/**
 * Donjons d'essence : part de victoires de l'expert à chaque palier, au niveau visé (`runs` équipes
 * jouables, builds au hasard). Règle : chaque palier ≥ `targets.awakening.essenceExpertMin`.
 */
export function essenceSim(
  content: Content,
  runs: number,
  seed: number,
): { rows: ScenarioRow[]; rates: { id: string; rates: number[] }[]; problems: string[] } {
  const ids = content.heroes.map((h) => h.id);
  const size = content.balance.progression.teamSize;
  const min = content.balance.targets.awakening.essenceExpertMin;
  const rows: ScenarioRow[] = [];
  const problems: string[] = [];
  const rates = content.essenceDungeons.map((dungeon, d) => {
    const list: number[] = [];
    for (let tier = 1; tier <= tierCount(content); tier++) {
      const rng = createRng(seed + 53 * d + tier);
      const level = tierTargetLevel(content, dungeon, tier);
      const results: BattleOutcome[] = [];
      for (let i = 0; i < runs; i++) {
        const team = pickTeam(content, rng.shuffle(ids), size);
        const heroes = compileTeam(
          content,
          team.map((id) => randomBuild(content, id, level, rng)),
        );
        let cleared = true;
        for (let room = 0; room < dungeon.encounters.length && cleared; room++) {
          const e = essenceEncounter(content, dungeon, tier, room);
          if (e === null) break;
          const enemies = compileEncounter(
            content,
            e.enemies,
            e.level,
            undefined,
            e.hpPct,
            e.atkPct,
          );
          cleared =
            runBattle({ units: [...heroes, ...enemies] }, content.balance, lookahead).result
              .winner === 'player';
        }
        results.push(outcome(cleared));
      }
      const row = summarize(`${dungeon.id}_tier${String(tier)}_expert`, results);
      rows.push(row);
      list.push(row.winRate);
      if (row.winRate < min)
        problems.push(
          `${dungeon.id} palier ${String(tier)} : expert ${(row.winRate * 100).toFixed(0)} % (cible ≥ ${String(min * 100)} %)`,
        );
    }
    return { id: dungeon.id, rates: list };
  });
  return { rows, rates, problems };
}
