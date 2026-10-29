import { tierNumeral } from '@outlaw/engine';
import account from './account.fr.json';
import admin from './admin.fr.json';
import auto from './auto.fr.json';
import awakening from './awakening.fr.json';
import boss from './boss.fr.json';
import chests from './chests.fr.json';
import farm from './farm.fr.json';
import fr from './fr.json';
import heroTexts from './heroes.fr.json';
import loot from './loot.fr.json';
import pvp from './pvp.fr.json';
import spellLevels from './spells.fr.json';
import quests from './quests.fr.json';
import tiers from './tiers.fr.json';
import tower from './tower.fr.json';
import names from './content.fr.json';

/** Clés de texte : le français est la langue par défaut et la référence des clés. */
export type TextKey =
  | keyof typeof fr
  | keyof typeof account
  | keyof typeof admin
  | keyof typeof auto
  | keyof typeof awakening
  | keyof typeof boss
  | keyof typeof chests
  | keyof typeof farm
  | keyof typeof heroTexts
  | keyof typeof loot
  | keyof typeof pvp
  | keyof typeof quests
  | keyof typeof spellLevels
  | keyof typeof tiers
  | keyof typeof tower;

/** Comptes (account.fr.json), administration (admin.fr.json), combat auto (auto.fr.json), éveil et sanctuaires (awakening.fr.json), boss de la semaine (boss.fr.json), coffres (chests.fr.json), confort de farm (farm.fr.json), héros (heroes.fr.json), butin (loot.fr.json), PvP (pvp.fr.json), quêtes (quests.fr.json), montée des sorts (spells.fr.json), paliers (tiers.fr.json) et tour (tower.fr.json) vivent à part pour limiter les conflits d'édition. */
const dictionary: Readonly<Record<TextKey, string>> = {
  ...fr,
  ...account,
  ...admin,
  ...auto,
  ...awakening,
  ...boss,
  ...chests,
  ...farm,
  ...heroTexts,
  ...loot,
  ...pvp,
  ...spellLevels,
  ...quests,
  ...tiers,
  ...tower,
};

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
const items: Readonly<Record<string, string>> = names.items;
const dungeons: Readonly<Record<string, { name: string; text: string }>> = names.dungeons;

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
  item: (id: string): string => items[id] ?? id,
  dungeon: (id: string): string => dungeons[id]?.name ?? id,
  dungeonText: (id: string): string => dungeons[id]?.text ?? '',
  /** Nom d'une unité de combat d'après son contenu (héros ou ennemi). */
  unit: (kind: string): string => heroes[kind]?.name ?? enemies[kind] ?? kind,
  /** Toutes les entrées, pour les tests de couverture des traductions. */
  all: { heroes, spells, passives, pages, nodes, enemies, items, dungeons },
};
export { names_ as names };

/** Nom d'un donjon avec son palier : « Landes de braise II » (le palier I n'est pas écrit). */
export function dungeonTitle(id: string, tier = 1): string {
  const name = names_.dungeon(id);
  return tier > 1 ? t('tier.short', { dungeon: name, tier: tierNumeral(tier) }) : name;
}

/** Nom de la poussière d'un palier (1 à 3) : « poussière fine ». */
export function dustName(tier: number): string {
  return tk(`dust.tier.${tier}`);
}
