import {
  baseStatsSchema,
  effectSchema,
  elementSchema,
  enemyTargetRuleSchema,
  idSchema,
  roleSchema,
  spellSlotSchema,
  targetingSchema,
  triggerSchema,
} from '@outlaw/data';
import type { BattleRules, BattleSetup, UnitDef } from '@outlaw/engine';
import { z } from 'zod';

/**
 * Schémas du combat tel qu'il circule : unités compilées et configuration. Bâtis sur ceux du contenu
 * (briques, déclencheurs) : un changement du contenu qui sortirait de ces schémas casse un test de
 * ce paquet plutôt qu'un salon en production. Leur type est celui du moteur (z.ZodType<…> vérifie à
 * la compilation qu'ils décrivent exactement UnitDef et BattleSetup).
 */

export const sideSchema = z.enum(['player', 'enemy']);

export const battleRulesSchema: z.ZodType<BattleRules> = z.strictObject({
  firstSide: sideSchema,
  limit: z.enum(['enemy_wins', 'hp_ratio']),
});

const unitIdSchema = z.string().min(1).max(64);

const resolvedSpellSchema = z.strictObject({
  id: idSchema,
  slot: spellSlotSchema,
  targeting: targetingSchema,
  element: elementSchema,
  cost: z.number().int().min(0),
  gain: z.number().int().min(0),
  delay: z.number().positive(),
  effects: z.array(effectSchema).max(12),
});

export const unitDefSchema: z.ZodType<UnitDef> = z.strictObject({
  id: unitIdSchema,
  kind: idSchema,
  side: sideSchema,
  slot: z.number().int().min(0).max(2),
  element: elementSchema,
  role: roleSchema.nullable(),
  boss: z.boolean(),
  stats: baseStatsSchema,
  spells: z.array(resolvedSpellSchema).min(1).max(8),
  triggers: z.array(z.strictObject({ source: unitIdSchema, trigger: triggerSchema })).max(16),
  controller: z.enum(['policy', 'script']),
  script: z.array(z.strictObject({ spell: idSchema, target: enemyTargetRuleSchema })).max(6),
});

export const battleSetupSchema: z.ZodType<BattleSetup> = z.strictObject({
  units: z.array(unitDefSchema).min(2).max(6),
  rules: battleRulesSchema.optional(),
});

/** Action jouée, telle qu'elle est journalisée : le sort lancé par l'unité active, avec sa cible. */
export const loggedActionSchema = z.strictObject({
  unit: unitIdSchema,
  spell: idSchema.max(64),
  target: unitIdSchema.optional(),
  /** Présent quand le serveur a joué à la place du joueur. */
  auto: z.literal('timeout').optional(),
});
export type LoggedAction = z.infer<typeof loggedActionSchema>;
