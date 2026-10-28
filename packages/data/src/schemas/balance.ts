/** Unités au plus par camp en combat : les emplacements de la scène et des rencontres. */
export const MAX_SIDE = 4;

import { z } from 'zod';
import { idSchema } from './common';
import { MAX_HERO_TIER } from './heroes';
import { passiveModSchema } from './items';
import { questRewardSchema } from './quests';

const pos = z.number().positive();
const nonNeg = z.number().min(0);
const posInt = z.number().int().min(1);
const nonNegInt = z.number().int().min(0);

/** Bonus du dernier niveau d'un sort : coût en points et délai, en baisse (ou 0). */
const capstoneSchema = z.strictObject({ cost: z.number().int().max(0), delay: z.number().max(0) });

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
      /**
       * Monter de niveau se paie : l'XP du niveau et de la poussière. `tierFrom[k]` est le premier
       * niveau (celui qu'on quitte) payé en poussière du palier k + 1 ; la quantité est
       * `dust[k] + dustPerLevel[k] × (niveau − tierFrom[k])`.
       */
      levelUp: z.strictObject({
        tierFrom: z.array(posInt).length(3),
        dust: z.array(posInt).length(3),
        dustPerLevel: z.array(nonNegInt).length(3),
      }),
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
        /**
         * Multiplicateur (en %) des copies, de l'or et de la poussière de `upgradeCosts` selon le
         * palier de poussière de l'objet (celui de son donjon), arrondi (au moins une copie) : un
         * objet du début s'améliore vite, un objet de fin de jeu demande du vrai grind. Une entrée
         * par palier.
         */
        tierCostPct: z.strictObject({
          copies: z.array(pos).length(3),
          gold: z.array(pos).length(3),
          materials: z.array(pos).length(3),
        }),
      }),
    }),

    /**
     * Paliers de donjon (I, II, III…) : terminer un palier ouvre le suivant du même donjon. Une
     * seule formule pour tous les donjons : le palier k ajoute (k − 1) × `levelsPerTier` au niveau
     * des ennemis et (k − 1) × `enemyPctPerTier` % à leurs PV et ATK (les niveaux seuls pèsent
     * peu, la croissance des monstres étant plate), (k − 1) × `rewardPctPerTier` % aux
     * récompenses et (k − 1) × `rareWeightPerTier` au poids du rare ; le niveau plus haut des
     * ennemis monte aussi la chance des coffres riches (`chests.dropLevels`).
     */
    tiers: z.strictObject({
      count: posInt,
      levelsPerTier: nonNegInt,
      enemyPctPerTier: z.strictObject({ hp: nonNeg, atk: nonNeg }),
      rewardPctPerTier: z.strictObject({ xp: nonNeg, gold: nonNeg, materials: nonNeg }),
      rareWeightPerTier: nonNegInt,
    }),

    /**
     * Éveil des héros (une fois par héros) et donjons d'essence. L'éveil se paie en essences de
     * l'élément du héros (`cost.essences` : faible, moyenne, supérieure) et en or, à partir du
     * niveau `minLevel`. Il donne, par une formule commune à tous les héros : `statPct` % de PV,
     * d'ATK et de DEF (hors plafond des objets, donc borné ici) et les modifications de passif
     * `mods` (mêmes mécanismes que les objets). Les donjons d'essence s'ouvrent quand `openAfter`
     * est terminé ; au palier k, un passage gagnant donne `drops[k − 1]` essences de qualité k.
     */
    awakening: z.strictObject({
      minLevel: posInt,
      statPct: z.number().min(0).max(10),
      mods: z.array(passiveModSchema).min(1).max(4),
      cost: z.strictObject({
        essences: z.tuple([nonNegInt, nonNegInt, nonNegInt]),
        gold: nonNegInt,
      }),
      openAfter: idSchema,
      drops: z.tuple([posInt, posInt, posInt]),
    }),

    /**
     * Tour à étages : un combat par étage, composé par règle (`content/tower.json`). L'étage n a
     * des ennemis au niveau `level.start + (n − 1) × level.perFloor` (borné au niveau maximum : c'est
     * aussi le niveau visé), des PV et une ATK lus sur `curve` (points d'appui, en ligne droite
     * entre deux), majorés aux étages de boss (`boss`, tous les `bossEvery` étages). Au-delà du
     * niveau maximum, la difficulté suit l'équipement visé (`gear`), comme les paliers de donjon.
     */
    tower: z.strictObject({
      floors: posInt,
      bossEvery: posInt,
      level: z.strictObject({ start: posInt, perFloor: nonNeg }),
      /** Nombre d'ennemis d'un étage ordinaire, à partir de l'étage `from` (croissant). */
      sizes: z
        .array(z.strictObject({ from: posInt, count: z.number().int().min(1).max(MAX_SIDE) }))
        .min(1),
      /** À partir de cet étage, le dernier ennemi d'un étage ordinaire vient de l'élément suivant. */
      mixFrom: posInt,
      /** PV et ATK des ennemis (en %) aux étages d'appui ; jamais en baisse d'un appui au suivant. */
      curve: z.array(z.strictObject({ floor: posInt, hpPct: pos, atkPct: pos })).min(2),
      /** Étage de boss : PV et ATK de la courbe multipliés par ces pourcentages. */
      boss: z.strictObject({ hpPct: pos, atkPct: pos }),
      /** Équipement visé à partir de l'étage `from` : objets portés et leur amélioration. */
      gear: z.array(z.strictObject({ from: posInt, items: nonNegInt, upgrade: nonNegInt })),
      /** Récompenses de la première victoire d'un étage (rejouer ne rapporte rien). */
      rewards: z.strictObject({
        /** Poussière du palier qu'exige le niveau de l'étage (brute, fine, pure). */
        dust: z.array(nonNegInt).length(3),
        /** Poussière d'un étage de boss, en % de celle d'un étage ordinaire. */
        bossDustPct: nonNeg,
        /** Fragments tirés (poids du coffre `fragmentChest`, héros ciblé compris) par étage. */
        fragments: nonNegInt,
        fragmentChest: idSchema,
        /** Coffre de chaque étage de boss, dans l'ordre. */
        bossChests: z.array(idSchema),
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
     * Coffres et fragments de héros. Un coffre ne donne que des fragments ; `summonCosts` fragments
     * invoquent un héros, et chaque palier de niveau se paie en fragments (`starCosts`).
     */
    chests: z.strictObject({
      /** Fragments d'un héros pour l'invoquer, selon sa rareté (commun, rare, épique, légendaire). */
      summonCosts: z.array(posInt).length(MAX_HERO_TIER),
      /** Fragments pour passer l'étoile 1, 2, 3… (une entrée par palier jusqu'au niveau maximum). */
      starCosts: z.array(posInt),
      /**
       * Le héros ciblé pèse ce multiple de son poids normal dans chaque coffre : sa chance monte en
       * proportion de sa rareté (un commun ciblé sort souvent, un légendaire ciblé reste rare).
       */
      focusMultiplier: z.number().min(1),
      /**
       * Niveaux d'ennemis (palier compris) entre lesquels la chance de chaque coffre va de
       * `drop[0]` à `drop[1]`, en ligne droite, bornée aux extrémités.
       */
      dropLevels: z.tuple([posInt, posInt]),
      /** Paliers de coffre, du plus modeste au plus riche. */
      tiers: z
        .array(
          z.strictObject({
            id: idSchema,
            fragments: posInt,
            /**
             * Poids d'un héros de chaque rareté (commun, rare, épique, légendaire) dans le tirage
             * d'un fragment de ce coffre : 0, la rareté n'y sort jamais.
             */
            weights: z.array(nonNegInt).length(MAX_HERO_TIER),
            /** Chance (%) de ce coffre par passage, au plus bas puis au plus haut de `dropLevels`. */
            drop: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
          }),
        )
        .min(1),
    }),

    /**
     * Niveaux de sort (montée des sorts) : chaque sort d'un héros va du niveau 1 à `max`. Une
     * formule pour tous les héros : chaque niveau au-delà du premier ajoute `powerPctPerLevel` % à
     * la puissance des briques de dégâts, de soin et de bouclier du sort ; le dernier niveau ajoute
     * `capstone[emplacement]` (coût en points, délai). Chaque niveau se paie en grimoires
     * (ressource commune à tous les héros) et en fragments du héros (`costs[niveau − 1]`, vers le
     * niveau suivant). Les grimoires tombent des coffres (`grimoires.chests`, par identifiant de
     * coffre) et des passages de donjon selon le palier (`grimoires.tiers`, palier I, II, III…).
     */
    spellLevels: z.strictObject({
      max: z.number().int().min(1),
      powerPctPerLevel: nonNeg,
      capstone: z.strictObject({
        basic: capstoneSchema,
        a: capstoneSchema,
        b: capstoneSchema,
        ult: capstoneSchema,
      }),
      costs: z.array(z.strictObject({ grimoires: nonNegInt, fragments: nonNegInt })),
      grimoires: z.strictObject({
        chests: z.record(idSchema, nonNegInt),
        tiers: z.array(nonNegInt).min(1),
      }),
    }),

    /**
     * Quêtes du jour, de la semaine et succès (contenu : `content/quests.json`). Une récompense
     * vaut `passagePct` % de l'or et de la poussière d'un passage du donjon le plus avancé terminé,
     * plus un coffre facultatif (justification : docs/BALANCE.md, « Quêtes et succès »).
     */
    quests: z.strictObject({
      daily: z.strictObject({
        count: posInt,
        reward: questRewardSchema,
        /** Toutes les quêtes du jour réclamées. */
        bonus: questRewardSchema,
      }),
      weekly: z.strictObject({ count: posInt, reward: questRewardSchema }),
      /** Classes de récompense des succès. */
      achievements: z.strictObject({
        small: questRewardSchema,
        medium: questRewardSchema,
        large: questRewardSchema,
      }),
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
      /**
       * Montée des sorts : à niveau de héros égal, tous les sorts au maximum ne terminent pas plus
       * de ce nombre de points de donjons en plus (en retard, joueur moyen) qu'au niveau 1.
       */
      spellLevelsMaxGapPoints: nonNeg,
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
      /**
       * Paliers de donjon (expert au niveau visé) : chaque palier réussit au moins `expertMin`,
       * et aucun palier n'est plus facile que le précédent du même donjon de plus de `tolerance`.
       */
      tiers: z.strictObject({
        expertMin: z.number().min(0).max(1),
        tolerance: z.number().min(0).max(1),
      }),
      /**
       * Tour (expert au niveau et à l'équipement visés) : chaque étage réussit au moins
       * `expertMin`, et aucun étage n'est plus facile que le précédent de plus de `tolerance`.
       */
      tower: z.strictObject({
        expertMin: z.number().min(0).max(1),
        tolerance: z.number().min(0).max(1),
      }),
      /**
       * Éveil : à niveau égal, un héros éveillé ne fait pas gagner plus de `maxGapPoints` points de
       * donjons terminés (joueur moyen, en retard) à son équipe ; chaque palier d'un donjon
       * d'essence réussit au moins `essenceExpertMin` pour l'expert au niveau visé.
       */
      awakening: z.strictObject({
        maxGapPoints: nonNeg,
        essenceExpertMin: z.number().min(0).max(1),
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
    for (const end of [0, 1] as const) {
      const sum = b.chests.tiers.reduce((total, tier) => total + tier.drop[end], 0);
      if (sum > 100) {
        ctx.addIssue({
          code: 'custom',
          message: `chests.tiers : chances de coffre cumulées ${String(sum)} % > 100 %`,
          path: ['chests', 'tiers'],
        });
      }
    }
    if (b.chests.dropLevels[0] >= b.chests.dropLevels[1]) {
      ctx.addIssue({
        code: 'custom',
        message: 'chests.dropLevels : le premier niveau doit être sous le second',
        path: ['chests', 'dropLevels'],
      });
    }
    b.chests.tiers.forEach((tier, i) => {
      if (tier.weights.every((w) => w === 0)) {
        ctx.addIssue({
          code: 'custom',
          message: `chests.tiers : le coffre « ${tier.id} » ne peut donner aucun héros`,
          path: ['chests', 'tiers', i, 'weights'],
        });
      }
    });
    const tierIds = b.chests.tiers.map((tier) => tier.id);
    const rewards = [
      ['daily', 'reward', b.quests.daily.reward],
      ['daily', 'bonus', b.quests.daily.bonus],
      ['weekly', 'reward', b.quests.weekly.reward],
      ...Object.entries(b.quests.achievements).map(([k, r]) => ['achievements', k, r] as const),
    ] as const;
    for (const [group, key, reward] of rewards) {
      if (reward.chest !== null && !tierIds.includes(reward.chest)) {
        ctx.addIssue({
          code: 'custom',
          message: `quests : coffre inconnu « ${reward.chest} »`,
          path: ['quests', group, key, 'chest'],
        });
      }
    }
    if (new Set(tierIds).size !== tierIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'chests.tiers : identifiants en double',
        path: ['chests', 'tiers'],
      });
    }
    if (b.spellLevels.costs.length !== b.spellLevels.max - 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'spellLevels.costs doit avoir une entrée par niveau au-delà du premier',
        path: ['spellLevels', 'costs'],
      });
    }
    for (const id of Object.keys(b.spellLevels.grimoires.chests)) {
      if (!tierIds.includes(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `spellLevels.grimoires.chests : coffre inconnu « ${id} »`,
          path: ['spellLevels', 'grimoires', 'chests', id],
        });
      }
    }
    const tower = b.tower;
    const issue = (message: string, path: (string | number)[]): void => {
      ctx.addIssue({ code: 'custom', message, path: ['tower', ...path] });
    };
    if (tower.floors % tower.bossEvery !== 0)
      issue('floors doit être un multiple de bossEvery', ['floors']);
    const increasing = <T>(list: readonly T[], key: (x: T) => number): boolean =>
      list.every((x, i) => i === 0 || key(x) > key(list[i - 1] as T));
    if (tower.sizes[0]?.from !== 1 || !increasing(tower.sizes, (s) => s.from))
      issue('sizes : commence à l’étage 1, étages croissants', ['sizes']);
    const curve = tower.curve;
    const steady = curve.every(
      (p, i) =>
        i === 0 ||
        (p.hpPct >= (curve[i - 1]?.hpPct ?? 0) && p.atkPct >= (curve[i - 1]?.atkPct ?? 0)),
    );
    if (
      curve[0]?.floor !== 1 ||
      curve.at(-1)?.floor !== tower.floors ||
      !increasing(curve, (p) => p.floor) ||
      !steady
    )
      issue('curve : de l’étage 1 au dernier, étages croissants, PV et ATK jamais en baisse', [
        'curve',
      ]);
    const { slots, maxUpgradeLevel } = b.progression.items;
    if (
      !increasing(tower.gear, (g) => g.from) ||
      tower.gear.some((g, i) => {
        const prev = tower.gear[i - 1];
        return (
          g.items > slots ||
          g.upgrade > maxUpgradeLevel ||
          (prev !== undefined && (g.items < prev.items || g.upgrade < prev.upgrade))
        );
      })
    )
      issue('gear : étages croissants, équipement jamais en baisse, dans les bornes des objets', [
        'gear',
      ]);
    const chestIds = new Set(b.chests.tiers.map((c) => c.id));
    if (tower.rewards.bossChests.length !== tower.floors / tower.bossEvery)
      issue('rewards.bossChests : un coffre par étage de boss', ['rewards', 'bossChests']);
    for (const id of [...tower.rewards.bossChests, tower.rewards.fragmentChest]) {
      if (!chestIds.has(id)) issue(`coffre inconnu « ${id} »`, ['rewards']);
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
