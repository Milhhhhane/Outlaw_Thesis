import { loadContent, type Content, type Item } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  compileEncounter,
  compileEnemy,
  compileHero,
  compileTeam,
  modifierTriggers,
  talentPoints,
  unlockedPages,
  validateBuild,
  type HeroBuild,
} from '../src/compile';
import { InvalidSetupError } from '../src/errors';

const base = loadContent();
const testItems: Item[] = [
  { id: 'it_scale', rarity: 'common', mods: [{ type: 'scale', field: 'power', mulPct: 20 }] },
  { id: 'it_threshold', rarity: 'rare', mods: [{ type: 'threshold', delta: 10 }] },
  { id: 'it_limit', rarity: 'common', mods: [{ type: 'limit', delta: 1 }] },
  {
    id: 'it_add',
    rarity: 'rare',
    stat: { stat: 'hp', pct: 8 },
    mods: [{ type: 'addEffect', effect: { kind: 'heal', target: 'self', power: 20 } }],
  },
];
const content: Content = {
  ...base,
  items: testItems,
  itemById: new Map(testItems.map((item) => [item.id, item])),
};
const { balance } = content;

const build = (partial: Partial<HeroBuild> & { hero: string }): HeroBuild => ({
  level: 1,
  talents: [],
  items: [],
  ...partial,
});
const spellOf = (unit: ReturnType<typeof compileHero>, id: string) =>
  unit.spells.find((s) => s.id === id)!;

describe('points et pages', () => {
  it('1 point tous les 3 niveaux, pages aux niveaux 1, 10 et 20', () => {
    expect([1, 3, 5, 6, 30].map((l) => talentPoints(l, balance))).toEqual([0, 1, 1, 2, 10]);
    expect([1, 9, 10, 19, 20, 30].map((l) => unlockedPages(l, balance))).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });
});

describe('validation d’un build', () => {
  const issues = (b: Partial<HeroBuild>) => validateBuild(content, build({ hero: 'pyra', ...b }));

  it('accepte un build valide', () => {
    expect(issues({ level: 6, talents: ['pyra_exe_core', 'pyra_exe_cheap'] })).toEqual([]);
  });

  it.each<[string, Partial<HeroBuild> & { hero?: string }, RegExp]>([
    ['héros inconnu', { hero: 'nobody' }, /héros inconnu/],
    ['niveau', { level: 0 }, /niveau 0/],
    ['talent inconnu', { level: 3, talents: ['nope'] }, /talent inconnu/],
    ['doublon', { level: 6, talents: ['pyra_exe_core', 'pyra_exe_core'] }, /deux fois/],
    ['page verrouillée', { level: 9, talents: ['pyra_tempo_core'] }, /verrouillée/],
    ['prérequis', { level: 3, talents: ['pyra_exe_focus'] }, /exige pyra_exe_core/],
    [
      'choix exclusif',
      { level: 9, talents: ['pyra_exe_core', 'pyra_exe_finisher', 'pyra_exe_cheap'] },
      /choix exclusif/,
    ],
    [
      'trop de points',
      { level: 3, talents: ['pyra_exe_core', 'pyra_exe_focus'] },
      /2 talents pour 1/,
    ],
    [
      'trop d’objets',
      { items: ['it_scale', 'it_limit', 'it_add'].map((id) => ({ id, upgrade: 0 })) },
      /3 objets/,
    ],
    ['objet inconnu', { items: [{ id: 'nope', upgrade: 0 }] }, /objet inconnu/],
    [
      'objet en double',
      {
        items: [
          { id: 'it_add', upgrade: 0 },
          { id: 'it_add', upgrade: 1 },
        ],
      },
      /deux fois/,
    ],
    ['amélioration', { items: [{ id: 'it_add', upgrade: 4 }] }, /amélioration 4/],
  ])('%s', (_name, b, pattern) => {
    expect(issues(b).join('\n')).toMatch(pattern);
  });

  it('compileHero refuse un build invalide', () => {
    expect(() =>
      compileHero(content, build({ hero: 'pyra', level: 0 }), { side: 'player', slot: 0 }),
    ).toThrow(InvalidSetupError);
  });
});

describe('compilation d’un héros', () => {
  it('niveau 1 sans talent : valeurs de balance.json', () => {
    const unit = compileHero(content, build({ hero: 'pyra' }), { side: 'player', slot: 1 });
    expect(unit).toMatchObject({
      id: 'h1',
      kind: 'pyra',
      element: 'fire',
      role: 'damage',
      controller: 'policy',
    });
    expect(unit.stats).toEqual(content.heroById.get('pyra')?.stats);
    expect(unit.spells.map((s) => [s.slot, s.cost, s.gain, s.delay, s.element])).toEqual([
      ['basic', 0, 1, 100, 'fire'],
      ['a', 1, 0, 100, 'fire'],
      ['b', 2, 0, 120, 'fire'],
      ['ult', 4, 0, 150, 'fire'],
    ]);
    expect(unit.triggers.map((t) => t.source)).toEqual(['pyra_momentum']);
  });

  it('les talents modifient puissance, coût, délai, ciblage et effets', () => {
    const exe = compileHero(
      content,
      build({ hero: 'pyra', level: 6, talents: ['pyra_exe_cheap', 'pyra_exe_core'] }),
      {
        side: 'player',
        slot: 0,
      },
    );
    expect(spellOf(exe, 'pyra_blaze')).toMatchObject({ cost: 1 });
    expect(spellOf(exe, 'pyra_blaze').effects[0]).toMatchObject({ kind: 'damage', power: 215 });

    const tempo = compileHero(
      content,
      build({ hero: 'pyra', level: 12, talents: ['pyra_tempo_core', 'pyra_tempo_relay'] }),
      {
        side: 'player',
        slot: 0,
      },
    );
    expect(spellOf(tempo, 'pyra_spark').delay).toBe(85);
    expect(spellOf(tempo, 'pyra_kindle').targeting).toBe('ally');

    const embers = compileHero(
      content,
      build({ hero: 'pyra', level: 24, talents: ['pyra_embers_core', 'pyra_embers_linger'] }),
      { side: 'player', slot: 0 },
    );
    expect(spellOf(embers, 'pyra_blaze').effects[1]).toMatchObject({ status: 'burn', duration: 3 });
    expect(spellOf(embers, 'pyra_spark').effects).toHaveLength(2);

    const tithe = compileHero(
      content,
      build({ hero: 'maree', level: 21, talents: ['maree_current_core', 'maree_current_tithe'] }),
      { side: 'player', slot: 0 },
    );
    expect(spellOf(tithe, 'maree_ripple')).toMatchObject({ gain: 2 });
    expect(spellOf(tithe, 'maree_ripple').effects[0]).toMatchObject({ power: 66 });
  });

  it('les objets modifient le passif, renforcés par l’amélioration', () => {
    const at = (hero: string, id: string, upgrade: number) =>
      compileHero(content, build({ hero, items: [{ id, upgrade }] }), { side: 'player', slot: 0 })
        .triggers[0]!.trigger;
    expect(at('ronce', 'it_scale', 0).effects[0]).toMatchObject({ power: 18 });
    expect(at('ronce', 'it_scale', 3).effects[0]).toMatchObject({ power: 19 });
    expect(at('pyra', 'it_threshold', 0).thresholdPct).toBe(60);
    expect(at('pyra', 'it_threshold', 2).thresholdPct).toBe(63);
    expect(at('maree', 'it_limit', 3).limit).toEqual({ per: 'combat', count: 2 });
    expect(at('pyra', 'it_limit', 0).limit).toBeUndefined();
    expect(at('pyra', 'it_add', 2).effects[1]).toEqual({ kind: 'heal', target: 'self', power: 26 });
  });

  it('la petite stat d’objet est plafonnée', () => {
    const unit = compileHero(
      content,
      build({ hero: 'pyra', items: [{ id: 'it_add', upgrade: 3 }] }),
      {
        side: 'player',
        slot: 0,
      },
    );
    expect(unit.stats.hp).toBe(Math.round(380 * 1.08));
  });
});

describe('ennemis et équipes', () => {
  it('compile un ennemi au niveau voulu, avec son script', () => {
    const low = compileEnemy(content, 'thorn_witch', 1, 2);
    expect(low).toMatchObject({
      id: 'e2',
      kind: 'thorn_witch',
      controller: 'script',
      side: 'enemy',
    });
    // Statistiques de base, puis l'échelle globale des monstres (PV et ATK).
    const base = content.enemyById.get('thorn_witch')!.stats;
    const { enemyScale } = balance;
    expect(low.stats).toEqual({
      ...base,
      hp: Math.round(base.hp * enemyScale.hp),
      atk: Math.round(base.atk * enemyScale.atk),
    });
    expect(low.script[0]).toEqual({ spell: 'witch_hex', target: 'highest_atk' });
    const high = compileEnemy(content, 'thorn_witch', 99, 0);
    expect(high.stats.hp).toBe(
      Math.round(Math.round(base.hp * (1 + balance.progression.growth.enemy.hp)) * enemyScale.hp),
    );
    // Rencontre de donjon : son champ hpPct règle les PV de ce combat seulement.
    const [tough] = compileEncounter(content, ['thorn_witch'], 1, undefined, 150);
    expect(tough?.stats.hp).toBe(Math.round(low.stats.hp * 1.5));
    expect(() => compileEnemy(content, 'ghost', 1, 0)).toThrow(InvalidSetupError);
  });

  it('une équipe refuse deux fois le même héros', () => {
    expect(() => compileTeam(content, [build({ hero: 'pyra' }), build({ hero: 'pyra' })])).toThrow(
      /même héros/,
    );
    const team = compileTeam(
      content,
      ['pyra', 'maree', 'ronce'].map((hero) => build({ hero })),
      'enemy',
    );
    expect(team.map((u) => u.id)).toEqual(['e0', 'e1', 'e2']);
  });

  it('les modificateurs de donjon vont au bon camp', () => {
    const modifier = {
      id: 'heat',
      rules: [
        {
          appliesTo: 'enemies' as const,
          trigger: {
            on: 'combat_start' as const,
            subject: 'self' as const,
            effects: [
              {
                kind: 'statMod' as const,
                target: 'self' as const,
                stat: 'atk' as const,
                percent: 10,
                duration: 99,
              },
            ],
          },
        },
      ],
    };
    expect(modifierTriggers(modifier, 'player')).toEqual([]);
    expect(modifierTriggers(undefined, 'enemy')).toEqual([]);
    const foes = compileEncounter(content, ['moss_brute', 'brine_crab'], 5, modifier);
    expect(foes.map((u) => [u.id, u.triggers.map((t) => t.source)])).toEqual([
      ['e0', ['heat']],
      ['e1', ['heat']],
    ]);
    const heroes = compileTeam(content, [build({ hero: 'ronce' })], 'player', modifier);
    expect(heroes[0]?.triggers.map((t) => t.source)).toEqual(['ronce_hunt']);
  });
});
