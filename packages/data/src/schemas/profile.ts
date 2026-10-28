import { z } from 'zod';
import { MAX_SIDE } from './balance';
import { idSchema } from './common';
import { emptyQuestState, questStateSchema } from './quests';

/** Niveau de chaque sort d'un héros (1 = sans montée). */
export const spellLevelsSchema = z.strictObject({
  basic: z.number().int().min(1),
  a: z.number().int().min(1),
  b: z.number().int().min(1),
  ult: z.number().int().min(1),
});
export type SpellLevels = z.infer<typeof spellLevelsSchema>;
/** Tous les sorts au niveau 1 : valeur des anciennes sauvegardes et d'un héros neuf. */
export const BASE_SPELL_LEVELS: SpellLevels = Object.freeze({ basic: 1, a: 1, b: 1, ult: 1 });

const nonNegInt = z.number().int().min(0);
const posInt = z.number().int().min(1);
const essenceStock = z.tuple([nonNegInt, nonNegInt, nonNegInt]);

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
  /** Niveau de chaque sort (montée des sorts). Absent des anciennes sauvegardes : tous au niveau 1. */
  spells: spellLevelsSchema.default(BASE_SPELL_LEVELS),
  /** Éveil payé (une fois par héros). Absent des anciennes sauvegardes. */
  awakened: z.boolean().default(false),
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

/** Équipes enregistrées : nombre d'emplacements et longueur maximale d'un nom. */
export const PRESET_SLOTS = 3;
export const PRESET_NAME_MAX = 20;

/** Une équipe enregistrée : un nom choisi par le joueur et ses héros, dans l'ordre. */
export const teamPresetSchema = z.strictObject({
  name: z.string().min(1).max(PRESET_NAME_MAX),
  team: z.array(idSchema).min(1).max(MAX_SIDE),
});
export type TeamPreset = z.infer<typeof teamPresetSchema>;

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
  /** Grimoires (montée des sorts, commune à tous les héros). Absent des anciennes sauvegardes. */
  grimoires: nonNegInt.default(0),
  /** Héros qui reçoit une part des fragments des coffres (le joueur se spécialise). */
  focus: idSchema.nullable().default(null),
  /**
   * Équipes enregistrées, une par emplacement (index = emplacement, null = vide). Absent des
   * anciennes sauvegardes : aucun emplacement rempli.
   */
  presets: z.array(teamPresetSchema.nullable()).max(PRESET_SLOTS).default([]),
  /**
   * Compteurs à vie (donjons gagnés, niveaux payés, coffres ouverts…), tenus par le moteur ; les
   * quêtes comptent leur différence depuis le début de la période. Absent des anciennes sauvegardes.
   */
  stats: z.record(idSchema, nonNegInt).default({}),
  /** Quêtes du jour, de la semaine et succès réclamés. Absent des anciennes sauvegardes. */
  quests: questStateSchema.default(emptyQuestState),
  /**
   * Tour à étages : plus haut étage battu (0 : aucun). On tente l'étage suivant ou on rejoue un
   * étage battu. Absent des anciennes sauvegardes.
   */
  tower: z.strictObject({ cleared: nonNegInt }).default({ cleared: 0 }),
  /**
   * Essences par élément : [faible, moyenne, supérieure]. Elles paient l'éveil des héros du même
   * élément. Absent des anciennes sauvegardes.
   */
  essences: z
    .strictObject({ fire: essenceStock, water: essenceStock, nature: essenceStock })
    .default({ fire: [0, 0, 0], water: [0, 0, 0], nature: [0, 0, 0] }),
  /**
   * Donjons d'essence : passages gagnants et palier atteint (comme `dungeons`, I par défaut).
   * Absent des anciennes sauvegardes.
   */
  essenceDungeons: z
    .record(idSchema, z.strictObject({ clears: nonNegInt, tier: posInt.default(1) }))
    .default({}),
  /**
   * Boss de la semaine : semaine et jour UTC (`periodOf`) des valeurs gardées ; meilleurs dégâts et
   * paliers déjà payés cette semaine, par difficulté ; tentatives prises ce jour. Le moteur les
   * remet à zéro à la semaine ou au jour suivant. Absent des anciennes sauvegardes.
   */
  boss: z
    .strictObject({
      week: z.number().int(),
      best: z.array(nonNegInt),
      claimed: z.array(nonNegInt),
      day: z.number().int(),
      attempts: nonNegInt,
    })
    .default({ week: -1, best: [], claimed: [], day: -1, attempts: 0 }),
  /** Mode test : respec gratuit, tout débloqué (sprint 4). */
  testMode: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
