import { z } from 'zod';
import { MAX_SIDE } from './balance';
import { idSchema } from './common';

const nonNegInt = z.number().int().min(0);
const posInt = z.number().int().min(1);

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
  /**
   * Paliers de niveau déjà payés en fragments. Absent des anciennes sauvegardes : le moteur prend
   * le plus grand de cette valeur et de celle que le niveau implique (`heroStars`).
   */
  stars: nonNegInt.default(0),
});
export type HeroProgress = z.infer<typeof heroProgressSchema>;

export const ownedItemSchema = z.strictObject({
  uid: nonNegInt,
  item: idSchema,
  upgrade: nonNegInt,
  /** Exemplaires supplémentaires du même objet : ils servent à l'améliorer. Absent des anciennes sauvegardes. */
  copies: nonNegInt.default(0),
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
  team: z.array(idSchema).max(MAX_SIDE),
  items: z.array(ownedItemSchema),
  nextUid: nonNegInt,
  dungeons: z.record(
    idSchema,
    z.strictObject({
      clears: nonNegInt,
      /** Passages sans objet rare dans ce donjon (garantie du rare). Absent des anciennes sauvegardes. */
      dry: nonNegInt.default(0),
      /**
       * Palier atteint (débloqué) : I par défaut ; terminer le palier k pour la première fois
       * passe à k + 1, y compris au-delà du dernier palier (tous terminés). Le moteur en déduit
       * le palier ouvert (`tierReached`) et le premier passage de chaque palier. Absent des
       * anciennes sauvegardes : un donjon déjà terminé y compte comme palier I terminé.
       */
      tier: posInt.default(1),
    }),
  ),
  /** Ancienne garantie globale du rare : conservée pour les sauvegardes, remplacée par `dungeons[id].dry`. */
  sinceRare: nonNegInt,
  /** Fragments possédés par héros (invocation et étoiles). Absent des anciennes sauvegardes. */
  fragments: z.record(idSchema, nonNegInt).default({}),
  /** Coffres fermés par palier. Absent des anciennes sauvegardes. */
  chests: z.record(idSchema, nonNegInt).default({}),
  /** Héros qui reçoit une part des fragments des coffres (le joueur se spécialise). */
  focus: idSchema.nullable().default(null),
  /** Mode test : respec gratuit, tout débloqué (sprint 4). */
  testMode: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
