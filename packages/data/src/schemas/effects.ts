import { z } from 'zod';
import { elementSchema, modifiableStatSchema, nonZero, spellSlotSchema } from './common';

/**
 * Les 8 briques d'effet : tout ce que le moteur de combat sait faire.
 * Chaque sort, passif, talent et objet est un assemblage de ces briques.
 *
 *  1. damage     dégâts
 *  2. heal       soin
 *  3. shield     bouclier
 *  4. tempo      modification de tempo (avancer ou retarder une unité)
 *  5. statMod    modification de stat avec durée
 *  6. status     altération (marque, brûlure, étourdissement)
 *  7. teamPoints gain ou dépense de points d'équipe
 *  8. trigger    déclencheur sur événement
 */

/** Cible d'une brique. « primary » = la ou les cibles choisies du sort (sorts uniquement). */
export const TARGET_REFS = [
  'primary',
  'self',
  'subject',
  'other',
  'all_allies',
  'other_allies',
  'all_enemies',
  'lowest_hp_ally',
  'lowest_hp_enemy',
] as const;
export const targetRefSchema = z.enum(TARGET_REFS);
export type TargetRef = z.infer<typeof targetRefSchema>;

export const STATUS_KINDS = ['mark', 'burn', 'stun'] as const;
export const statusKindSchema = z.enum(STATUS_KINDS);
export type StatusKind = z.infer<typeof statusKindSchema>;

/** Pourcentage de l'ATK du lanceur. */
const powerSchema = z.number().positive();
const durationSchema = z.number().int().min(1);

export const damageEffectSchema = z.strictObject({
  kind: z.literal('damage'),
  target: targetRefSchema.default('primary'),
  power: powerSchema,
  /** Élément du coup. Par défaut : élément du sort, sinon celui du lanceur. */
  element: elementSchema.optional(),
});

export const healEffectSchema = z.strictObject({
  kind: z.literal('heal'),
  target: targetRefSchema.default('primary'),
  power: powerSchema,
});

export const shieldEffectSchema = z.strictObject({
  kind: z.literal('shield'),
  target: targetRefSchema.default('primary'),
  power: powerSchema,
  /** Durée en tours de la cible. */
  duration: durationSchema,
});

export const tempoEffectSchema = z.strictObject({
  kind: z.literal('tempo'),
  target: targetRefSchema.default('primary'),
  /** En unités de temps : négatif = avance la cible, positif = la retarde. */
  amount: z.number().refine(nonZero, 'amount ne peut pas valoir 0'),
});

export const statModEffectSchema = z.strictObject({
  kind: z.literal('statMod'),
  target: targetRefSchema.default('primary'),
  stat: modifiableStatSchema,
  /** En pourcentage, additif entre sources, borné par balance.combat.statMod. */
  percent: z.number().refine(nonZero, 'percent ne peut pas valoir 0'),
  duration: durationSchema,
});

export const statusEffectSchema = z.strictObject({
  kind: z.literal('status'),
  target: targetRefSchema.default('primary'),
  status: statusKindSchema,
  duration: durationSchema,
  /** Brûlure : % d'ATK du lanceur par tour. Marque : bonus de dégâts subis en %. Ignoré pour l'étourdissement. */
  power: powerSchema.optional(),
});

export const teamPointsEffectSchema = z.strictObject({
  kind: z.literal('teamPoints'),
  amount: z.number().int().refine(nonZero, 'amount ne peut pas valoir 0'),
  /** « own » : réserve de l'équipe du lanceur. « opposing » : réserve adverse. */
  side: z.enum(['own', 'opposing']).default('own'),
});

/** Les 7 briques qui ne sont pas des déclencheurs : elles peuvent être contenues dans un déclencheur. */
export const plainEffectSchema = z.discriminatedUnion('kind', [
  damageEffectSchema,
  healEffectSchema,
  shieldEffectSchema,
  tempoEffectSchema,
  statModEffectSchema,
  statusEffectSchema,
  teamPointsEffectSchema,
]);
export type PlainEffect = z.infer<typeof plainEffectSchema>;
export type PlainEffectKind = PlainEffect['kind'];

export const EVENT_KINDS = [
  'combat_start',
  'turn_start',
  'turn_end',
  'spell_cast',
  'damage_dealt',
  'damage_taken',
  'unit_down',
  'hp_crossed',
  'status_applied',
] as const;
export const eventKindSchema = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof eventKindSchema>;

/** Qui doit être le sujet de l'événement, relativement au propriétaire du déclencheur. */
export const subjectFilterSchema = z.enum(['self', 'ally', 'enemy', 'any']);
export type SubjectFilter = z.infer<typeof subjectFilterSchema>;

export const triggerSchema = z
  .strictObject({
    on: eventKindSchema,
    subject: subjectFilterSchema.default('self'),
    /** hp_crossed : seuil de PV (en % des PV max) franchi vers le bas. */
    thresholdPct: z.number().min(1).max(99).optional(),
    /** spell_cast : emplacements concernés. */
    slots: z.array(spellSlotSchema).min(1).optional(),
    /** status_applied : altération concernée. */
    status: statusKindSchema.optional(),
    /** damage_dealt / damage_taken : la victime doit porter cette altération. */
    targetHasStatus: statusKindSchema.optional(),
    /** Limite d'utilisations. Absente : illimité. */
    limit: z
      .strictObject({ per: z.enum(['combat', 'turn']), count: z.number().int().min(1) })
      .optional(),
    effects: z.array(plainEffectSchema).min(1).max(4),
  })
  .superRefine((t, ctx) => {
    const issue = (message: string, path: (string | number)[]): void => {
      ctx.addIssue({ code: 'custom', message, path });
    };
    if (t.on === 'hp_crossed' && t.thresholdPct === undefined) {
      issue('hp_crossed exige thresholdPct', ['thresholdPct']);
    }
    if (t.on !== 'hp_crossed' && t.thresholdPct !== undefined) {
      issue('thresholdPct est réservé à hp_crossed', ['thresholdPct']);
    }
    if (t.on !== 'spell_cast' && t.slots !== undefined) {
      issue('slots est réservé à spell_cast', ['slots']);
    }
    if (t.on === 'status_applied' && t.status === undefined) {
      issue('status_applied exige status', ['status']);
    }
    if (t.on !== 'status_applied' && t.status !== undefined) {
      issue('status est réservé à status_applied', ['status']);
    }
    if (t.targetHasStatus !== undefined && t.on !== 'damage_dealt' && t.on !== 'damage_taken') {
      issue('targetHasStatus est réservé à damage_dealt et damage_taken', ['targetHasStatus']);
    }
    if (t.on === 'combat_start' && t.subject !== 'self') {
      issue('combat_start n’a pas de sujet : utiliser subject « self »', ['subject']);
    }
    const noOther = t.on === 'combat_start' || t.on === 'turn_start' || t.on === 'turn_end';
    t.effects.forEach((effect, index) => {
      if (!('target' in effect)) return;
      if (effect.target === 'other' && noOther) {
        issue(`la cible « other » n’existe pas pour ${t.on}`, ['effects', index, 'target']);
      }
      if (effect.target === 'subject' && t.on === 'combat_start') {
        issue('la cible « subject » n’existe pas pour combat_start', ['effects', index, 'target']);
      }
      if (effect.target === 'primary') {
        issue('la cible « primary » est réservée aux sorts', ['effects', index, 'target']);
      }
    });
  });
export type Trigger = z.infer<typeof triggerSchema>;

export const triggerEffectSchema = z.strictObject({
  kind: z.literal('trigger'),
  /** Unité qui reçoit le déclencheur. */
  target: targetRefSchema.default('self'),
  /** Durée en tours du porteur. Absente : jusqu'à la fin du combat. */
  duration: durationSchema.optional(),
  trigger: triggerSchema,
});

/** Les 8 briques. */
export const effectSchema = z.discriminatedUnion('kind', [
  damageEffectSchema,
  healEffectSchema,
  shieldEffectSchema,
  tempoEffectSchema,
  statModEffectSchema,
  statusEffectSchema,
  teamPointsEffectSchema,
  triggerEffectSchema,
]);
export type Effect = z.infer<typeof effectSchema>;
export type EffectKind = Effect['kind'];
export const EFFECT_KINDS = [
  'damage',
  'heal',
  'shield',
  'tempo',
  'statMod',
  'status',
  'teamPoints',
  'trigger',
] as const satisfies readonly EffectKind[];

/** Champs numériques ajustables par un talent ou un objet, selon la brique. */
export const SCALABLE_FIELDS = {
  damage: ['power'],
  heal: ['power'],
  shield: ['power', 'duration'],
  tempo: ['amount'],
  statMod: ['percent', 'duration'],
  status: ['duration', 'power'],
  teamPoints: ['amount'],
} as const satisfies Record<PlainEffectKind, readonly string[]>;
