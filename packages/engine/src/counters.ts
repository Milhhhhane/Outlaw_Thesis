import type { Counter, Profile } from '@outlaw/data';

/**
 * Compteurs à vie du profil (`profile.stats`) : chaque fonction de progression qui fait l'action
 * les avance ici. Les quêtes et les succès les lisent (`quests.ts`) ; rien d'autre n'en dépend.
 */
export function countAction(
  stats: Profile['stats'],
  counts: Partial<Record<Counter, number>>,
): Profile['stats'] {
  const next = { ...stats };
  for (const [key, n] of Object.entries(counts)) {
    if (n > 0) next[key] = (next[key] ?? 0) + n;
  }
  return next;
}

/** Valeur d'un compteur (0 s'il n'a jamais bougé). */
export function counter(profile: Profile, key: Counter): number {
  return profile.stats[key] ?? 0;
}
