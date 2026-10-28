import { z } from 'zod';
import { idSchema, elementSchema } from './common';
import { encounterSchema, DUNGEON_ENCOUNTERS } from './dungeons';

/**
 * Donjons d'essence (`content/essences.json`) : un par élément, hors du chemin de la carte. Ils
 * reprennent des ennemis et des boss existants de leur élément, trois combats et les paliers de
 * `balance.tiers` (niveau et PV/ATK des ennemis), mais ne donnent ni XP, ni or, ni objet : seulement
 * des essences de leur élément, de la qualité du palier (`balance.awakening.drops`). Les essences
 * paient l'éveil des héros du même élément.
 */
export const essenceDungeonSchema = z.strictObject({
  id: idSchema,
  element: elementSchema,
  /** Niveau des ennemis au palier I (les paliers suivants suivent `balance.tiers`). */
  recommendedLevel: z.number().int().min(1),
  encounters: z.array(encounterSchema).length(DUNGEON_ENCOUNTERS),
  /** Décor de combat emprunté à un donjon (`bg/<scene>.png`). */
  scene: idSchema,
});
export type EssenceDungeon = z.infer<typeof essenceDungeonSchema>;

export const essencesContentSchema = z.strictObject({
  dungeons: z.array(essenceDungeonSchema).length(3),
});
export type EssencesContent = z.infer<typeof essencesContentSchema>;
