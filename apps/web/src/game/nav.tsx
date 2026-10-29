import type { FarmRuns } from '@outlaw/engine';
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
  /** `runs` : passages joués d'affilée en Auto (1 par défaut). */
  | {
      readonly name: 'dungeon';
      readonly id: string;
      readonly tier?: number;
      readonly runs?: FarmRuns;
    }
  | { readonly name: 'demo' }
  /** Tour à étages : la colonne des étages (étage choisi), puis le combat d'un étage. */
  | { readonly name: 'tower'; readonly floor?: number }
  | { readonly name: 'tower_run'; readonly floor: number }
  /** Sanctuaires d'essence (depuis la carte), puis le passage d'un sanctuaire à un palier. */
  | { readonly name: 'essences'; readonly dungeon?: string }
  | { readonly name: 'essence_run'; readonly id: string; readonly tier: number }
  /** Boss de la semaine (depuis la tour) : difficulté choisie, puis son combat. */
  | { readonly name: 'boss'; readonly difficulty?: number }
  | { readonly name: 'boss_run'; readonly difficulty: number }
  /** Duel en ligne : entrée du menu, puis un salon par son code. */
  | { readonly name: 'pvp' }
  | { readonly name: 'pvp_room'; readonly code: string }
  /** Amis : demandes et liste (compte connecté ; en invité, l'écran explique). */
  | { readonly name: 'friends' }
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
