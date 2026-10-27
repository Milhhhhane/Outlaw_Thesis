import { compileTeam, createBattle, type HeroBuild } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import { battleSetupSchema, unitDefSchema } from '../src/schemas';
import { balance, content, talentsFor } from './helpers';

/**
 * Le schéma des unités compilées est bâti sur celui du contenu. Si un talent, un objet ou une
 * amélioration produisait une valeur qu'il refuse, un salon ne pourrait plus se restaurer :
 * on le vérifie ici sur toutes les combinaisons héros × niveau × objet × amélioration.
 */
describe('schémas des unités compilées', () => {
  const maxUpgrade = balance.progression.items.maxUpgradeLevel;

  it('acceptent chaque héros à chaque niveau, avec chaque objet à chaque amélioration', () => {
    let checked = 0;
    for (const hero of content.heroes) {
      for (const level of [1, 10, 20, 30]) {
        const talents = talentsFor(hero.id, level);
        const variants: HeroBuild['items'][] = [[]];
        for (const item of content.items) {
          for (let upgrade = 0; upgrade <= maxUpgrade; upgrade++) {
            variants.push([{ id: item.id, upgrade }]);
          }
        }
        for (const items of variants) {
          const [unit] = compileTeam(content, [{ hero: hero.id, level, talents, items }], 'enemy');
          const parsed = unitDefSchema.safeParse(unit);
          expect(parsed.success, `${hero.id} niveau ${level} ${JSON.stringify(items)}`).toBe(true);
          if (parsed.success) expect(parsed.data).toEqual(unit);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('acceptent deux objets sur un héros', () => {
    const items = content.items.slice(0, 2).map((item) => ({ id: item.id, upgrade: maxUpgrade }));
    const builds = ['pyra', 'maree', 'ronce'].map((hero) => ({
      hero,
      level: 30,
      talents: talentsFor(hero, 30),
      items,
    }));
    const setup = {
      units: [
        ...compileTeam(content, builds, 'player'),
        ...compileTeam(content, builds, 'enemy'),
      ].map((unit, index) => ({ ...unit, id: `u${index}` })),
      rules: { firstSide: 'enemy', limit: 'hp_ratio' },
    };
    const parsed = battleSetupSchema.parse(setup);
    expect(parsed).toEqual(setup);
    expect(() => createBattle(parsed, balance)).not.toThrow();
  });

  it('refusent une unité altérée', () => {
    const [unit] = compileTeam(
      content,
      [{ hero: 'pyra', level: 5, talents: [], items: [] }],
      'player',
    );
    expect(unitDefSchema.safeParse({ ...unit, extra: 1 }).success).toBe(false);
    expect(unitDefSchema.safeParse({ ...unit, slot: 3 }).success).toBe(false);
    expect(unitDefSchema.safeParse({ ...unit, stats: { ...unit!.stats, hp: 0 } }).success).toBe(
      false,
    );
    expect(unitDefSchema.safeParse({ ...unit, controller: 'human' }).success).toBe(false);
    expect(battleSetupSchema.safeParse({ units: [unit] }).success).toBe(false);
  });
});
