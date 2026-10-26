/**
 * Critère de sortie du sprint 0 : trois scénarios de combat calculés à la main.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, legalActions, step } from '../src/battle';
import { IllegalActionError } from '../src/errors';
import { balance, hit, ofType, playout, spell, unit } from './helpers';

describe('scénario 1 : duel déterministe', () => {
  // Héros feu (ATK 50, VIT 100) contre ennemi eau (PV 300, DEF 15, VIT 90).
  // Coup du héros : 50 × 100 ÷ 115 × 0,8 (désavantage) = 34,78 → 35.
  // Coup de l'ennemi : 40 × 100 ÷ 120 × 1,25 (avantage) = 41,67 → 42.
  // Le héros joue aux instants 100, 200, 300… ; l'ennemi à 111,11, 222,22… (délai × 100 ÷ 90).
  const setup = {
    units: [
      unit({ id: 'hero', side: 'player', element: 'fire' }),
      unit({
        id: 'grunt',
        side: 'enemy',
        element: 'water',
        stats: { hp: 300, atk: 40, def: 15, vit: 90 },
      }),
    ],
  };
  const { state, events } = playout(setup);

  it('chaque coup suit la formule de dégâts et le triangle des éléments', () => {
    const damage = ofType(events, 'damage');
    const byHero = damage.filter((e) => e.source === 'hero');
    const byGrunt = damage.filter((e) => e.source === 'grunt');
    expect(new Set(byHero.map((e) => e.amount))).toEqual(new Set([35]));
    expect(new Set(byHero.map((e) => e.multiplier))).toEqual(new Set([0.8]));
    expect(new Set(byGrunt.map((e) => e.amount))).toEqual(new Set([42]));
    expect(new Set(byGrunt.map((e) => e.multiplier))).toEqual(new Set([1.25]));
  });

  it('les tours alternent selon la VIT', () => {
    const turns = ofType(events, 'turn_start').map((e) => `${e.unit}@${e.time}`);
    expect(turns.slice(0, 5)).toEqual([
      'hero@10000',
      'grunt@11111',
      'hero@20000',
      'grunt@22222',
      'hero@30000',
    ]);
  });

  it('le héros gagne au 9e coup, avec 64 PV restants, en 17 actions', () => {
    expect(state.result).toEqual({ winner: 'player', reason: 'annihilation' });
    expect(state.actionCount).toBe(17);
    expect(state.units.find((u) => u.def.id === 'hero')?.hp).toBe(64);
    expect(state.units.find((u) => u.def.id === 'grunt')?.alive).toBe(false);
    expect(events.at(-2)).toEqual({ type: 'unit_down', unit: 'grunt' });
    expect(events.at(-1)).toEqual({ type: 'battle_end', winner: 'player', reason: 'annihilation' });
    expect(state.active).toBeNull();
  });

  it('la réserve plafonne à 6 sans événement superflu', () => {
    const points = ofType(events, 'points');
    expect(points.map((e) => e.total)).toEqual([4, 5, 6]);
    expect(state.points.player).toBe(balance.combat.teamPoints.cap);
  });
});

describe('scénario 2 : réserve de points partagée par les trois héros', () => {
  const kit = (id: string) => [
    spell(`${id}_basic`, 'basic', [hit()]),
    spell(`${id}_b`, 'b', [hit(150)]),
    spell(`${id}_ult`, 'ult', [hit(120)], { targeting: 'all_enemies' }),
  ];
  const setup = {
    units: [
      unit({ id: 'h0', side: 'player', slot: 0, spells: kit('h0') }),
      unit({ id: 'h1', side: 'player', slot: 1, spells: kit('h1') }),
      unit({ id: 'h2', side: 'player', slot: 2, spells: kit('h2') }),
      unit({ id: 'boss', side: 'enemy', stats: { hp: 5000, atk: 1, def: 0 } }),
    ],
  };

  it('à VIT égale, les héros jouent par emplacement puis l’ennemi', () => {
    const { state, events } = createBattle(setup, balance);
    expect(state.active).toBe('h0');
    expect(state.points.player).toBe(3);
    expect(ofType(events, 'turn_start').map((e) => e.unit)).toEqual(['h0']);
  });

  it('un héros gagne, un autre dépense, le troisième subit la réserve commune', () => {
    let { state } = createBattle(setup, balance);
    let result = step(state, { type: 'cast', unit: 'h0', spell: 'h0_basic', target: 'boss' });
    state = result.state;
    expect(state.points.player).toBe(4);
    result = step(state, { type: 'cast', unit: 'h1', spell: 'h1_b', target: 'boss' });
    state = result.state;
    expect(state.points.player).toBe(2);
    expect(ofType(result.events, 'points')).toEqual([
      { type: 'points', side: 'player', delta: -2, total: 2, reason: 'cost' },
    ]);
    // h2 n'a rien dépensé, mais l'ultime (4) n'est plus abordable.
    expect(state.active).toBe('h2');
    expect(legalActions(state).map((a) => a.spell)).toEqual(['h2_basic', 'h2_b']);
    expect(() => step(state, { type: 'cast', unit: 'h2', spell: 'h2_ult' })).toThrow(
      IllegalActionError,
    );
    result = step(state, { type: 'cast', unit: 'h2', spell: 'h2_basic', target: 'boss' });
    expect(result.state.points.player).toBe(3);
    // L'ennemi scripté joue ensuite sans toucher à la réserve, puis h0 reprend la main.
    expect(ofType(result.events, 'turn_start').map((e) => e.unit)).toEqual(['boss', 'h0']);
    expect(result.state.points.enemy).toBe(balance.combat.teamPoints.start);
  });

  it('l’ultime frappe tous les ennemis et vide la réserve', () => {
    const wide = {
      units: [
        ...setup.units.filter((u) => u.side === 'player'),
        unit({ id: 'e0', side: 'enemy', slot: 0, stats: { hp: 5000, def: 0 } }),
        unit({ id: 'e1', side: 'enemy', slot: 1, stats: { hp: 5000, def: 0 } }),
      ],
    };
    let { state } = createBattle(wide, balance);
    state = step(state, { type: 'cast', unit: 'h0', spell: 'h0_basic', target: 'e0' }).state;
    const result = step(state, { type: 'cast', unit: 'h1', spell: 'h1_ult' });
    expect(result.state.points.player).toBe(0);
    const hits = ofType(result.events, 'damage').filter((e) => e.source === 'h1');
    expect(hits.map((e) => [e.target, e.amount])).toEqual([
      ['e0', 60],
      ['e1', 60],
    ]);
  });
});

describe('scénario 3 : limite de 100 actions', () => {
  // Dégâts minimaux des deux côtés : personne ne tombe, la limite tranche.
  const setup = {
    units: [
      unit({ id: 'hero', side: 'player', stats: { hp: 10000, atk: 1, def: 1000 } }),
      unit({ id: 'wall', side: 'enemy', stats: { hp: 10000, atk: 1, def: 1000 } }),
    ],
  };
  const { state, events } = playout(setup);

  it('le combat s’arrête à 100 actions sur une défaite des héros', () => {
    expect(state.actionCount).toBe(balance.combat.actionLimit);
    expect(ofType(events, 'turn_start')).toHaveLength(balance.combat.actionLimit);
    expect(state.result).toEqual({ winner: 'enemy', reason: 'action_limit' });
    expect(events.at(-1)).toEqual({ type: 'battle_end', winner: 'enemy', reason: 'action_limit' });
  });

  it('chaque coup inflige au moins les dégâts minimaux', () => {
    const amounts = new Set(ofType(events, 'damage').map((e) => e.amount));
    expect(amounts).toEqual(new Set([balance.combat.minDamage]));
  });

  it('plus aucune action n’est possible après la fin', () => {
    expect(legalActions(state)).toEqual([]);
    expect(() => step(state, { type: 'cast', unit: 'hero', spell: 'hero_basic' })).toThrow(
      /terminé/,
    );
  });
});
