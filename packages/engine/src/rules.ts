import type { BattleRules } from './types';

/** Règles du PvE : les héros d'abord, la limite d'actions est une défaite des héros. */
export const DEFAULT_RULES: BattleRules = { firstSide: 'player', limit: 'enemy_wins' };

/** Règles effectives d'un setup ou d'un état : celles qu'il porte, sinon les valeurs par défaut. */
export function rulesOf(source: { readonly rules?: BattleRules | undefined }): BattleRules {
  return source.rules ?? DEFAULT_RULES;
}
