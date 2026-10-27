import {
  parseServerMessage,
  PROTOCOL_VERSION,
  contentHash,
  type ClientMessage,
  type ServerMessage,
} from '@outlaw/net';
import { content } from '../combat/session';

/**
 * Connexion WebSocket d'un salon : salutation à chaque (re)connexion, « ping » régulier pour garder
 * la ligne ouverte, reprise automatique tant que la grâce du serveur (60 s) n'est pas écoulée.
 */

export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Pourquoi la liaison est fermée pour de bon. */
export type CloseCause =
  | 'room_closed' // le salon n'existe plus
  | 'replaced' // ouvert dans un autre onglet
  | 'rate_limited'
  | 'unreachable' // jamais pu se connecter (code inconnu, salon complet, serveur absent)
  | 'lost'; // coupée trop longtemps

export interface SocketLike {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface SocketHandlers {
  readonly onMessage: (msg: ServerMessage, receivedAt: number) => void;
  readonly onStatus: (status: LinkStatus, cause: CloseCause | null) => void;
}

const OPEN = 1;
/** Codes de fermeture envoyés par le serveur (voir apps/api/src/pvp-room.ts). */
const CODE_REPLACED = 4000;
const CODE_ROOM_CLOSED = 4004;
const CODE_RATE_LIMITED = 4008;

export const PING_MS = 25_000;
/** Un peu plus que la grâce du serveur : passé ce délai, l'adversaire a de toute façon gagné. */
export const GIVE_UP_MS = 75_000;
const BACKOFF = [500, 1000, 2000, 4000] as const;

export function roomSocketUrl(code: string, location: Pick<Location, 'protocol' | 'host'>): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/api/pvp/rooms/${code}/ws`;
}

export class PvpSocket {
  private socket: SocketLike | null = null;
  private status: LinkStatus = 'connecting';
  private everOpen = false;
  private attempt = 0;
  private lostSince: number | null = null;
  private retry: number | undefined;
  private ping: number | undefined;
  private stopped = false;

  constructor(
    private readonly open: () => SocketLike,
    private readonly handlers: SocketHandlers,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    this.connect();
  }

  send(msg: ClientMessage): boolean {
    if (this.socket === null || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  /** Ferme pour de bon : plus aucune reprise, aucun rapport (l'écran qui l'appelle disparaît). */
  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retry);
    window.clearInterval(this.ping);
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      try {
        socket.close(1000, 'left');
      } catch {
        // Déjà fermée.
      }
    }
  }

  private report(status: LinkStatus, cause: CloseCause | null = null): void {
    this.status = status;
    this.handlers.onStatus(status, cause);
  }

  private connect(): void {
    let socket: SocketLike;
    try {
      socket = this.open();
    } catch {
      this.dropped(null);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.everOpen = true;
      this.attempt = 0;
      this.lostSince = null;
      this.report('open');
      this.send({ type: 'hello', v: PROTOCOL_VERSION, contentHash: contentHash(content) });
      window.clearInterval(this.ping);
      this.ping = window.setInterval(() => {
        if (socket.readyState === OPEN) socket.send('ping');
      }, PING_MS);
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      const parsed = parseServerMessage(event.data);
      if (parsed.ok) this.handlers.onMessage(parsed.msg, this.now());
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      window.clearInterval(this.ping);
      this.dropped(event.code);
    };
    socket.onerror = () => {
      // La fermeture qui suit décide de la suite.
    };
  }

  private dropped(code: number | null): void {
    if (this.stopped) return;
    const decided: CloseCause | null =
      code === CODE_REPLACED
        ? 'replaced'
        : code === CODE_ROOM_CLOSED
          ? 'room_closed'
          : code === CODE_RATE_LIMITED
            ? 'rate_limited'
            : null;
    if (decided !== null) {
      this.end(decided);
      return;
    }
    // Jamais connectés : le code est faux, le salon est plein, ou le serveur ne répond pas.
    if (!this.everOpen) {
      this.end('unreachable');
      return;
    }
    const now = this.now();
    this.lostSince ??= now;
    if (now - this.lostSince > GIVE_UP_MS) {
      this.end('lost');
      return;
    }
    this.report('reconnecting');
    const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)] ?? 4000;
    this.attempt += 1;
    this.retry = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private end(cause: CloseCause): void {
    this.stopped = true;
    window.clearTimeout(this.retry);
    this.report('closed', cause);
  }

  get current(): LinkStatus {
    return this.status;
  }
}
