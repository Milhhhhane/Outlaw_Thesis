import type { Content, Hero } from '@outlaw/data';
import { talentPoints, unlockedPages, type HeroBuild } from '@outlaw/engine';
import type { Rng } from './rng';

/** Nœuds qu'on peut prendre maintenant : page débloquée, prérequis pris, groupe libre. */
export function availableNodes(
  hero: Hero,
  level: number,
  taken: ReadonlySet<string>,
  content: Content,
): string[] {
  const pages = unlockedPages(level, content.balance);
  const groups = new Set<string>();
  for (const page of hero.pages) {
    for (const node of page.nodes) if (taken.has(node.id) && node.group) groups.add(node.group);
  }
  const result: string[] = [];
  hero.pages.slice(0, pages).forEach((page) => {
    for (const node of page.nodes) {
      if (taken.has(node.id)) continue;
      if (node.requires !== undefined && !taken.has(node.requires)) continue;
      if (node.group !== undefined && groups.has(node.group)) continue;
      result.push(node.id);
    }
  });
  return result;
}

/** Build tiré au hasard : tous les points dépensés dans des nœuds valides. */
export function randomBuild(content: Content, heroId: string, level: number, rng: Rng): HeroBuild {
  const hero = content.heroById.get(heroId);
  if (hero === undefined) throw new Error(`héros inconnu : ${heroId}`);
  const taken = new Set<string>();
  const points = talentPoints(level, content.balance);
  while (taken.size < points) {
    const options = availableNodes(hero, level, taken, content);
    if (options.length === 0) break;
    taken.add(rng.pick(options));
  }
  return { hero: heroId, level, talents: [...taken], items: [] };
}

/**
 * Équipes « jouables » de la simulation : au plus `MAX_PER_ROLE` héros du même rôle. Avec les six
 * premiers héros (deux par rôle), toute équipe de quatre l'était ; avec 25 héros, une équipe de
 * trois soutiens sans personne pour frapper fausserait les durées et les taux de réussite.
 */
export const MAX_PER_ROLE = 2;

/** Les premiers héros de `order` qui forment une équipe jouable de `size` héros. */
export function pickTeam(content: Content, order: readonly string[], size: number): string[] {
  const team: string[] = [];
  const roles = new Map<string, number>();
  for (const id of order) {
    if (team.length === size) break;
    const role = content.heroById.get(id)?.role ?? '';
    if ((roles.get(role) ?? 0) >= MAX_PER_ROLE) continue;
    roles.set(role, (roles.get(role) ?? 0) + 1);
    team.push(id);
  }
  return team;
}
