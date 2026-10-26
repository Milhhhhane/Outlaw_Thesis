import { z } from 'zod';
import {
  SPELL_SLOTS,
  baseStatsSchema,
  elementSchema,
  idSchema,
  nonZero,
  roleSchema,
  spellSlotSchema,
} from './common';
import { SCALABLE_FIELDS, effectSchema, triggerSchema } from './effects';

/** Ciblage d'un sort : choisi par le joueur (enemy, ally) ou automatique (self, all_*). « ally » inclut le lanceur. */
export const targetingSchema = z.enum(['enemy', 'ally', 'self', 'all_enemies', 'all_allies']);
export type Targeting = z.infer<typeof targetingSchema>;

/**
 * Un sort. Le coût en points et le délai viennent de balance.json selon l'emplacement (slot),
 * puis des talents. L'attaque de base génère des points au lieu d'en dépenser.
 */
export const spellSchema = z.strictObject({
  id: idSchema,
  slot: spellSlotSchema,
  targeting: targetingSchema,
  /** Élément du sort. Par défaut : élément du lanceur. */
  element: elementSchema.optional(),
  effects: z.array(effectSchema).min(1).max(6),
});
export type Spell = z.infer<typeof spellSchema>;

/** Passif : événements déclencheurs fixes, sans chaîne. Jamais un simple bonus de stat. */
export const passiveSchema = z
  .strictObject({
    id: idSchema,
    triggers: z.array(triggerSchema).min(1).max(2),
  })
  .superRefine((passive, ctx) => {
    const onlyStats = passive.triggers.every((t) => t.effects.every((e) => e.kind === 'statMod'));
    if (onlyStats) {
      ctx.addIssue({
        code: 'custom',
        message: 'un passif ne peut pas se réduire à un bonus de stat',
        path: ['triggers'],
      });
    }
  });
export type Passive = z.infer<typeof passiveSchema>;

const scalableKindSchema = z.enum([
  'damage',
  'heal',
  'shield',
  'tempo',
  'statMod',
  'status',
  'teamPoints',
]);

/**
 * Modifications de sort apportées par un talent. Jamais de simple bonus de stat :
 * un talent change ce que fait un sort, son coût, son délai ou sa cible.
 */
export const spellModSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('addEffect'), slot: spellSlotSchema, effect: effectSchema }),
  z
    .strictObject({
      type: z.literal('scaleEffect'),
      slot: spellSlotSchema,
      kind: scalableKindSchema,
      field: z.enum(['power', 'duration', 'amount', 'percent']),
      /** Ajout au champ (avant le multiplicateur). */
      add: z.number().optional(),
      /** Multiplicateur en % (ex. 25 = +25 %, -20 = -20 %). */
      mulPct: z.number().optional(),
    })
    .superRefine((mod, ctx) => {
      const allowed: readonly string[] = SCALABLE_FIELDS[mod.kind];
      if (!allowed.includes(mod.field)) {
        ctx.addIssue({
          code: 'custom',
          message: `${mod.kind} n’a pas de champ ajustable « ${mod.field} » (${allowed.join(', ')})`,
          path: ['field'],
        });
      }
      if (mod.add === undefined && mod.mulPct === undefined) {
        ctx.addIssue({ code: 'custom', message: 'add ou mulPct requis', path: ['add'] });
      }
    }),
  z.strictObject({
    type: z.literal('cost'),
    slot: z.enum(['a', 'b', 'ult']),
    delta: z.number().int().refine(nonZero, 'delta ne peut pas valoir 0'),
  }),
  /** Points générés par l'attaque de base. */
  z.strictObject({
    type: z.literal('gain'),
    delta: z.number().int().refine(nonZero, 'delta ne peut pas valoir 0'),
  }),
  z.strictObject({
    type: z.literal('delay'),
    slot: spellSlotSchema,
    delta: z.number().refine(nonZero, 'delta ne peut pas valoir 0'),
  }),
  z.strictObject({
    type: z.literal('retarget'),
    slot: spellSlotSchema,
    targeting: targetingSchema,
  }),
]);
export type SpellMod = z.infer<typeof spellModSchema>;

/**
 * Un nœud de talent. « requires » : nœud de la même page à prendre avant.
 * « group » : les nœuds d'un même groupe s'excluent mutuellement (choix « A ou B »).
 */
export const talentNodeSchema = z.strictObject({
  id: idSchema,
  requires: idSchema.optional(),
  group: idSchema.optional(),
  mods: z.array(spellModSchema).min(1).max(3),
});
export type TalentNode = z.infer<typeof talentNodeSchema>;

export const NODES_PER_PAGE = 5;
export const PAGES_PER_HERO = 3;

/** Une page de talents : 5 nœuds, une thèse (le texte de la thèse vit dans i18n). */
export const talentPageSchema = z
  .strictObject({
    id: idSchema,
    nodes: z.array(talentNodeSchema).length(NODES_PER_PAGE),
  })
  .superRefine((page, ctx) => {
    const ids = new Set(page.nodes.map((n) => n.id));
    const byId = new Map(page.nodes.map((n) => [n.id, n] as const));
    page.nodes.forEach((node, index) => {
      if (node.requires === undefined) return;
      if (!ids.has(node.requires)) {
        ctx.addIssue({
          code: 'custom',
          message: `prérequis « ${node.requires} » absent de la page`,
          path: ['nodes', index, 'requires'],
        });
        return;
      }
      // Détection de cycle : on remonte la chaîne de prérequis.
      const seen = new Set<string>([node.id]);
      let cursor: string | undefined = node.requires;
      while (cursor !== undefined) {
        if (seen.has(cursor)) {
          ctx.addIssue({
            code: 'custom',
            message: `cycle de prérequis autour de « ${node.id} »`,
            path: ['nodes', index, 'requires'],
          });
          return;
        }
        seen.add(cursor);
        cursor = byId.get(cursor)?.requires;
      }
    });
    const groups = new Map<string, number>();
    for (const node of page.nodes) {
      if (node.group !== undefined) groups.set(node.group, (groups.get(node.group) ?? 0) + 1);
    }
    for (const [group, count] of groups) {
      if (count < 2) {
        ctx.addIssue({
          code: 'custom',
          message: `le groupe exclusif « ${group} » doit contenir au moins 2 nœuds`,
          path: ['nodes'],
        });
      }
    }
  });
export type TalentPage = z.infer<typeof talentPageSchema>;

/**
 * Un héros : 4 statistiques de niveau 1, 1 élément, 1 rôle, 4 sorts, 1 passif fixe, 3 pages de talents.
 * Ajouter un héros ne demande aucun code : un fichier JSON suffit.
 */
export const heroSchema = z
  .strictObject({
    id: idSchema,
    element: elementSchema,
    role: roleSchema,
    stats: baseStatsSchema,
    spells: z.array(spellSchema).length(SPELL_SLOTS.length),
    passive: passiveSchema,
    pages: z.array(talentPageSchema).length(PAGES_PER_HERO),
  })
  .superRefine((hero, ctx) => {
    const slots = new Set(hero.spells.map((s) => s.slot));
    if (slots.size !== SPELL_SLOTS.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'un héros a exactement un sort par emplacement (basic, a, b, ult)',
        path: ['spells'],
      });
    }
    const seen = new Set<string>();
    const claim = (id: string, path: (string | number)[]): void => {
      if (seen.has(id)) {
        ctx.addIssue({ code: 'custom', message: `identifiant en double : « ${id} »`, path });
      }
      seen.add(id);
    };
    claim(hero.id, ['id']);
    hero.spells.forEach((s, i) => {
      claim(s.id, ['spells', i, 'id']);
    });
    claim(hero.passive.id, ['passive', 'id']);
    hero.pages.forEach((page, pi) => {
      claim(page.id, ['pages', pi, 'id']);
      page.nodes.forEach((node, ni) => {
        claim(node.id, ['pages', pi, 'nodes', ni, 'id']);
      });
    });
  });
export type Hero = z.infer<typeof heroSchema>;
