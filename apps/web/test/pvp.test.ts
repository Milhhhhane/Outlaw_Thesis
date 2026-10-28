import { sandboxProfile, takeTalent, validateBuild } from '@outlaw/engine';
import { defaultRules, validateTeam, type ServerMessage } from '@outlaw/net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../src/combat/session';
import { reducer, restore } from '../src/combat/useBattle';
import { demoSetup } from '../src/combat/session';
import { normalizeCode } from '../src/pvp/api';
import { initialSession, reduceSession, toAction } from '../src/pvp/session';
import {
  GIVE_UP_MS,
  PING_MS,
  PvpSocket,
  roomSocketUrl,
  type LinkStatus,
  type SocketLike,
} from '../src/pvp/socket';
import { cappedLevel, teamRequestFor, tierOf, trimTalents } from '../src/pvp/team';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = {
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    };
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe('liaison avec le salon', () => {
  let sockets: FakeSocket[];
  let clock: number;
  const statuses: { status: LinkStatus; cause: string | null }[] = [];
  const received: ServerMessage[] = [];

  function link(): PvpSocket {
    return new PvpSocket(
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      {
        onMessage: (msg) => received.push(msg),
        onStatus: (status, cause) => statuses.push({ status, cause }),
      },
      () => clock,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    clock = 1_000_000;
    statuses.length = 0;
    received.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('salue le salon à chaque ouverture et ignore les « pong »', () => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    expect(statuses.at(-1)).toEqual({ status: 'open', cause: null });
    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ type: 'hello', v: 1 });
    sockets[0]!.receive('pong');
    sockets[0]!.receive(JSON.stringify({ type: 'names', you: 'A', opponent: null }));
    sockets[0]!.receive('pas du json');
    expect(received).toEqual([{ type: 'names', you: 'A', opponent: null }]);
    socket.stop();
  });

  it('envoie un « ping » régulier pour garder la ligne ouverte', () => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    vi.advanceTimersByTime(PING_MS * 2 + 10);
    expect(sockets[0]!.sent.filter((text) => text === 'ping')).toHaveLength(2);
    socket.stop();
  });

  it('reprend après une coupure, avec une nouvelle salutation', () => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    sockets[0]!.drop(1006);
    expect(statuses.at(-1)?.status).toBe('reconnecting');
    vi.advanceTimersByTime(600);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(statuses.at(-1)?.status).toBe('open');
    expect(JSON.parse(sockets[1]!.sent[0]!)).toMatchObject({ type: 'hello' });
    socket.stop();
  });

  it('renonce après plus longtemps que la grâce du serveur', () => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    sockets[0]!.drop(1006);
    clock += GIVE_UP_MS + 1;
    vi.advanceTimersByTime(600);
    sockets[1]!.drop(1006);
    expect(statuses.at(-1)).toEqual({ status: 'closed', cause: 'lost' });
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it.each([
    [4000, 'replaced'],
    [4004, 'room_closed'],
    [4008, 'rate_limited'],
  ] as const)('ne reprend pas quand le serveur ferme avec %i', (code, cause) => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    sockets[0]!.drop(code);
    expect(statuses.at(-1)).toEqual({ status: 'closed', cause });
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('signale un salon inaccessible quand la première connexion échoue', () => {
    const socket = link();
    socket.start();
    sockets[0]!.drop(1006);
    expect(statuses.at(-1)).toEqual({ status: 'closed', cause: 'unreachable' });
  });

  it('ne dit rien après un arrêt volontaire', () => {
    const socket = link();
    socket.start();
    sockets[0]!.open();
    const count = statuses.length;
    socket.stop();
    sockets[0]!.drop(1000);
    expect(statuses).toHaveLength(count);
    expect(socket.send({ type: 'ready' })).toBe(false);
  });

  it("construit l'adresse du salon d'après la page", () => {
    expect(roomSocketUrl('ABC234', { protocol: 'https:', host: 'jeu.example' })).toBe(
      'wss://jeu.example/api/pvp/rooms/ABC234/ws',
    );
    expect(roomSocketUrl('ABC234', { protocol: 'http:', host: 'localhost:8788' })).toBe(
      'ws://localhost:8788/api/pvp/rooms/ABC234/ws',
    );
  });
});

describe('état de la session', () => {
  const start: ServerMessage = {
    type: 'battle_start',
    setup: demoSetup(),
    rules: defaultRules,
    firstSide: 'player',
    you: 'player',
    actions: [],
    stateHash: '0'.repeat(14),
    deadline: 5000,
    serverNow: 1000,
  };

  it('retient le décalage d’horloge et l’échéance à chaque message', () => {
    let state = reduceSession(initialSession, { type: 'message', msg: start, at: 400 });
    expect(state.battleId).toBe(1);
    expect(state.offset).toBe(600);
    expect(state.deadline).toBe(5000);
    state = reduceSession(state, {
      type: 'message',
      msg: {
        type: 'applied',
        actor: 'u',
        action: { spell: 's' },
        stateHash: '1'.repeat(14),
        deadline: 9000,
        serverNow: 2000,
      },
      at: 1500,
    });
    expect(state.applied).toHaveLength(1);
    expect(state.deadline).toBe(9000);
    expect(state.offset).toBe(500);
  });

  it('repart de zéro à chaque nouveau combat (revanche, resynchronisation)', () => {
    let state = reduceSession(initialSession, { type: 'message', msg: start, at: 0 });
    state = reduceSession(state, {
      type: 'message',
      msg: { type: 'result', winner: 'player', reason: 'annihilation' },
      at: 0,
    });
    expect(state.result).not.toBeNull();
    expect(state.deadline).toBeNull();
    state = reduceSession(state, { type: 'message', msg: start, at: 0 });
    expect(state.battleId).toBe(2);
    expect(state.result).toBeNull();
    expect(state.applied).toEqual([]);
  });

  it('distingue vos émotes de celles de l’adversaire et garde le dernier refus', () => {
    let state = reduceSession(initialSession, { type: 'emote', id: 2 });
    expect(state.emote).toMatchObject({ id: 2, mine: true });
    state = reduceSession(state, { type: 'message', msg: { type: 'emote', id: 4 }, at: 0 });
    expect(state.emote).toMatchObject({ id: 4, mine: false });
    state = reduceSession(state, {
      type: 'message',
      msg: { type: 'error', code: 'illegal_action' },
      at: 0,
    });
    expect(state.error?.code).toBe('illegal_action');
    state = reduceSession(state, { type: 'dismiss' });
    expect(state.error).toBeNull();
  });

  it('range les pseudos et l’état du lien', () => {
    let state = reduceSession(initialSession, {
      type: 'message',
      msg: { type: 'names', you: 'Alice', opponent: 'Bob' },
      at: 0,
    });
    expect(state.names).toEqual({ you: 'Alice', opponent: 'Bob' });
    state = reduceSession(state, { type: 'status', status: 'closed', cause: 'room_closed' });
    expect(state.link).toBe('closed');
    expect(state.cause).toBe('room_closed');
  });
});

describe('combat reçu du serveur', () => {
  it('applique une action annoncée même pendant une animation', () => {
    const setup = demoSetup();
    const first = restore(setup, []);
    const unit = first.state.active!;
    const spell = first.state.units.find((u) => u.def.id === unit)!.def.spells[0]!;
    const enemy = first.state.units.find((u) => u.def.side === 'enemy')!.def.id;
    const action = toAction(unit, { spell: spell.id, target: enemy });
    const acted = reducer(first, { type: 'apply', action });
    expect(acted.queue.length).toBeGreaterThan(0);
    // La file est pleine : une action locale serait ignorée, une action du serveur ne l'est jamais.
    expect(reducer(acted, { type: 'act', action })).toBe(acted);
    const nextActor = acted.state.active;
    expect(nextActor).not.toBeNull();
  });

  it('ignore, sans planter, une action impossible chez nous', () => {
    const model = restore(demoSetup(), []);
    const bad = toAction('inconnu', { spell: 'rien' });
    expect(reducer(model, { type: 'apply', action: bad })).toBe(model);
  });

  it('reprend un combat en cours sans animation', () => {
    const setup = demoSetup();
    let live = restore(setup, []);
    const history = [];
    for (let i = 0; i < 4 && live.state.result === null; i++) {
      const unit = live.state.active!;
      const def = live.state.units.find((u) => u.def.id === unit)!.def;
      const spell = def.spells[0]!;
      const target = live.state.units.find((u) => u.def.side !== def.side && u.alive)!.def.id;
      const action = toAction(unit, {
        spell: spell.id,
        ...(spell.targeting === 'enemy' ? { target } : {}),
      });
      history.push(action);
      live = reducer(live, { type: 'apply', action });
      live = reducer(live, { type: 'flush' });
    }
    const resumed = restore(setup, history);
    expect(resumed.queue).toEqual([]);
    expect(resumed.state.actionCount).toBe(live.state.actionCount);
    expect(resumed.view.units.map((u) => u.hp)).toEqual(live.view.units.map((u) => u.hp));
  });
});

/** Le bac à sable n'enregistre aucun talent : on en prend un maximum, dans l'ordre, comme le ferait un joueur. */
function withTalents(heroes: readonly string[]) {
  let current = sandboxProfile(content);
  for (const hero of heroes) {
    const nodes = content.heroById.get(hero)!.pages.flatMap((page) => page.nodes);
    for (let pass = 0; pass < 3; pass++) {
      for (const node of nodes) {
        const taken = takeTalent(content, current, hero, node.id);
        if (taken.ok) current = taken.value;
      }
    }
  }
  return current;
}

describe('équipe envoyée au salon', () => {
  // Une équipe de la taille du jeu (`teamSize`, 4) : le salon refuse toute autre taille.
  const heroes = content.heroes.slice(0, content.balance.progression.teamSize).map((h) => h.id);
  const profile = withTalents(heroes);
  const check = (level: number, items = true) =>
    validateTeam({
      profile,
      request: teamRequestFor(content, profile, heroes, {
        ...defaultRules,
        maxLevel: level,
        items,
      }),
      rules: { ...defaultRules, maxLevel: level, items },
      content,
      balance: content.balance,
    });

  it('est toujours acceptée par le salon, quel que soit le plafond de niveau', () => {
    for (const level of [1, 2, 5, 9, 10, 15, 19, 20, 25, 30]) {
      const result = check(level);
      expect(result.ok, `niveau ${String(level)}`).toBe(true);
    }
  });

  it('ne joint aucun objet quand ils sont interdits', () => {
    const request = teamRequestFor(content, profile, heroes, { ...defaultRules, items: false });
    expect(request.heroes.every((entry) => entry.items.length === 0)).toBe(true);
    expect(check(30, false).ok).toBe(true);
  });

  it('garde les talents dans l’ordre d’achat tant que le moteur les accepte', () => {
    const talents = profile.heroes.pyra!.talents;
    expect(talents.length).toBeGreaterThan(3);
    const kept = trimTalents(content, 'pyra', 3, talents);
    expect(kept.length).toBeLessThan(talents.length);
    expect(kept).toEqual(talents.slice(0, kept.length));
    expect(validateBuild(content, { hero: 'pyra', level: 3, talents: kept, items: [] })).toEqual(
      [],
    );
    expect(trimTalents(content, 'pyra', 30, talents)).toEqual(talents);
  });

  it('plafonne le niveau et additionne les paliers', () => {
    expect(cappedLevel(content, profile, 'pyra', { ...defaultRules, maxLevel: 7 })).toBe(7);
    expect(cappedLevel(content, profile, 'pyra', defaultRules)).toBe(
      Math.min(profile.heroes.pyra!.level, content.balance.progression.maxLevel),
    );
    expect(tierOf(content, heroes)).toBe(
      heroes.reduce((sum, id) => sum + content.heroById.get(id)!.tier, 0),
    );
  });
});

describe('codes de salon', () => {
  it('accepte six caractères sans 0, O, 1, I, quelle que soit la casse', () => {
    expect(normalizeCode('abc234')).toBe('ABC234');
    expect(normalizeCode(' ABC234 ')).toBe('ABC234');
    expect(normalizeCode('ABC23')).toBeNull();
    expect(normalizeCode('ABC2345')).toBeNull();
    expect(normalizeCode('ABO234')).toBeNull();
    expect(normalizeCode('AB1234')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
});
