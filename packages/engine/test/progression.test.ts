import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  addXp,
  completeDungeon,
  dungeonOpen,
  energyAt,
  enterDungeon,
  equip,
  heroBuild,
  lootRates,
  newProfile,
  nextRandom,
  respec,
  respecCost,
  setTeam,
  starterHeroes,
  takeTalent,
  upgradeCost,
  upgradeItem,
  xpToNext,
  type Outcome,
} from '../src/progression';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const withLevel = (profile: Profile, hero: string, level: number): Profile => ({
  ...profile,
  heroes: { ...profile.heroes, [hero]: { ...profile.heroes[hero]!, level } },
});

describe('profil', () => {
  it('nouveau profil valide : héros de départ au niveau 1, équipe complète', () => {
    const profile = newProfile(content, 7, 1000);
    expect(profileSchema.parse(profile)).toEqual(profile);
    expect(starterHeroes(content)).toEqual(['pyra', 'maree', 'ronce']);
    expect(profile.team).toEqual(['pyra', 'maree', 'ronce']);
    expect(profile.heroes.pyra).toEqual({
      level: 1,
      xp: 0,
      talents: [],
      items: [null, null],
      freeRespecUsed: false,
    });
  });
});

describe('XP et niveaux', () => {
  it('courbe base × N^exposant, plusieurs niveaux d’un coup, plafond', () => {
    expect(xpToNext(1, content)).toBe(40);
    expect(xpToNext(4, content)).toBe(320);
    const hero = newProfile(content).heroes.pyra!;
    expect(addXp(hero, 39, content)).toEqual({ hero: { ...hero, xp: 39 }, levels: 0 });
    const twice = addXp(hero, 40 + 113 + 5, content); // 40 (1→2) + 113 (2→3)
    expect(twice.levels).toBe(2);
    expect(twice.hero).toMatchObject({ level: 3, xp: 5 });
    const capped = addXp(hero, 10 ** 9, content);
    expect(capped.hero).toMatchObject({ level: 30, xp: 0 });
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
      { uid: 1, item: 'ember_charm', upgrade: 0 },
      { uid: 2, item: 'ember_charm', upgrade: 1 },
      { uid: 3, item: 'iron_band', upgrade: 3 },
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

  it('amélioration : or et matériaux, trois niveaux', () => {
    expect(upgradeCost(content, 0)).toEqual({ gold: 100, materials: { tier: 1, amount: 5 } });
    expect(upgradeCost(content, 3)).toBeNull();
    expect(upgradeItem(content, owned, 1)).toEqual({ ok: false, reason: 'not_enough_gold' });
    expect(upgradeItem(content, { ...owned, gold: 100 }, 1)).toEqual({
      ok: false,
      reason: 'not_enough_materials',
    });
    const rich = { ...owned, gold: 150, materials: [6, 0, 0] as Profile['materials'] };
    const upgraded = value(upgradeItem(content, rich, 1));
    expect(upgraded).toMatchObject({ gold: 50, materials: [1, 0, 0] });
    expect(upgraded.items[0]).toEqual({ uid: 1, item: 'ember_charm', upgrade: 1 });
    expect(upgradeItem(content, rich, 3)).toEqual({ ok: false, reason: 'max_upgrade' });
    expect(upgradeItem(content, rich, 42)).toEqual({ ok: false, reason: 'unknown_item' });
  });
});

describe('équipe et énergie', () => {
  it('1 à 3 héros débloqués, sans doublon', () => {
    const profile = newProfile(content);
    expect(value(setTeam(profile, ['ronce'])).team).toEqual(['ronce']);
    expect(setTeam(profile, [])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(profile, ['pyra', 'pyra'])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(profile, ['ghost'])).toEqual({ ok: false, reason: 'locked_hero' });
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
    let profile = value(setTeam(newProfile(content, 3), ['pyra', 'maree']));
    expect(dungeonOpen(content, profile, 'ember_wastes')).toBe(true);
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(false);
    const first = value(completeDungeon(content, profile, 'ember_wastes'));
    profile = first.profile;
    expect(first.report).toMatchObject({
      firstClear: true,
      gold: 80,
      materials: { tier: 1, amount: 4 },
    });
    expect(first.report.xp.pyra).toEqual({ gained: 60, levels: 1 });
    expect(first.report.xp.ronce).toEqual({ gained: 30, levels: 0 });
    expect(profile.items).toHaveLength(1);
    expect(profile.dungeons.ember_wastes).toEqual({ clears: 1 });
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(true);
    expect(dungeonOpen(content, { ...profile, testMode: true }, 'thorn_maze')).toBe(true);
    expect(dungeonOpen(content, profile, 'nowhere')).toBe(false);
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('même profil, même butin ; rare garanti au 5e donjon sans rare', () => {
    const profile = newProfile(content, 99);
    expect(value(completeDungeon(content, profile, 'ember_wastes')).report.item).toEqual(
      value(completeDungeon(content, profile, 'ember_wastes')).report.item,
    );
    let current = profile;
    let sinceRare = 0;
    for (let i = 0; i < 40; i++) {
      const { profile: next, report } = value(completeDungeon(content, current, 'ember_wastes'));
      const rare = content.itemById.get(report.item.item)?.rarity === 'rare';
      if (sinceRare === 4) expect(rare).toBe(true);
      if (report.item.guaranteed) expect(sinceRare).toBe(4);
      sinceRare = rare ? 0 : sinceRare + 1;
      expect(next.sinceRare).toBe(sinceRare);
      current = next;
    }
    expect(completeDungeon(content, profile, 'nowhere')).toEqual({
      ok: false,
      reason: 'unknown_dungeon',
    });
  });

  it('taux affichés et générateur à graine', () => {
    const dungeon = content.dungeonById.get('ember_wastes')!;
    const rates = lootRates(dungeon);
    expect(rates.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
    expect(rates[0]).toEqual({ item: 'ember_charm', pct: 25 });
    const a = nextRandom(5);
    expect(nextRandom(5)).toEqual(a);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
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
