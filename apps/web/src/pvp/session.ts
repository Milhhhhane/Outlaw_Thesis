import type { Action } from '@outlaw/engine';
import type { ClientMessage, ErrorCode, RoomResult, RoomView, ServerMessage } from '@outlaw/net';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ShownEmote } from './info';
import {
  PvpSocket,
  roomSocketUrl,
  type CloseCause,
  type LinkStatus,
  type SocketLike,
} from './socket';

export type BattleStart = Extract<ServerMessage, { type: 'battle_start' }>;
export type Applied = Extract<ServerMessage, { type: 'applied' }>;

export interface SessionState {
  readonly link: LinkStatus;
  readonly cause: CloseCause | null;
  readonly names: { readonly you: string | null; readonly opponent: string | null };
  readonly room: RoomView | null;
  /** Numéro du combat reçu : change à chaque `battle_start` (revanche, reprise, resynchronisation). */
  readonly battleId: number;
  readonly start: BattleStart | null;
  /** Coups annoncés depuis `start`, dans l'ordre. */
  readonly applied: readonly Applied[];
  /** Échéance du coup en cours, en heures du serveur (null : aucune). */
  readonly deadline: number | null;
  /** Heure du serveur moins heure de cet appareil, mesurée au dernier message. */
  readonly offset: number;
  readonly result: RoomResult | null;
  readonly error: {
    readonly key: number;
    readonly code: ErrorCode;
    readonly detail?: string;
  } | null;
  readonly emote: ShownEmote | null;
  readonly counter: number;
}

export const initialSession: SessionState = {
  link: 'connecting',
  cause: null,
  names: { you: null, opponent: null },
  room: null,
  battleId: 0,
  start: null,
  applied: [],
  deadline: null,
  offset: 0,
  result: null,
  error: null,
  emote: null,
  counter: 0,
};

export type SessionEvent =
  | { readonly type: 'status'; readonly status: LinkStatus; readonly cause: CloseCause | null }
  | { readonly type: 'message'; readonly msg: ServerMessage; readonly at: number }
  | { readonly type: 'emote'; readonly id: number }
  | { readonly type: 'dismiss' };

export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'status':
      return { ...state, link: event.status, cause: event.cause };
    case 'emote':
      return {
        ...state,
        counter: state.counter + 1,
        emote: { key: state.counter + 1, id: event.id, mine: true },
      };
    case 'dismiss':
      return { ...state, error: null };
    case 'message':
      break;
  }
  const { msg, at } = event;
  const counter = state.counter + 1;
  switch (msg.type) {
    case 'names':
      return { ...state, names: { you: msg.you, opponent: msg.opponent } };
    case 'room':
      return {
        ...state,
        room: msg.room,
        // Le salon est la référence : un combat en cours n'a pas de résultat, un combat fini a le sien.
        result: msg.room.phase === 'ended' ? (msg.room.result ?? state.result) : null,
      };
    case 'battle_start':
      return {
        ...state,
        battleId: state.battleId + 1,
        start: msg,
        applied: [],
        deadline: msg.deadline,
        offset: msg.serverNow - at,
        result: null,
        error: null,
      };
    case 'applied':
      return {
        ...state,
        applied: [...state.applied, msg],
        deadline: msg.deadline,
        offset: msg.serverNow - at,
        error: null,
      };
    case 'result':
      return { ...state, result: msg, deadline: null };
    case 'emote':
      return { ...state, counter, emote: { key: counter, id: msg.id, mine: false } };
    case 'error':
      return {
        ...state,
        counter,
        error: {
          key: counter,
          code: msg.code,
          ...(msg.detail === undefined ? {} : { detail: msg.detail }),
        },
      };
  }
}

/** Une action du jeu telle que le serveur l'annonce. */
export function toAction(actor: string, action: { spell: string; target?: string }): Action {
  return {
    type: 'cast',
    unit: actor,
    spell: action.spell,
    ...(action.target === undefined ? {} : { target: action.target }),
  };
}

/** La liaison avec un salon : l'état reçu et de quoi envoyer. */
export function usePvpSession(code: string) {
  const [state, dispatch] = useReducer(reduceSession, initialSession);
  const socket = useRef<PvpSocket | null>(null);

  useEffect(() => {
    const link = new PvpSocket(
      () => new WebSocket(roomSocketUrl(code, window.location)) as unknown as SocketLike,
      {
        onMessage: (msg, at) => {
          dispatch({ type: 'message', msg, at });
        },
        onStatus: (status, cause) => {
          dispatch({ type: 'status', status, cause });
        },
      },
    );
    socket.current = link;
    link.start();
    return () => {
      link.stop();
      socket.current = null;
    };
  }, [code]);

  const send = useCallback((msg: ClientMessage): boolean => {
    return socket.current?.send(msg) ?? false;
  }, []);
  const emote = useCallback(
    (id: number): void => {
      if (send({ type: 'emote', id })) dispatch({ type: 'emote', id });
    },
    [send],
  );
  const dismiss = useCallback(() => {
    dispatch({ type: 'dismiss' });
  }, []);

  return { state, send, emote, dismiss };
}
