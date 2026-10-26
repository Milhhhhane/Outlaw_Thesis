/**
 * Les 7 briques simples, les altérations et leurs durées. Valeurs calculées à la main :
 * héros h (ATK 50, DEF 20, VIT 100) contre ennemi e (DEF 20, VIT 100), même élément.
 */
import type { Effect } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { createBattle, enemyIntent, step } from '../src/battle';
import type { BattleState, ResolvedSpell, UnitDef } from '../src/types';
import { balance, hit, ofType, spell, unit } from './helpers';

type Opts = Partial<UnitDef['stats']>;

function duel(spells: readonly ResolvedSpell[], foe: Opts = {}, foeExtra: Partial<UnitDef> = {}) {
  return createBattle(
    {
      units: [
        unit({ id: 'h', side: 'player', spells: [spell('h_basic', 'basic', [hit()]), ...spells] }),
        { ...unit({ id: 'e', side: 'enemy', stats: { hp: 5000, atk: 1, ...foe } }), ...foeExtra },
      ],
    },
    balance,
  );
}

function cast(state: BattleState, spellId: string, target?: string) {
  return step(state, { type: 'cast', unit: 'h', spell: spellId, ...(target ? { target } : {}) });
}

const self = (id: string, slot: 'a' | 'b' | 'ult', effects: Effect[]) =>
  spell(id, slot, effects, { targeting: 'self' });
const onEnemy = (id: string, slot: 'a' | 'b' | 'ult', effects: Effect[]) =>
  spell(id, slot, effects);
const u = (state: BattleState, id: string) => state.units.find((x) => x.def.id === id)!;

describe('bouclier', () => {
  it('absorbe avant les PV', () => {
    const guard = self('guard', 'a', [
      { kind: 'shield', target: 'primary', power: 100, duration: 2 },
    ]);
    const { state } = duel([guard], { atk: 60 });
    const result = cast(state, 'guard');
    expect(ofType(result.events, 'shield')).toEqual([
      { type: 'shield', source: 'h', target: 'h', amount: 50, total: 50, turns: 2 },
    ]);
    // 60 × 100 ÷ 120 = 50 : tout est absorbé.
    expect(ofType(result.events, 'damage')).toMatchObject([
      { target: 'h', amount: 50, absorbed: 50, hpAfter: 400, shieldAfter: 0 },
    ]);
  });

  it('se cumule jusqu’au plafond et expire', () => {
    const guard = self('guard', 'a', [
      { kind: 'shield', target: 'primary', power: 300, duration: 1 },
    ]);
    let { state } = duel([guard]);
    state = cast(state, 'guard').state; // 150, puis 1 absorbé
    expect(u(state, 'h').shield).toBe(149);
    const second = cast(state, 'guard'); // plafond : 60 % de 400 = 240
    expect(ofType(second.events, 'shield')[0]).toMatchObject({ amount: 91, total: 240 });
    // Posé à ce tour : il ne s'use pas ce tour-ci, mais à la fin du suivant.
    const third = cast(second.state, 'h_basic', 'e');
    expect(ofType(third.events, 'expired')).toEqual([
      { type: 'expired', unit: 'h', effect: 'shield' },
    ]);
    expect(u(third.state, 'h').shield).toBe(0);
  });
});

describe('tempo', () => {
  it('avance le lanceur et retarde la cible, jamais avant l’instant présent', () => {
    const rush = self('rush', 'a', [{ kind: 'tempo', target: 'primary', amount: -40 }]);
    const slow = onEnemy('slow', 'b', [{ kind: 'tempo', target: 'primary', amount: 50 }]);
    const pull = onEnemy('pull', 'ult', [{ kind: 'tempo', target: 'primary', amount: -999 }]);
    let { state } = duel([rush, slow, pull]);

    let result = cast(state, 'rush');
    expect(ofType(result.events, 'tempo')).toEqual([
      { type: 'tempo', source: 'h', target: 'h', delta: -4000, nextTime: 16000 },
    ]);
    state = result.state;
    expect(state.clock).toBe(16000);

    result = cast(state, 'slow', 'e'); // e devait jouer à 20000
    expect(ofType(result.events, 'tempo')[0]).toMatchObject({ delta: 5000, nextTime: 25000 });
    state = result.state;
    // Réserve : 3 − 1 − 2 = 0 ; quatre attaques de base pour l'ultime.
    for (let i = 0; i < 4; i++) state = cast(state, 'h_basic', 'e').state;
    result = cast(state, 'pull', 'e');
    const pulled = ofType(result.events, 'tempo')[0];
    expect(pulled?.nextTime).toBe(state.clock);
  });
});

describe('modification de stat', () => {
  const rage = self('rage', 'a', [
    { kind: 'statMod', target: 'primary', stat: 'atk', percent: 50, duration: 2 },
  ]);
  const fury = self('fury', 'b', [
    { kind: 'statMod', target: 'primary', stat: 'atk', percent: 80, duration: 2 },
  ]);

  it('augmente les dégâts, remplace la même origine et se borne', () => {
    let { state } = duel([rage, fury]);
    let result = cast(state, 'rage');
    expect(ofType(result.events, 'stat_mod')[0]).toMatchObject({ percent: 50, total: 50 });
    state = result.state;
    result = cast(state, 'h_basic', 'e');
    // 75 × 100 ÷ 120 = 62,5 → 63
    expect(ofType(result.events, 'damage')[0]).toMatchObject({ source: 'h', amount: 63 });
    state = result.state;
    result = cast(state, 'rage'); // même origine : remplace
    expect(ofType(result.events, 'stat_mod')[0]).toMatchObject({ total: 50 });
    state = result.state;
    state = cast(state, 'h_basic', 'e').state;
    result = cast(state, 'fury'); // 50 + 80 = 130, borné à 100
    expect(ofType(result.events, 'stat_mod')[0]).toMatchObject({
      total: balance.combat.statMod.maxPct,
    });
  });

  it('dure deux tours du porteur après celui de la pose', () => {
    let { state } = duel([rage]);
    state = cast(state, 'rage').state;
    let result = cast(state, 'h_basic', 'e');
    expect(ofType(result.events, 'expired')).toEqual([]);
    result = cast(result.state, 'h_basic', 'e');
    expect(ofType(result.events, 'expired')).toEqual([
      { type: 'expired', unit: 'h', effect: 'stat_mod' },
    ]);
    expect(u(result.state, 'h').mods).toEqual([]);
  });

  it('la VIT modifiée change le délai suivant', () => {
    const haste = self('haste', 'a', [
      { kind: 'statMod', target: 'primary', stat: 'vit', percent: 25, duration: 3 },
    ]);
    let { state } = duel([haste]);
    state = cast(state, 'haste').state; // le délai de ce sort est déjà compté (VIT 100)
    expect(u(state, 'h').nextTime).toBe(20000);
    const result = cast(state, 'h_basic', 'e'); // VIT 125 : 100 × 100 ÷ 125 = 80
    expect(u(result.state, 'h').nextTime).toBe(28000);
  });
});

describe('altérations', () => {
  it('marque : dégâts subis augmentés (puissance par défaut de balance.json)', () => {
    const brand = onEnemy('brand', 'a', [
      { kind: 'status', target: 'primary', status: 'mark', duration: 2 },
    ]);
    let { state } = duel([brand]);
    let result = cast(state, 'brand', 'e');
    expect(ofType(result.events, 'status')).toEqual([
      { type: 'status', source: 'h', target: 'e', status: 'mark', turns: 2, resisted: false },
    ]);
    state = result.state;
    result = cast(state, 'h_basic', 'e');
    // 50 × 100 ÷ 120 × 1,25 = 52,08 → 52
    expect(ofType(result.events, 'damage')[0]).toMatchObject({ source: 'h', amount: 52 });
  });

  it('brûlure : dégâts fixés à la pose, au début de chaque tour de la cible', () => {
    const ignite = onEnemy('ignite', 'a', [
      { kind: 'status', target: 'primary', status: 'burn', duration: 2, power: 40 },
    ]);
    let { state } = duel([ignite]);
    let result = cast(state, 'ignite', 'e');
    // 50 × 40 % × 100 ÷ 120 = 16,67 → 17
    expect(ofType(result.events, 'damage')).toContainEqual(
      expect.objectContaining({ target: 'e', cause: 'burn', amount: 17 }),
    );
    state = result.state;
    result = cast(state, 'h_basic', 'e');
    const burns = ofType(result.events, 'damage').filter((d) => d.cause === 'burn');
    expect(burns).toHaveLength(1);
    expect(ofType(result.events, 'expired')).toContainEqual({
      type: 'expired',
      unit: 'e',
      effect: 'burn',
    });
  });

  it('étourdissement : tour sauté, intention conservée, puis immunité', () => {
    const bash = onEnemy('bash', 'a', [
      { kind: 'status', target: 'primary', status: 'stun', duration: 1 },
    ]);
    let { state } = duel([bash]);
    expect(enemyIntent(state, 'e')).toEqual({
      unit: 'e',
      spell: 'e_basic',
      slot: 'basic',
      targets: ['h'],
      stunned: false,
    });
    let result = cast(state, 'bash', 'e');
    expect(ofType(result.events, 'turn_skipped')).toEqual([
      { type: 'turn_skipped', unit: 'e', reason: 'stun' },
    ]);
    expect(ofType(result.events, 'cast').filter((c) => c.unit === 'e')).toEqual([]);
    state = result.state;
    // Immunité jusqu'à la fin du prochain tour joué de e.
    result = cast(state, 'bash', 'e');
    expect(ofType(result.events, 'status')[0]).toMatchObject({ resisted: true, turns: 0 });
    expect(ofType(result.events, 'cast').filter((c) => c.unit === 'e')).toHaveLength(1);
    expect(ofType(result.events, 'expired')).toContainEqual({
      type: 'expired',
      unit: 'e',
      effect: 'stun_immunity',
    });
    state = result.state;
    state = cast(state, 'h_basic', 'e').state;
    result = cast(state, 'bash', 'e');
    expect(ofType(result.events, 'status')[0]).toMatchObject({ resisted: false });
    expect(enemyIntent(result.state, 'h')).toBeNull();
  });
});

describe('effets de sort combinés', () => {
  it('les briques s’appliquent dans l’ordre et ignorent les cibles tombées', () => {
    const finisher = onEnemy('finisher', 'b', [
      { kind: 'damage', target: 'primary', power: 1000 },
      { kind: 'status', target: 'primary', status: 'mark', duration: 1 },
      { kind: 'heal', target: 'self', power: 10 },
    ]);
    const { state } = duel([finisher], { hp: 100 });
    const result = cast(state, 'finisher', 'e');
    expect(result.state.result).toEqual({ winner: 'player', reason: 'annihilation' });
    expect(ofType(result.events, 'status')).toEqual([]);
  });
});
