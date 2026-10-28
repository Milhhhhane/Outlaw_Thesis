import { z } from 'zod';
import { MAX_SIDE } from './balance';
import { ELEMENTS, idSchema } from './common';
import { triggerSchema } from './effects';

/** Élément d'un donjon : un des 3 éléments, ou « mixte ». */
export const dungeonElementSchema = z.enum([...ELEMENTS, 'mixed']);
export type DungeonElement = z.infer<typeof dungeonElementSchema>;

/**
 * Modificateur de donjon : des déclencheurs ordinaires, posés sur chaque unité d'un camp
 * au début du combat. Il force à adapter l'équipe et les talents, sans nouvelle règle de moteur.
 */
export const dungeonModifierSchema = z.strictObject({
  id: idSchema,
  rules: z
    .array(z.strictObject({ appliesTo: z.enum(['heroes', 'enemies']), trigger: triggerSchema }))
    .min(1)
    .max(3),
});
export type DungeonModifier = z.infer<typeof dungeonModifierSchema>;

export const encounterSchema = z.strictObject({
  /** Ennemis du combat, de gauche à droite : 1 à 3. */
  enemies: z.array(idSchema).min(1).max(MAX_SIDE),
  /** PV des ennemis de ce combat, en % (100 par défaut) : règle la durée combat par combat. */
  hpPct: z.number().int().min(10).max(400).optional(),
  /** ATK des ennemis du combat, en % (levier de difficulté : les dégâts, sans toucher à la durée). */
  atkPct: z.number().int().min(10).max(400).optional(),
});
export type Encounter = z.infer<typeof encounterSchema>;

export const DUNGEON_ENCOUNTERS = 3;

/** Carte du monde : 320 × 180 pixels natifs par chapitre. */
export const MAP_SIZE = { w: 320, h: 180 } as const;
/** Repères dessinés sur la carte (sprites `landmark_*` de l'atlas). */
export const LANDMARKS = [
  'camp',
  'ruins',
  'gate',
  'tower',
  'spire',
  'crown',
  'bridge',
  'salt',
  'pass',
  'throne',
] as const;
export const landmarkSchema = z.enum(LANDMARKS);

/** Place d'un donjon sur la carte : position du repère et chapitre (une carte par chapitre). */
export const mapPlaceSchema = z.strictObject({
  x: z
    .number()
    .int()
    .min(8)
    .max(MAP_SIZE.w - 8),
  y: z
    .number()
    .int()
    .min(8)
    .max(MAP_SIZE.h - 8),
  landmark: landmarkSchema,
  chapter: z.number().int().min(1).default(1),
});
export type MapPlace = z.infer<typeof mapPlaceSchema>;

/** Un donjon : 2 salles puis un boss, un niveau recommandé, un modificateur, une table de butin. */
export const dungeonSchema = z.strictObject({
  id: idSchema,
  element: dungeonElementSchema,
  recommendedLevel: z.number().int().min(1),
  modifier: dungeonModifierSchema,
  encounters: z.array(encounterSchema).length(DUNGEON_ENCOUNTERS),
  rewards: z.strictObject({
    xp: z.number().int().min(0),
    gold: z.number().int().min(0),
    materials: z.strictObject({
      tier: z.number().int().min(1).max(3),
      amount: z.number().int().min(0),
    }),
  }),
  /**
   * Butin : les objets qui peuvent tomber ici. Le poids vient de la rareté (balance.economy.loot),
   * pas du donjon : une liste suffit, et les taux affichés en découlent.
   */
  loot: z.array(idSchema).min(2),
  /** Décor de combat (fichier `bg/<scene>.png`) ; par défaut, l'identifiant du donjon. */
  scene: idSchema.optional(),
  map: mapPlaceSchema,
  /** Héros débloqué en terminant ce donjon pour la première fois. */
  unlocksHero: idSchema.optional(),
});
export type Dungeon = z.infer<typeof dungeonSchema>;
