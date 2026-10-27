import { loadContent, type Profile } from '@outlaw/data';
import { defaultAction, sandboxProfile, talentPoints } from '@outlaw/engine';
import {
  contentHash,
  deserializeRoom,
  parseServerMessage,
  playerOf,
  PROTOCOL_VERSION,
  restoreBattle,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from '@outlaw/net';
import { describe, expect, it } from 'vitest';
import {
  CLOSE,
  IDLE_MS,
  RoomService,
  type Account,
  type Host,
  type Peer,
  type Stored,
} from '../src/pvp-room';

const content = loadContent();
const balance = content.balance;
const rich: Profile = sandboxProfile(content);

const ALICE: Account = { id: 1, pseudo: 'Alice' };
const BOB: Account = { id: 2, pseudo: 'Bob' };
const CAROL: Account = { id: 3, pseudo: 'Carol' };

class FakePeer implements Peer {
  readonly received: ServerMessage[] = [];
  closedWith: { code: number; reason: string } | null = null;
  open = true;
  send(text: string): void {
    const parsed = parseServerMessage(text);
    if (!parsed.ok) throw new Error(`message serveur illisible : ${text}`);
    this.received.push(parsed.msg);
  }
  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.open = false;
  }
  of<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter(
      (msg): msg is Extract<ServerMessage, { type: T }> => msg.type === type,
    );
  }
}

class FakeHost implements Host {
  time = 1_000_000;
  flip: 'player' | 'enemy' = 'player';
  stored: Stored | null = null;
  alarmAt: number | null = null;
  destroyed = false;
  profileReads = 0;
  readonly profiles = new Map<number, Profile | null>([
    [ALICE.id, rich],
    [BOB.id, rich],
  ]);
  readonly sockets: Record<PlayerId, FakePeer[]> = { p1: [], p2: [] };

  now = () => this.time;
  coin = () => this.flip;
  load = () => Promise.resolve(this.stored === null ? null : structuredClone(this.stored));
  save = (stored: Stored) => {
    this.stored = structuredClone(stored);
    return Promise.resolve();
  };
  destroy = () => {
    this.stored = null;
    this.alarmAt = null;
    this.destroyed = true;
    return Promise.resolve();
  };
  setAlarm = (at: number | null) => {
    this.alarmAt = at;
    return Promise.resolve();
  };
  profile = (id: number) => {
    this.profileReads += 1;
    return Promise.resolve(this.profiles.get(id) ?? null);
  };
  peers = (player: PlayerId) => this.sockets[player].filter((peer) => peer.open);

  connect(player: PlayerId): FakePeer {
    const peer = new FakePeer();
    this.sockets[player].push(peer);
    return peer;
  }
}

const HELLO: ClientMessage = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  contentHash: contentHash(content),
};

/** Talents valides pour un héros au niveau 30 (premiers noeuds accessibles). */
function talents(hero: string): string[] {
  const def = content.heroById.get(hero)!;
  const nodes = def.pages.flatMap((page) => page.nodes);
  const taken: string[] = [];
  for (let guard = 0; guard < 60 && taken.length < talentPoints(30, balance); guard++) {
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

const team = (heroes: readonly string[], items: readonly number[]): ClientMessage => ({
  type: 'set_team',
  heroes: heroes.map((hero, slot) => ({
    hero,
    slot,
    talents: talents(hero),
    items: [items[slot]!],
  })),
});

const text = (msg: ClientMessage): string => JSON.stringify(msg);

/** Un salon ouvert par Alice, rejoint par Bob, les deux connectés et salués. */
async function lobby() {
  const host = new FakeHost();
  const service = new RoomService(host, content);
  expect(await service.init('ABC234', ALICE)).toBe(true);
  expect(await service.join(ALICE)).toEqual({ ok: true, player: 'p1' });
  const alice = host.connect('p1');
  await service.connected();
  expect(await service.join(BOB)).toEqual({ ok: true, player: 'p2' });
  const bob = host.connect('p2');
  await service.connected();
  await service.message('p1', text(HELLO));
  await service.message('p2', text(HELLO));
  return { host, service, alice, bob };
}

async function startBattle() {
  const table = await lobby();
  const { service } = table;
  await service.message('p1', text(team(['pyra', 'maree', 'ronce'], [1, 4, 7])));
  await service.message('p2', text(team(['cendre', 'ressac', 'seve'], [10, 13, 16])));
  await service.message('p1', text({ type: 'ready' }));
  await service.message('p2', text({ type: 'ready' }));
  return table;
}

function turn(host: FakeHost): { player: PlayerId; message: ClientMessage } {
  const room = deserializeRoom(host.stored!.room);
  const state = restoreBattle(room, balance);
  const active = state.units.find((unit) => unit.def.id === state.active)!;
  const action = defaultAction(state);
  return {
    player: playerOf(active.def.side),
    message: {
      type: 'action',
      spell: action.spell,
      ...(action.target === undefined ? {} : { target: action.target }),
    },
  };
}

describe('salons : création et places', () => {
  it("crée le salon une seule fois et programme l'alarme d'inactivité", async () => {
    const host = new FakeHost();
    const service = new RoomService(host, content);
    expect(await service.init('ABC234', ALICE)).toBe(true);
    expect(await service.init('ABC234', BOB)).toBe(false);
    expect(host.stored?.accounts.p1).toEqual(ALICE);
    expect(host.alarmAt).toBe(host.time + IDLE_MS);
  });

  it("donne la place d'hôte au créateur, la seconde au premier venu, puis refuse", async () => {
    const host = new FakeHost();
    const service = new RoomService(host, content);
    await service.init('ABC234', ALICE);
    expect(await service.join(ALICE)).toEqual({ ok: true, player: 'p1' });
    expect(await service.join(BOB)).toEqual({ ok: true, player: 'p2' });
    expect(await service.join(CAROL)).toEqual({ ok: false, status: 409, error: 'room_full' });
    // Un joueur déjà assis retrouve sa place (reconnexion, autre onglet).
    expect(await service.join(BOB)).toEqual({ ok: true, player: 'p2' });
    expect(await service.join(ALICE)).toEqual({ ok: true, player: 'p1' });
  });

  it('répond « introuvable » pour un salon qui n’existe pas', async () => {
    const service = new RoomService(new FakeHost(), content);
    expect(await service.join(ALICE)).toEqual({ ok: false, status: 404, error: 'room_not_found' });
  });

  it("annonce à chacun son pseudo et celui de l'autre", async () => {
    const { alice, bob } = await lobby();
    expect(alice.of('names').at(-1)).toEqual({ type: 'names', you: 'Alice', opponent: 'Bob' });
    expect(bob.of('names').at(-1)).toEqual({ type: 'names', you: 'Bob', opponent: 'Alice' });
    // Alice a d'abord connu le salon seule.
    expect(alice.of('names')[0]).toEqual({ type: 'names', you: 'Alice', opponent: null });
  });
});

describe('salons : un combat complet', () => {
  it('démarre à deux équipes prêtes, avec la même révélation pour les deux', async () => {
    const { host, alice, bob } = await startBattle();
    const a = alice.of('battle_start')[0]!;
    const b = bob.of('battle_start')[0]!;
    expect(a.you).toBe('player');
    expect(b.you).toBe('enemy');
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.setup).toEqual(b.setup);
    expect(host.stored).not.toBeNull();
    expect(host.alarmAt).toBe(a.deadline);
  });

  it('joue le combat jusqu’au bout et ne renvoie aucune erreur', async () => {
    const { host, service, alice, bob } = await startBattle();
    for (let guard = 0; guard < 500 && alice.of('result').length === 0; guard++) {
      const { player, message } = turn(host);
      await service.message(player, text(message));
    }
    const final = alice.of('result')[0]!;
    expect(final).toBeDefined();
    expect(bob.of('result')[0]).toEqual(final);
    expect(alice.of('error')).toEqual([]);
    expect(bob.of('error')).toEqual([]);
    // Chaque coup a été annoncé aux deux joueurs, dans le même ordre.
    expect(alice.of('applied').map((msg) => msg.stateHash)).toEqual(
      bob.of('applied').map((msg) => msg.stateHash),
    );
  });

  it("refuse l'action de celui dont ce n'est pas le tour, sans rien changer", async () => {
    const { host, service, alice, bob } = await startBattle();
    const { player, message } = turn(host);
    const before = host.stored!.room;
    const other = player === 'p1' ? 'p2' : 'p1';
    await service.message(other, text(message));
    const peer = other === 'p1' ? alice : bob;
    expect(peer.of('error').at(-1)?.code).toBe('not_your_turn');
    expect(host.stored!.room).toBe(before);
  });

  it('survit à un redémarrage du serveur : tout vient du stockage', async () => {
    const { host, alice } = await startBattle();
    // Un autre RoomService sur le même stockage : le Durable Object s'est endormi puis réveillé.
    const reborn = new RoomService(host, content);
    const reads = host.profileReads;
    const { player, message } = turn(host);
    await reborn.message(player, text(message));
    expect(host.profileReads).toBeGreaterThan(reads);
    expect(alice.of('applied')).toHaveLength(1);
    expect(alice.of('error')).toEqual([]);
  });
});

describe('salons : chrono et déconnexions', () => {
  it("joue l'action par défaut quand l'alarme sonne après l'échéance", async () => {
    const { host, service, alice, bob } = await startBattle();
    const start = alice.of('battle_start')[0]!;
    host.time = (start.deadline ?? 0) + 1;
    await service.alarm();
    expect(alice.of('applied')[0]?.auto).toBe('timeout');
    expect(bob.of('applied')[0]?.auto).toBe('timeout');
  });

  it("n'efface rien avant l'échéance : l'alarme trop tôt ne fait rien", async () => {
    const { host, service, alice } = await startBattle();
    host.time += 1000;
    await service.alarm();
    expect(alice.of('applied')).toEqual([]);
  });

  it('ne signale la déconnexion que lorsque la dernière connexion du joueur se ferme', async () => {
    const { host, service, alice, bob } = await startBattle();
    // Alice ouvre un deuxième onglet : fermer le premier ne la déconnecte pas.
    const second = host.connect('p1');
    alice.open = false;
    await service.closed('p1');
    expect(bob.of('room').at(-1)?.room.opponent.connected).toBe(true);
    second.open = false;
    await service.closed('p1');
    expect(bob.of('room').at(-1)?.room.opponent.connected).toBe(false);
  });

  it('accorde la grâce puis déclare forfait au réveil', async () => {
    const { host, service, bob } = await startBattle();
    host.sockets.p1.forEach((peer) => (peer.open = false));
    await service.closed('p1');
    expect(host.alarmAt).not.toBeNull();
    host.time += 61_000;
    await service.alarm();
    const result = bob.of('result')[0];
    expect(result?.reason).toBe('disconnect');
  });

  it("referme le salon et ses connexions après l'inactivité", async () => {
    const { host, service, alice, bob } = await lobby();
    host.time += IDLE_MS + 1;
    await service.alarm();
    expect(host.destroyed).toBe(true);
    expect(alice.closedWith?.code).toBe(CLOSE.roomClosed);
    expect(bob.closedWith?.code).toBe(CLOSE.roomClosed);
  });

  it('repousse la fermeture à chaque message reçu', async () => {
    const { host, service, alice } = await lobby();
    host.time += IDLE_MS - 1000;
    await service.message('p1', text({ type: 'emote', id: 1 }));
    host.time += IDLE_MS - 1000;
    await service.alarm();
    expect(host.destroyed).toBe(false);
    expect(alice.closedWith).toBeNull();
  });
});

describe('salons : messages et profils', () => {
  it('répond une erreur à un message mal formé, sans toucher au salon', async () => {
    const { host, service, alice, bob } = await lobby();
    const before = host.stored!.room;
    await service.message('p1', 'pas du json');
    await service.message('p1', JSON.stringify({ type: 'ready', extra: true }));
    await service.message('p1', 'x'.repeat(5000));
    expect(alice.of('error').map((msg) => msg.code)).toEqual([
      'bad_json',
      'bad_schema',
      'too_large',
    ]);
    expect(bob.of('error')).toEqual([]);
    expect(host.stored!.room).toBe(before);
  });

  it('relit le profil quand le joueur annonce son équipe (partie jouée entre-temps)', async () => {
    const { host, service, alice } = await lobby();
    // Entre-temps, Alice n'a plus de sauvegarde en ligne.
    host.profiles.set(ALICE.id, null);
    await service.message('p1', text(team(['pyra', 'maree', 'ronce'], [1, 4, 7])));
    expect(alice.of('error').at(-1)?.code).toBe('no_profile');
    host.profiles.set(ALICE.id, rich);
    await service.message('p1', text(team(['pyra', 'maree', 'ronce'], [1, 4, 7])));
    expect(alice.of('error')).toHaveLength(1);
  });

  it("ne confond jamais les joueurs : l'identité vient de la connexion, pas du message", async () => {
    const { host, service, bob } = await lobby();
    const before = host.stored!.room;
    // Bob n'est pas l'hôte : ses règles sont refusées, quoi qu'il écrive.
    await service.message(
      'p2',
      JSON.stringify({ type: 'set_rules', rules: { maxLevel: 5 }, player: 'p1' }),
    );
    expect(bob.of('error').at(-1)?.code).toBeDefined();
    expect(host.stored!.room).toBe(before);
  });
});
