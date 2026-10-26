import { z } from 'zod';
import { idSchema, nonZero } from './common';
import { plainEffectSchema } from './effects';

/**
 * Modifications du passif apportées par un objet. Les objets ont leur terrain (le passif),
 * les talents le leur (les sorts) : cela limite les combinaisons à tester.
 */
export const passiveModSchema = z.discriminatedUnion('type', [
  /** Ajuste tous les champs numériques correspondants des effets du passif (ex. power +25 %). */
  z.strictObject({
    type: z.literal('scale'),
    field: z.enum(['power', 'duration', 'amount', 'percent']),
    mulPct: z.number().refine(nonZero, 'mulPct ne peut pas valoir 0'),
  }),
  /** Ajoute une brique à chaque déclencheur du passif. */
  z.strictObject({ type: z.literal('addEffect'), effect: plainEffectSchema }),
  /** Décale le seuil de PV d'un déclencheur hp_crossed (en points de %). */
  z.strictObject({
    type: z.literal('threshold'),
    delta: z.number().refine(nonZero, 'delta ne peut pas valoir 0'),
  }),
  /** Ajoute des utilisations à la limite par combat des déclencheurs du passif. */
  z.strictObject({
    type: z.literal('limit'),
    delta: z.number().int().refine(nonZero, 'delta ne peut pas valoir 0'),
  }),
]);
export type PassiveMod = z.infer<typeof passiveModSchema>;

export const RARITIES = ['common', 'rare'] as const;
export const raritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof raritySchema>;

/**
 * Un objet : effets fixes (pas de stats aléatoires), 1 ou 2 modifications du passif
 * et éventuellement une petite statistique plafonnée par balance.progression.items.statCapPct.
 */
export const itemSchema = z.strictObject({
  id: idSchema,
  rarity: raritySchema,
  stat: z
    .strictObject({ stat: z.enum(['hp', 'atk', 'def']), pct: z.number().positive() })
    .optional(),
  mods: z.array(passiveModSchema).min(1).max(2),
});
export type Item = z.infer<typeof itemSchema>;
