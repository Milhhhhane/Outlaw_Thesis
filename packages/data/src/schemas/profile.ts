import { z } from 'zod';
import { idSchema } from './common';

const nonNegInt = z.number().int().min(0);

/** Progression d'un héros. Les objets sont référencés par l'uid de l'exemplaire possédé. */
export const heroProgressSchema = z.strictObject({
  level: z.number().int().min(1),
  /** XP accumulée vers le niveau suivant. */
  xp: nonNegInt,
  talents: z.array(idSchema),
  /** Un uid d'objet ou null par emplacement. */
  items: z.array(nonNegInt.nullable()),
  /** Vrai une fois le respec gratuit utilisé. */
  freeRespecUsed: z.boolean(),
});
export type HeroProgress = z.infer<typeof heroProgressSchema>;

export const ownedItemSchema = z.strictObject({
  uid: nonNegInt,
  item: idSchema,
  upgrade: nonNegInt,
});
export type OwnedItem = z.infer<typeof ownedItemSchema>;

export const PROFILE_VERSION = 1;

/**
 * Profil du joueur, sauvegardé tel quel (localStorage). Versionné : toute évolution du format
 * ajoute une migration côté interface et incrémente PROFILE_VERSION.
 */
export const profileSchema = z.strictObject({
  version: z.literal(PROFILE_VERSION),
  /** État du tirage de butin : avance à chaque tirage, le butin reste reproductible. */
  seed: z.number().int(),
  gold: nonNegInt,
  /** Matériaux par palier : [palier 1, palier 2, palier 3]. */
  materials: z.tuple([nonNegInt, nonNegInt, nonNegInt]),
  energy: z.strictObject({ value: nonNegInt, updatedAt: nonNegInt }),
  heroes: z.record(idSchema, heroProgressSchema),
  unlocked: z.array(idSchema),
  team: z.array(idSchema).max(3),
  items: z.array(ownedItemSchema),
  nextUid: nonNegInt,
  dungeons: z.record(idSchema, z.strictObject({ clears: nonNegInt })),
  /** Donjons terminés depuis le dernier objet rare (garantie). */
  sinceRare: nonNegInt,
  /** Mode test : respec gratuit, tout débloqué (sprint 4). */
  testMode: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
