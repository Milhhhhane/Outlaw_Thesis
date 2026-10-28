import type { Content } from '@outlaw/data';
import { cyrb53 } from '@outlaw/engine';

const cache = new WeakMap<Content, string>();

/**
 * Empreinte de ce qui décide d'un combat PvP : équilibrage, héros et objets. Le client l'envoie dans
 * son premier message ; le serveur refuse un client dont le contenu diffère (même version de
 * protocole, jeu pas à jour) plutôt que de laisser les deux rejeux diverger en plein combat.
 */
export function contentHash(content: Content): string {
  const known = cache.get(content);
  if (known !== undefined) return known;
  const text = JSON.stringify({
    balance: content.balance,
    heroes: content.heroes,
    items: content.items,
  });
  const hash = cyrb53(text).toString(16).padStart(14, '0');
  cache.set(content, hash);
  return hash;
}
