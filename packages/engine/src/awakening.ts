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

/** Éveille un héros débloqué, au niveau requis, contre des essences de son élément et de l'or. */
export function awaken(content: Content, profile: Profile, heroId: string): Outcome {
  const hero = profile.heroes[heroId];
  const cost = awakenCost(content, heroId);
  if (cost === null || hero === undefined || !profile.unlocked.includes(heroId))
    return refuse('locked_hero');
  if (profile.testMode) return refuse('test_mode');
  if (hero.awakened) return refuse('already_awakened');
  if (hero.level < cost.minLevel) return refuse('level_too_low');
  const stock = profile.essences[cost.element];
  if (cost.essences.some((n, q) => (stock[q] ?? 0) < n)) return refuse('not_enough_essences');
  if (profile.gold < cost.gold) return refuse('not_enough_gold');
  const left: Profile['essences']['fire'] = [
    stock[0] - cost.essences[0],
    stock[1] - cost.essences[1],
    stock[2] - cost.essences[2],
  ];
  return ok({
    ...profile,
    gold: profile.gold - cost.gold,
    essences: { ...profile.essences, [cost.element]: left },
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
