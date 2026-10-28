import type { Action, Side } from '@outlaw/engine';
import type { RoomResult } from '@outlaw/net';

/** Une émote affichée à l'écran (la clé relance l'animation). */
export interface ShownEmote {
  readonly key: number;
  readonly id: number;
  readonly mine: boolean;
}

/**
 * Ce que l'écran de combat doit savoir d'une partie en ligne. Les heures sont en millisecondes de
 * l'horloge de CET appareil (le décalage avec le serveur est corrigé en amont).
 */
export interface PvpInfo {
  readonly you: Side;
  readonly names: { readonly you: string; readonly opponent: string };
  /** Échéance de l'action en cours, ou null (animation, combat fini). */
  readonly deadline: number | null;
  /** Une action est partie : on attend la confirmation du serveur. */
  readonly pending: boolean;
  readonly send: (action: Action) => void;
  /** Résultat annoncé par le serveur (couvre aussi abandon et déconnexion). */
  readonly result: RoomResult | null;
  readonly opponent: { readonly connected: boolean; readonly graceUntil: number | null };
  /** Connexion au serveur interrompue : reprise en cours. */
  readonly offline: boolean;
  readonly rematch: { readonly me: boolean; readonly opponent: boolean };
  readonly onRematch: () => void;
  /** Abandon (en plein combat) ou retour au salon / à l'accueil (combat fini). */
  readonly onLeave: () => void;
  readonly onEmote: (id: number) => void;
  readonly emote: ShownEmote | null;
  /** Dernier refus du serveur à afficher (action impossible, par exemple). */
  readonly notice: string | null;
}
