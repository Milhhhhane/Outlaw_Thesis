import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  addXp,
  canLevelUp,
  completeDungeon,
  dungeonOpen,
  energyAt,
  enterDungeon,
  equip,
  heroBuild,
  levelDustTier,
  levelUp,
  levelUpCost,
  levelUpMax,
  newProfile,
  respec,
  respecCost,
  SANDBOX_COPIES,
  sandboxProfile,
  setLevel,
  setTeam,
  setUpgrade,
  starterHeroes,
  takeTalent,
  xpToNext,
  type Outcome,
} from '../src/progression';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
const withLevel = (profile: Profile, hero: string, level: number): Profile => ({
  ...profile,
  heroes: { ...profile.heroes, [hero]: { ...profile.heroes[hero]!, level } },
});

describe('profil', () => {
  it('nouveau profil valide : héros de départ au niveau 1, équipe complète', () => {
    const profile = newProfile(content, 7, 1000);
    expect(profileSchema.parse(profile)).toEqual(profile);
    expect(starterHeroes(content)).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
    expect(profile.team).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
    expect(profile.heroes.pyra).toEqual({
      level: 1,
      xp: 0,
      talents: [],
      items: [null, null],
      freeRespecUsed: false,
      stars: 0,
    });
    expect(profile.fragments).toEqual({});
    expect(profile.chests).toEqual({});
    expect(profile.focus).toBeNull();
  });

  it('une sauvegarde d’avant les coffres reste lisible, sans perdre ses niveaux', () => {
    const profile = newProfile(content, 7, 1000);
    const old = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
    delete old.fragments;
    delete old.chests;
    delete old.focus;
    for (const hero of Object.values(old.heroes as Record<string, Record<string, unknown>>)) {
      delete hero.stars;
    }
    const read = profileSchema.parse(old);
    expect(read).toEqual(profile);
  });
});

describe('XP et niveaux', () => {
  const dust = (profile: Profile, materials: Profile['materials']): Profile => ({
    ...profile,
    materials,
  });

  it('l’XP se met en banque, le niveau se paie en XP et en poussière du palier', () => {
    expect(xpToNext(1, content)).toBe(40);
    expect(xpToNext(4, content)).toBe(320);
    const base = newProfile(content);
    const hero = base.heroes.pyra!;
    // Rien ne monte tout seul, quelle que soit l'XP.
    expect(addXp(hero, 10 ** 6, content)).toEqual({ ...hero, xp: 10 ** 6 });
    expect(levelUpCost(content, hero)).toEqual({ xp: 40, dust: { tier: 1, amount: 2 } });
    expect(levelDustTier(content, 7)).toBe(1);
    expect(levelDustTier(content, 8)).toBe(2);
    expect(levelDustTier(content, 22)).toBe(3);

    const banked = { ...base, heroes: { ...base.heroes, pyra: { ...hero, xp: 40 + 113 + 5 } } };
    expect(reason(levelUp(content, banked, 'pyra'))).toBe('not_enough_materials');
    expect(reason(levelUp(content, dust(base, [9, 0, 0]), 'pyra'))).toBe('not_enough_xp');
    expect(canLevelUp(content, dust(banked, [9, 0, 0]), banked.heroes.pyra)).toBe(true);
    const once = value(levelUp(content, dust(banked, [9, 0, 0]), 'pyra'));
    expect(once.heroes.pyra).toMatchObject({ level: 2, xp: 113 + 5 });
    expect(once.materials).toEqual([7, 0, 0]);
    // « Au maximum » : deux niveaux possibles, le troisième manque d'XP.
    const twice = value(levelUpMax(content, dust(banked, [9, 0, 0]), 'pyra'));
    expect(twice.heroes.pyra).toMatchObject({ level: 3, xp: 5 });
    expect(twice.materials).toEqual([5, 0, 0]);
    expect(reason(levelUpMax(content, twice, 'pyra'))).toBe('not_enough_xp');
    expect(reason(levelUp(content, base, 'nope'))).toBe('locked_hero');
  });

  it('plafond d’étoile et niveau maximum', () => {
    const base = newProfile(content);
    const gated = {
      ...dust(base, [99, 99, 99]),
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 10, xp: 10 ** 6 } },
    };
    expect(reason(levelUp(content, gated, 'pyra'))).toBe('star_gate');
    expect(canLevelUp(content, gated, gated.heroes.pyra)).toBe(false);
    const maxed = {
      ...gated,
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 30, xp: 50, stars: 2 } },
    };
    expect(levelUpCost(content, maxed.heroes.pyra)).toBeNull();
    expect(reason(levelUp(content, maxed, 'pyra'))).toBe('max_level');
    expect(addXp(maxed.heroes.pyra, 500, content)).toMatchObject({ level: 30, xp: 0 });
    // Le dernier niveau vide la banque.
    const almost = {
      ...gated,
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 29, xp: 10 ** 6, stars: 2 } },
    };
    expect(value(levelUp(content, almost, 'pyra')).heroes.pyra).toMatchObject({ level: 30, xp: 0 });
  });
});

describe('talents et respec', () => {
  it('prend un talent seulement si le build reste valide', () => {
    let profile = newProfile(content);
    expect(takeTalent(content, profile, 'pyra', 'pyra_exe_core')).toEqual({
      ok: false,
      reason: 'talent_invalid',
    });
    profile = withLevel(profile, 'pyra', 6);
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_cheap'));
    expect(takeTalent(content, profile, 'pyra', 'pyra_exe_finisher')).toMatchObject({ ok: false });
    expect(takeTalent(content, profile, 'pyra', 'nope')).toEqual({
      ok: false,
      reason: 'unknown_node',
    });
    expect(takeTalent(content, profile, 'ghost', 'pyra_exe_core')).toEqual({
      ok: false,
      reason: 'unknown_hero',
    });
    expect(heroBuild(profile, 'pyra').talents).toEqual(['pyra_exe_core', 'pyra_exe_cheap']);
  });

  it('premier respec gratuit, puis or × niveau ; gratuit en mode test', () => {
    let profile = withLevel(newProfile(content), 'pyra', 6);
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    expect(respecCost(content, profile, 'pyra')).toBe(0);
    profile = value(respec(content, profile, 'pyra'));
    expect(profile.heroes.pyra?.talents).toEqual([]);
    expect(respec(content, profile, 'pyra')).toEqual({ ok: false, reason: 'no_talent' });
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    expect(respecCost(content, profile, 'pyra')).toBe(120);
    expect(respec(content, profile, 'pyra')).toEqual({ ok: false, reason: 'not_enough_gold' });
    profile = value(respec(content, { ...profile, gold: 200 }, 'pyra'));
    expect(profile.gold).toBe(80);
    expect(respecCost(content, { ...profile, testMode: true }, 'pyra')).toBe(0);
  });
});

describe('objets', () => {
  const owned: Profile = {
    ...newProfile(content),
    items: [
      { uid: 1, item: 'ember_charm', upgrade: 0, copies: 0 },
      { uid: 2, item: 'ember_charm', upgrade: 1, copies: 0 },
      { uid: 3, item: 'iron_band', upgrade: 3, copies: 0 },
    ],
    nextUid: 4,
  };

  it('équipe, déplace d’un héros à l’autre et refuse les doublons', () => {
    let profile = value(equip(content, owned, 'pyra', 0, 1));
    expect(heroBuild(profile, 'pyra').items).toEqual([{ id: 'ember_charm', upgrade: 0 }]);
    expect(equip(content, profile, 'pyra', 1, 2)).toEqual({ ok: false, reason: 'bad_slot' });
    profile = value(equip(content, profile, 'maree', 1, 1));
    expect(profile.heroes.pyra?.items).toEqual([null, null]);
    expect(profile.heroes.maree?.items).toEqual([null, 1]);
    profile = value(equip(content, profile, 'maree', 1, null));
    expect(profile.heroes.maree?.items).toEqual([null, null]);
    expect(equip(content, profile, 'maree', 2, 1)).toEqual({ ok: false, reason: 'bad_slot' });
    expect(equip(content, profile, 'maree', 0, 99)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(equip(content, profile, 'ghost', 0, 1)).toEqual({ ok: false, reason: 'unknown_hero' });
  });
});

describe('équipe et énergie', () => {
  it('1 à teamSize héros débloqués, sans doublon', () => {
    const profile = newProfile(content);
    const size = content.balance.progression.teamSize;
    expect(size).toBe(4);
    expect(profile.team).toHaveLength(size);
    expect(
      setTeam(content, profile, [...content.heroes.map((h) => h.id), 'ghost'].slice(0, size + 1)),
    ).toEqual({ ok: false, reason: 'bad_team' });
    expect(value(setTeam(content, profile, ['ronce'])).team).toEqual(['ronce']);
    expect(setTeam(content, profile, [])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(content, profile, ['pyra', 'pyra'])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(content, profile, ['ghost'])).toEqual({ ok: false, reason: 'locked_hero' });
  });

  it('l’énergie existe mais ne coûte rien dans le MVP', () => {
    const profile = { ...newProfile(content, 1, 0), energy: { value: 10, updatedAt: 0 } };
    expect(energyAt(content, profile, 5 * 60000)).toBe(15);
    expect(energyAt(content, profile, 10 ** 9)).toBe(content.balance.energy.cap);
    expect(value(enterDungeon(content, profile, 'ember_wastes', 60000)).energy).toEqual({
      value: 11,
      updatedAt: 60000,
    });
    expect(enterDungeon(content, profile, 'nowhere', 0)).toEqual({
      ok: false,
      reason: 'unknown_dungeon',
    });
    expect(enterDungeon(content, { ...profile, team: [] }, 'ember_wastes', 0)).toEqual({
      ok: false,
      reason: 'bad_team',
    });
  });
});

describe('donjons et butin', () => {
  it('récompenses : XP (repos réduit), or, matériaux, objet, ouverture du suivant', () => {
    let profile = value(setTeam(content, newProfile(content, 3), ['pyra', 'maree']));
    expect(dungeonOpen(content, profile, 'ember_wastes')).toBe(true);
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(false);
    const first = value(completeDungeon(content, profile, 'ember_wastes'));
    profile = first.profile;
    expect(first.report).toMatchObject({
      firstClear: true,
      gold: 80,
      materials: { tier: 1, amount: 4 },
    });
    expect(first.report.xp.pyra).toEqual({ gained: 100, ready: true });
    expect(first.report.xp.ronce).toEqual({ gained: 50, ready: true });
    expect(profile.heroes.pyra).toMatchObject({ level: 1, xp: 100 });
    expect(profile.items).toHaveLength(1);
    expect(profile.dungeons.ember_wastes).toEqual({ clears: 1, dry: 0 });
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(true);
    expect(dungeonOpen(content, { ...profile, testMode: true }, 'thorn_maze')).toBe(true);
    expect(dungeonOpen(content, profile, 'nowhere')).toBe(false);
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('déblocage d’un héros au niveau recommandé du donjon', () => {
    const custom = {
      ...content,
      dungeons: content.dungeons.map((d) =>
        d.id === 'drowned_halls' ? { ...d, unlocksHero: 'ronce' } : d,
      ),
    };
    custom.dungeonById = new Map(custom.dungeons.map((d) => [d.id, d]));
    const start = { ...newProfile(custom), unlocked: ['pyra', 'maree'], team: ['pyra', 'maree'] };
    const { profile, report } = value(completeDungeon(custom, start, 'drowned_halls'));
    expect(report.unlockedHero).toBe('ronce');
    expect(profile.unlocked).toContain('ronce');
    expect(profile.heroes.ronce?.level).toBe(4);
  });
});

describe('mode test', () => {
  it('tout débloqué, niveau maximum, objets améliorés, rien n’est gagné', () => {
    const sandbox = sandboxProfile(content);
    expect(profileSchema.parse(sandbox)).toEqual(sandbox);
    expect(sandbox.testMode).toBe(true);
    expect(sandbox.unlocked).toEqual(content.heroes.map((h) => h.id));
    expect(sandbox.heroes.pyra?.level).toBe(30);
    expect(sandbox.items).toHaveLength(content.items.length * SANDBOX_COPIES);
    expect(new Set(sandbox.items.map((i) => i.upgrade))).toEqual(new Set([3]));
    expect(dungeonOpen(content, sandbox, 'broken_crossing')).toBe(true);
    expect(completeDungeon(content, sandbox, 'ember_wastes')).toEqual({
      ok: false,
      reason: 'test_mode',
    });
    expect(respecCost(content, sandbox, 'pyra')).toBe(0);
  });

  it('préremplit l’équipe depuis des builds partagés', () => {
    const sandbox = sandboxProfile(content, [
      {
        hero: 'ronce',
        level: 12,
        talents: ['ronce_snare_core'],
        items: [{ id: 'storm_sigil', upgrade: 1 }],
      },
      {
        hero: 'pyra',
        level: 5,
        talents: [],
        items: [
          { id: 'storm_sigil', upgrade: 2 },
          { id: 'nope', upgrade: 0 },
        ],
      },
    ]);
    expect(sandbox.team).toEqual(['ronce', 'pyra']);
    expect(heroBuild(sandbox, 'ronce')).toEqual({
      hero: 'ronce',
      level: 12,
      talents: ['ronce_snare_core'],
      items: [{ id: 'storm_sigil', upgrade: 1 }],
    });
    expect(heroBuild(sandbox, 'pyra').items).toEqual([{ id: 'storm_sigil', upgrade: 2 }]);
  });

  it('niveau libre : les talents en trop tombent ; amélioration libre', () => {
    let sandbox = sandboxProfile(content, [
      {
        hero: 'pyra',
        level: 9,
        talents: ['pyra_exe_core', 'pyra_exe_focus', 'pyra_exe_refund'],
        items: [],
      },
    ]);
    sandbox = value(setLevel(content, sandbox, 'pyra', 2));
    expect(sandbox.heroes.pyra).toMatchObject({ level: 2, talents: ['pyra_exe_core'] });
    expect(value(setLevel(content, sandbox, 'pyra', 99)).heroes.pyra?.level).toBe(30);
    expect(setLevel(content, sandbox, 'ghost', 3)).toEqual({ ok: false, reason: 'unknown_hero' });
    expect(setLevel(content, newProfile(content), 'pyra', 3)).toEqual({
      ok: false,
      reason: 'test_only',
    });
    expect(value(setUpgrade(content, sandbox, 1, 7)).items[0]?.upgrade).toBe(3);
    expect(value(setUpgrade(content, sandbox, 1, 0)).items[0]?.upgrade).toBe(0);
    expect(setUpgrade(content, sandbox, 9999, 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(setUpgrade(content, newProfile(content), 1, 1)).toEqual({
      ok: false,
      reason: 'test_only',
    });
  });
});
