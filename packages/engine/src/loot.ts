import type { Content, Dungeon, OwnedItem, Profile } from '@outlaw/data';

/**
 * Butin des donjons : table pondérée, maîtrise et paliers de poussière. Chaque objet vient d'un
 * seul donjon (le contenu le garantit) : farmer un objet, c'est choisir son donjon.
 */

/** Palier de poussière (1 à 3) d'un donjon, donc de ses objets. */
export function dungeonTier(dungeon: Dungeon): number {
  return dungeon.rewards.materials.tier;
}

/** Palier de poussière d'un objet : celui de son donjon d'origine (1 si l'objet est hors butin). */
export function itemTier(content: Content, itemId: string): number {
  const origin = content.itemOrigin.get(itemId);
  const dungeon = origin === undefined ? undefined : content.dungeonById.get(origin);
  return dungeon === undefined ? 1 : dungeonTier(dungeon);
}

/** Rang de maîtrise d'un donjon : un par palier de victoires atteint. */
export function masteryRank(content: Content, clears: number): number {
  return content.balance.economy.loot.mastery.clears.filter((n) => clears >= n).length;
}

/** Prochain palier de victoires de maîtrise, ou null au rang maximum. */
export function masteryNext(content: Content, clears: number): number | null {
  return content.balance.economy.loot.mastery.clears.find((n) => clears < n) ?? null;
}

/** Multiplicateur de poussière du rang de maîtrise. */
export function masteryMaterialsFactor(content: Content, rank: number): number {
  return 1 + (rank * content.balance.economy.loot.mastery.materialsPctPerRank) / 100;
}

export interface Weighted {
  readonly item: string;
  readonly weight: number;
}

/**
 * Table pondérée d'un donjon : chaque objet pèse le poids de sa rareté, et le rare gagne le bonus
 * de chaque rang de maîtrise.
 */
export function lootTable(content: Content, dungeon: Dungeon, rank = 0): Weighted[] {
  const { weights, mastery } = content.balance.economy.loot;
  return dungeon.loot.map((item) => {
    const rarity = content.itemById.get(item)?.rarity ?? 'common';
    return {
      item,
      weight: weights[rarity] + (rarity === 'rare' ? rank * mastery.rareWeightPerRank : 0),
    };
  });
}

/** Taux d'obtention affichés au joueur, en %. */
export function lootRates(
  content: Content,
  dungeon: Dungeon,
  rank = 0,
): { item: string; pct: number }[] {
  const table = lootTable(content, dungeon, rank);
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  return table.map((entry) => ({ item: entry.item, pct: (entry.weight * 100) / total }));
}

/**
 * L'exemplaire possédé d'un objet : le plus amélioré (puis le plus ancien). Un profil normal n'en
 * a qu'un (`mergeItems`) ; le mode test en garde plusieurs, un par porteur possible.
 */
export function ownedItem(profile: Profile, itemId: string): OwnedItem | undefined {
  let best: OwnedItem | undefined;
  for (const owned of profile.items) {
    if (owned.item !== itemId) continue;
    if (best === undefined || owned.upgrade > best.upgrade) best = owned;
  }
  return best;
}
