import type { Content, Profile } from '@outlaw/data';
import { validateBuild } from '@outlaw/engine';
import type { RoomRules, TeamRequest } from '@outlaw/net';

/**
 * Talents d'un héros pour un plafond de niveau : on garde ses choix dans l'ordre d'achat tant que le
 * moteur les accepte au niveau plafonné (points, pages débloquées, prérequis). Un salon plafonné à
 * un niveau bas n'oblige donc personne à refaire son arbre : l'excédent est simplement ignoré.
 */
export function trimTalents(
  content: Content,
  hero: string,
  level: number,
  talents: readonly string[],
): string[] {
  const kept: string[] = [];
  for (const node of talents) {
    const next = [...kept, node];
    if (validateBuild(content, { hero, level, talents: next, items: [] }).length === 0) {
      kept.push(node);
    }
  }
  return kept;
}

/** Niveau d'un héros dans le salon : celui du profil, ramené au plafond des règles. */
export function cappedLevel(content: Content, profile: Profile, hero: string, rules: RoomRules) {
  return Math.min(
    profile.heroes[hero]?.level ?? 1,
    rules.maxLevel,
    content.balance.progression.maxLevel,
  );
}

/** La demande d'équipe envoyée au salon pour trois héros du profil. */
export function teamRequestFor(
  content: Content,
  profile: Profile,
  heroes: readonly string[],
  rules: RoomRules,
): TeamRequest {
  return {
    heroes: heroes.map((hero, slot) => {
      const progress = profile.heroes[hero];
      const level = cappedLevel(content, profile, hero, rules);
      const items = rules.items
        ? (progress?.items ?? []).filter((uid): uid is number => uid !== null)
        : [];
      return {
        hero,
        slot,
        talents: trimTalents(content, hero, level, progress?.talents ?? []),
        items,
      };
    }),
  };
}

/** Somme des paliers de trois héros (le budget de paliers du salon). */
export function tierOf(content: Content, heroes: readonly string[]): number {
  return heroes.reduce((sum, hero) => sum + (content.heroById.get(hero)?.tier ?? 1), 0);
}
