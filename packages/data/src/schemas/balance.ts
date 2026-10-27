/** Unités au plus par camp en combat : les emplacements de la scène et des rencontres. */
export const MAX_SIDE = 4;

import { z } from 'zod';
import { idSchema } from './common';

const pos = z.number().positive();
const nonNeg = z.number().min(0);
const posInt = z.number().int().min(1);
const nonNegInt = z.number().int().min(0);

const growthSchema = z.strictObject({ hp: nonNeg, atk: nonNeg, def: nonNeg });

/**
 * Tous les paramètres d'équilibrage vivent dans packages/data/balance.json.
 * On règle le jeu en simulation en modifiant ce fichier et le contenu, jamais les règles du moteur.
 */
export const balanceSchema = z
  .strictObject({
    version: posInt,

    combat: z.strictObject({
      teamPoints: z.strictObject({ start: nonNegInt, cap: posInt, basicGain: nonNegInt }),
      /** Coût en points des compétences A, B et de l'ultime. */
      costs: z.strictObject({ a: nonNegInt, b: nonNegInt, ult: nonNegInt }),
      /** Délais de base par emplacement : prochain tour = maintenant + délai × 100 ÷ VIT. */
      delays: z.strictObject({ basic: pos, a: pos, b: pos, ult: pos }),
      /** Délai fictif du « tour précédent » pour ordonner le premier tour de chaque unité. */
      initialDelay: pos,
      /** Nombre d'actions affichées dans la file d'initiative. */
      queueHorizon: posInt,
      /** Défaite par manque de progression après ce nombre d'actions au total. */
      actionLimit: posInt,
      /** Plafond de VIT effective : la vitesse est un levier d'options, pas une stat à farmer. */
      speedCap: pos,
      element: z.strictObject({ advantage: pos, disadvantage: pos }),
      /** Dégâts = ATK × puissance × K ÷ (K + DEF). */
      defenseScale: pos,
      minDamage: nonNegInt,
      /** Bonus de dégâts subis d'une unité marquée, en %. */
      markBonusPct: pos,
      /** Dégâts de brûlure par défaut, en % de l'ATK du lanceur, par tour. */
      burnPowerPct: pos,
      /** Tours (de l'unité) pendant lesquels elle ne peut pas être de nouveau étourdie. */
      stunImmunityTurns: nonNegInt,
      /** Bornes du cumul additif de modifications de stat, en %. */
      statMod: z.strictObject({ minPct: z.number().max(0), maxPct: pos }),
      /** Plafond d'un bouclier, en % des PV max de la cible. */
      shieldCapPctMaxHp: pos,
    }),

    /**
     * Échelle globale des monstres, appliquée après la croissance par niveau : PV et ATK de tous
     * les ennemis. Les héros ne sont pas touchés. Leviers de réglage du propriétaire.
     */
    enemyScale: z.strictObject({ hp: pos, atk: pos }),

    progression: z.strictObject({
      maxLevel: z.number().int().min(2),
      /** Héros par équipe (emplacements côté joueur ; le moteur en accepte autant par camp). */
      teamSize: z.number().int().min(1).max(MAX_SIDE),
      /** Un héros ne dépasse pas (étoiles + 1) × ce nombre : chaque palier se paie en fragments. */
      levelsPerStar: posInt,
      /** Croissance des stats brutes au niveau max, en fraction de la stat de niveau 1 (1 = +100 %). */
      growth: z.strictObject({ hero: growthSchema, enemy: growthSchema }),
      /** Niveaux auxquels un héros gagne 1 point de talent. */
      talentPointLevels: z.array(posInt).min(1),
      /** Niveaux de déblocage des 3 pages de talents. */
      pageUnlockLevels: z.array(posInt).length(3),
      /** XP des héros au repos, en fraction du taux normal. */
      restXpRate: z.number().min(0).max(1),
      /** XP pour passer du niveau N au suivant : round(base × N ^ exponent). */
      xp: z.strictObject({ base: pos, exponent: pos }),
      respec: z.strictObject({
        firstFreePerHero: z.boolean(),
        /** Coût en or du respec : coefficient × niveau du héros. */
        goldPerHeroLevel: nonNegInt,
      }),
      items: z.strictObject({
        slots: posInt,
        /** Niveaux d'amélioration d'un objet (0 = brut). */
        maxUpgradeLevel: posInt,
        /** Chaque niveau d'amélioration augmente les valeurs de l'objet de ce pourcentage. */
        upgradeScalePct: nonNeg,
        /** Plafond de la petite stat d'un objet, en %. */
        statCapPct: pos,
        /**
         * Coût d'amélioration vers le niveau 1, 2, 3… (longueur = maxUpgradeLevel) : exemplaires
         * supplémentaires du même objet (consommés), or et poussière du palier du donjon d'origine.
         */
        upgradeCosts: z.array(
          z.strictObject({ copies: posInt, gold: nonNegInt, materials: nonNegInt }),
        ),
      }),
    }),

    economy: z.strictObject({
      /** Part de l'XP, de l'or et de la poussière d'un donjon rejoué (farm) par rapport au premier passage. */
      replayRewardRate: z.number().min(0).max(1),
      loot: z.strictObject({
        /** Poids de tirage de chaque rareté (un objet de la table du donjon, pondéré par sa rareté). */
        weights: z.strictObject({ common: posInt, rare: posInt }),
        /** Le premier passage d'un donjon donne toujours un objet rare. */
        firstClearRare: z.boolean(),
        /** Un objet rare est garanti au plus tard au Nème passage sans rare DANS CE donjon. */
        rarePity: posInt,
        /**
         * Maîtrise d'un donjon : un rang par palier de victoires atteint. Chaque rang ajoute du
         * poids au tirage du rare et un pourcentage à la poussière gagnée.
         */
        mastery: z.strictObject({
          clears: z.array(posInt).min(1),
          rareWeightPerRank: nonNegInt,
          materialsPctPerRank: nonNegInt,
        }),
        /** Poussière rendue par une copie dissoute, par rareté (palier = celui du donjon d'origine). */
        salvage: z.strictObject({ common: posInt, rare: posInt }),
      }),
    }),

    /**
     * Coffres et fragments de héros. Un coffre ne donne que des fragments ; `summonCost` fragments
     * invoquent un héros, et chaque palier de niveau se paie en fragments (`starCosts`).
     */
    chests: z.strictObject({
      /** Fragments d'un héros pour l'invoquer. */
      summonCost: posInt,
      /** Fragments pour passer l'étoile 1, 2, 3… (une entrée par palier jusqu'au niveau maximum). */
      starCosts: z.array(posInt),
      /** Part des fragments d'un coffre qui va au héros ciblé par le joueur (le reste est au hasard). */
      focusRate: z.number().min(0).max(1),
      /** Chance qu'un donjon déjà terminé redonne son coffre (le premier passage le donne toujours). */
      replayChestRate: z.number().min(0).max(1),
      /** Paliers de coffre, du plus modeste au plus riche. */
      tiers: z.array(z.strictObject({ id: idSchema, fragments: posInt })).min(1),
    }),

    /** L'énergie existe dès le MVP avec un coût de 0 : levier de monétisation sans gacha, plus tard. */
    energy: z.strictObject({
      costPerDungeon: nonNegInt,
      cap: posInt,
      regenPerMinute: nonNeg,
    }),

    /** Cibles de la simulation (règles d'équilibre). */
    targets: z.strictObject({
      /** R1 : à niveau égal, le meilleur build bat le pire build dans au moins cette part des combats. */
      r1MinWinRate: z.number().min(0).max(1),
      /** R2 : part de victoires minimale du meilleur build avec r2LevelGap niveaux de retard sur le donjon. */
      r2MinWinRate: z.number().min(0).max(1),
      r2LevelGap: nonNegInt,
      /** Aucun héros indispensable : écart maximal, en points de taux de victoire. */
      dispensableMaxGapPoints: nonNeg,
      /** Rythme : actions de joueur par combat (politique experte, niveau conseillé). */
      pacing: z.strictObject({
        normal: z.tuple([pos, pos]),
        boss: z.tuple([pos, pos]),
        /** Aucun combat expert ne finit en moins d'actions de joueur (sauf le tout premier). */
        floor: pos,
        firstFightFloor: pos,
        firstDungeonMax: pos,
        dungeonMax: pos,
      }),
      /** Part de donjons terminés au niveau conseillé, par politique (bornes incluses). */
      expertWinRate: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
      averageWinRate: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
      /**
       * Courbe de difficulté (joueur moyen, niveau conseillé) : le premier donjon réussit au moins
       * `first`, chaque donjon réussit au plus `tolerance` de mieux que le précédent (la difficulté
       * monte), et aucun ne descend sous `last`.
       */
      averageCurve: z.strictObject({
        first: z.number().min(0).max(1),
        last: z.number().min(0).max(1),
        tolerance: z.number().min(0).max(1),
      }),
    }),
  })
  .superRefine((b, ctx) => {
    if (b.combat.teamPoints.start > b.combat.teamPoints.cap) {
      ctx.addIssue({
        code: 'custom',
        message: 'combat.teamPoints.start dépasse le plafond',
        path: ['combat', 'teamPoints', 'start'],
      });
    }
    if (b.progression.items.upgradeCosts.length !== b.progression.items.maxUpgradeLevel) {
      ctx.addIssue({
        code: 'custom',
        message: 'upgradeCosts doit avoir une entrée par niveau d’amélioration',
        path: ['progression', 'items', 'upgradeCosts'],
      });
    }
    const stars = Math.ceil(b.progression.maxLevel / b.progression.levelsPerStar) - 1;
    if (b.chests.starCosts.length !== stars) {
      ctx.addIssue({
        code: 'custom',
        message: `starCosts doit avoir une entrée par palier (${String(stars)} attendues)`,
        path: ['chests', 'starCosts'],
      });
    }
    const tierIds = b.chests.tiers.map((tier) => tier.id);
    if (new Set(tierIds).size !== tierIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'chests.tiers : identifiants en double',
        path: ['chests', 'tiers'],
      });
    }
    const unlocks = b.progression.pageUnlockLevels;
    const ascending = unlocks.every((level, i) => i === 0 || level >= (unlocks[i - 1] ?? 0));
    if (!ascending || unlocks.some((level) => level > b.progression.maxLevel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'pageUnlockLevels doit être croissant et inférieur au niveau maximum',
        path: ['progression', 'pageUnlockLevels'],
      });
    }
    if (b.progression.talentPointLevels.some((level) => level > b.progression.maxLevel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'talentPointLevels dépasse le niveau maximum',
        path: ['progression', 'talentPointLevels'],
      });
    }
  });
export type Balance = z.infer<typeof balanceSchema>;
