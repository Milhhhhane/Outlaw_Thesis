import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { createBattle, step } from '../src/battle';
import {
  bossDifficulties,
  bossFight,
  bossProgress,
  bossReward,
  bossTierReached,
  bossUnlockDungeon,
  bossUnlocked,
  completeBoss,
  damageDealt,
  enterBoss,
  weeklyBoss,
} from '../src/boss';
import { compileEncounter, compileTeam } from '../src/compile';
import {
  heroBuild,
  levelDustTier,
  newProfile,
  sandboxProfile,
  type Outcome,
} from '../src/progression';
import { autoAction } from '../src/auto';
import type { BattleEvent } from '../src/types';

const content = loadContent();
const rules = content.balance.boss;
const DAY = 86_400_000;
/** Un lundi, 00:00 UTC. */
const MONDAY = Date.UTC(2026, 10, 2);
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
/** Joueur qui a terminé tous les donjons : toutes les difficultés ouvertes. */
const veteran = (): Profile => ({
  ...newProfile(content, 5),
  dungeons: Object.fromEntries(content.dungeons.map((d) => [d.id, { clears: 1, dry: 0, tier: 2 }])),
});
const top = (d: number): number => rules.difficulties[d - 1]!.thresholds.at(-1)!;

describe('boss de la semaine : rotation et difficultés', () => {
  it('un boss par semaine, le lundi 00:00 UTC, en rotation sur les trois éléments', () => {
    const weeks = [0, 1, 2, 3].map((w) => weeklyBoss(content, MONDAY + w * 7 * DAY));
    expect(new Set(weeks.slice(0, 3).map((w) => w.element)).size).toBe(3);
    expect(weeks[3]!.enemy).toBe(weeks[0]!.enemy);
    expect(weeks.every((w) => content.enemyById.get(w.enemy)?.boss === true)).toBe(true);
    // Dimanche 23:59 : encore la semaine d'avant.
    expect(weeklyBoss(content, MONDAY - 60_000).week).toBe(weeks[0]!.week - 1);
    const fight = bossFight(content, MONDAY, 1)!;
    expect(fight).toMatchObject({
      difficulty: 1,
      enemy: weeks[0]!.enemy,
      level: rules.difficulties[0]!.level,
    });
    expect(fight.rules.actionLimit).toBe(rules.actionLimit);
    expect(bossFight(content, MONDAY, 0)).toBeNull();
    expect(bossFight(content, MONDAY, bossDifficulties(content) + 1)).toBeNull();
  });

  it('difficultés ouvertes par le meilleur donjon terminé ; toutes en mode test', () => {
    const fresh = newProfile(content, 1);
    expect(bossUnlocked(content, fresh, 1)).toBe(false);
    const first = bossUnlockDungeon(content, 1)!;
    const opened = { ...fresh, dungeons: { [first]: { clears: 1, dry: 0, tier: 2 } } };
    expect(bossUnlocked(content, opened, 1)).toBe(true);
    expect(bossUnlocked(content, opened, 2)).toBe(false);
    expect(bossUnlocked(content, veteran(), bossDifficulties(content))).toBe(true);
    expect(bossUnlocked(content, sandboxProfile(content), bossDifficulties(content))).toBe(true);
    expect(bossUnlocked(content, veteran(), 99)).toBe(false);
    expect(bossUnlockDungeon(content, 99)).toBeNull();
    expect(reason(enterBoss(content, fresh, 1, MONDAY))).toBe('boss_locked');
    expect(reason(enterBoss(content, fresh, 9, MONDAY))).toBe('unknown_difficulty');
    expect(reason(enterBoss(content, { ...veteran(), team: [] }, 1, MONDAY))).toBe('bad_team');
  });
});

describe('boss de la semaine : tentatives, score et paliers', () => {
  it('trois tentatives par jour UTC, prises à l’entrée, rendues le lendemain', () => {
    let profile = veteran();
    for (let i = 0; i < rules.attemptsPerDay; i++)
      profile = value(enterBoss(content, profile, 1, MONDAY));
    expect(bossProgress(content, profile, MONDAY).attemptsLeft).toBe(0);
    expect(reason(enterBoss(content, profile, 2, MONDAY + 3_600_000))).toBe('no_attempts');
    expect(bossProgress(content, profile, MONDAY + DAY).attemptsLeft).toBe(rules.attemptsPerDay);
    expect(reason(enterBoss(content, profile, 1, MONDAY + DAY))).toBe('ok');
    // Mode test : rien n'est compté.
    const test = sandboxProfile(content);
    expect(value(enterBoss(content, test, 1, MONDAY))).toBe(test);
    expect(reason(completeBoss(content, test, 1, 10, MONDAY))).toBe('test_mode');
  });

  it('chaque palier atteint est payé une fois par semaine ; le meilleur score reste', () => {
    const d = bossDifficulties(content);
    const t = rules.difficulties[d - 1]!.thresholds;
    let profile = value(enterBoss(content, veteran(), d, MONDAY));
    // Deux paliers d'un coup.
    const a = value(completeBoss(content, profile, d, t[1]!, MONDAY));
    expect(a.report).toMatchObject({ damage: t[1], best: t[1], newBest: true, reached: 2 });
    expect(a.report.paid.map((p) => p.tier)).toEqual([1, 2]);
    const reward = bossReward(content, d, 2);
    expect(reward.materials.tier).toBe(levelDustTier(content, rules.difficulties[d - 1]!.level));
    const tier = reward.materials.tier - 1;
    const dust = rules.rewards[0]!.dust + rules.rewards[1]!.dust;
    expect(a.profile.materials[tier]).toBe(profile.materials[tier]! + dust);
    const frags = (p: Profile): number => Object.values(p.fragments).reduce((x, y) => x + y, 0);
    expect(frags(a.profile)).toBe(
      frags(profile) + rules.rewards[0]!.fragments + rules.rewards[1]!.fragments,
    );
    // Moins bien ensuite : rien de payé, le meilleur score reste.
    profile = a.profile;
    const b = value(completeBoss(content, profile, d, 5, MONDAY + DAY));
    expect(b.report).toMatchObject({ best: t[1], newBest: false, reached: 0, paid: [] });
    // Mieux : seuls les paliers neufs, coffres compris.
    const c = value(completeBoss(content, b.profile, d, top(d), MONDAY + DAY));
    expect(c.report.paid.map((p) => p.tier)).toEqual(t.slice(2).map((_, i) => i + 3));
    const chests = rules.rewards.slice(2).flatMap((r) => (r.chest === null ? [] : [r.chest]));
    for (const chest of chests)
      expect(c.profile.chests[chest]).toBe(
        (b.profile.chests[chest] ?? 0) + chests.filter((x) => x === chest).length,
      );
    expect(
      value(completeBoss(content, c.profile, d, top(d) * 2, MONDAY + DAY)).report.paid,
    ).toEqual([]);
    // La semaine suivante : score et paliers repartent de zéro.
    const next = MONDAY + 7 * DAY;
    expect(bossProgress(content, c.profile, next).best[d - 1]).toBe(0);
    expect(value(completeBoss(content, c.profile, d, t[0]!, next)).report.paid).toHaveLength(1);
    expect(bossTierReached(content, 99, 1e9)).toBe(0);
    expect(reason(completeBoss(content, newProfile(content, 1), 1, 10, MONDAY))).toBe(
      'boss_locked',
    );
    expect(reason(completeBoss(content, veteran(), 0, 10, MONDAY))).toBe('unknown_difficulty');
  });

  it('ancienne sauvegarde sans boss : se charge, aucune tentative prise', () => {
    const legacy: Record<string, unknown> = { ...veteran() };
    delete legacy.boss;
    const read = profileSchema.parse(legacy);
    expect(bossProgress(content, read, MONDAY)).toMatchObject({
      attemptsLeft: rules.attemptsPerDay,
      best: rules.difficulties.map(() => 0),
    });
  });
});

describe('boss de la semaine : combat', () => {
  it('le combat finit à la limite d’actions du boss ; les dégâts se lisent dans le journal', () => {
    const fight = bossFight(content, MONDAY, 1)!;
    const boss = compileEncounter(
      content,
      [fight.enemy],
      fight.level,
      undefined,
      fight.hpPct,
      fight.atkPct,
    );
    const sandbox = sandboxProfile(content);
    const team = compileTeam(
      content,
      sandbox.team.map((id) => heroBuild(sandbox, id)),
      'player',
    );
    const units = [...team, ...boss];
    let result = createBattle({ units, rules: fight.rules }, content.balance);
    const events: BattleEvent[] = [...result.events];
    while (result.state.result === null) {
      result = step(result.state, autoAction(result.state));
      events.push(...result.events);
    }
    expect(result.state.result).toEqual({ winner: 'enemy', reason: 'action_limit' });
    expect(result.state.actionCount).toBe(rules.actionLimit);
    const end = result.state.units.find((u) => u.def.side === 'enemy')!;
    expect(damageDealt(events)).toBe(end.def.stats.hp - end.hp + healed(events, end.def.id));
    expect(damageDealt(events)).toBeGreaterThan(0);
    expect(() =>
      createBattle({ units, rules: { ...fight.rules, actionLimit: 0 } }, content.balance),
    ).toThrow();
  });

  it('damageDealt : PV perdus seulement (bouclier, excédent et soins exclus)', () => {
    const events: BattleEvent[] = [
      {
        type: 'battle_start',
        units: [
          { id: 'b', kind: 'x', side: 'enemy', slot: 0, element: 'fire', hp: 100, maxHp: 100 },
          { id: 'h', kind: 'y', side: 'player', slot: 0, element: 'fire', hp: 50, maxHp: 50 },
        ],
      },
      dmg('b', 30, 70),
      { type: 'heal', source: 'b', target: 'b', cause: 'spell', amount: 20, hpAfter: 90 },
      dmg('h', 10, 40),
      dmg('b', 500, 0),
      dmg('z', 5, 0),
    ];
    expect(damageDealt(events)).toBe(30 + 90);
    expect(damageDealt(events, 'player')).toBe(10);
  });
});

function dmg(target: string, amount: number, hpAfter: number): BattleEvent {
  return {
    type: 'damage',
    source: 's',
    target,
    cause: 'spell',
    amount,
    absorbed: 0,
    multiplier: 1,
    hpAfter,
    shieldAfter: 0,
    killed: hpAfter === 0,
  };
}

function healed(events: readonly BattleEvent[], id: string): number {
  // Soins du boss : rendus aux PV, ils ne retirent rien aux dégâts comptés.
  let hp: number | null = null;
  let total = 0;
  for (const e of events) {
    if (e.type === 'battle_start') hp = e.units.find((u) => u.id === id)?.hp ?? null;
    if (e.type === 'damage' && e.target === id) hp = e.hpAfter;
    if (e.type === 'heal' && e.target === id && hp !== null) {
      total += e.hpAfter - hp;
      hp = e.hpAfter;
    }
  }
  return total;
}
