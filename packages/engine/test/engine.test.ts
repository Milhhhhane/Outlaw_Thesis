import { describe, expect, it } from 'vitest';
import { createBattle, legalActions, replay, step, validateSetup } from '../src/battle';
import { applyEffect } from '../src/effects';
import { openDraft } from '../src/draft';
import { IllegalActionError, InvalidSetupError } from '../src/errors';
import { compareTurnOrder, nextActor, projectQueue } from '../src/queue';
import { elementMultiplier, interval, statsAtLevel, TIME_SCALE } from '../src/stats';
import { resolveRef, scriptTarget } from '../src/targets';
import type { BattleSetup, UnitDef } from '../src/types';
import { balance, deepFreeze, hit, ofType, playout, spell, unit } from './helpers';

const duel: BattleSetup = {
  units: [unit({ id: 'hero', side: 'player' }), unit({ id: 'grunt', side: 'enemy' })],
};

describe('statistiques', () => {
  const growth = balance.progression.growth.hero;
  const max = balance.progression.maxLevel;
  const base = { hp: 400, atk: 50, def: 20, vit: 100 };

  it('niveau 1 = stats de base, niveau max = croissance complète, VIT fixe', () => {
    expect(statsAtLevel(base, 1, growth, max)).toEqual(base);
    expect(statsAtLevel(base, max, growth, max)).toEqual({
      hp: Math.round(400 * (1 + growth.hp)),
      atk: Math.round(50 * (1 + growth.atk)),
      def: Math.round(20 * (1 + growth.def)),
      vit: 100,
    });
    const mid = statsAtLevel(base, 15, growth, max);
    expect(mid.hp).toBeGreaterThan(400);
    expect(mid.hp).toBeLessThan(400 * (1 + growth.hp));
  });

  it('refuse un niveau hors bornes', () => {
    expect(() => statsAtLevel(base, 0, growth, max)).toThrow(RangeError);
    expect(() => statsAtLevel(base, max + 1, growth, max)).toThrow(RangeError);
    expect(() => statsAtLevel(base, 1.5, growth, max)).toThrow(RangeError);
  });

  it('délai × 100 ÷ VIT, en centièmes entiers', () => {
    expect(interval(100, 100)).toBe(100 * TIME_SCALE);
    expect(interval(150, 100)).toBe(150 * TIME_SCALE);
    expect(interval(100, 90)).toBe(11111);
    expect(Number.isInteger(interval(120, 73))).toBe(true);
  });

  it('triangle : feu > nature > eau > feu', () => {
    const { element } = balance.combat;
    const { advantage: up, disadvantage: down } = element;
    expect(elementMultiplier('fire', 'nature', element)).toBe(up);
    expect(elementMultiplier('nature', 'water', element)).toBe(up);
    expect(elementMultiplier('water', 'fire', element)).toBe(up);
    expect(elementMultiplier('nature', 'fire', element)).toBe(down);
    expect(elementMultiplier('water', 'nature', element)).toBe(down);
    expect(elementMultiplier('fire', 'water', element)).toBe(down);
    for (const e of ['fire', 'water', 'nature'] as const) {
      expect(elementMultiplier(e, e, element)).toBe(1);
    }
  });
});

describe('file d’initiative', () => {
  it('égalité : héros avant ennemis, puis emplacement', () => {
    const { state } = createBattle(
      {
        units: [
          unit({ id: 'e0', side: 'enemy', slot: 0 }),
          unit({ id: 'h1', side: 'player', slot: 1 }),
          unit({ id: 'h0', side: 'player', slot: 0 }),
        ],
      },
      balance,
    );
    const [h0, h1, e0] = state.units;
    expect(state.units.map((u) => u.def.id)).toEqual(['h0', 'h1', 'e0']);
    expect(h0 && h1 && compareTurnOrder(h0, h1)).toBeLessThan(0);
    expect(h1 && e0 && compareTurnOrder(e0, h1)).toBeGreaterThan(0);
    expect(nextActor([])).toBeNull();
  });

  it('la VIT est plafonnée', () => {
    const { state } = createBattle(
      {
        units: [
          unit({ id: 'fast', side: 'player', stats: { vit: 1000 } }),
          unit({ id: 'e', side: 'enemy' }),
        ],
      },
      balance,
    );
    expect(state.units[0]?.nextTime).toBe(interval(100, balance.combat.speedCap));
  });

  it('la file projetée annonce exactement les tours joués à l’attaque de base', () => {
    const setup: BattleSetup = {
      units: [
        unit({ id: 'h0', side: 'player', slot: 0, stats: { vit: 120, atk: 1, hp: 9000 } }),
        unit({ id: 'h1', side: 'player', slot: 1, stats: { vit: 85, atk: 1, hp: 9000 } }),
        unit({ id: 'e0', side: 'enemy', stats: { vit: 100, atk: 1, hp: 9000 } }),
      ],
    };
    const first = createBattle(setup, balance);
    const projected = projectQueue(first.state);
    expect(projected).toHaveLength(balance.combat.queueHorizon);

    let state = first.state;
    const turns = ofType(first.events, 'turn_start');
    while (turns.length < projected.length) {
      const basic = legalActions(state).find((a) => a.spell.endsWith('_basic'));
      if (basic === undefined) throw new Error('pas d’attaque de base');
      const next = step(state, basic);
      state = next.state;
      turns.push(...ofType(next.events, 'turn_start'));
    }
    expect(turns.slice(0, projected.length).map((t) => ({ unit: t.unit, time: t.time }))).toEqual(
      projected,
    );
  });

  it('la file est vide quand le combat est fini', () => {
    expect(projectQueue(playout(duel).state)).toEqual([]);
  });
});

describe('actions', () => {
  const kit = [
    spell('h_basic', 'basic', [hit()]),
    spell('h_a', 'a', [{ kind: 'heal', target: 'primary', power: 100 }], { targeting: 'ally' }),
    spell('h_self', 'b', [{ kind: 'heal', target: 'self', power: 50 }], { targeting: 'self' }),
    spell('h_aoe', 'ult', [hit(10)], { targeting: 'all_allies' }),
  ];
  const setup: BattleSetup = {
    units: [
      unit({ id: 'h', side: 'player', spells: kit }),
      unit({ id: 'mate', side: 'player', slot: 1 }),
      unit({ id: 'e0', side: 'enemy', slot: 0 }),
      unit({ id: 'e1', side: 'enemy', slot: 1 }),
    ],
  };

  it('énumère sorts abordables et cibles vivantes du bon camp', () => {
    const { state } = createBattle(setup, balance);
    expect(legalActions(state)).toEqual([
      { type: 'cast', unit: 'h', spell: 'h_basic', target: 'e0' },
      { type: 'cast', unit: 'h', spell: 'h_basic', target: 'e1' },
      { type: 'cast', unit: 'h', spell: 'h_a', target: 'h' },
      { type: 'cast', unit: 'h', spell: 'h_a', target: 'mate' },
      { type: 'cast', unit: 'h', spell: 'h_self' },
    ]);
  });

  it('refuse les actions invalides sans modifier l’état', () => {
    const { state } = createBattle(setup, balance);
    const bad = [
      { type: 'cast', unit: 'mate', spell: 'mate_basic', target: 'e0' },
      { type: 'cast', unit: 'h', spell: 'nope' },
      { type: 'cast', unit: 'h', spell: 'h_basic' },
      { type: 'cast', unit: 'h', spell: 'h_basic', target: 'mate' },
      { type: 'cast', unit: 'h', spell: 'h_basic', target: 'ghost' },
      { type: 'cast', unit: 'h', spell: 'h_self', target: 'h' },
    ] as const;
    for (const action of bad) expect(() => step(state, action)).toThrow(IllegalActionError);
  });

  it('le soin plafonne aux PV max et n’émet rien sur une cible pleine', () => {
    let { state } = createBattle(setup, balance);
    let result = step(state, { type: 'cast', unit: 'h', spell: 'h_a', target: 'mate' });
    expect(ofType(result.events, 'heal')).toEqual([]);
    state = result.state;
    // mate (pilotée) attaque, puis les ennemis frappent h ; h se soigne ensuite.
    state = step(state, { type: 'cast', unit: 'mate', spell: 'mate_basic', target: 'e0' }).state;
    const hurt = state.units.find((u) => u.def.id === 'h');
    expect(hurt?.hp).toBe(400 - 42 * 2);
    result = step(state, { type: 'cast', unit: 'h', spell: 'h_a', target: 'h' });
    expect(ofType(result.events, 'heal')).toEqual([
      { type: 'heal', source: 'h', target: 'h', amount: 50, hpAfter: 366 },
    ]);
  });

  it('les tirs groupés touchent chaque cible vivante, alliés compris', () => {
    let { state } = createBattle(
      {
        units: setup.units.map((u) =>
          u.id === 'h' ? { ...u, stats: { ...u.stats, vit: 150 } } : u,
        ),
      },
      balance,
    );
    state = step(state, { type: 'cast', unit: 'h', spell: 'h_basic', target: 'e0' }).state;
    expect(state.active).toBe('mate');
    state = step(state, { type: 'cast', unit: 'mate', spell: 'mate_basic', target: 'e0' }).state;
    expect(state.active).toBe('h');
    const ult = step(state, { type: 'cast', unit: 'h', spell: 'h_aoe' });
    expect(ofType(ult.events, 'damage').map((e) => e.target)).toEqual(['h', 'mate']);
  });
});

describe('briques et ciblage', () => {
  it('teamPoints agit sur sa réserve ou sur celle d’en face, bornée', () => {
    const drain = spell(
      'drain',
      'a',
      [
        { kind: 'teamPoints', amount: 2, side: 'own' },
        { kind: 'teamPoints', amount: -5, side: 'opposing' },
      ],
      { targeting: 'self' },
    );
    const { state } = createBattle(
      {
        units: [
          unit({ id: 'h', side: 'player', spells: [spell('h_basic', 'basic', [hit()]), drain] }),
          unit({ id: 'e', side: 'enemy' }),
        ],
      },
      balance,
    );
    const result = step(state, { type: 'cast', unit: 'h', spell: 'drain' });
    expect(ofType(result.events, 'points')).toEqual([
      { type: 'points', side: 'player', delta: -1, total: 2, reason: 'cost' },
      { type: 'points', side: 'player', delta: 2, total: 4, reason: 'effect' },
      { type: 'points', side: 'enemy', delta: -3, total: 0, reason: 'effect' },
    ]);
  });

  it('les règles de cible du script et les références de brique', () => {
    const units = createBattle(
      {
        units: [
          unit({ id: 'p0', side: 'player', slot: 0, stats: { atk: 10 } }),
          unit({ id: 'p1', side: 'player', slot: 1, stats: { atk: 90 } }),
          unit({ id: 'p2', side: 'player', slot: 2, stats: { atk: 90 } }),
          unit({ id: 'e0', side: 'enemy' }),
        ],
      },
      balance,
    ).state.units.map((u) => (u.def.id === 'p2' ? { ...u, hp: 5 } : u));
    const [p0, , , e0] = units;
    if (p0 === undefined || e0 === undefined) throw new Error('unités manquantes');
    const s = spell('s', 'basic', [hit()]);
    const pick = (rule: Parameters<typeof scriptTarget>[3]) =>
      scriptTarget(units, e0, s, rule)?.def.id;
    expect(pick('first')).toBe('p0');
    expect(pick('last')).toBe('p2');
    expect(pick('lowest_hp')).toBe('p2');
    expect(pick('highest_atk')).toBe('p1');
    expect(pick('auto')).toBeUndefined();

    const ctx = { units, caster: p0, primary: [e0] };
    const ids = (ref: Parameters<typeof resolveRef>[0]) =>
      resolveRef(ref, ctx).map((u) => u.def.id);
    expect(ids('primary')).toEqual(['e0']);
    expect(ids('self')).toEqual(['p0']);
    expect(ids('all_allies')).toEqual(['p0', 'p1', 'p2']);
    expect(ids('other_allies')).toEqual(['p1', 'p2']);
    expect(ids('all_enemies')).toEqual(['e0']);
    expect(ids('lowest_hp_ally')).toEqual(['p2']);
    expect(ids('lowest_hp_enemy')).toEqual(['e0']);
    expect(() => ids('subject')).toThrow(InvalidSetupError);
    expect(resolveRef('self', { ...ctx, caster: { ...p0, alive: false } })).toEqual([]);
    expect(resolveRef('lowest_hp_enemy', { ...ctx, units: [p0] })).toEqual([]);
  });

  it('un ennemi scripté suit son script en boucle', () => {
    const smash = spell('smash', 'b', [hit(200)], { targeting: 'all_enemies' });
    const { events } = playout({
      units: [
        unit({ id: 'h', side: 'player', stats: { hp: 3000, atk: 1 } }),
        unit({
          id: 'e',
          side: 'enemy',
          stats: { atk: 10, hp: 30 },
          spells: [spell('poke', 'basic', [hit()]), smash],
          script: [
            { spell: 'poke', target: 'lowest_hp' },
            { spell: 'smash', target: 'auto' },
          ],
        }),
      ],
    });
    const casts = ofType(events, 'cast').filter((e) => e.unit === 'e');
    expect(casts.slice(0, 4).map((e) => e.spell)).toEqual(['poke', 'smash', 'poke', 'smash']);
  });

  it('une brique non gérée est refusée', () => {
    const { state } = createBattle(duel, balance);
    const draft = openDraft(state);
    const caster = draft.units[0];
    if (caster === undefined) throw new Error('unité manquante');
    const s = spell('x', 'basic', []);
    const tempo = { kind: 'tempo', target: 'self', amount: 10 } as const;
    expect(() => {
      applyEffect(draft, { caster, spell: s, primary: [] }, tempo);
    }).toThrow(InvalidSetupError);
  });
});

describe('validation de la configuration', () => {
  const ok = unit({ id: 'h', side: 'player' });
  const foe = unit({ id: 'e', side: 'enemy' });
  const cases: [string, UnitDef[]][] = [
    ['unité en double', [ok, ok, foe]],
    ['emplacement occupé', [ok, { ...ok, id: 'h2' }, foe]],
    ['camp vide', [ok]],
    ['emplacement hors bornes', [{ ...ok, slot: 3 }, foe]],
    ['PV nuls', [{ ...ok, stats: { ...ok.stats, hp: 0 } }, foe]],
    ['sorts en double', [{ ...ok, spells: [...ok.spells, ...ok.spells] }, foe]],
    [
      'brique non gérée',
      [
        { ...ok, spells: [spell('t', 'basic', [{ kind: 'tempo', target: 'self', amount: 5 }])] },
        foe,
      ],
    ],
    ['pas d’attaque de base gratuite', [{ ...ok, spells: [spell('a', 'a', [hit()])] }, foe]],
    ['script vide', [ok, { ...foe, script: [] }]],
    ['script vers un sort absent', [ok, { ...foe, script: [{ spell: 'nope', target: 'first' }] }]],
    [
      'règle « auto » sur un sort ciblé',
      [ok, { ...foe, script: [{ spell: 'e_basic', target: 'auto' }] }],
    ],
  ];
  it.each(cases)('%s', (_name, units) => {
    expect(() => {
      validateSetup({ units });
    }).toThrow(InvalidSetupError);
  });
  it('une configuration correcte passe', () => {
    expect(() => {
      validateSetup({ units: [ok, foe] });
    }).not.toThrow();
  });
});

describe('déterminisme et pureté', () => {
  const setup: BattleSetup = {
    units: [
      unit({ id: 'h0', side: 'player', slot: 0, element: 'fire' }),
      unit({ id: 'h1', side: 'player', slot: 1, element: 'water', stats: { vit: 110 } }),
      unit({ id: 'e0', side: 'enemy', slot: 0, element: 'nature', stats: { vit: 95 } }),
      unit({ id: 'e1', side: 'enemy', slot: 1, element: 'water', stats: { hp: 600 } }),
    ],
  };

  it('deux parties identiques produisent le même journal, et le rejeu le reproduit', () => {
    const a = playout(setup);
    const b = playout(setup);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    const replayed = replay(setup, balance, a.actions);
    expect(replayed.events).toEqual(a.events);
    expect(replayed.state).toEqual(a.state);
  });

  it('un pas ne modifie jamais l’état reçu', () => {
    const { state } = createBattle(setup, balance);
    const before = JSON.stringify(state);
    deepFreeze(state);
    const action = legalActions(state)[0];
    if (action === undefined) throw new Error('aucune action');
    const next = step(state, action);
    expect(JSON.stringify(state)).toBe(before);
    expect(next.state).not.toBe(state);
  });
});
