import { describe, expect, it } from 'vitest';
import { autoAction } from '../src/auto';
import { createBattle, legalActions } from '../src/battle';
import type { BattleState, UnitState } from '../src/types';
import { balance, hit, playout, spell, unit } from './helpers';

const heal = { kind: 'heal', target: 'primary', power: 100 } as const;
const shield = { kind: 'shield', target: 'primary', power: 50, duration: 2 } as const;
const buff = { kind: 'statMod', target: 'self', stat: 'atk', percent: 20, duration: 2 } as const;

const bolt = spell('bolt', 'a', [hit(150)]);
const nova = spell('nova', 'ult', [hit(120)], { targeting: 'all_enemies' });
const mend = spell('mend', 'b', [heal], { targeting: 'ally', element: 'water' });
const rain = spell('rain', 'a', [heal], { targeting: 'all_allies', element: 'water' });
const ward = spell('ward', 'a', [shield], { targeting: 'ally', element: 'nature' });
const focus = spell('focus', 'a', [buff], { targeting: 'self' });

const basic = (id: string) => spell(`${id}_basic`, 'basic', [hit()]);

/** Combat de départ : deux héros (le premier joue), deux ennemis ; réserve à `points`. */
function start(
  heroSpells: ReturnType<typeof spell>[],
  points = 10,
  enemies = ['grunt', 'brute'],
): BattleState {
  const setup = {
    units: [
      unit({ id: 'h1', side: 'player', slot: 0, spells: [basic('h1'), ...heroSpells] }),
      unit({ id: 'h2', side: 'player', slot: 1 }),
      ...enemies.map((id, slot) => unit({ id, side: 'enemy', slot })),
    ],
  };
  const { state } = createBattle(setup, balance);
  expect(state.active).toBe('h1');
  return { ...state, points: { ...state.points, player: points } };
}

function patch(state: BattleState, id: string, change: Partial<UnitState>): BattleState {
  return {
    ...state,
    units: state.units.map((u) => (u.def.id === id ? { ...u, ...change } : u)),
  };
}

describe('combat automatique', () => {
  it('lance le sort offensif le plus cher que la réserve permet, sur l’ennemi le plus faible', () => {
    const state = patch(start([bolt, nova]), 'brute', { hp: 60 });
    const action = autoAction(state);
    expect(action.spell).toBe('nova');
    expect(action.target).toBeUndefined();

    const cheap = { ...state, points: { ...state.points, player: nova.cost - 1 } };
    expect(autoAction(cheap)).toMatchObject({ spell: 'bolt', target: 'brute' });
  });

  it('retombe sur l’attaque de base sans réserve', () => {
    const state = start([bolt, nova], 0);
    expect(autoAction(state)).toMatchObject({ spell: 'h1_basic' });
  });

  it('ne soigne pas des alliés en bonne santé, soigne le plus blessé sinon', () => {
    const healthy = start([mend]);
    expect(autoAction(healthy).spell).not.toBe('mend');

    const hurt = patch(patch(healthy, 'h1', { hp: 200 }), 'h2', { hp: 90 });
    expect(autoAction(hurt)).toMatchObject({ spell: 'mend', target: 'h2' });
  });

  it('un soin de groupe attend qu’un allié soit blessé', () => {
    const healthy = start([rain]);
    expect(autoAction(healthy).spell).toBe('h1_basic');
    const hurt = patch(healthy, 'h2', { hp: 100 });
    expect(autoAction(hurt).spell).toBe('rain');
  });

  it('pose un bouclier sur un allié qui n’en a pas, jamais sur un allié déjà protégé', () => {
    const state = start([ward]);
    const first = autoAction(state);
    expect(first.spell).toBe('ward');
    const covered = patch(patch(state, 'h1', { shield: 30 }), 'h2', { shield: 30 });
    expect(autoAction(covered).spell).toBe('h1_basic');
    const one = patch(state, 'h1', { shield: 30 });
    expect(autoAction(one)).toMatchObject({ spell: 'ward', target: 'h2' });
  });

  it('n’empile pas une amélioration déjà active', () => {
    const state = start([focus]);
    expect(autoAction(state).spell).toBe('focus');
    const active = patch(state, 'h1', {
      mods: [{ key: 'h1:focus:atk', stat: 'atk', percent: 20, turns: 2, since: 1, source: 'h1' }],
    });
    expect(autoAction(active).spell).toBe('h1_basic');
  });

  it('décide sans hasard et toujours parmi les actions légales', () => {
    const state = start([bolt, nova, mend, ward, focus]);
    const a = autoAction(state);
    expect(autoAction(state)).toEqual(a);
    expect(legalActions(state)).toContainEqual(a);
  });

  it('ne dépend pas de la taille des équipes : quatre héros et trois ennemis', () => {
    const base = start([bolt, mend]);
    const clone = (id: string, slot: number, side: 'player' | 'enemy'): UnitState => {
      const template = base.units.find((u) => u.def.side === side && u.def.slot === 0);
      if (template === undefined) throw new Error('modèle absent');
      return { ...template, def: { ...template.def, id, slot } };
    };
    const state: BattleState = {
      ...base,
      units: [
        ...base.units,
        clone('h3', 2, 'player'),
        clone('h4', 3, 'player'),
        clone('e3', 2, 'enemy'),
      ],
    };
    const hurt = patch(state, 'h4', { hp: 50 });
    expect(autoAction(hurt)).toMatchObject({ spell: 'mend', target: 'h4' });
    const down = patch(hurt, 'h4', { alive: false, hp: 0 });
    expect(autoAction(down).spell).not.toBe('mend');
  });

  it('refuse de décider sans unité active', () => {
    const { state } = playout({
      units: [
        unit({ id: 'h', side: 'player' }),
        unit({ id: 'e', side: 'enemy', stats: { hp: 10 } }),
      ],
    });
    expect(state.active).toBeNull();
    expect(() => autoAction(state)).toThrow('aucune unité active');
  });

  it('mène un combat entier et gagne un combat facile, de façon rejouable', () => {
    const setup = {
      units: [
        unit({ id: 'h1', side: 'player', slot: 0, spells: [basic('h1'), bolt] }),
        unit({ id: 'h2', side: 'player', slot: 1 }),
        unit({ id: 'g', side: 'enemy', slot: 0, stats: { hp: 200, atk: 10 } }),
      ],
    };
    const first = playout(setup, autoAction);
    const second = playout(setup, autoAction);
    expect(first.state.result?.winner).toBe('player');
    expect(second.actions).toEqual(first.actions);
  });
});
