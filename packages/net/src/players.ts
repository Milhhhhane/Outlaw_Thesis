import type { Side } from '@outlaw/engine';

/**
 * Les deux places d'un salon. Le joueur 1 (l'hôte) est toujours le camp « player », le joueur 2
 * le camp « enemy » : seule la priorité (firstSide) change d'un combat à l'autre.
 */
export const PLAYER_IDS = ['p1', 'p2'] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];

export function sideOf(player: PlayerId): Side {
  return player === 'p1' ? 'player' : 'enemy';
}

export function playerOf(side: Side): PlayerId {
  return side === 'player' ? 'p1' : 'p2';
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'p1' ? 'p2' : 'p1';
}

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}
