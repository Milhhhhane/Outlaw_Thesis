import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  atStarGate,
  chestCount,
  chestSize,
  completeDungeon,
  fragmentRates,
  heroStars,
  levelCap,
  newProfile,
  openChest,
  sandboxProfile,
  setFocus,
  setLevel,
  starCost,
  starsForLevel,
  starUp,
  summonHero,
  xpToNext,
  type Outcome,
} from '../src';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = <T>(outcome: Outcome<T>): string => (outcome.ok ? 'ok' : outcome.reason);

const base = (): Profile => newProfile(content, 11, 0);
const withChests = (profile: Profile, chests: Record<string, number>): Profile => ({
  ...profile,
  chests,
});
const withFragments = (profile: Profile, fragments: Record<string, number>): Profile => ({
  ...profile,
  fragments,
});
const at = (
  profile: Profile,
  hero: string,
  change: Partial<Profile['heroes'][string]>,
): Profile => ({
  ...profile,
  heroes: { ...profile.heroes, [hero]: { ...profile.heroes[hero]!, ...change } },
});
const total = (fragments: Record<string, number>): number =>
  Object.values(fragments).reduce((sum, n) => sum + n, 0);

describe('étoiles et plafond de niveau', () => {
  it('une étoile par dizaine de niveaux : le 10 est encore à zéro, le 11 à une', () => {
    expect([1, 10, 11, 20, 21, 30].map((level) => starsForLevel(level, content))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });

  it('plafond : 10 à zéro étoile, 20 à une, 30 (maximum du jeu) à deux', () => {
    const hero = base().heroes.pyra!;
    expect(levelCap(hero, content)).toBe(10);
    expect(levelCap({ ...hero, stars: 1 }, content)).toBe(20);
    expect(levelCap({ ...hero, stars: 2 }, content)).toBe(30);
    expect(levelCap({ ...hero, stars: 9 }, content)).toBe(30);
  });

  it('une ancienne sauvegarde (niveau 25, aucune étoile) garde ses niveaux', () => {
    const hero = { ...base().heroes.pyra!, level: 25, stars: 0 };
    expect(heroStars(hero, content)).toBe(2);
    expect(levelCap(hero, content)).toBe(30);
    expect(atStarGate(hero, content)).toBe(false);
  });

  it('la porte : niveau plafonné sous le maximum du jeu, jamais au niveau 30', () => {
    const hero = base().heroes.pyra!;
    expect(atStarGate({ ...hero, level: 9 }, content)).toBe(false);
    expect(atStarGate({ ...hero, level: 10 }, content)).toBe(true);
    expect(atStarGate({ ...hero, level: 20, stars: 1 }, content)).toBe(true);
    expect(atStarGate({ ...hero, level: 30, stars: 2 }, content)).toBe(false);
  });
});

describe('ouverture d’un coffre', () => {
  it('donne la taille du palier en fragments et consomme le coffre', () => {
    const profile = withChests(base(), { bronze: 2, gold: 1 });
    expect(chestCount(profile)).toBe(3);
    expect(chestSize(content, 'bronze')).toBe(3);
    expect(chestSize(content, 'gold')).toBe(8);
    const opened = value(openChest(content, profile, 'gold'));
    expect(opened.report.tier).toBe('gold');
    expect(opened.report.fragments).toHaveLength(8);
    expect(total(opened.profile.fragments)).toBe(8);
    expect(opened.profile.chests).toEqual({ bronze: 2, gold: 0 });
    expect(opened.profile.seed).not.toBe(profile.seed);
    expect(profileSchema.parse(opened.profile)).toEqual(opened.profile);
    // Le rapport et les fragments racontent la même chose.
    const counted: Record<string, number> = {};
    for (const hero of opened.report.fragments) counted[hero] = (counted[hero] ?? 0) + 1;
    expect(counted).toEqual(opened.profile.fragments);
  });

  it('refuse un coffre qu’on n’a pas ou un palier inconnu', () => {
    expect(reason(openChest(content, base(), 'bronze'))).toBe('no_chest');
    expect(reason(openChest(content, withChests(base(), { diamant: 1 }), 'diamant'))).toBe(
      'no_chest',
    );
  });

  it('même profil, même tirage', () => {
    const profile = withChests(base(), { silver: 1 });
    expect(value(openChest(content, profile, 'silver'))).toEqual(
      value(openChest(content, profile, 'silver')),
    );
  });

  it('sans héros ciblé : tous les héros sortent, à peu près à parts égales', () => {
    let profile = withChests(base(), { gold: 400 });
    for (let i = 0; i < 400; i++) profile = value(openChest(content, profile, 'gold')).profile;
    const heroes = content.heroes.map((h) => h.id);
    const expected = (400 * 8) / heroes.length;
    for (const id of heroes) {
      expect(profile.fragments[id]).toBeGreaterThan(expected * 0.85);
      expect(profile.fragments[id]).toBeLessThan(expected * 1.15);
    }
  });

  it('héros ciblé : sa part monte au taux annoncé, le reste est au hasard', () => {
    const targeted = value(setFocus(content, withChests(base(), { gold: 400 }), 'ronce'));
    let profile = targeted;
    for (let i = 0; i < 400; i++) profile = value(openChest(content, profile, 'gold')).profile;
    const rates = fragmentRates(content, targeted);
    expect(rates.reduce((sum, r) => sum + r.pct, 0)).toBeCloseTo(100, 6);
    const ronce = rates.find((r) => r.hero === 'ronce')!.pct;
    const other = rates.find((r) => r.hero === 'pyra')!.pct;
    // 50 % ciblés + 50 % / 6 héros = 58,33 % ; les autres 8,33 %.
    expect(ronce).toBeCloseTo(58.333, 2);
    expect(other).toBeCloseTo(8.333, 2);
    const share = (profile.fragments.ronce ?? 0) / (400 * 8);
    expect(share).toBeGreaterThan(ronce / 100 - 0.04);
    expect(share).toBeLessThan(ronce / 100 + 0.04);
  });

  it('un héros ciblé inconnu du contenu est ignoré au tirage et à l’affichage', () => {
    const stale = { ...withChests(base(), { bronze: 1 }), focus: 'fantome' };
    const rates = fragmentRates(content, stale);
    expect(new Set(rates.map((r) => r.pct)).size).toBe(1);
    expect(total(value(openChest(content, stale, 'bronze')).profile.fragments)).toBe(3);
  });

  it('cibler : un héros connu ou personne, rien d’autre', () => {
    expect(value(setFocus(content, base(), 'seve')).focus).toBe('seve');
    expect(value(setFocus(content, { ...base(), focus: 'seve' }, null)).focus).toBeNull();
    expect(reason(setFocus(content, base(), 'fantome'))).toBe('unknown_hero');
  });
});

describe('invocation', () => {
  it('10 fragments invoquent un héros au niveau 1, étoile 0, sans toucher à l’équipe', () => {
    const profile = withFragments(base(), { ressac: 12 });
    const summoned = value(summonHero(content, profile, 'ressac'));
    expect(summoned.unlocked).toContain('ressac');
    expect(summoned.heroes.ressac).toMatchObject({ level: 1, stars: 0, talents: [] });
    expect(summoned.fragments.ressac).toBe(2);
    expect(summoned.team).toEqual(profile.team);
  });

  it('refuse sans assez de fragments, un héros déjà possédé ou inconnu', () => {
    expect(reason(summonHero(content, withFragments(base(), { ressac: 9 }), 'ressac'))).toBe(
      'not_enough_fragments',
    );
    expect(reason(summonHero(content, withFragments(base(), { pyra: 50 }), 'pyra'))).toBe(
      'already_unlocked',
    );
    expect(reason(summonHero(content, base(), 'fantome'))).toBe('unknown_hero');
  });
});

describe('étoiles', () => {
  const gate = (fragments: number): Profile =>
    withFragments(at(base(), 'pyra', { level: 10, xp: xpToNext(10, content) }), {
      pyra: fragments,
    });

  it('paie 10 fragments à la porte du niveau 10 et lève le plafond à 20', () => {
    const hero = gate(0).heroes.pyra!;
    expect(starCost(content, hero)).toBe(10);
    const raised = value(starUp(content, gate(14), 'pyra'));
    expect(raised.fragments.pyra).toBe(4);
    expect(raised.heroes.pyra).toMatchObject({ stars: 1, level: 11 });
    expect(levelCap(raised.heroes.pyra!, content)).toBe(20);
  });

  it('l’XP gardée à la porte sert aussitôt, mais pas plus d’un niveau d’avance', () => {
    const raised = value(starUp(content, gate(10), 'pyra'));
    // Plafond atteint avec un niveau d'XP en réserve : un niveau gagné, le reste intact.
    expect(raised.heroes.pyra!.level).toBe(11);
    expect(raised.heroes.pyra!.xp).toBe(0);
  });

  it('la deuxième étoile coûte 20 et il n’y en a pas de troisième au niveau 30', () => {
    const level20 = at(base(), 'pyra', { level: 20, stars: 1, xp: 0 });
    const second = value(starUp(content, withFragments(level20, { pyra: 25 }), 'pyra'));
    expect(second.fragments.pyra).toBe(5);
    expect(second.heroes.pyra).toMatchObject({ stars: 2, level: 20 });
    const maxed = at(base(), 'pyra', { level: 30, stars: 2 });
    expect(starCost(content, maxed.heroes.pyra!)).toBeNull();
    expect(reason(starUp(content, withFragments(maxed, { pyra: 999 }), 'pyra'))).toBe('max_star');
  });

  it('refuse sans assez de fragments, trop tôt, ou pour un héros non possédé', () => {
    expect(reason(starUp(content, gate(9), 'pyra'))).toBe('not_enough_fragments');
    const early = withFragments(at(base(), 'pyra', { level: 9 }), { pyra: 99 });
    expect(reason(starUp(content, early, 'pyra'))).toBe('not_at_cap');
    expect(reason(starUp(content, withFragments(base(), { ressac: 99 }), 'ressac'))).toBe(
      'locked_hero',
    );
  });
});

describe('coffres des donjons', () => {
  it('le premier passage donne toujours le coffre du donjon', () => {
    const first = value(completeDungeon(content, base(), 'ember_wastes'));
    expect(first.report.chest).toBe('bronze');
    expect(first.profile.chests).toEqual({ bronze: 1 });
    const deep = value(completeDungeon(content, base(), 'verdant_crown'));
    expect(deep.report.chest).toBe('gold');
  });

  it('un donjon rejoué redonne son coffre une fois sur deux environ', () => {
    let profile = value(completeDungeon(content, base(), 'ember_wastes')).profile;
    let chests = 0;
    const runs = 600;
    for (let i = 0; i < runs; i++) {
      const done = value(completeDungeon(content, profile, 'ember_wastes'));
      if (done.report.chest !== null) chests++;
      profile = done.profile;
    }
    const rate = content.balance.chests.replayChestRate;
    expect(chests / runs).toBeGreaterThan(rate - 0.07);
    expect(chests / runs).toBeLessThan(rate + 0.07);
    expect(profile.chests.bronze).toBe(chests + 1);
  });

  it('ajouter le coffre ne change pas le butin du premier passage', () => {
    const a = value(completeDungeon(content, base(), 'thorn_maze'));
    expect(a.report.item.item).toBe(
      value(completeDungeon(content, base(), 'thorn_maze')).report.item.item,
    );
  });

  it('au plafond d’étoile, un héros ne dépasse pas le niveau 10 même à coups de donjons', () => {
    let profile = base();
    for (let i = 0; i < 40; i++) {
      profile = value(completeDungeon(content, profile, 'thorn_maze')).profile;
    }
    expect(profile.heroes.pyra!.level).toBe(10);
    expect(atStarGate(profile.heroes.pyra!, content)).toBe(true);
    const raised = value(starUp(content, withFragments(profile, { pyra: 10 }), 'pyra'));
    expect(raised.heroes.pyra!.level).toBeGreaterThan(10);
  });
});

describe('mode test', () => {
  it('héros au maximum, aucune étoile à payer, niveau libre cohérent avec les étoiles', () => {
    const sandbox = sandboxProfile(content);
    expect(sandbox.heroes.pyra).toMatchObject({ level: 30, stars: 2 });
    const lowered = value(setLevel(content, sandbox, 'pyra', 12));
    expect(lowered.heroes.pyra).toMatchObject({ level: 12, stars: 1 });
    expect(reason(starUp(content, sandbox, 'pyra'))).toBe('max_star');
    expect(reason(summonHero(content, sandbox, 'pyra'))).toBe('already_unlocked');
  });
});
