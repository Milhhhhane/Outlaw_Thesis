import { z } from 'zod';
import { baseStatsSchema, elementSchema, idSchema } from './common';
import { passiveSchema, spellSchema } from './heroes';

/**
 * Règle de choix de cible du script ennemi. « auto » : ciblage sans choix (self, all_*).
 * Les autres règles s'appliquent parmi les cibles vivantes (égalité : emplacement le plus bas).
 */
export const enemyTargetRuleSchema = z.enum(['auto', 'lowest_hp', 'highest_atk', 'first', 'last']);
export type EnemyTargetRule = z.infer<typeof enemyTargetRuleSchema>;

/**
 * Un type d'ennemi : même format de stats que les héros, un script d'actions fixe
 * dont la prochaine action est affichée au joueur.
 */
export const enemySchema = z
  .strictObject({
    id: idSchema,
    element: elementSchema,
    boss: z.boolean().default(false),
    stats: baseStatsSchema,
    skills: z.array(spellSchema).min(1).max(4),
    script: z
      .array(z.strictObject({ skill: idSchema, target: enemyTargetRuleSchema }))
      .min(1)
      .max(6),
    passive: passiveSchema.optional(),
  })
  .superRefine((enemy, ctx) => {
    const skills = new Map(enemy.skills.map((s) => [s.id, s] as const));
    if (skills.size !== enemy.skills.length) {
      ctx.addIssue({ code: 'custom', message: 'sorts en double', path: ['skills'] });
    }
    enemy.script.forEach((step, index) => {
      const skill = skills.get(step.skill);
      if (!skill) {
        ctx.addIssue({
          code: 'custom',
          message: `le script cite « ${step.skill} », absent des sorts`,
          path: ['script', index, 'skill'],
        });
        return;
      }
      const picked = skill.targeting === 'enemy' || skill.targeting === 'ally';
      if (picked && step.target === 'auto') {
        ctx.addIssue({
          code: 'custom',
          message: `« ${step.skill} » vise une seule unité : choisir une règle de cible`,
          path: ['script', index, 'target'],
        });
      }
      if (!picked && step.target !== 'auto') {
        ctx.addIssue({
          code: 'custom',
          message: `« ${step.skill} » ne choisit pas de cible : utiliser « auto »`,
          path: ['script', index, 'target'],
        });
      }
    });
  });
export type Enemy = z.infer<typeof enemySchema>;
