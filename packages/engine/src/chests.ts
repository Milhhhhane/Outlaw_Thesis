import type { Content, HeroProgress, Profile } from '@outlaw/data';
import {
  addXp,
  atStarGate,
  freshHero,
  heroStars,
  nextRandom,
  type Outcome,
  type Refusal,
} from './progression';

/**
 * Coffres et fragments. Un coffre ne donne que des fragments de héros, tirés avec la graine du
 * profil (même profil, même tirage). Des fragments invoquent un héros, ou paient l'étoile qui lève
 * le plafond de niveau. Fonctions pures : (profil, demande) → nouveau profil ou refus motivé.
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

/**
 * Chance, en %, qu'un fragment tombe sur chaque héros, avec le héros ciblé du profil. Affiché au
 * joueur : le tirage et l'affichage partagent ce calcul.
 */
export function fragmentRates(content: Content, profile: Profile): { hero: string; pct: number }[] {
  const heroes = content.heroes.map((h) => h.id);
  const target = profile.focus !== null && heroes.includes(profile.focus) ? profile.focus : null;
  const focus = target === null ? 0 : content.balance.chests.focusRate;
  return heroes.map((hero) => ({
    hero,
    pct: ((hero === target ? focus : 0) + (1 - focus) / heroes.length) * 100,
  }));
}

/** Ouvre un coffre fermé du palier donné : un tirage de fragments, ajoutés au profil. */
export function openChest(
  content: Content,
  profile: Profile,
  tier: string,
): Outcome<{ profile: Profile; report: ChestReport }> {
  const size = chestSize(content, tier);
  if (size === null || (profile.chests[tier] ?? 0) < 1) return refuse('no_chest');
  const heroes = content.heroes.map((h) => h.id);
  const target = profile.focus !== null && heroes.includes(profile.focus) ? profile.focus : null;
  const { focusRate } = content.balance.chests;

  let seed = profile.seed;
  const drawn: string[] = [];
  const fragments = { ...profile.fragments };
  for (let i = 0; i < size; i++) {
    // Deux tirages par fragment, toujours : le ciblage ne change pas la suite de la graine.
    const aim = nextRandom(seed);
    const any = nextRandom(aim.seed);
    seed = any.seed;
    const hero =
      target !== null && aim.value < focusRate
        ? target
        : (heroes[Math.floor(any.value * heroes.length)] ?? heroes[0] ?? '');
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

/** Invoque un héros que le joueur ne possède pas encore, contre ses fragments. */
export function summonHero(content: Content, profile: Profile, heroId: string): Outcome {
  if (!content.heroById.has(heroId)) return refuse('unknown_hero');
  if (profile.unlocked.includes(heroId)) return refuse('already_unlocked');
  const { summonCost } = content.balance.chests;
  const owned = profile.fragments[heroId] ?? 0;
  if (owned < summonCost) return refuse('not_enough_fragments');
  return ok({
    ...profile,
    fragments: { ...profile.fragments, [heroId]: owned - summonCost },
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
  const raised = addXp({ ...hero, stars: heroStars(hero, content) + 1 }, 0, content).hero;
  return ok({
    ...profile,
    fragments: { ...profile.fragments, [heroId]: owned - cost },
    heroes: { ...profile.heroes, [heroId]: raised },
  });
}
