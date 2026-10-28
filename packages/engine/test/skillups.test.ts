import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  compileHero,
  completeDungeon,
  heroBuild,
  newProfile,
  openChest,
  sandboxProfile,
  setSpellLevel,
  spellMaxCost,
  spellPowerPct,
  spellUp,
  spellUpCost,
  validateBuild,
  type HeroBuild,
  type Outcome,
} from '../src';

const content = loadContent();
const { spellLevels } = content.balance;
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
const at = { side: 'player', slot: 0 } as const;
const all = (n: number) => ({ basic: n, a: n, b: n, ult: n });

describe('montée des sorts : compilation', () => {
  const build: HeroBuild = { hero: 'pyra', level: 10, talents: [], items: [] };
  const base = compileHero(content, build, at);

  it('chaque niveau ajoute powerPctPerLevel % aux dégâts, soins et boucliers ; le dernier, son bonus', () => {
    expect(spellPowerPct(content.balance, 1)).toBe(0);
    const maxed = compileHero(content, { ...build, spells: all(spellLevels.max) }, at);
    const pct = spellPowerPct(content.balance, spellLevels.max);
    expect(pct).toBe(spellLevels.powerPctPerLevel * (spellLevels.max - 1));
    base.spells.forEach((spell, i) => {
      const leveled = maxed.spells[i]!;
      spell.effects.forEach((effect, j) => {
        const after = leveled.effects[j]!;
        if (effect.kind === 'damage' || effect.kind === 'heal' || effect.kind === 'shield') {
          expect(after).toMatchObject({ power: Math.round(effect.power * (1 + pct / 100)) });
        } else expect(after).toEqual(effect);
      });
      const bonus = spellLevels.capstone[spell.slot];
      expect(leveled.cost).toBe(Math.max(0, spell.cost + bonus.cost));
      expect(leveled.delay).toBe(Math.max(1, spell.delay + bonus.delay));
    });
    // Un niveau intermédiaire : la puissance, pas le bonus du dernier niveau.
    const mid = compileHero(content, { ...build, spells: { ...all(1), ult: 2 } }, at);
    const ult = mid.spells.find((s) => s.slot === 'ult')!;
    expect(ult.delay).toBe(base.spells.find((s) => s.slot === 'ult')!.delay);
    expect(compileHero(content, { ...build, spells: all(1) }, at)).toEqual(base);
  });

  it('refuse un niveau de sort hors bornes', () => {
    expect(validateBuild(content, { ...build, spells: { ...all(1), a: 0 } })).toHaveLength(1);
    expect(
      validateBuild(content, { ...build, spells: { ...all(1), b: spellLevels.max + 1 } }),
    ).toHaveLength(1);
  });
});

describe('montée des sorts : profil', () => {
  const rich = (): Profile => {
    const p = newProfile(content, 5);
    return { ...p, grimoires: 100, fragments: { pyra: 100 } };
  };

  it('une ancienne sauvegarde charge avec tous les sorts au niveau 1 et aucun grimoire', () => {
    // Sauvegarde d'avant la montée des sorts : ni `grimoires`, ni `spells` par héros.
    const old: Record<string, unknown> = { ...newProfile(content, 5) };
    delete old.grimoires;
    const heroes = Object.fromEntries(
      Object.entries(newProfile(content, 5).heroes).map(([id, hero]) => {
        const legacy: Record<string, unknown> = { ...hero };
        delete legacy.spells;
        return [id, legacy];
      }),
    );
    const parsed = profileSchema.parse({ ...old, heroes });
    expect(parsed.grimoires).toBe(0);
    expect(parsed.heroes.pyra?.spells).toEqual(all(1));
  });

  it('monter un sort paie grimoires et fragments, jusqu’au maximum', () => {
    let p = rich();
    for (let level = 1; level < spellLevels.max; level++)
      p = value(spellUp(content, p, 'pyra', 'a'));
    const total = spellMaxCost(content);
    expect(p.heroes.pyra?.spells.a).toBe(spellLevels.max);
    expect(p.grimoires).toBe(100 - total.grimoires);
    expect(p.fragments.pyra).toBe(100 - total.fragments);
    expect(spellUpCost(content, spellLevels.max)).toBeNull();
    expect(reason(spellUp(content, p, 'pyra', 'a'))).toBe('max_spell_level');
    expect(heroBuild(p, 'pyra').spells?.a).toBe(spellLevels.max);
  });

  it('refuse sans grimoires, sans fragments, pour un héros absent ou en mode test', () => {
    const p = rich();
    expect(reason(spellUp(content, { ...p, grimoires: 0 }, 'pyra', 'b'))).toBe(
      'not_enough_grimoires',
    );
    expect(reason(spellUp(content, { ...p, fragments: {} }, 'pyra', 'b'))).toBe(
      'not_enough_fragments',
    );
    expect(reason(spellUp(content, p, 'phenix', 'b'))).toBe('locked_hero');
    expect(reason(spellUp(content, { ...p, testMode: true }, 'pyra', 'b'))).toBe('test_mode');
  });

  it('mode test : niveaux réglables, bornés, un sort ou tous', () => {
    const sandbox = sandboxProfile(content);
    const one = value(setSpellLevel(content, sandbox, 'pyra', 'ult', 99));
    expect(one.heroes.pyra?.spells).toEqual({ ...all(1), ult: spellLevels.max });
    const every = value(setSpellLevel(content, one, 'pyra', null, 0));
    expect(every.heroes.pyra?.spells).toEqual(all(1));
    expect(reason(setSpellLevel(content, newProfile(content), 'pyra', 'a', 2))).toBe('test_only');
    expect(reason(setSpellLevel(content, sandbox, 'inconnu', 'a', 2))).toBe('unknown_hero');
    // Un lien partagé garde ses niveaux de sort.
    const shared = sandboxProfile(content, [
      { hero: 'pyra', level: 10, talents: [], items: [], spells: { ...all(1), a: 3 } },
    ]);
    expect(shared.heroes.pyra?.spells.a).toBe(3);
  });

  it('les grimoires tombent des paliers II et III et des coffres', () => {
    const p = newProfile(content, 5);
    const first = value(completeDungeon(content, p, 'ember_wastes', 1));
    expect(first.report.grimoires).toBe(spellLevels.grimoires.tiers[0]);
    const second = value(completeDungeon(content, first.profile, 'ember_wastes', 2));
    expect(second.report.grimoires).toBe(spellLevels.grimoires.tiers[1]);
    expect(second.profile.grimoires).toBe(first.profile.grimoires + second.report.grimoires);
    const gold = value(openChest(content, { ...p, chests: { gold: 1 } }, 'gold'));
    expect(gold.report.grimoires).toBe(spellLevels.grimoires.chests.gold);
    expect(gold.profile.grimoires).toBe(spellLevels.grimoires.chests.gold);
  });
});
