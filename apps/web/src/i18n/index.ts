import fr from './fr.json';
import names from './content.fr.json';

/** Clés de texte : le français est la langue par défaut et la référence des clés. */
export type TextKey = keyof typeof fr;

const dictionary: Readonly<Record<TextKey, string>> = fr;

type Params = Readonly<Record<string, string | number>>;

/** Texte traduit ; les {paramètres} sont remplacés, un paramètre absent est laissé tel quel. */
export function t(key: TextKey, params: Params = {}): string {
  return dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Clé construite dynamiquement (statut, cible…) : vérifiée à l'exécution, la clé brute sinon. */
export function tk(key: string, params: Params = {}): string {
  return key in dictionary ? t(key as TextKey, params) : key;
}

const list = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' });

/** « Pyra, Marée et Ronce ». */
export function joinNames(items: readonly string[]): string {
  return list.format(items);
}

const heroes: Readonly<Record<string, { name: string; thesis: string }>> = names.heroes;
const spells: Readonly<Record<string, string>> = names.spells;
const passives: Readonly<Record<string, string>> = names.passives;
const pages: Readonly<Record<string, { name: string; thesis: string }>> = names.pages;
const nodes: Readonly<Record<string, string>> = names.nodes;
const enemies: Readonly<Record<string, string>> = names.enemies;

/** Noms du contenu. Un identifiant sans traduction s'affiche tel quel (et un test le signale). */
export const names_ = {
  hero: (id: string): string => heroes[id]?.name ?? id,
  heroThesis: (id: string): string => heroes[id]?.thesis ?? '',
  spell: (id: string): string => spells[id] ?? id,
  passive: (id: string): string => passives[id] ?? id,
  page: (id: string): string => pages[id]?.name ?? id,
  pageThesis: (id: string): string => pages[id]?.thesis ?? '',
  node: (id: string): string => nodes[id] ?? id,
  enemy: (id: string): string => enemies[id] ?? id,
  /** Nom d'une unité de combat d'après son contenu (héros ou ennemi). */
  unit: (kind: string): string => heroes[kind]?.name ?? enemies[kind] ?? kind,
  /** Toutes les entrées, pour les tests de couverture des traductions. */
  all: { heroes, spells, passives, pages, nodes, enemies },
};
export { names_ as names };
