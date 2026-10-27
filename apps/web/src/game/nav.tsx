import { createContext, useContext } from 'react';

/** Les écrans du jeu. */
export type Route =
  | { readonly name: 'title' }
  | { readonly name: 'hub' }
  | { readonly name: 'map'; readonly dungeon?: string }
  | { readonly name: 'team'; readonly dungeon?: string }
  | { readonly name: 'heroes' }
  | { readonly name: 'hero'; readonly id: string }
  | { readonly name: 'workshop' }
  | { readonly name: 'credits' }
  | { readonly name: 'dungeon'; readonly id: string }
  | { readonly name: 'demo' };

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
