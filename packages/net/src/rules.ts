import { z } from 'zod';
import { MAX_HERO_TIER, MAX_SIDE } from '@outlaw/data';
import type { BattleRules, Side } from '@outlaw/engine';

/** Niveau maximal que l'hôte peut fixer : celui du jeu (balance.progression.maxLevel). */
export const MAX_LEVEL_LIMIT = 30;

/** Chronos possibles pour une action, en secondes. */
export const TURN_SECONDS_OPTIONS = [20, 30, 45, 60] as const;

/**
 * Bornes du budget de paliers pour une équipe de `teamSize` héros : de tous de palier I
 * (`teamSize`) à tous de palier IV (`teamSize` × 4). Avec quatre héros : 4 à 16.
 */
export function tierBudgetBounds(teamSize: number): { readonly min: number; readonly max: number } {
  return { min: teamSize, max: teamSize * MAX_HERO_TIER };
}

/** Budgets de paliers proposés : aucun, ou chaque entier entre les bornes de `tierBudgetBounds`. */
export function tierBudgetOptions(teamSize: number): readonly (number | null)[] {
  const { min, max } = tierBudgetBounds(teamSize);
  return [null, ...Array.from({ length: max - min + 1 }, (_, i) => i + min)];
}

/**
 * Règles du salon, réglées par l'hôte avant le combat.
 * Les règles du moteur (camp prioritaire, limite d'actions au ratio de PV) en sont déduites par toBattleRules.
 */
export const roomRulesSchema = z.strictObject({
  /** Niveau maximal des héros : celui du profil est ramené à ce plafond. */
  maxLevel: z.number().int().min(1).max(MAX_LEVEL_LIMIT),
  /** Objets autorisés. */
  items: z.boolean(),
  /**
   * Somme maximale des paliers des héros de l'équipe (I = 1 … IV = 4), ou null : aucun budget.
   * Bornes larges ici ; le salon refuse un budget hors de `tierBudgetBounds(teamSize)`.
   */
  tierBudget: z
    .number()
    .int()
    .min(1)
    .max(MAX_SIDE * MAX_HERO_TIER)
    .nullable(),
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
