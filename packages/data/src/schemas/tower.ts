import { z } from 'zod';
import { MAX_SIDE } from './balance';
import { idSchema } from './common';

const poolSchema = z.strictObject({
  enemies: z.array(idSchema).min(1),
  hpPct: z.number().int().min(10).max(400).default(100),
  atkPct: z.number().int().min(10).max(400).default(100),
});

/**
 * Tour à étages (`content/tower.json`) : la composition des étages, pas leurs chiffres. Un étage
 * ordinaire tire ses ennemis du groupe de son élément (rotation feu → eau → nature) ; un étage de
 * boss reprend une composition écrite ici. Niveaux, PV, ATK, taille des groupes et récompenses
 * sont des formules de `balance.tower` : 50 étages sans 50 combats écrits à la main.
 */
export const towerSchema = z.strictObject({
  /**
   * Groupe ordinaire de chaque élément : ennemis (aucun boss) dans l'ordre où ils alternent, et
   * correction de PV et d'ATK (en %, 100 par défaut) qui égalise la difficulté des trois groupes.
   */
  pools: z.strictObject({
    fire: poolSchema,
    water: poolSchema,
    nature: poolSchema,
  }),
  /**
   * Étages de boss, dans l'ordre (étage `bossEvery`, puis 2 × `bossEvery`…) : ennemis de gauche à
   * droite (un boss au moins) et, au choix, le modificateur d'un donjon existant (son identifiant).
   */
  bosses: z
    .array(
      z.strictObject({
        enemies: z.array(idSchema).min(1).max(MAX_SIDE),
        modifierOf: idSchema.optional(),
        /** PV et ATK de ce boss, en % de la courbe de l'étage (100 par défaut). */
        hpPct: z.number().int().min(10).max(400).default(100),
        atkPct: z.number().int().min(10).max(400).default(100),
      }),
    )
    .min(1),
});
export type TowerData = z.infer<typeof towerSchema>;
