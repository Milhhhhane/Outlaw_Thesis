import type { Content, Dungeon, Profile } from '@outlaw/data';

/**
 * Paliers de donjon (I, II, III…). Terminer un palier ouvre le suivant du même donjon. Une seule
 * formule, dans `balance.tiers`, pour tous les donjons : le palier k monte le niveau des ennemis,
 * les récompenses (or, poussière), le poids du rare et le palier du coffre.
 */

type Progress = Profile['dungeons'][string];

/** Nombre de paliers de chaque donjon. */
export function tierCount(content: Content): number {
  return content.balance.tiers.count;
}

/** Niveau des ennemis au palier donné : niveau conseillé + (palier − 1) × `levelsPerTier` (sans borne). */
export function tierLevel(content: Content, dungeon: Dungeon, tier: number): number {
  return dungeon.recommendedLevel + (tier - 1) * content.balance.tiers.levelsPerTier;
}

/** Multiplicateur des PV et de l'ATK des ennemis au palier donné (en plus de leur niveau). */
export function tierEnemyScale(content: Content, tier: number): { hp: number; atk: number } {
  const { enemyPctPerTier } = content.balance.tiers;
  return {
    hp: 1 + ((tier - 1) * enemyPctPerTier.hp) / 100,
    atk: 1 + ((tier - 1) * enemyPctPerTier.atk) / 100,
  };
}

/**
 * PV et ATK d'un combat (en %) une fois le palier appliqué : les leviers du combat (`hpPct`,
 * `atkPct`) multipliés par ceux du palier. C'est ce que reçoit `compileEncounter`.
 */
export function tierEncounterPct(
  content: Content,
  tier: number,
  hpPct = 100,
  atkPct = 100,
): { hpPct: number; atkPct: number } {
  const scale = tierEnemyScale(content, tier);
  return { hpPct: hpPct * scale.hp, atkPct: atkPct * scale.atk };
}

/** Niveau visé par les héros à ce palier : celui des ennemis, borné au niveau maximum du jeu. */
export function tierTargetLevel(content: Content, dungeon: Dungeon, tier: number): number {
  return Math.min(content.balance.progression.maxLevel, tierLevel(content, dungeon, tier));
}

/** Multiplicateur d'une récompense (XP, or, poussière) au palier donné. */
export function tierRewardFactor(
  content: Content,
  tier: number,
  reward: 'xp' | 'gold' | 'materials',
): number {
  return 1 + ((tier - 1) * content.balance.tiers.rewardPctPerTier[reward]) / 100;
}

/** Poids ajouté au rare de la table de butin au palier donné. */
export function tierRareWeight(content: Content, tier: number): number {
  return (tier - 1) * content.balance.tiers.rareWeightPerTier;
}

/**
 * Chance (%) de chaque coffre à la fin d'un passage, du plus riche au plus modeste : elle suit le
 * niveau des ennemis du palier (`chests.dropLevels`), en ligne droite entre `drop[0]` et `drop[1]`.
 * Plus le passage est dur, plus les coffres riches tombent. Le reste (100 − somme) : aucun coffre.
 */
export function chestOdds(
  content: Content,
  dungeon: Dungeon,
  tier: number,
): { readonly chest: string; readonly pct: number }[] {
  const { dropLevels, tiers } = content.balance.chests;
  const [low, high] = dropLevels;
  const t = Math.min(1, Math.max(0, (tierLevel(content, dungeon, tier) - low) / (high - low)));
  return tiers
    .map((chest) => ({ chest: chest.id, pct: chest.drop[0] + (chest.drop[1] - chest.drop[0]) * t }))
    .reverse();
}

/**
 * Coffre gagné pour un tirage `value` dans [0, 1) : le plus riche d'abord, selon `chestOdds`.
 * `guaranteed` (premier passage du palier) : sans coffre tiré, le plus modeste est donné.
 */
export function rollChest(
  content: Content,
  dungeon: Dungeon,
  tier: number,
  value: number,
  guaranteed: boolean,
): string | null {
  let cursor = value * 100;
  for (const { chest, pct } of chestOdds(content, dungeon, tier)) {
    cursor -= pct;
    if (cursor < 0) return chest;
  }
  return guaranteed ? (content.balance.chests.tiers[0]?.id ?? null) : null;
}

/**
 * Prochain palier jamais terminé : `tier` enregistré, ou II si le donjon a été terminé avant que
 * les paliers existent (anciennes sauvegardes). Peut dépasser le nombre de paliers (tous terminés).
 */
export function tierFrontier(progress: Progress | undefined): number {
  if (progress === undefined) return 1;
  return Math.max(progress.tier, progress.clears > 0 ? 2 : 1);
}

/** Plus haut palier ouvert d'un donjon (I tant qu'il n'est pas terminé). */
export function tierReached(content: Content, profile: Profile, dungeonId: string): number {
  return Math.min(tierCount(content), tierFrontier(profile.dungeons[dungeonId]));
}

/** Le palier a déjà été terminé au moins une fois. */
export function tierCleared(profile: Profile, dungeonId: string, tier: number): boolean {
  return tier < tierFrontier(profile.dungeons[dungeonId]);
}

/** Le palier est un numéro valide et il est ouvert (en mode test, tous le sont). */
export function tierOpen(
  content: Content,
  profile: Profile,
  dungeonId: string,
  tier: number,
): boolean {
  if (!Number.isInteger(tier) || tier < 1 || tier > tierCount(content)) return false;
  return profile.testMode || tier <= tierReached(content, profile, dungeonId);
}

/** Chiffre romain d'un palier (affichage). */
export function tierNumeral(tier: number): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return numerals[tier - 1] ?? String(tier);
}
