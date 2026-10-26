import balanceJson from '../balance.json' with { type: 'json' };
import { rawHeroes } from '../content/heroes/index';
import dungeonsJson from '../content/dungeons.json' with { type: 'json' };
import enemiesJson from '../content/enemies.json' with { type: 'json' };
import itemsJson from '../content/items.json' with { type: 'json' };
import { parseContent, type Content } from './content';

export * from './content';
export * from './schemas/balance';
export * from './schemas/common';
export * from './schemas/dungeons';
export * from './schemas/effects';
export * from './schemas/enemies';
export * from './schemas/heroes';
export * from './schemas/items';
export * from './schemas/profile';

/** Charge et valide tout le contenu embarqué (aucun appel réseau : tout est statique). */
export function loadContent(): Content {
  return parseContent({
    balance: balanceJson,
    heroes: rawHeroes,
    enemies: enemiesJson,
    items: itemsJson,
    dungeons: dungeonsJson,
  });
}
