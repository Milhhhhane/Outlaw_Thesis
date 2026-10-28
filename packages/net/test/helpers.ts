import { loadContent, type Profile } from '@outlaw/data';
import {
  createBattle,
  defaultAction,
  hashState,
  sandboxProfile,
  step,
  talentPoints,
  unlockedPages,
  type Action,
  type BattleState,
  type Side,
} from '@outlaw/engine';
import {
  contentHash,
  createRoom,
  opponentOf,
  playerOf,
  PLAYER_IDS,
  PROTOCOL_VERSION,
  reduceRoom,
  restoreBattle,
  validateTeam,
  type ClientMessage,
  type PlayerId,
  type Room,
  type RoomContext,
  type RoomRules,
  type RoomUpdate,
  type ServerMessage,
  type TeamRequest,
} from '../src';

export const content = loadContent();
export const balance = content.balance;

export const HELLO: ClientMessage = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  contentHash: contentHash(content),
};

/** Tous les héros au niveau maximum, plusieurs exemplaires de chaque objet (voir sandboxProfile). */
export const richProfile: Profile = sandboxProfile(content);

const TEAMS: Readonly<Record<string, readonly string[]>> = {
  a: ['pyra', 'maree', 'ronce', 'cendre'],
  b: ['cendre', 'ressac', 'seve', 'pyra'],
};

/** Premiers talents valides jusqu'à épuisement des points du niveau donné. */
export function talentsFor(hero: string, level: number): string[] {
  const def = content.heroById.get(hero)!;
  const pages = unlockedPages(level, balance);
  const nodes = def.pages.slice(0, pages).flatMap((page) => page.nodes);
  const taken: string[] = [];
  for (let guard = 0; guard < 50 && taken.length < talentPoints(level, balance); guard++) {
    const groups = new Set(nodes.filter((n) => taken.includes(n.id)).map((n) => n.group));
    const next = nodes.find(
      (n) =>
        !taken.includes(n.id) &&
        (n.requires === undefined || taken.includes(n.requires)) &&
        (n.group === undefined || !groups.has(n.group)),
    );
    if (next === undefined) break;
    taken.push(next.id);
  }
  return taken;
}

/** Demande d'équipe : les héros dans l'ordre, talents au niveau donné, un objet par héros (uid donnés). */
export function teamRequest(
  heroes: readonly string[],
  options: { level?: number; items?: readonly (readonly number[])[] } = {},
): TeamRequest {
  const level = options.level ?? 30;
  return {
    heroes: heroes.map((hero, slot) => ({
      hero,
      slot,
      talents: talentsFor(hero, level),
      items: [...(options.items?.[slot] ?? [])],
    })),
  };
}

export const squad = (name: 'a' | 'b'): readonly string[] => TEAMS[name]!;

/** Héros par équipe, lu dans l'équilibrage (4) : les tests ne supposent pas de nombre. */
export const TEAM = balance.progression.teamSize;

/** Un salon et ses deux joueurs : l'heure, les profils et les messages reçus sont suivis ici. */
export class Table {
  room: Room;
  now = 1_000_000;
  coin: Side = 'player';
  closed = false;
  readonly profiles: Record<PlayerId, Profile | null> = { p1: richProfile, p2: richProfile };
  readonly inbox: Record<PlayerId, ServerMessage[]> = { p1: [], p2: [] };
  last: RoomUpdate | null = null;
  balance = content.balance;

  constructor(rules?: RoomRules) {
    this.room = createRoom(rules);
  }

  ctx(): RoomContext {
    return {
      now: this.now,
      coin: this.coin,
      profileOf: (player) => this.profiles[player],
      content,
      balance: this.balance,
    };
  }

  /** Gèle le salon après chaque événement : le réducteur ne doit jamais modifier ce qu'il reçoit. */
  freeze = false;

  private apply(update: RoomUpdate): RoomUpdate {
    this.room = this.freeze ? deepFreeze(update.room) : update.room;
    this.last = update;
    if (update.closed === true) this.closed = true;
    for (const out of update.send) {
      for (const player of out.to === 'all' ? PLAYER_IDS : [out.to])
        this.inbox[player].push(out.msg);
    }
    return update;
  }

  send(player: PlayerId, msg: ClientMessage): RoomUpdate {
    return this.apply(reduceRoom(this.room, { type: 'message', player, msg }, this.ctx()));
  }

  disconnect(player: PlayerId): RoomUpdate {
    return this.apply(reduceRoom(this.room, { type: 'disconnect', player }, this.ctx()));
  }

  tick(advanceMs = 0): RoomUpdate {
    this.now += advanceMs;
    return this.apply(reduceRoom(this.room, { type: 'tick' }, this.ctx()));
  }

  /** Les messages reçus par un joueur depuis le dernier appel, ou le dernier d'un type. */
  take(player: PlayerId): ServerMessage[] {
    return this.inbox[player].splice(0);
  }

  lastOf<T extends ServerMessage['type']>(
    player: PlayerId,
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    return this.inbox[player].findLast(
      (msg): msg is Extract<ServerMessage, { type: T }> => msg.type === type,
    );
  }

  /** Les deux joueurs rejoignent, composent leur équipe et se déclarent prêts : le combat commence. */
  startBattle(
    teams: { p1: TeamRequest; p2: TeamRequest } = {
      p1: teamRequest(squad('a'), { items: [[1], [4], [7], [10]] }),
      p2: teamRequest(squad('b'), { items: [[13], [16], [19], [22]] }),
    },
  ): void {
    this.send('p1', HELLO);
    this.send('p2', HELLO);
    this.send('p1', { type: 'set_team', heroes: teams.p1.heroes });
    this.send('p2', { type: 'set_team', heroes: teams.p2.heroes });
    this.send('p1', { type: 'ready' });
    this.send('p2', { type: 'ready' });
    if (this.room.phase !== 'battle')
      throw new Error(`le combat n'a pas commencé : ${this.room.phase}`);
  }

  state(): BattleState {
    return restoreBattle(this.room, this.balance);
  }

  /** Le joueur qui doit jouer, et l'action par défaut du moteur pour lui. */
  turn(): { player: PlayerId; action: Action } {
    const state = this.state();
    const active = state.units.find((unit) => unit.def.id === state.active);
    if (active === undefined) throw new Error('personne ne joue');
    return { player: playerOf(active.def.side), action: defaultAction(state) };
  }

  /** Joue le combat jusqu'au bout, chaque joueur envoyant l'action par défaut. */
  playOut(): void {
    for (let guard = 0; guard < 500 && this.room.phase === 'battle'; guard++) {
      const { player, action } = this.turn();
      this.send(player, {
        type: 'action',
        spell: action.spell,
        ...(action.target === undefined ? {} : { target: action.target }),
      });
    }
    if (this.room.phase === 'battle') throw new Error('le combat ne finit pas');
  }
}

/**
 * Un client minimal, comme le sera celui de l'interface : il rejoue le combat à partir de ce que
 * le serveur annonce et vérifie l'empreinte de chaque état.
 */
export class Replica {
  state: BattleState | null = null;
  you: Side | null = null;
  mismatches = 0;
  applied = 0;

  constructor(private readonly bal = balance) {}

  receive(msg: ServerMessage): void {
    if (msg.type === 'battle_start') {
      this.you = msg.you;
      let state = createBattle(msg.setup, this.bal).state;
      for (const logged of msg.actions) {
        state = step(state, {
          type: 'cast',
          unit: logged.unit,
          spell: logged.spell,
          ...(logged.target === undefined ? {} : { target: logged.target }),
        }).state;
      }
      this.state = state;
      if (hashState(state) !== msg.stateHash) this.mismatches++;
    } else if (msg.type === 'applied' && this.state !== null) {
      this.state = step(this.state, {
        type: 'cast',
        unit: msg.actor,
        spell: msg.action.spell,
        ...(msg.action.target === undefined ? {} : { target: msg.action.target }),
      }).state;
      this.applied++;
      if (hashState(this.state) !== msg.stateHash) this.mismatches++;
    }
  }
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export { opponentOf, validateTeam };
