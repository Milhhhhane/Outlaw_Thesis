import { describe, expect, it } from 'vitest';
import type { RoomNamespace } from '../src/index';
import { newRoomCode } from '../src/index';
import { ORIGIN, server } from './helpers';

/** Un espace de noms de salons factice : il note les requêtes et répond ce qu'on lui dit de répondre. */
function fakeRooms(answer: (request: Request) => number | Promise<number> = () => 201) {
  const seen: Request[] = [];
  const namespace: RoomNamespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: async (request) => {
        seen.push(request);
        return new Response(null, { status: await answer(request) });
      },
    }),
  };
  return { namespace, seen };
}

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

async function signedIn(rooms?: RoomNamespace) {
  const s = server(rooms);
  const registered = await s.register('Alice');
  return { s, cookie: registered.cookie! };
}

describe('POST /api/pvp/rooms', () => {
  it('crée un salon et renvoie son code', async () => {
    const { namespace, seen } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    const response = await s.call('POST', '/api/pvp/rooms', { cookie });
    expect(response.status).toBe(201);
    expect(response.json?.code).toMatch(CODE);
    expect(seen).toHaveLength(1);
    const request = seen[0]!;
    expect(new URL(request.url).pathname).toBe('/init');
    expect(new URL(request.url).searchParams.get('code')).toBe(response.json?.code);
    expect(request.headers.get('X-Outlaw-Pseudo')).toBe('Alice');
    expect(Number(request.headers.get('X-Outlaw-Account'))).toBeGreaterThan(0);
  });

  it('exige un compte, et refuse une autre origine', async () => {
    const { namespace } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    expect((await s.call('POST', '/api/pvp/rooms')).status).toBe(401);
    const foreign = await s.call('POST', '/api/pvp/rooms', {
      cookie,
      origin: 'https://autre.example',
    });
    expect(foreign.status).toBe(403);
    expect(foreign.json?.error).toBe('bad_origin');
  });

  it("répond « indisponible » quand le service n'est pas branché", async () => {
    const { s, cookie } = await signedIn();
    const response = await s.call('POST', '/api/pvp/rooms', { cookie });
    expect(response.status).toBe(503);
    expect(response.json?.error).toBe('unavailable');
  });

  it('tire un autre code quand celui-ci existe déjà', async () => {
    let calls = 0;
    const { namespace, seen } = fakeRooms(() => (++calls < 3 ? 409 : 201));
    const { s, cookie } = await signedIn(namespace);
    const response = await s.call('POST', '/api/pvp/rooms', { cookie });
    expect(response.status).toBe(201);
    expect(seen).toHaveLength(3);
    const codes = seen.map((request) => new URL(request.url).searchParams.get('code'));
    expect(new Set(codes).size).toBe(3);
    expect(response.json?.code).toBe(codes[2]);
  });

  it('abandonne après plusieurs collisions ou une erreur du salon', async () => {
    const { namespace, seen } = fakeRooms(() => 500);
    const { s, cookie } = await signedIn(namespace);
    const response = await s.call('POST', '/api/pvp/rooms', { cookie });
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(1);
  });

  it('limite le nombre de salons créés par heure et par compte', async () => {
    const { namespace } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    for (let i = 0; i < 20; i++) {
      expect((await s.call('POST', '/api/pvp/rooms', { cookie })).status).toBe(201);
    }
    const blocked = await s.call('POST', '/api/pvp/rooms', { cookie });
    expect(blocked.status).toBe(429);
    expect(blocked.json?.error).toBe('too_many');
    s.advance(61 * 60 * 1000);
    expect((await s.call('POST', '/api/pvp/rooms', { cookie })).status).toBe(201);
  });
});

describe('GET /api/pvp/rooms/:code/ws', () => {
  const upgrade = { Upgrade: 'websocket' };

  async function connect(
    s: ReturnType<typeof server>,
    cookie: string | null,
    options: { origin?: string | null; upgrade?: boolean; code?: string } = {},
  ) {
    const headers: Record<string, string> = {};
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
    if (options.upgrade !== false) Object.assign(headers, upgrade);
    if (cookie !== null) headers.Cookie = cookie;
    return s.fetchRaw(`/api/pvp/rooms/${options.code ?? 'ABC234'}/ws`, headers);
  }

  it('exige un compte', async () => {
    const { namespace } = fakeRooms();
    const { s } = await signedIn(namespace);
    expect((await connect(s, null)).status).toBe(401);
  });

  it('refuse une origine étrangère ou absente (détournement de WebSocket)', async () => {
    const { namespace, seen } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    expect((await connect(s, cookie, { origin: 'https://autre.example' })).status).toBe(403);
    expect((await connect(s, cookie, { origin: null })).status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("refuse une requête qui n'est pas une mise à niveau WebSocket", async () => {
    const { namespace, seen } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    expect((await connect(s, cookie, { upgrade: false })).status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it('ignore un code mal formé sans réveiller aucun salon', async () => {
    const { namespace, seen } = fakeRooms();
    const { s, cookie } = await signedIn(namespace);
    for (const code of ['abc234', 'ABC23', 'ABCDEFG', 'ABO234', 'AB1234']) {
      expect((await connect(s, cookie, { code })).status).toBe(404);
    }
    expect(seen).toHaveLength(0);
  });

  it("traduit les refus du salon et n'envoie au salon que l'identité vérifiée", async () => {
    const { namespace, seen } = fakeRooms(() => 404);
    const { s, cookie } = await signedIn(namespace);
    const missing = await connect(s, cookie);
    expect(missing.status).toBe(404);
    expect((await missing.json()) as unknown).toMatchObject({ error: 'room_not_found' });

    const full = fakeRooms(() => 409);
    const other = await signedIn(full.namespace);
    const refused = await connect(other.s, other.cookie);
    expect(refused.status).toBe(409);
    expect((await refused.json()) as unknown).toMatchObject({ error: 'room_full' });

    const request = seen[0]!;
    expect(new URL(request.url).pathname).toBe('/ws');
    expect(request.headers.get('X-Outlaw-Pseudo')).toBe('Alice');
    // Le jeton de session ne quitte pas le Worker.
    expect(request.headers.get('Cookie')).toBeNull();
  });

  it('remplace une identité annoncée par le client par celle de la session', async () => {
    const { namespace, seen } = fakeRooms(() => 404);
    const { s, cookie } = await signedIn(namespace);
    await s.fetchRaw('/api/pvp/rooms/ABC234/ws', {
      ...upgrade,
      Origin: ORIGIN,
      Cookie: cookie,
      'X-Outlaw-Account': '999',
      'X-Outlaw-Pseudo': 'Root',
    });
    const request = seen[0]!;
    expect(request.headers.get('X-Outlaw-Account')).not.toBe('999');
    expect(request.headers.get('X-Outlaw-Pseudo')).toBe('Alice');
  });

  it('limite les connexions par minute et par compte', async () => {
    const { namespace } = fakeRooms(() => 404);
    const { s, cookie } = await signedIn(namespace);
    for (let i = 0; i < 30; i++) expect((await connect(s, cookie)).status).toBe(404);
    expect((await connect(s, cookie)).status).toBe(429);
  });
});

describe('codes de salon', () => {
  it('sont toujours du bon alphabet et rarement identiques', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = newRoomCode();
      expect(code).toMatch(CODE);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(495);
  });
});
