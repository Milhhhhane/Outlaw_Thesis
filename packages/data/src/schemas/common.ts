import { z } from 'zod';

/** Identifiant de contenu : snake_case, stable, jamais affiché tel quel (voir i18n). */
export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'identifiant attendu en snake_case (a-z, 0-9, _)');

export const ELEMENTS = ['fire', 'water', 'nature'] as const;
export const elementSchema = z.enum(ELEMENTS);
export type Element = z.infer<typeof elementSchema>;

export const ROLES = ['damage', 'support', 'control'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Emplacements de sort d'une unité : attaque de base, compétence A, compétence B, ultime. */
export const SPELL_SLOTS = ['basic', 'a', 'b', 'ult'] as const;
export const spellSlotSchema = z.enum(SPELL_SLOTS);
export type SpellSlot = z.infer<typeof spellSlotSchema>;

/** Statistiques modifiables par une brique « modification de stat ». Les PV ne le sont pas. */
export const MODIFIABLE_STATS = ['atk', 'def', 'vit'] as const;
export const modifiableStatSchema = z.enum(MODIFIABLE_STATS);
export type ModifiableStat = z.infer<typeof modifiableStatSchema>;

/** Les 4 statistiques du jeu : PV, ATK, DEF, VIT. */
export const baseStatsSchema = z.strictObject({
  hp: z.number().int().positive(),
  atk: z.number().int().positive(),
  def: z.number().int().min(0),
  vit: z.number().int().positive(),
});
export type BaseStats = z.infer<typeof baseStatsSchema>;

export const nonZero = (n: number): boolean => n !== 0;
