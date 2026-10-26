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
