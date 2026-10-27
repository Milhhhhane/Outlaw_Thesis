import { describe, expect, it } from 'vitest';
import {
  defaultRules,
  MAX_LEVEL_LIMIT,
  roomRulesSchema,
  tierBudgetOptions,
  toBattleRules,
  TURN_SECONDS_OPTIONS,
} from '../src';
import { balance } from './helpers';

describe('règles du salon', () => {
  it('valeurs par défaut : niveau 30, objets, aucun budget, 30 s', () => {
    expect(defaultRules).toEqual({ maxLevel: 30, items: true, tierBudget: null, turnSeconds: 30 });
    expect(roomRulesSchema.parse(defaultRules)).toEqual(defaultRules);
    expect(MAX_LEVEL_LIMIT).toBe(balance.progression.maxLevel);
  });

  it('niveau maximum de 1 à 30', () => {
    for (const maxLevel of [1, 15, 30]) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, maxLevel }).success).toBe(true);
    }
    for (const maxLevel of [0, -1, 31, 2.5, '30', null]) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, maxLevel }).success).toBe(false);
    }
  });

  it('budget de paliers : aucun, ou un entier de 3 à 12', () => {
    expect(tierBudgetOptions).toEqual([null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const tierBudget of tierBudgetOptions) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, tierBudget }).success).toBe(true);
    }
    for (const tierBudget of [0, 2, 13, 4.5, '6', undefined]) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, tierBudget }).success).toBe(false);
    }
  });

  it('chrono par action : 20, 30, 45 ou 60 secondes', () => {
    expect(TURN_SECONDS_OPTIONS).toEqual([20, 30, 45, 60]);
    for (const turnSeconds of TURN_SECONDS_OPTIONS) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, turnSeconds }).success).toBe(true);
    }
    for (const turnSeconds of [0, 10, 25, 90, '30']) {
      expect(roomRulesSchema.safeParse({ ...defaultRules, turnSeconds }).success).toBe(false);
    }
  });

  it('objets : un booléen ; aucun champ en trop', () => {
    expect(roomRulesSchema.safeParse({ ...defaultRules, items: 'oui' }).success).toBe(false);
    expect(roomRulesSchema.safeParse({ ...defaultRules, extra: 1 }).success).toBe(false);
  });

  it('règles du moteur : la priorité vient du tirage, la limite se règle au ratio de PV', () => {
    expect(toBattleRules('player')).toEqual({ firstSide: 'player', limit: 'hp_ratio' });
    expect(toBattleRules('enemy')).toEqual({ firstSide: 'enemy', limit: 'hp_ratio' });
  });
});
