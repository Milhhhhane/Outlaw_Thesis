import type { Content, HeroProgress, Profile } from '@outlaw/data';
import {
  atStarGate,
  freshHero,
  heroStars,
  nextRandom,
  type Outcome,
  type Refusal,
} from './progression';

/**
 * Coffres et fragments. Un coffre ne donne que des fragments de héros, tirés avec la graine du
 * profil (même profil, même tirage) et pondérés par la rareté des héros, avec des poids propres à
 * chaque coffre (un bronze ne donne jamais de légendaire, un or en donne souvent). Le héros ciblé
 * pèse `focusMultiplier` fois son poids : sa chance monte en proportion de sa rareté. Des fragments
 * invoquent un héros (coût selon sa rareté), ou paient l'étoile qui lève le plafond de niveau.
 * Fonctions pures : (profil, demande) → nouveau profil ou refus motivé.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

export interface ChestReport {
  readonly tier: string;
  /** Héros de chaque fragment, dans l'ordre du tirage (pour l'ouverture animée). */
  readonly fragments: readonly string[];
}

/** Nombre total de coffres fermés. */
export function chestCount(profile: Profile): number {
  return Object.values(profile.chests).reduce((sum, n) => sum + n, 0);
}

/** Fragments par héros d'un coffre de ce palier, ou null si le palier n'existe pas. */
export function chestSize(content: Content, tier: string): number | null {
  return content.balance.chests.tiers.find((t) => t.id === tier)?.fragments ?? null;
}

/** Poids d'un héros dans le tirage d'un fragment de ce coffre : celui de sa rareté dans ce coffre. */
export function heroWeight(content: Content, chest: string, heroId: string): number {
  const tier = content.heroById.get(heroId)?.tier ?? 1;
  const weights = content.balance.chests.tiers.find((t) => t.id === chest)?.weights;
  return weights?.[tier - 1] ?? 0;
}

/** Fragments pour invoquer un héros : le coût de sa rareté. */
export function summonCost(content: Content, heroId: string): number {
  const tier = content.heroById.get(heroId)?.tier ?? 1;
  const { summonCosts } = content.balance.chests;
  return summonCosts[tier - 1] ?? summonCosts[0] ?? 0;
}

/** Héros ciblé valide du profil, ou null. */
function focusOf(content: Content, profile: Profile): string | null {
  return profile.focus !== null && content.heroById.has(profile.focus) ? profile.focus : null;
}

/** Poids de chaque héros dans un coffre, héros ciblé compris (`focusMultiplier` fois son poids). */
function drawWeights(content: Content, chest: string, target: string | null): number[] {
  const { focusMultiplier } = content.balance.chests;
  return content.heroes.map(
    (h) => heroWeight(content, chest, h.id) * (h.id === target ? focusMultiplier : 1),
  );
}

/**
 * Héros tiré par un nombre de [0, 1) : chaque héros occupe une part de l'intervalle proportionnelle
 * à son poids, dans l'ordre du contenu.
 */
function weightedHero(content: Content, weights: readonly number[], value: number): string {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let cursor = value * total;
  for (let i = 0; i < content.heroes.length; i++) {
    cursor -= weights[i] ?? 0;
    if (cursor < 0) return content.heroes[i]?.id ?? '';
  }
  return content.heroes.findLast((_, i) => (weights[i] ?? 0) > 0)?.id ?? '';
}

/**
 * Chance, en %, qu'un fragment de ce coffre tombe sur chaque héros, avec le héros ciblé du profil.
 * Affiché au joueur : le tirage et l'affichage partagent ce calcul.
 */
export function fragmentRates(
  content: Content,
  profile: Profile,
  chest: string,
): { hero: string; pct: number }[] {
  const weights = drawWeights(content, chest, focusOf(content, profile));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return content.heroes.map(({ id: hero }, i) => ({
    hero,
    pct: total === 0 ? 0 : ((weights[i] ?? 0) / total) * 100,
  }));
}

/** Part (%) de chaque rareté (commun → légendaire) dans les fragments de ce coffre, sans ciblage. */
export function chestRarityRates(content: Content, chest: string): number[] {
  const weights = drawWeights(content, chest, null);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const byTier = content.balance.chests.summonCosts.map(() => 0);
  content.heroes.forEach((h, i) => {
    byTier[h.tier - 1] = (byTier[h.tier - 1] ?? 0) + (weights[i] ?? 0);
  });
  return byTier.map((w) => (total === 0 ? 0 : (w / total) * 100));
}

/** Ouvre un coffre fermé du palier donné : un tirage de fragments, ajoutés au profil. */
export function openChest(
  content: Content,
  profile: Profile,
  tier: string,
): Outcome<{ profile: Profile; report: ChestReport }> {
  const size = chestSize(content, tier);
  if (size === null || (profile.chests[tier] ?? 0) < 1) return refuse('no_chest');
  const weights = drawWeights(content, tier, focusOf(content, profile));

  let seed = profile.seed;
  const drawn: string[] = [];
  const fragments = { ...profile.fragments };
  for (let i = 0; i < size; i++) {
    // Un tirage par fragment, toujours : le ciblage ne change pas la suite de la graine.
    const roll = nextRandom(seed);
    seed = roll.seed;
    const hero = weightedHero(content, weights, roll.value);
    drawn.push(hero);
    fragments[hero] = (fragments[hero] ?? 0) + 1;
  }
  return ok({
    profile: {
      ...profile,
      seed,
      fragments,
      chests: { ...profile.chests, [tier]: (profile.chests[tier] ?? 0) - 1 },
    },
    report: { tier, fragments: drawn },
  });
}

/** Héros ciblé par les coffres (null : pur hasard). */
export function setFocus(content: Content, profile: Profile, heroId: string | null): Outcome {
  if (heroId !== null && !content.heroById.has(heroId)) return refuse('unknown_hero');
  return ok({ ...profile, focus: heroId });
}

/** Invoque un héros que le joueur ne possède pas encore, contre ses fragments (coût de sa rareté). */
export function summonHero(content: Content, profile: Profile, heroId: string): Outcome {
  if (!content.heroById.has(heroId)) return refuse('unknown_hero');
  if (profile.unlocked.includes(heroId)) return refuse('already_unlocked');
  const cost = summonCost(content, heroId);
  const owned = profile.fragments[heroId] ?? 0;
  if (owned < cost) return refuse('not_enough_fragments');
  return ok({
    ...profile,
    fragments: { ...profile.fragments, [heroId]: owned - cost },
    unlocked: [...profile.unlocked, heroId],
    heroes: { ...profile.heroes, [heroId]: freshHero(1, content) },
  });
}

/** Fragments de l'étoile suivante du héros, ou null s'il n'y en a plus (niveau maximum du jeu). */
export function starCost(content: Content, hero: HeroProgress): number | null {
  return content.balance.chests.starCosts[heroStars(hero, content)] ?? null;
}

/**
 * Paie l'étoile qui lève le plafond de niveau. Seulement au plafond : dépenser avant n'avancerait
 * à rien, et le joueur sait toujours quand il le faut. L'XP gardée au plafond est utilisée aussitôt.
 */
export function starUp(content: Content, profile: Profile, heroId: string): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined || !profile.unlocked.includes(heroId)) return refuse('locked_hero');
  const cost = starCost(content, hero);
  if (cost === null) return refuse('max_star');
  if (!atStarGate(hero, content)) return refuse('not_at_cap');
  const owned = profile.fragments[heroId] ?? 0;
  if (owned < cost) return refuse('not_enough_fragments');
  const raised = { ...hero, stars: heroStars(hero, content) + 1 };
  return ok({
    ...profile,
    fragments: { ...profile.fragments, [heroId]: owned - cost },
    heroes: { ...profile.heroes, [heroId]: raised },
  });
}
