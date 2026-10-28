import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  awaken,
  awakenCost,
  completeEssence,
  enterEssence,
  essenceDrop,
  essenceDungeon,
  essenceEncounter,
  essenceTierOpen,
  essenceTierReached,
  essencesOpen,
  setAwakened,
} from '../src/awakening';
import { compileHero } from '../src/compile';
import { heroBuild, newProfile, sandboxProfile, type Outcome } from '../src/progression';

const content = loadContent();
const rules = content.balance.awakening;
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
/** Profil où le donjon qui ouvre les essences est terminé. */
const opened = (): Profile => ({
  ...newProfile(content, 3),
  dungeons: { [rules.openAfter]: { clears: 1, dry: 0, tier: 2 } },
});
const fire = content.essenceDungeons.find((d) => d.element === 'fire')!;

describe('éveil : effet sur l’unité compilée', () => {
  it('stats + statPct % hors plafond des objets, passif renforcé par la formule commune', () => {
    const build = { hero: 'cendre', level: 20, talents: [], items: [] };
    const plain = compileHero(content, build, { side: 'player', slot: 0 });
    const woke = compileHero(content, { ...build, awakened: true }, { side: 'player', slot: 0 });
    expect(plain.awakened).toBeUndefined();
    expect(woke.awakened).toBe(true);
    expect(woke.stats.atk).toBe(Math.round(plain.stats.atk * (1 + rules.statPct / 100)));
    expect(woke.stats.vit).toBe(plain.stats.vit);
    // Cendre : tempo 15 sur altération posée → +20 % = 18.
    const amount = (u: typeof plain): unknown => {
      const effect = u.triggers[0]?.trigger.effects[0];
      return effect?.kind === 'tempo' ? effect.amount : null;
    };
    expect(amount(plain)).toBe(15);
    expect(amount(woke)).toBe(18);
  });
});

describe('éveil et montée des sorts', () => {
  it('se combinent dans la même compilation : sorts montés, passif et stats éveillés', () => {
    const max = content.balance.spellLevels.max;
    const spells = { basic: max, a: max, b: max, ult: max };
    const build = { hero: 'cendre', level: 20, talents: [], items: [] };
    const place = { side: 'player', slot: 0 } as const;
    const plain = compileHero(content, build, place);
    const leveled = compileHero(content, { ...build, spells }, place);
    const both = compileHero(content, { ...build, spells, awakened: true }, place);
    const awake = compileHero(content, { ...build, awakened: true }, place);
    // Les sorts ne dépendent que des niveaux de sort, le passif et les stats que de l'éveil.
    expect(both.spells).toEqual(leveled.spells);
    expect(both.spells).not.toEqual(plain.spells);
    expect(both.triggers).toEqual(awake.triggers);
    expect(both.stats).toEqual(awake.stats);
  });
});

describe('donjons d’essence', () => {
  it('ouverts après `openAfter`, paliers ouverts un à un, tous en mode test', () => {
    const fresh = newProfile(content, 3);
    expect(essencesOpen(content, fresh)).toBe(false);
    expect(reason(enterEssence(content, fresh, fire.id, 1, 0))).toBe('tier_locked');
    expect(reason(enterEssence(content, fresh, 'nope', 1, 0))).toBe('unknown_dungeon');
    const p = opened();
    expect(essenceTierOpen(content, p, fire.id, 1)).toBe(true);
    expect(essenceTierOpen(content, p, fire.id, 2)).toBe(false);
    expect(essenceTierOpen(content, p, fire.id, 0)).toBe(false);
    expect(essenceTierOpen(content, p, 'nope', 1)).toBe(false);
    expect(enterEssence(content, p, fire.id, 1, 0).ok).toBe(true);
    expect(reason(enterEssence(content, { ...p, team: [] }, fire.id, 1, 0))).toBe('bad_team');
    const sandbox = sandboxProfile(content);
    expect(essenceTierOpen(content, sandbox, fire.id, 3)).toBe(true);
    expect(reason(completeEssence(content, sandbox, fire.id, 1))).toBe('test_mode');
  });

  it('un passage donne des essences de la qualité du palier et ouvre le suivant', () => {
    expect(essenceDrop(content, 1)).toEqual({ quality: 1, amount: rules.drops[0] });
    expect(essenceDrop(content, 3)).toEqual({ quality: 3, amount: rules.drops[2] });
    let p = opened();
    const first = value(completeEssence(content, p, fire.id, 1));
    expect(first.report).toMatchObject({ element: 'fire', quality: 1, firstClear: true });
    p = first.profile;
    expect(p.essences.fire).toEqual([rules.drops[0], 0, 0]);
    expect(p.gold).toBe(0);
    expect(essenceTierReached(p, fire.id)).toBe(2);
    const replay = value(completeEssence(content, p, fire.id, 1));
    expect(replay.report.firstClear).toBe(false);
    expect(essenceTierReached(replay.profile, fire.id)).toBe(2);
    expect(reason(completeEssence(content, p, fire.id, 3))).toBe('tier_locked');
    expect(reason(completeEssence(content, p, 'nope', 1))).toBe('unknown_dungeon');
  });

  it('combats : ennemis de l’élément, niveau et PV/ATK du palier', () => {
    const boss = essenceEncounter(content, fire, 3, 2)!;
    expect(boss.level).toBe(fire.recommendedLevel + 2 * content.balance.tiers.levelsPerTier);
    expect(boss.atkPct).toBeGreaterThan(100);
    expect(essenceEncounter(content, fire, 1, 9)).toBeNull();
    expect(essenceDungeon(content, fire.id)).toBe(fire);
  });
});

describe('éveil : coût et conditions', () => {
  it('refusé sans niveau, sans essences ou sans or ; payé une seule fois', () => {
    expect(awakenCost(content, 'nope')).toBeNull();
    const cost = awakenCost(content, 'pyra')!;
    expect(cost.element).toBe('fire');
    const hero = { ...newProfile(content, 3).heroes.pyra!, level: rules.minLevel - 1 };
    const rich: Profile = {
      ...opened(),
      gold: rules.cost.gold,
      essences: { fire: [99, 99, 99], water: [0, 0, 0], nature: [0, 0, 0] },
      heroes: { ...opened().heroes, pyra: hero },
    };
    expect(reason(awaken(content, rich, 'nope'))).toBe('locked_hero');
    expect(reason(awaken(content, rich, 'pyra'))).toBe('level_too_low');
    const ready = { ...rich, heroes: { ...rich.heroes, pyra: { ...hero, level: rules.minLevel } } };
    expect(reason(awaken(content, { ...ready, gold: 0 }, 'pyra'))).toBe('not_enough_gold');
    const poor = { ...ready, essences: { ...ready.essences, fire: [0, 0, 0] as [0, 0, 0] } };
    expect(reason(awaken(content, poor, 'pyra'))).toBe('not_enough_essences');
    const done = value(awaken(content, ready, 'pyra'));
    expect(done.gold).toBe(0);
    expect(done.essences.fire).toEqual(
      [99, 99, 99].map((n, q) => n - (rules.cost.essences[q] ?? 0)),
    );
    expect(heroBuild(done, 'pyra').awakened).toBe(true);
    expect(heroBuild(ready, 'pyra').awakened).toBeUndefined();
    expect(reason(awaken(content, done, 'pyra'))).toBe('already_awakened');
    expect(reason(awaken(content, sandboxProfile(content), 'pyra'))).toBe('test_mode');
  });

  it('mode test : éveil réglable sans rien payer, refusé hors mode test', () => {
    const sandbox = sandboxProfile(content);
    const on = value(setAwakened(sandbox, 'sablier', true));
    expect(on.heroes.sablier?.awakened).toBe(true);
    expect(value(setAwakened(on, 'sablier', false)).heroes.sablier?.awakened).toBe(false);
    expect(reason(setAwakened(sandbox, 'nope', true))).toBe('unknown_hero');
    expect(reason(setAwakened(newProfile(content), 'pyra', true))).toBe('test_only');
    expect(
      sandboxProfile(content, [{ ...heroBuild(on, 'sablier') }]).heroes.sablier?.awakened,
    ).toBe(true);
  });

  it('une ancienne sauvegarde se charge : ni éveil, ni essences', () => {
    const old = JSON.parse(JSON.stringify(newProfile(content, 3))) as Record<string, unknown>;
    delete old.essences;
    delete old.essenceDungeons;
    const heroes = old.heroes as Record<string, Record<string, unknown>>;
    for (const hero of Object.values(heroes)) delete hero.awakened;
    const parsed = profileSchema.parse(old);
    expect(parsed.essences.water).toEqual([0, 0, 0]);
    expect(parsed.essenceDungeons).toEqual({});
    expect(parsed.heroes.pyra?.awakened).toBe(false);
  });
});
