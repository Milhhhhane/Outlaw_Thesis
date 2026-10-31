import type { Content, Element, EssenceDungeon, Profile } from '@outlaw/data';
import { energyAt, type Outcome, type Refusal } from './progression';
import { tierCount, tierEncounterPct, tierLevel } from './tiers';

/**
 * Éveil des héros et donjons d'essence. Un donjon d'essence par élément, ouvert quand
 * `balance.awakening.openAfter` est terminé ; trois paliers comme les donjons (`balance.tiers`),
 * le palier k donnant des essences de qualité k (faible, moyenne, supérieure) et rien d'autre.
 * Chaque héros s'éveille une fois, contre des essences de son élément et de l'or, à partir du
 * niveau `minLevel` ; l'effet (stats et passif) est une formule commune, appliquée par
 * `compileHero` quand le build porte `awakened`. Fonctions pures : (profil, demande) → Outcome.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

/** Qualités d'essence, du palier I au palier III. */
export const ESSENCE_QUALITIES = 3;

/** Le donjon d'essence d'identifiant donné. */
export function essenceDungeon(content: Content, id: string): EssenceDungeon | undefined {
  return content.essenceDungeons.find((d) => d.id === id);
}

/** Les donjons d'essence sont ouverts (donjon `openAfter` terminé, ou mode test). */
export function essencesOpen(content: Content, profile: Profile): boolean {
  return (
    profile.testMode || (profile.dungeons[content.balance.awakening.openAfter]?.clears ?? 0) > 0
  );
}

/** Palier atteint dans un donjon d'essence (I par défaut ; au-delà du dernier : tous terminés). */
export function essenceTierReached(profile: Profile, id: string): number {
  return profile.essenceDungeons[id]?.tier ?? 1;
}

/** Le palier peut être tenté : donjons ouverts et palier atteint (tous en mode test). */
export function essenceTierOpen(
  content: Content,
  profile: Profile,
  id: string,
  tier: number,
): boolean {
  if (essenceDungeon(content, id) === undefined) return false;
  if (!Number.isInteger(tier) || tier < 1 || tier > tierCount(content)) return false;
  if (!essencesOpen(content, profile)) return false;
  return profile.testMode || tier <= essenceTierReached(profile, id);
}

/** Ennemis d'un combat d'un donjon d'essence au palier donné : niveau et PV/ATK en %. */
export function essenceEncounter(
  content: Content,
  dungeon: EssenceDungeon,
  tier: number,
  room: number,
): { enemies: readonly string[]; level: number; hpPct: number; atkPct: number } | null {
  const encounter = dungeon.encounters[room];
  if (encounter === undefined) return null;
  const pct = tierEncounterPct(content, tier, encounter.hpPct, encounter.atkPct);
  return { enemies: encounter.enemies, level: tierLevel(content, dungeon, tier), ...pct };
}

/** Essences d'un passage gagnant au palier donné : qualité (1 à 3) et quantité. */
export function essenceDrop(content: Content, tier: number): { quality: number; amount: number } {
  const quality = Math.min(ESSENCE_QUALITIES, Math.max(1, tier));
  const { drops } = content.balance.awakening;
  return { quality, amount: drops.slice(quality - 1, quality).reduce((a, b) => a + b, 0) };
}

/** Entrée dans un donjon d'essence ouvert : même énergie qu'un donjon. */
export function enterEssence(
  content: Content,
  profile: Profile,
  id: string,
  tier: number,
  now: number,
): Outcome {
  if (essenceDungeon(content, id) === undefined) return refuse('unknown_dungeon');
  if (!essenceTierOpen(content, profile, id, tier)) return refuse('tier_locked');
  if (profile.team.length === 0) return refuse('bad_team');
  const cost = content.balance.energy.costPerDungeon;
  const available = energyAt(content, profile, now);
  if (available < cost) return refuse('no_energy');
  return ok({ ...profile, energy: { value: available - cost, updatedAt: now } });
}

export interface EssenceReport {
  readonly dungeon: string;
  readonly tier: number;
  readonly element: Element;
  readonly quality: number;
  readonly amount: number;
  /** Premier passage de ce palier : il ouvre le suivant. */
  readonly firstClear: boolean;
}

/** Passage gagnant d'un donjon d'essence : essences de l'élément, palier suivant ouvert. */
export function completeEssence(
  content: Content,
  profile: Profile,
  id: string,
  tier: number,
): Outcome<{ profile: Profile; report: EssenceReport }> {
  const dungeon = essenceDungeon(content, id);
  if (dungeon === undefined) return refuse('unknown_dungeon');
  if (profile.testMode) return refuse('test_mode');
  if (!essenceTierOpen(content, profile, id, tier)) return refuse('tier_locked');
  const drop = essenceDrop(content, tier);
  const stock: Profile['essences']['fire'] = [...profile.essences[dungeon.element]];
  stock[drop.quality - 1] = (stock[drop.quality - 1] ?? 0) + drop.amount;
  const progress = profile.essenceDungeons[id] ?? { clears: 0, tier: 1 };
  const firstClear = tier === progress.tier;
  return ok({
    profile: {
      ...profile,
      essences: { ...profile.essences, [dungeon.element]: stock },
      essenceDungeons: {
        ...profile.essenceDungeons,
        [id]: { clears: progress.clears + 1, tier: firstClear ? tier + 1 : progress.tier },
      },
    },
    report: { dungeon: id, tier, element: dungeon.element, ...drop, firstClear },
  });
}

export interface AwakenCost {
  readonly element: Element;
  /** Essences de l'élément du héros : [faible, moyenne, supérieure]. */
  readonly essences: readonly [number, number, number];
  readonly gold: number;
  readonly minLevel: number;
}

/** Ce que coûte l'éveil d'un héros (null : héros inconnu). */
export function awakenCost(content: Content, heroId: string): AwakenCost | null {
  const hero = content.heroById.get(heroId);
  if (hero === undefined) return null;
  const { cost, minLevel } = content.balance.awakening;
  return { element: hero.element, essences: cost.essences, gold: cost.gold, minLevel };
}

/** Une condition chiffrée de l'éveil : ce qu'il faut, ce que le joueur a, ce qui manque (0 : remplie). */
export interface AwakenNeed {
  readonly need: number;
  readonly have: number;
  readonly missing: number;
}

/**
 * Où gagner une qualité d'essence : le sanctuaire de l'élément, le premier palier qui la donne,
 * les essences par victoire et les victoires qu'il faut pour combler le manque. `lock` dit ce qui
 * ouvre ce palier s'il est fermé : terminer le donjon `openAfter` (sanctuaires fermés) ou gagner
 * le palier précédent du sanctuaire ; null : le palier est ouvert.
 */
export interface EssenceSource {
  readonly dungeon: string;
  readonly tier: number;
  readonly amount: number;
  readonly runs: number;
  readonly lock:
    | { readonly kind: 'dungeon'; readonly dungeon: string }
    | { readonly kind: 'tier'; readonly tier: number }
    | null;
}

/** Essence d'une qualité (1 à 3) : besoin, stock, manque et où l'obtenir (null : nulle part). */
export interface AwakenEssence extends AwakenNeed {
  readonly quality: number;
  readonly source: EssenceSource | null;
}

/** Un manque qui bloque l'éveil, dans l'ordre où l'écran les énumère. */
export type AwakenMissing =
  | { readonly kind: 'level'; readonly amount: number }
  | { readonly kind: 'essence'; readonly quality: number; readonly amount: number }
  | { readonly kind: 'gold'; readonly amount: number };

/** Où en est un héros face à l'éveil : chaque condition et la liste de ce qui manque (vide : rien). */
export interface AwakenStatus {
  readonly element: Element;
  readonly level: AwakenNeed;
  readonly essences: readonly [AwakenEssence, AwakenEssence, AwakenEssence];
  readonly gold: AwakenNeed;
  readonly missing: readonly AwakenMissing[];
}

const need = (required: number, have: number): AwakenNeed => ({
  need: required,
  have,
  missing: Math.max(0, required - have),
});

/** Premier palier d'un sanctuaire qui donne la qualité voulue, et ce qui l'ouvre. */
function essenceSource(
  content: Content,
  profile: Profile,
  element: Element,
  quality: number,
  missing: number,
): EssenceSource | null {
  const dungeon = content.essenceDungeons.find((d) => d.element === element);
  const tier = Array.from({ length: tierCount(content) }, (_, i) => i + 1).find(
    (k) => essenceDrop(content, k).quality === quality,
  );
  if (dungeon === undefined || tier === undefined) return null;
  const { amount } = essenceDrop(content, tier);
  const lock: EssenceSource['lock'] = !essencesOpen(content, profile)
    ? { kind: 'dungeon', dungeon: content.balance.awakening.openAfter }
    : essenceTierOpen(content, profile, dungeon.id, tier)
      ? null
      : { kind: 'tier', tier: tier - 1 };
  return { dungeon: dungeon.id, tier, amount, runs: Math.ceil(missing / amount), lock };
}

/**
 * Conditions de l'éveil d'un héros du profil, chiffrées (null : héros inconnu). C'est d'elles que
 * `awaken` tire ses refus de niveau, d'essences et d'or ; l'écran les affiche telles quelles.
 */
export function awakenStatus(
  content: Content,
  profile: Profile,
  heroId: string,
): AwakenStatus | null {
  const hero = profile.heroes[heroId];
  const cost = awakenCost(content, heroId);
  if (cost === null || hero === undefined) return null;
  const stock = profile.essences[cost.element];
  const essence = (q: 0 | 1 | 2): AwakenEssence => {
    const n = need(cost.essences[q], stock[q]);
    return {
      ...n,
      quality: q + 1,
      source: essenceSource(content, profile, cost.element, q + 1, n.missing),
    };
  };
  const level = need(cost.minLevel, hero.level);
  const essences = [essence(0), essence(1), essence(2)] as const;
  const gold = need(cost.gold, profile.gold);
  const missing: AwakenMissing[] = [
    ...(level.missing > 0 ? [{ kind: 'level', amount: level.missing } as const] : []),
    ...essences
      .filter((e) => e.missing > 0)
      .map((e) => ({ kind: 'essence', quality: e.quality, amount: e.missing }) as const),
    ...(gold.missing > 0 ? [{ kind: 'gold', amount: gold.missing } as const] : []),
  ];
  return { element: cost.element, level, essences, gold, missing };
}

/** Éveille un héros débloqué, au niveau requis, contre des essences de son élément et de l'or. */
export function awaken(content: Content, profile: Profile, heroId: string): Outcome {
  const hero = profile.heroes[heroId];
  const status = awakenStatus(content, profile, heroId);
  if (status === null || hero === undefined || !profile.unlocked.includes(heroId))
    return refuse('locked_hero');
  if (profile.testMode) return refuse('test_mode');
  if (hero.awakened) return refuse('already_awakened');
  if (status.level.missing > 0) return refuse('level_too_low');
  if (status.essences.some((e) => e.missing > 0)) return refuse('not_enough_essences');
  if (status.gold.missing > 0) return refuse('not_enough_gold');
  const [low, mid, high] = status.essences;
  const left: Profile['essences']['fire'] = [
    low.have - low.need,
    mid.have - mid.need,
    high.have - high.need,
  ];
  return ok({
    ...profile,
    gold: profile.gold - status.gold.need,
    essences: { ...profile.essences, [status.element]: left },
    heroes: { ...profile.heroes, [heroId]: { ...hero, awakened: true } },
  });
}

/** Mode test : éveille ou endort un héros, sans rien payer. */
export function setAwakened(profile: Profile, heroId: string, awakened: boolean): Outcome {
  if (!profile.testMode) return refuse('test_only');
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  return ok({ ...profile, heroes: { ...profile.heroes, [heroId]: { ...hero, awakened } } });
}
