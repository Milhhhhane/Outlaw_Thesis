import { saveEnvelopeSchema } from '@outlaw/accounts';
import { loadContent, type Content, type Profile } from '@outlaw/data';
import type { Side } from '@outlaw/engine';
import {
  createRoom,
  deserializeRoom,
  encodeMessage,
  nextWakeUp,
  parseClientMessage,
  PLAYER_IDS,
  reduceRoom,
  receive,
  serializeRoom,
  type PlayerId,
  type Room,
  type RoomContext,
  type RoomUpdate,
} from '@outlaw/net';
import type { Database } from './db';

/**
 * Salon PvP côté serveur : une coquille fine autour du réducteur pur de `@outlaw/net`.
 *
 * - `RoomService` : toute la logique (identité, tirage au sort, profils, messages, alarmes). Elle ne
 *   touche ni Cloudflare ni le réseau : tout passe par `Host`, ce qui la rend testable sous Node.
 * - `PvpRoom` (en bas) : la classe du Durable Object, qui branche `Host` sur le stockage SQLite du
 *   Durable Object, les WebSocket en veille (hibernation) et la base D1 des comptes.
 */

/** Un salon inactif (aucun message) disparaît au bout de ce délai. */
export const IDLE_MS = 30 * 60 * 1000;

/** Au plus 60 messages en 5 secondes par connexion (12 par seconde : aucun humain n'y arrive) ; au-delà, la connexion est coupée. */
const RATE_WINDOW_MS = 5000;
const RATE_MAX = 60;

/** Codes de fermeture propres au jeu (4000 à 4999). */
export const CLOSE = {
  replaced: 4000,
  roomClosed: 4004,
  rateLimited: 4008,
} as const;

export interface Account {
  readonly id: number;
  readonly pseudo: string;
}

/** Ce que le Durable Object garde sur disque (le salon lui-même est un texte JSON validé à la lecture). */
export interface Stored {
  readonly code: string;
  readonly room: string;
  readonly accounts: { readonly p1: Account; readonly p2: Account | null };
  readonly lastActive: number;
}

export interface Peer {
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface Host {
  now(): number;
  /** Tirage au sort de la priorité du premier combat. */
  coin(): Side;
  load(): Promise<Stored | null>;
  save(stored: Stored): Promise<void>;
  /** Efface tout (stockage et alarme) : le salon n'existe plus. */
  destroy(): Promise<void>;
  setAlarm(at: number | null): Promise<void>;
  /** Profil de la sauvegarde en ligne d'un compte, ou null s'il n'y en a pas. */
  profile(accountId: number): Promise<Profile | null>;
  /** Connexions ouvertes d'un joueur (celle qui se ferme n'en fait plus partie). */
  peers(player: PlayerId): readonly Peer[];
}

export type JoinResult =
  | { readonly ok: true; readonly player: PlayerId }
  | {
      readonly ok: false;
      readonly status: 404 | 409;
      readonly error: 'room_not_found' | 'room_full';
    };

export class RoomService {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly profiles = new Map<number, Profile | null>();
  private readonly content: Content;

  constructor(
    private readonly host: Host,
    content?: Content,
  ) {
    this.content = content ?? loadContent();
  }

  /** Un seul événement à la fois : les accès à D1 rendent la main, pas question d'entrelacer deux événements. */
  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Crée le salon (le créateur est l'hôte). Faux si ce code existe déjà. */
  init(code: string, owner: Account): Promise<boolean> {
    return this.exclusive(async () => {
      if ((await this.host.load()) !== null) return false;
      const now = this.host.now();
      const stored: Stored = {
        code,
        room: serializeRoom(createRoom()),
        accounts: { p1: owner, p2: null },
        lastActive: now,
      };
      await this.host.save(stored);
      await this.host.setAlarm(now + IDLE_MS);
      return true;
    });
  }

  /** Attribue une place à un compte qui se connecte : sa place s'il en a une, sinon la place libre. */
  join(account: Account): Promise<JoinResult> {
    return this.exclusive(async () => {
      const stored = await this.host.load();
      if (stored === null) return { ok: false, status: 404, error: 'room_not_found' };
      if (stored.accounts.p1.id === account.id) return { ok: true, player: 'p1' };
      if (stored.accounts.p2?.id === account.id) return { ok: true, player: 'p2' };
      if (stored.accounts.p2 !== null) return { ok: false, status: 409, error: 'room_full' };
      const room = deserializeRoom(stored.room);
      // Une place libre ne s'occupe qu'avant le combat.
      if (room.phase === 'battle') return { ok: false, status: 409, error: 'room_full' };
      await this.host.save({
        ...stored,
        accounts: { ...stored.accounts, p2: account },
        lastActive: this.host.now(),
      });
      return { ok: true, player: 'p2' };
    });
  }

  /** La connexion est ouverte : chacun apprend le pseudo de l'autre. */
  connected(): Promise<void> {
    return this.exclusive(async () => {
      const stored = await this.host.load();
      if (stored === null) return;
      await this.touch(stored);
      this.announceNames(stored);
    });
  }

  /** Un texte reçu d'un joueur. */
  message(player: PlayerId, text: string): Promise<void> {
    return this.exclusive(async () => {
      const stored = await this.host.load();
      if (stored === null) {
        this.closeAll('room_closed');
        return;
      }
      const parsed = parseClientMessage(text);
      // Le profil peut avoir changé depuis la dernière fois (partie jouée entre-temps) : on le relit
      // quand le joueur annonce son équipe ou se (re)connecte.
      const refresh = parsed.ok && (parsed.msg.type === 'hello' || parsed.msg.type === 'set_team');
      await this.loadProfiles(stored, refresh ? player : null);
      const room = deserializeRoom(stored.room);
      const ctx = this.context(stored);
      const update = parsed.ok
        ? reduceRoom(room, { type: 'message', player, msg: parsed.msg }, ctx)
        : receive(room, player, text, ctx);
      await this.commit(stored, update);
    });
  }

  /** Une connexion s'est fermée : si c'était la dernière du joueur, le salon l'apprend. */
  closed(player: PlayerId): Promise<void> {
    return this.exclusive(async () => {
      const stored = await this.host.load();
      if (stored === null) return;
      if (this.host.peers(player).length > 0) return;
      const update = reduceRoom(
        deserializeRoom(stored.room),
        { type: 'disconnect', player },
        this.context(stored),
      );
      await this.commit(stored, update);
    });
  }

  /** L'alarme a sonné : échéances de chrono et de grâce, ou fin d'un salon oublié. */
  alarm(): Promise<void> {
    return this.exclusive(async () => {
      const stored = await this.host.load();
      if (stored === null) return;
      if (this.host.now() - stored.lastActive >= IDLE_MS) {
        this.closeAll('room_closed');
        await this.host.destroy();
        return;
      }
      await this.loadProfiles(stored, null);
      const update = reduceRoom(
        deserializeRoom(stored.room),
        { type: 'tick' },
        this.context(stored),
      );
      await this.commit(stored, update, false);
    });
  }

  /* ---------------------------------------------------------------- interne */

  private context(stored: Stored): RoomContext {
    return {
      now: this.host.now(),
      coin: this.host.coin(),
      profileOf: (player) => {
        const account = stored.accounts[player];
        return account === null ? null : (this.profiles.get(account.id) ?? null);
      },
      content: this.content,
      balance: this.content.balance,
    };
  }

  /** Charge les profils absents de la mémoire (le serveur a pu dormir) et relit celui de `fresh`. */
  private async loadProfiles(stored: Stored, fresh: PlayerId | null): Promise<void> {
    for (const player of PLAYER_IDS) {
      const account = stored.accounts[player];
      if (account === null) continue;
      if (player === fresh || !this.profiles.has(account.id)) {
        this.profiles.set(account.id, await this.host.profile(account.id));
      }
    }
  }

  private async touch(stored: Stored): Promise<Stored> {
    const next = { ...stored, lastActive: this.host.now() };
    await this.host.save(next);
    return next;
  }

  /** L'état est écrit avant que les messages partent : un joueur ne voit jamais un coup qui n'existerait pas. */
  private async commit(stored: Stored, update: RoomUpdate, active = true): Promise<void> {
    if (update.closed === true) {
      this.deliver(update);
      this.closeAll('room_closed');
      await this.host.destroy();
      return;
    }
    const next: Stored = {
      ...stored,
      room: serializeRoom(update.room),
      lastActive: active ? this.host.now() : stored.lastActive,
    };
    await this.host.save(next);
    await this.host.setAlarm(this.alarmAt(update.room, next));
    this.deliver(update);
  }

  private deliver(update: RoomUpdate): void {
    for (const { to, msg } of update.send) {
      const text = encodeMessage(msg);
      const targets = to === 'all' ? PLAYER_IDS : [to];
      for (const player of targets) {
        for (const peer of this.host.peers(player)) {
          try {
            peer.send(text);
          } catch {
            // Connexion déjà morte : sa fermeture sera traitée à part.
          }
        }
      }
    }
  }

  private alarmAt(room: Room, stored: Stored): number {
    const wake = nextWakeUp(room);
    const idle = stored.lastActive + IDLE_MS;
    return wake === null ? idle : Math.min(wake, idle);
  }

  private announceNames(stored: Stored): void {
    const name = (player: PlayerId): string | null => stored.accounts[player]?.pseudo ?? null;
    for (const player of PLAYER_IDS) {
      const you = name(player);
      if (you === null) continue;
      const other = name(player === 'p1' ? 'p2' : 'p1');
      const text = encodeMessage({ type: 'names', you, opponent: other });
      for (const peer of this.host.peers(player)) {
        try {
          peer.send(text);
        } catch {
          // Voir commit().
        }
      }
    }
  }

  private closeAll(reason: string): void {
    for (const player of PLAYER_IDS) {
      for (const peer of this.host.peers(player)) {
        try {
          peer.close(CLOSE.roomClosed, reason);
        } catch {
          // Déjà fermée.
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ Durable Object */

/** Le sous-ensemble de l'API des Durable Objects dont ce fichier a besoin (pas de dépendance aux types Cloudflare). */
interface WebSocketLike extends Peer {
  readonly readyState: number;
}
interface DurableObjectStateLike {
  readonly storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>;
    deleteAlarm(): Promise<void>;
    setAlarm(at: number): Promise<void>;
  };
  acceptWebSocket(ws: WebSocketLike, tags: string[]): void;
  getWebSockets(tag: string): WebSocketLike[];
  getTags(ws: WebSocketLike): string[];
  setWebSocketAutoResponse(pair: unknown): void;
}

export interface PvpEnv {
  readonly DB: Database;
}

declare const WebSocketPair: new () => { 0: WebSocketLike; 1: WebSocketLike };
declare const WebSocketRequestResponsePair: new (request: string, response: string) => unknown;

const OPEN = 1;

/** Lit « 0 » ou « 1 » dans un octet tiré au sort : la priorité du premier combat. */
function flip(): Side {
  const byte = new Uint8Array(1);
  crypto.getRandomValues(byte);
  return (byte[0] ?? 0) % 2 === 0 ? 'player' : 'enemy';
}

async function loadProfile(db: Database, accountId: number): Promise<Profile | null> {
  const row = await db
    .prepare('SELECT data FROM saves WHERE user_id = ?')
    .bind(accountId)
    .first<{ data: string }>();
  if (row === null) return null;
  try {
    const parsed = saveEnvelopeSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? parsed.data.profile : null;
  } catch {
    return null;
  }
}

/** Un salon = un Durable Object (nommé par son code). Le Worker lui passe l'identité déjà vérifiée. */
export class PvpRoom {
  private readonly service: RoomService;
  /** Cadence des messages par connexion (en mémoire : repart de zéro après une veille). */
  private readonly rate = new WeakMap<object, { start: number; count: number }>();
  /** Connexions en train de se fermer : elles ne comptent plus comme présentes. */
  private readonly closing = new WeakSet<object>();

  constructor(
    private readonly state: DurableObjectStateLike,
    env: PvpEnv,
  ) {
    // Un « ping » du client reçoit « pong » sans réveiller le salon.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    const host: Host = {
      now: () => Date.now(),
      coin: flip,
      load: async () => (await state.storage.get<Stored>('stored')) ?? null,
      save: (stored) => state.storage.put('stored', stored),
      destroy: async () => {
        await state.storage.deleteAlarm();
        await state.storage.deleteAll();
      },
      setAlarm: async (at) => {
        if (at === null) await state.storage.deleteAlarm();
        else await state.storage.setAlarm(at);
      },
      profile: (accountId) => loadProfile(env.DB, accountId),
      peers: (player) =>
        state.getWebSockets(player).filter((ws) => ws.readyState === OPEN && !this.closing.has(ws)),
    };
    this.service = new RoomService(host);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const id = Number(request.headers.get('X-Outlaw-Account'));
    let pseudo = '';
    try {
      pseudo = decodeURIComponent(request.headers.get('X-Outlaw-Pseudo') ?? '');
    } catch {
      // En-tête illisible : refusé plus bas.
    }
    if (!Number.isInteger(id) || id <= 0 || pseudo === '')
      return new Response(null, { status: 400 });
    const account: Account = { id, pseudo };

    if (url.pathname === '/init') {
      const code = url.searchParams.get('code') ?? '';
      return new Response(null, { status: (await this.service.init(code, account)) ? 201 : 409 });
    }
    if (url.pathname !== '/ws' || request.headers.get('Upgrade') !== 'websocket') {
      return new Response(null, { status: 404 });
    }
    const joined = await this.service.join(account);
    if (!joined.ok) {
      return new Response(JSON.stringify({ error: joined.error }), {
        status: joined.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    // Une seule connexion par joueur : l'ancienne (autre onglet, reconnexion) est remplacée.
    for (const old of this.state.getWebSockets(joined.player)) {
      this.closing.add(old);
      try {
        old.close(CLOSE.replaced, 'replaced');
      } catch {
        // Déjà fermée.
      }
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], [joined.player]);
    await this.service.connected();
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocketLike, message: string | ArrayBuffer): Promise<void> {
    const player = this.state.getTags(ws)[0] as PlayerId | undefined;
    if (player === undefined) return;
    const now = Date.now();
    const slot = this.rate.get(ws) ?? { start: now, count: 0 };
    if (now - slot.start > RATE_WINDOW_MS) {
      slot.start = now;
      slot.count = 0;
    }
    slot.count += 1;
    this.rate.set(ws, slot);
    if (slot.count > RATE_MAX) {
      ws.close(CLOSE.rateLimited, 'rate_limited');
      return;
    }
    // Un message binaire n'est pas dans le protocole : il passe par le même contrôle de taille et de forme.
    await this.service.message(player, typeof message === 'string' ? message : '\u0000');
  }

  async webSocketClose(ws: WebSocketLike, code: number, reason: string): Promise<void> {
    this.closing.add(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason.slice(0, 100));
    } catch {
      // Déjà fermée.
    }
    const player = this.state.getTags(ws)[0] as PlayerId | undefined;
    if (player !== undefined) await this.service.closed(player);
  }

  async webSocketError(ws: WebSocketLike): Promise<void> {
    this.closing.add(ws);
    const player = this.state.getTags(ws)[0] as PlayerId | undefined;
    if (player !== undefined) await this.service.closed(player);
  }

  async alarm(): Promise<void> {
    await this.service.alarm();
  }
}
