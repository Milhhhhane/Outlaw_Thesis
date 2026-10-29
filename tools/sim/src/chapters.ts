import type { Content, Dungeon } from '@outlaw/data';

/**
 * Chapitres de la carte (`map.chapter`). Les chapitres sont des régions parallèles : chaque
 * chapitre a son propre enchaînement de niveaux conseillés (1 à 30), donc les règles qui suivent
 * un enchaînement (courbe de difficulté, rythme du farm, moyennes des règles R2 et « aucun héros
 * indispensable ») se mesurent chapitre par chapitre. Le chapitre 1 garde les noms de lignes
 * d'origine ; les suivants sont préfixés (`ch2_`…), si bien qu'ajouter un chapitre n'ajoute que
 * des lignes à la référence de simulation.
 */

/** Chapitres présents, dans l'ordre. */
export function chapters(content: Pick<Content, 'dungeons'>): number[] {
  return [...new Set(content.dungeons.map((d) => d.map.chapter))].sort((a, b) => a - b);
}

/** Donjons d'un chapitre, dans l'ordre du fichier. */
export function chapterDungeons(content: Pick<Content, 'dungeons'>, chapter: number): Dungeon[] {
  return content.dungeons.filter((d) => d.map.chapter === chapter);
}

/** Préfixe des lignes d'un chapitre : rien pour le premier, `ch<n>_` ensuite. */
export function chapterPrefix(chapter: number): string {
  return chapter === 1 ? '' : `ch${String(chapter)}_`;
}

/** Ennemis ordinaires (sans boss) des donjons d'un chapitre, dans l'ordre de enemies.json. */
export function chapterEnemies(content: Content, chapter: number): string[] {
  const met = new Set(
    chapterDungeons(content, chapter).flatMap((d) => d.encounters.flatMap((e) => e.enemies)),
  );
  return content.enemies.filter((e) => !e.boss && met.has(e.id)).map((e) => e.id);
}

/** Objets du butin des donjons d'un chapitre, dans l'ordre de items.json. */
export function chapterItems(content: Content, chapter: number): string[] {
  return content.items
    .filter(
      (i) => content.dungeonById.get(content.itemOrigin.get(i.id) ?? '')?.map.chapter === chapter,
    )
    .map((i) => i.id);
}
