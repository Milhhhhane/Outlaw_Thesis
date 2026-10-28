import { createContext, useContext } from 'react';

/** Les écrans du jeu. */
export type Route =
  | { readonly name: 'title' }
  | { readonly name: 'hub' }
  | { readonly name: 'map'; readonly dungeon?: string; readonly tier?: number }
  | { readonly name: 'team'; readonly dungeon?: string; readonly tier?: number }
  | { readonly name: 'heroes' }
  | { readonly name: 'hero'; readonly id: string }
  | { readonly name: 'workshop' }
  | { readonly name: 'chests' }
  | { readonly name: 'quests' }
  | { readonly name: 'credits' }
  | { readonly name: 'dungeon'; readonly id: string; readonly tier?: number }
  | { readonly name: 'demo' }
  /** Tour à étages : la colonne des étages (étage choisi), puis le combat d'un étage. */
  | { readonly name: 'tower'; readonly floor?: number }
  | { readonly name: 'tower_run'; readonly floor: number }
  /** Duel en ligne : entrée du menu, puis un salon par son code. */
  | { readonly name: 'pvp' }
  | { readonly name: 'pvp_room'; readonly code: string }
  /** Administration : comptes, activité et avancement (administrateurs seulement). */
  | { readonly name: 'admin' };

export interface GameApi {
  readonly go: (route: Route) => void;
  readonly openOptions: () => void;
  /** Entre dans le mode test (partie normale) ou le quitte (mode test). */
  readonly toggleTestMode: () => void;
  readonly version: string;
}

export const GameContext = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (api === null) throw new Error('useGame hors du jeu');
  return api;
}
