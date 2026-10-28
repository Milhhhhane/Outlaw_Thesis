import { z } from 'zod';
import { idSchema } from './common';

/**
 * Compteurs à vie tenus par le moteur (`profile.stats`) : chaque fonction de progression qui fait
 * l'action l'incrémente. Les quêtes du jour et de la semaine comptent leur différence depuis le
 * début de la période ; les succès peuvent aussi les lire.
 */
export const COUNTERS = [
  /** Donjons gagnés (tous paliers). */
  'wins',
  /** Donjons gagnés au palier II ou plus. */
  'wins_tier2',
  /** Donjons gagnés au palier III ou plus. */
  'wins_tier3',
  /** Niveaux payés (un par niveau). */
  'levels',
  /** Améliorations d'objet. */
  'upgrades',
  /** Coffres ouverts. */
  'chests',
  /** Héros invoqués. */
  'summons',
  /** Étoiles payées. */
  'stars',
] as const;
export const counterSchema = z.enum(COUNTERS);
export type Counter = z.infer<typeof counterSchema>;

/**
 * Mesures d'un succès : un compteur, ou une valeur lue dans le profil (une ancienne sauvegarde
 * garde ainsi ses succès déjà mérités).
 */
export const PROFILE_METRICS = [
  /** Donjons différents terminés au moins une fois. */
  'dungeons_cleared',
  /** Victoires au total (somme des passages de chaque donjon). */
  'clears_total',
  /** Donjons dont le palier III est terminé. */
  'tier3_cleared',
  /** Plus haut rang de maîtrise atteint dans un donjon. */
  'mastery_rank',
  /** Objets différents possédés. */
  'items_owned',
  /** Objets au niveau d'amélioration maximum. */
  'items_maxed',
  /** Héros débloqués. */
  'heroes',
  /** Étoiles de tous les héros. */
  'stars_total',
  /** Plus haut niveau d'un héros. */
  'hero_level',
] as const;
export const metricSchema = z.enum([...COUNTERS, ...PROFILE_METRICS]);
export type Metric = z.infer<typeof metricSchema>;

/** Quête du jour ou de la semaine : un compteur à faire avancer de `target` pendant la période. */
export const questSchema = z.strictObject({
  id: idSchema,
  metric: counterSchema,
  target: z.number().int().min(1),
  /** Victoires à vie qu'il faut avant que la quête puisse être tirée (pas de quête impossible au début). */
  minWins: z.number().int().min(0).default(0),
});
export type Quest = z.infer<typeof questSchema>;

/** Succès permanent : une seule récompense, de la classe donnée (`balance.quests.achievements`). */
export const achievementSchema = z.strictObject({
  id: idSchema,
  metric: metricSchema,
  target: z.number().int().min(1),
  reward: z.enum(['small', 'medium', 'large']),
});
export type Achievement = z.infer<typeof achievementSchema>;

export const questsContentSchema = z.strictObject({
  daily: z.array(questSchema).min(1),
  weekly: z.array(questSchema).min(1),
  achievements: z.array(achievementSchema),
});
export type QuestsContent = z.infer<typeof questsContentSchema>;

/**
 * Récompense : `passagePct` % de l'or et de la poussière d'un passage du donjon le plus avancé
 * terminé (palier I, sans maîtrise), plus un coffre facultatif. Elle suit ainsi la progression :
 * le même effet relatif au premier donjon et au dernier.
 */
export const questRewardSchema = z.strictObject({
  passagePct: z.number().int().min(0),
  chest: idSchema.nullable().default(null),
});
export type QuestReward = z.infer<typeof questRewardSchema>;

/** État des quêtes d'une période (jour ou semaine UTC). */
export const questPeriodSchema = z.strictObject({
  /** Numéro de la période (jour depuis 1970, ou semaine commençant le lundi) ; -1 : jamais tirée. */
  period: z.number().int(),
  /** Quêtes tirées pour cette période. */
  ids: z.array(idSchema),
  /** Compteurs au début de la période : la progression est la différence. */
  base: z.record(idSchema, z.number().int().min(0)),
  /** Quêtes déjà réclamées. */
  claimed: z.array(idSchema),
  /** Bonus « tout fait » réclamé. */
  bonus: z.boolean(),
});
export type QuestPeriod = z.infer<typeof questPeriodSchema>;

const emptyPeriod = (): QuestPeriod => ({ period: -1, ids: [], base: {}, claimed: [], bonus: false });

export const questStateSchema = z.strictObject({
  daily: questPeriodSchema.default(emptyPeriod),
  weekly: questPeriodSchema.default(emptyPeriod),
  /** Succès réclamés. */
  achievements: z.array(idSchema).default([]),
});
export type QuestState = z.infer<typeof questStateSchema>;

export function emptyQuestState(): QuestState {
  return { daily: emptyPeriod(), weekly: emptyPeriod(), achievements: [] };
}
