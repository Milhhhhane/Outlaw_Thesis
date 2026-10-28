import type { Content, OwnedItem, Profile } from '@outlaw/data';
import { itemTier } from './loot';
import type { Outcome, Refusal } from './progression';

/**
 * Objets possédés : un objet est une entrée du profil plus des copies. Les copies d'un objet déjà
 * possédé servent à l'améliorer ; celles qui ne servent plus se dissolvent en poussière.
 * Fonctions pures : (profil, demande) → nouveau profil ou refus motivé.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

export interface UpgradeCost {
  /** Copies de l'objet consommées. */
  readonly copies: number;
  readonly gold: number;
  /** Poussière du palier du donjon d'origine de l'objet. */
  readonly materials: { readonly tier: number; readonly amount: number };
}

/**
 * Coût de l'amélioration suivante d'un objet, ou null au niveau maximum : copies, puis or et
 * poussière de `upgradeCosts` multipliés par `tierCostPct` du palier de l'objet.
 */
export function upgradeCost(content: Content, itemId: string, upgrade: number): UpgradeCost | null {
  const { upgradeCosts, tierCostPct } = content.balance.progression.items;
  const step = upgradeCosts[upgrade];
  if (step === undefined) return null;
  const tier = itemTier(content, itemId);
  const scaled = (value: number, pct: readonly number[]): number =>
    Math.round((value * (pct[tier - 1] ?? 100)) / 100);
  return {
    copies: Math.max(1, scaled(step.copies, tierCostPct.copies)),
    gold: scaled(step.gold, tierCostPct.gold),
    materials: { tier, amount: scaled(step.materials, tierCostPct.materials) },
  };
}

/** Copies qu'il faut encore pour amener un objet au niveau maximum. */
export function copiesToMax(content: Content, owned: OwnedItem): number {
  let total = 0;
  for (let level = owned.upgrade; ; level++) {
    const cost = upgradeCost(content, owned.item, level);
    if (cost === null) return total;
    total += cost.copies;
  }
}

export function upgradeItem(content: Content, profile: Profile, uid: number): Outcome {
  const owned = profile.items.find((i) => i.uid === uid);
  if (owned === undefined) return refuse('unknown_item');
  const cost = upgradeCost(content, owned.item, owned.upgrade);
  if (cost === null) return refuse('max_upgrade');
  if (owned.copies < cost.copies) return refuse('not_enough_copies');
  if (cost.gold > profile.gold) return refuse('not_enough_gold');
  const tier = cost.materials.tier - 1;
  if ((profile.materials[tier] ?? 0) < cost.materials.amount) return refuse('not_enough_materials');
  const materials: Profile['materials'] = [...profile.materials];
  materials[tier] = (materials[tier] ?? 0) - cost.materials.amount;
  return ok({
    ...profile,
    gold: profile.gold - cost.gold,
    materials,
    items: profile.items.map((i) =>
      i.uid === uid ? { ...i, upgrade: i.upgrade + 1, copies: i.copies - cost.copies } : i,
    ),
  });
}

/** Poussière rendue par une copie dissoute, au palier du donjon d'origine. */
export function salvageOf(content: Content, itemId: string): { tier: number; amount: number } {
  const rarity = content.itemById.get(itemId)?.rarity ?? 'common';
  return { tier: itemTier(content, itemId), amount: content.balance.economy.loot.salvage[rarity] };
}

/** Dissout `count` copies d'un objet en poussière. */
export function dissolveCopies(
  content: Content,
  profile: Profile,
  uid: number,
  count = 1,
): Outcome {
  const owned = profile.items.find((i) => i.uid === uid);
  if (owned === undefined) return refuse('unknown_item');
  if (!Number.isInteger(count) || count < 1 || owned.copies < count) {
    return refuse('not_enough_copies');
  }
  const gain = salvageOf(content, owned.item);
  const materials: Profile['materials'] = [...profile.materials];
  materials[gain.tier - 1] = (materials[gain.tier - 1] ?? 0) + gain.amount * count;
  return ok({
    ...profile,
    materials,
    items: profile.items.map((i) => (i.uid === uid ? { ...i, copies: i.copies - count } : i)),
  });
}

/**
 * Ramène chaque objet à une seule entrée : les exemplaires en trop, s'ils ne sont portés par
 * personne, deviennent des copies de l'exemplaire gardé (le plus amélioré, de préférence porté). Leur propre niveau
 * d'amélioration est perdu.
 * Les anciennes sauvegardes en avaient jusqu'à trois par objet. Un exemplaire porté en double reste
 * tel quel : rien n'est jamais retiré à un héros. Idempotent.
 */
export function mergeItems(profile: Profile): Profile {
  const worn = new Set(Object.values(profile.heroes).flatMap((h) => h.items));
  const keep = new Map<string, OwnedItem>();
  for (const owned of profile.items) {
    const current = keep.get(owned.item);
    const better =
      current === undefined ||
      owned.upgrade > current.upgrade ||
      (owned.upgrade === current.upgrade && worn.has(owned.uid) && !worn.has(current.uid));
    if (better) keep.set(owned.item, owned);
  }
  const extra = new Map<string, number>();
  const items: OwnedItem[] = [];
  for (const owned of profile.items) {
    const kept = keep.get(owned.item);
    if (kept === undefined || kept.uid === owned.uid || worn.has(owned.uid)) {
      items.push(owned);
    } else {
      extra.set(owned.item, (extra.get(owned.item) ?? 0) + 1 + owned.copies);
    }
  }
  if (extra.size === 0) return profile;
  return {
    ...profile,
    items: items.map((i) =>
      keep.get(i.item)?.uid === i.uid ? { ...i, copies: i.copies + (extra.get(i.item) ?? 0) } : i,
    ),
  };
}
