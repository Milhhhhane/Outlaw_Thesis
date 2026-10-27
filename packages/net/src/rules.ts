import { z } from 'zod';
import type { BattleRules, Side } from '@outlaw/engine';

/** Niveau maximal que l'hôte peut fixer : celui du jeu (balance.progression.maxLevel). */
export const MAX_LEVEL_LIMIT = 30;

/** Chronos possibles pour une action, en secondes. */
export const TURN_SECONDS_OPTIONS = [20, 30, 45, 60] as const;

/** Budgets de paliers possibles : aucun, ou un entier de 3 (trois héros de palier I) à 12 (trois de palier IV). */
export const tierBudgetOptions: readonly (number | null)[] = [
  null,
  ...Array.from({ length: 10 }, (_, i) => i + 3),
];

/**
 * Règles du salon, réglées par l'hôte avant le combat.
 * Les règles du moteur (camp prioritaire, limite d'actions au ratio de PV) en sont déduites par toBattleRules.
 */
export const roomRulesSchema = z.strictObject({
  /** Niveau maximal des héros : celui du profil est ramené à ce plafond. */
  maxLevel: z.number().int().min(1).max(MAX_LEVEL_LIMIT),
  /** Objets autorisés. */
  items: z.boolean(),
  /** Somme maximale des paliers des trois héros (I = 1 … IV = 4), ou null : aucun budget. */
  tierBudget: z.number().int().min(3).max(12).nullable(),
  /** Temps accordé à chaque action. */
  turnSeconds: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
});
export type RoomRules = z.infer<typeof roomRulesSchema>;

/** Règles d'un salon neuf. */
export const defaultRules: RoomRules = {
  maxLevel: MAX_LEVEL_LIMIT,
  items: true,
  tierBudget: null,
  turnSeconds: 30,
};

/** Règles du moteur pour un combat de salon : le tirage au sort donne la priorité, la limite départage au ratio de PV. */
export function toBattleRules(firstSide: Side): BattleRules {
  return { firstSide, limit: 'hp_ratio' };
}
