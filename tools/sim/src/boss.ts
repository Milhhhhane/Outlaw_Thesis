import type { Content } from '@outlaw/data';
import {
  bossDifficulties,
  bossFight,
  compileEncounter,
  compileTeam,
  createBattle,
  damageDealt,
  step,
  type BattleEvent,
  type BattleSetup,
} from '@outlaw/engine';
import { pickTeam, randomBuild } from './builds';
import { average, lookahead, type Policy } from './policy';
import { createRng } from './rng';
import { randomItems } from './tiers';

/**
 * Boss de la semaine : pour chaque boss de la rotation et chaque difficulté, des équipes tirées
 * au hasard (builds aléatoires) au niveau et à l'équipement visés, jouées par l'expert et par le
 * joueur moyen ; on mesure les dégâts infligés (`damageDealt` du journal). La dernière difficulté
 * est aussi jouée par l'expert à l'équipement au maximum et sans aucun objet.
 * Règles (`targets.boss`) : le premier palier de la première difficulté est à la portée du joueur
 * moyen, le dernier palier de la dernière difficulté demande l'équipement (atteint au maximum,
 * presque jamais sans objets).
 */

export interface DamageSample {
  readonly difficulty: number;
  readonly who: 'expert' | 'average' | 'expert_max' | 'expert_bare';
  /** Dégâts de chaque combat, triés par ordre croissant. */
  readonly damage: readonly number[];
  /** Combats où le boss est tombé (le combat a fini avant le temps). */
  readonly kills: number;
}

export interface BossSimReport {
  readonly samples: readonly DamageSample[];
  readonly problems: string[];
}

/** Part des combats qui atteignent `threshold`. */
export function reach(sample: DamageSample, threshold: number): number {
  return sample.damage.filter((d) => d >= threshold).length / Math.max(1, sample.damage.length);
}

/** Quantile `q` (0 à 1) d'une liste triée. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

function play(setup: BattleSetup, content: Content, policy: Policy): BattleEvent[] {
  const created = createBattle(setup, content.balance);
  let state = created.state;
  const events: BattleEvent[] = [...created.events];
  while (state.result === null) {
    const next = step(state, policy(state));
    state = next.state;
    events.push(...next.events);
  }
  return events;
}

export function bossSim(content: Content, runs: number, seed: number): BossSimReport {
  const heroes = content.heroes.map((h) => h.id);
  const { maxUpgradeLevel, slots } = content.balance.progression.items;
  const weekMs = 7 * 86_400_000;
  const samples: DamageSample[] = [];
  const last = bossDifficulties(content);
  for (let difficulty = 1; difficulty <= last; difficulty++) {
    const variants: {
      who: DamageSample['who'];
      gear: { items: number; upgrade: number } | null;
    }[] = [
      { who: 'expert', gear: null },
      { who: 'average', gear: null },
      ...(difficulty === last
        ? [
            { who: 'expert_max' as const, gear: { items: slots, upgrade: maxUpgradeLevel } },
            { who: 'expert_bare' as const, gear: { items: 0, upgrade: 0 } },
          ]
        : []),
    ];
    for (const variant of variants) {
      const damage: number[] = [];
      let kills = 0;
      // Chaque boss de la rotation à part égale : une semaine par boss.
      content.balance.boss.bosses.forEach((_, b) => {
        const fight = bossFight(content, b * weekMs + 4 * 86_400_000, difficulty);
        if (fight === null) return;
        const gear = variant.gear ?? fight.gear;
        const rng = createRng(seed + 7919 * difficulty + 104_729 * b);
        for (let i = 0; i < runs; i++) {
          const team = pickTeam(content, rng.shuffle(heroes), content.balance.progression.teamSize);
          const builds = team.map((hero) => ({
            ...randomBuild(content, hero, fight.level, rng),
            items: randomItems(content, gear, rng),
          }));
          const setup: BattleSetup = {
            units: [
              ...compileTeam(content, builds, 'player'),
              ...compileEncounter(
                content,
                [fight.enemy],
                fight.level,
                undefined,
                fight.hpPct,
                fight.atkPct,
              ),
            ],
            rules: fight.rules,
          };
          const policy = variant.who === 'average' ? average(seed + i) : lookahead;
          const events = play(setup, content, policy);
          damage.push(damageDealt(events));
          if (events.some((e) => e.type === 'battle_end' && e.winner === 'player')) kills++;
        }
      });
      damage.sort((a, b) => a - b);
      samples.push({ difficulty, who: variant.who, damage, kills });
    }
  }
  const problems: string[] = [];
  const targets = content.balance.targets.boss;
  const { difficulties } = content.balance.boss;
  const find = (d: number, who: DamageSample['who']): DamageSample | undefined =>
    samples.find((s) => s.difficulty === d && s.who === who);
  const first = difficulties[0]?.thresholds[0] ?? 0;
  const avg = find(1, 'average');
  if (avg !== undefined && reach(avg, first) < targets.firstReach)
    problems.push(
      `difficulté 1, palier 1 (${String(first)}) : joueur moyen ${(reach(avg, first) * 100).toFixed(0)} % < ${String(targets.firstReach * 100)} %`,
    );
  const top = difficulties.at(-1)?.thresholds.at(-1) ?? 0;
  const max = find(last, 'expert_max');
  const bare = find(last, 'expert_bare');
  if (max !== undefined && reach(max, top) < targets.lastReach)
    problems.push(
      `difficulté ${String(last)}, dernier palier (${String(top)}) : expert équipé au maximum ${(reach(max, top) * 100).toFixed(0)} % < ${String(targets.lastReach * 100)} %`,
    );
  if (bare !== undefined && reach(bare, top) > targets.bareReach)
    problems.push(
      `difficulté ${String(last)}, dernier palier (${String(top)}) : atteint sans objets (${(reach(bare, top) * 100).toFixed(0)} % > ${String(targets.bareReach * 100)} %)`,
    );
  return { samples, problems };
}
