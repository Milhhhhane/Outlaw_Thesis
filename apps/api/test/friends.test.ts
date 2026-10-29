import { FRIEND_REQUESTS_PENDING_MAX, FRIENDS_MAX } from '@outlaw/accounts';
import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import { server } from './helpers';

/** Amis : demandes par pseudo, acceptation, retrait, plafonds, limite de débit, confidentialité. */

const content = loadContent();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const SENSITIVE = ['pw_hash', 'pseudo_key', 'token', 'token_hash', 'scrypt', 'expires_at'];

type Json = Record<string, unknown>;
type Api = ReturnType<typeof server>;

let ipCounter = 0;
/** Un compte avec sa propre adresse IP (cinq inscriptions par heure et par adresse). */
async function account(api: Api, pseudo: string) {
  ipCounter += 1;
  const res = await api.register(pseudo, undefined, `198.51.100.${String(ipCounter % 250)}`);
  expect(res.status).toBe(201);
  const id = (
    api.db.raw.prepare('SELECT id FROM users WHERE pseudo = ?').get(pseudo) as { id: number }
  ).id;
  return { cookie: res.cookie, id, pseudo };
}

/** Des comptes écrits directement en base (l'inscription hache un mot de passe : trop lent ici). */
function rawUsers(api: Api, prefix: string, count: number): number[] {
  const insert = api.db.raw.prepare(
    'INSERT INTO users (pseudo, pseudo_key, pw_hash, created_at) VALUES (?, ?, ?, ?)',
  );
  return Array.from({ length: count }, (_, i) => {
    const pseudo = `${prefix}${String(i)}`;
    return Number(insert.run(pseudo, pseudo.toLowerCase(), 'x', api.now()).lastInsertRowid);
  });
}

/** Des liens écrits directement en base : `status` entre `me` et chacun des `others`. */
function rawLinks(api: Api, me: number, others: number[], status: 'pending' | 'accepted') {
  const insert = api.db.raw.prepare(
    `INSERT INTO friendships (user_a, user_b, requested_by, status, created_at, accepted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const other of others) {
    insert.run(
      Math.min(me, other),
      Math.max(me, other),
      me,
      status,
      api.now(),
      status === 'accepted' ? api.now() : null,
    );
  }
}

async function list(api: Api, cookie: string | null) {
  const res = await api.call('GET', '/api/friends', { cookie });
  expect(res.status).toBe(200);
  return res.json as { friends: Json[]; received: Json[]; sent: Json[] };
}

const ask = (api: Api, cookie: string | null, pseudo: string) =>
  api.call('POST', '/api/friends/requests', { cookie, body: { pseudo } });

/** Une partie avancée : équipe niveau 3 à 12, un donjon terminé. */
function advanced() {
  const base = newProfile(content, 7, 1_000);
  const [first, second] = base.team;
  const heroes = { ...base.heroes };
  if (first !== undefined && second !== undefined) {
    heroes[first] = { ...heroes[first]!, level: 12 };
    heroes[second] = { ...heroes[second]!, level: 3 };
  }
  const dungeon = content.dungeons[0]?.id ?? 'x';
  const profile = {
    ...base,
    gold: 345,
    heroes,
    dungeons: { [dungeon]: { clears: 2, dry: 0, tier: 2 } },
  };
  return { version: profile.version, profile };
}

describe('accès', () => {
  it('exige une session (401) sur chaque route', async () => {
    const api = server();
    for (const [method, path] of [
      ['GET', '/api/friends'],
      ['GET', '/api/friends/pending'],
      ['POST', '/api/friends/requests'],
      ['POST', '/api/friends/2/accept'],
      ['POST', '/api/friends/2/decline'],
      ['DELETE', '/api/friends/2'],
    ] as const) {
      const res = await api.call(method, path, { body: method === 'GET' ? undefined : {} });
      expect(res.status).toBe(401);
      expect(res.json?.error).toBe('unauthenticated');
    }
  });

  it('refuse une modification venue d’une autre origine et respecte le changement de mot de passe exigé', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    await account(api, 'Bruno');
    const foreign = await api.call('POST', '/api/friends/requests', {
      cookie: alice.cookie,
      origin: 'https://ailleurs.example',
      body: { pseudo: 'Bruno' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.json?.error).toBe('bad_origin');
    api.db.raw.prepare('UPDATE users SET must_change = 1 WHERE id = ?').run(alice.id);
    for (const res of [
      await api.call('GET', '/api/friends', { cookie: alice.cookie }),
      await ask(api, alice.cookie, 'Bruno'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.json?.error).toBe('must_change_password');
    }
  });

  it('refuse un corps mal formé et les routes inconnues', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bad = await api.call('POST', '/api/friends/requests', {
      cookie: alice.cookie,
      body: { pseudo: 'Bruno', extra: 1 },
    });
    expect(bad.status).toBe(400);
    for (const [method, path] of [
      ['GET', '/api/friends/2'],
      ['POST', '/api/friends/2'],
      ['DELETE', '/api/friends/2/accept'],
      ['POST', '/api/friends/abc/accept'],
      ['PUT', '/api/friends'],
    ] as const) {
      const res = await api.call(method, path, { cookie: alice.cookie });
      expect(res.status).toBe(404);
    }
  });
});

describe('demande et acceptation', () => {
  it('demande, puis acceptation : chacun voit l’autre dans sa liste', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    api.advance(1_000);
    // Le pseudo est comparé sans distinction de casse, espaces autour ignorés.
    const sent = await ask(api, alice.cookie, ' bRUNO ');
    expect(sent.status).toBe(201);
    expect(sent.headers.get('Cache-Control')).toBe('no-store');
    const requestedAt = api.now();
    expect(sent.json?.outcome).toBe('sent');
    expect(sent.json?.list).toEqual({
      friends: [],
      received: [],
      sent: [{ pseudo: 'Bruno', at: requestedAt }],
    });
    expect(await list(api, bruno.cookie)).toEqual({
      friends: [],
      received: [{ pseudo: 'Alice', at: requestedAt }],
      sent: [],
    });
    expect((await api.call('GET', '/api/friends/pending', { cookie: bruno.cookie })).json).toEqual({
      received: 1,
    });
    expect((await api.call('GET', '/api/friends/pending', { cookie: alice.cookie })).json).toEqual({
      received: 0,
    });

    // L'auteur de la demande ne peut pas l'accepter lui-même.
    const self = await api.call('POST', `/api/friends/${bruno.pseudo}/accept`, {
      cookie: alice.cookie,
    });
    expect(self.status).toBe(404);

    api.advance(HOUR);
    const accepted = await api.call('POST', `/api/friends/${alice.pseudo}/accept`, {
      cookie: bruno.cookie,
    });
    expect(accepted.status).toBe(200);
    const day = Math.floor(api.now() / DAY) * DAY;
    expect(accepted.json).toEqual({
      friends: [{ pseudo: 'Alice', since: api.now(), lastActiveDay: day, progress: null }],
      received: [],
      sent: [],
    });
    const fromAlice = await list(api, alice.cookie);
    expect(fromAlice.friends.map((f) => f.pseudo)).toEqual(['Bruno']);
    expect(fromAlice.sent).toEqual([]);
    expect((await api.call('GET', '/api/friends/pending', { cookie: bruno.cookie })).json).toEqual({
      received: 0,
    });
    // Accepter une seconde fois : déjà amis.
    const again = await api.call('POST', `/api/friends/${alice.pseudo}/accept`, {
      cookie: bruno.cookie,
    });
    expect(again.status).toBe(409);
    expect(again.json?.error).toBe('already_friends');
  });

  it('une demande croisée devient une amitié directe', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    expect((await ask(api, alice.cookie, 'Bruno')).status).toBe(201);
    const crossed = await ask(api, bruno.cookie, 'alice');
    expect(crossed.status).toBe(200);
    expect(crossed.json?.outcome).toBe('accepted');
    const fromBruno = (crossed.json?.list as { friends: Json[] }).friends;
    expect(fromBruno.map((f) => f.pseudo)).toEqual(['Alice']);
    expect((await list(api, alice.cookie)).friends.map((f) => f.pseudo)).toEqual(['Bruno']);
    const rows = api.db.raw.prepare('SELECT status FROM friendships').all();
    expect(rows).toEqual([{ status: 'accepted' }]);
  });

  it('refuse soi-même, un pseudo inconnu, déjà amis, déjà demandé', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    const carla = await account(api, 'Carla');
    const expectError = async (pseudo: string, status: number, error: string, who = alice) => {
      const res = await ask(api, who.cookie, pseudo);
      expect(res.status).toBe(status);
      expect(res.json).toEqual({ error });
    };
    await expectError('ALICE', 400, 'friend_self');
    await expectError('Personne', 404, 'friend_unknown');
    await expectError('x'.repeat(200), 404, 'friend_unknown');
    expect((await ask(api, alice.cookie, 'Bruno')).status).toBe(201);
    await expectError('bruno', 409, 'already_requested');
    expect((await ask(api, alice.cookie, 'Carla')).status).toBe(201);
    await api.call('POST', `/api/friends/${alice.pseudo}/accept`, { cookie: carla.cookie });
    await expectError('Carla', 409, 'already_friends');
    await expectError('Alice', 409, 'already_friends', carla);
    expect(bruno.id).toBeGreaterThan(0);
  });

  it('refuser une demande la fait disparaître des deux côtés ; on peut redemander ensuite', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    await ask(api, alice.cookie, 'Bruno');
    // L'auteur ne peut pas « refuser » sa propre demande (il l'annule par DELETE).
    const wrong = await api.call('POST', `/api/friends/${bruno.pseudo}/decline`, {
      cookie: alice.cookie,
    });
    expect(wrong.status).toBe(404);
    const declined = await api.call('POST', `/api/friends/${alice.pseudo}/decline`, {
      cookie: bruno.cookie,
    });
    expect(declined.status).toBe(200);
    expect(declined.json).toEqual({ friends: [], received: [], sent: [] });
    expect(await list(api, alice.cookie)).toEqual({ friends: [], received: [], sent: [] });
    expect((await ask(api, alice.cookie, 'Bruno')).status).toBe(201);
  });

  it('retire un ami ou annule une demande envoyée', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    const carla = await account(api, 'Carla');
    await ask(api, alice.cookie, 'Bruno');
    await ask(api, carla.cookie, 'Alice');
    await api.call('POST', `/api/friends/${carla.pseudo}/accept`, { cookie: alice.cookie });
    const cancelled = await api.call('DELETE', `/api/friends/${bruno.pseudo}`, {
      cookie: alice.cookie,
    });
    expect(cancelled.status).toBe(200);
    expect((cancelled.json as { sent: Json[] }).sent).toEqual([]);
    expect((await list(api, bruno.cookie)).received).toEqual([]);
    // L'un ou l'autre peut retirer l'amitié.
    const removed = await api.call('DELETE', `/api/friends/${alice.pseudo}`, {
      cookie: carla.cookie,
    });
    expect(removed.status).toBe(200);
    expect(await list(api, alice.cookie)).toEqual({ friends: [], received: [], sent: [] });
    const twice = await api.call('DELETE', `/api/friends/${alice.pseudo}`, {
      cookie: carla.cookie,
    });
    expect(twice.status).toBe(404);
    expect(twice.json).toEqual({ error: 'not_found' });
  });

  it('un tiers ne peut ni accepter, ni refuser, ni retirer', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    const carla = await account(api, 'Carla');
    const intruder = await account(api, 'Intrus');
    await ask(api, alice.cookie, 'Bruno');
    await ask(api, alice.cookie, 'Carla');
    await api.call('POST', `/api/friends/${alice.pseudo}/accept`, { cookie: carla.cookie });
    for (const [method, path] of [
      ['POST', `/api/friends/${alice.pseudo}/accept`],
      ['POST', `/api/friends/${bruno.pseudo}/accept`],
      ['POST', `/api/friends/${alice.pseudo}/decline`],
      ['DELETE', `/api/friends/${alice.pseudo}`],
      ['DELETE', `/api/friends/${bruno.pseudo}`],
      ['DELETE', `/api/friends/${carla.pseudo}`],
      ['DELETE', `/api/friends/${intruder.pseudo}`],
    ] as const) {
      const res = await api.call(method, path, { cookie: intruder.cookie });
      expect(res.status).toBe(404);
    }
    expect((await list(api, alice.cookie)).friends.map((f) => f.pseudo)).toEqual(['Carla']);
    expect((await list(api, bruno.cookie)).received.map((r) => r.pseudo)).toEqual(['Alice']);
    expect(await list(api, intruder.cookie)).toEqual({ friends: [], received: [], sent: [] });
  });
});

describe('plafonds et limite de débit', () => {
  it(`plafonne à ${String(FRIENDS_MAX)} amis ; le plafond de l’autre n’est dit qu’à l’acceptation`, async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    const carla = await account(api, 'Carla');
    const dan = await account(api, 'Dan');
    // Carla demande Alice, et Alice demande Dan, tant qu'Alice a de la place.
    await ask(api, carla.cookie, 'Alice');
    await ask(api, alice.cookie, 'Dan');
    const extras = rawUsers(api, 'ami', FRIENDS_MAX);
    rawLinks(api, alice.id, extras, 'accepted');
    expect((await list(api, alice.cookie)).friends).toHaveLength(FRIENDS_MAX);
    const full = await ask(api, alice.cookie, 'Bruno');
    expect(full.status).toBe(409);
    expect(full.json?.error).toBe('friends_full');
    // Un inconnu qui demande Alice reçoit la réponse d'une demande ordinaire : rien ne dit
    // qu'elle a déjà cent amis.
    const stranger = await ask(api, bruno.cookie, 'Alice');
    expect(stranger.status).toBe(201);
    expect(stranger.json?.outcome).toBe('sent');
    const late = await api.call('POST', `/api/friends/${carla.pseudo}/accept`, {
      cookie: alice.cookie,
    });
    expect(late.status).toBe(409);
    expect(late.json?.error).toBe('friends_full');
    // Dan, à qui Alice a demandé, l'apprend en acceptant.
    const other = await api.call('POST', `/api/friends/${alice.pseudo}/accept`, {
      cookie: dan.cookie,
    });
    expect(other.status).toBe(409);
    expect(other.json?.error).toBe('friend_full');
    // Une place se libère : l'acceptation passe.
    api.db.raw
      .prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?')
      .run(alice.id, extras[0] ?? 0);
    const accepted = await api.call('POST', `/api/friends/${carla.pseudo}/accept`, {
      cookie: alice.cookie,
    });
    expect(accepted.status).toBe(200);
    expect((accepted.json as { friends: Json[] }).friends).toHaveLength(FRIENDS_MAX);
  });

  it(`plafonne à ${String(FRIEND_REQUESTS_PENDING_MAX)} demandes envoyées en attente`, async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    await account(api, 'Bruno');
    rawLinks(api, alice.id, rawUsers(api, 'cible', FRIEND_REQUESTS_PENDING_MAX), 'pending');
    expect((await list(api, alice.cookie)).sent).toHaveLength(FRIEND_REQUESTS_PENDING_MAX);
    const res = await ask(api, alice.cookie, 'Bruno');
    expect(res.status).toBe(409);
    expect(res.json?.error).toBe('requests_full');
    // Une demande annulée libère une place.
    const first = (await list(api, alice.cookie)).sent[0]?.pseudo as string;
    await api.call('DELETE', `/api/friends/${first}`, { cookie: alice.cookie });
    expect((await ask(api, alice.cookie, 'Bruno')).status).toBe(201);
  });

  it('compte atomiquement 50 demandes simultanées : 20 traitées, 30 refusées', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const statuses = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        ask(api, alice.cookie, `Sonde${String(i)}`).then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 404)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(30);
    expect((await ask(api, alice.cookie, 'Encore')).status).toBe(429);
  });

  it('limite à 20 demandes par heure et par compte, réussies ou non', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    await account(api, 'Bruno');
    for (let i = 0; i < 20; i++) {
      expect((await ask(api, alice.cookie, `Inconnu${String(i)}`)).json?.error).toBe(
        'friend_unknown',
      );
    }
    // Au-delà, même un pseudo existant ne dit plus rien : on ne sonde pas les pseudos.
    const blocked = await ask(api, alice.cookie, 'Bruno');
    expect(blocked.status).toBe(429);
    expect(blocked.json?.error).toBe('too_many');
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    expect((await ask(api, alice.cookie, 'Personne')).status).toBe(429);
    // La limite est par compte : un autre compte peut demander.
    const carla = await account(api, 'Carla');
    expect((await ask(api, carla.cookie, 'Bruno')).status).toBe(201);
    api.advance(HOUR + 1);
    expect((await ask(api, alice.cookie, 'Bruno')).status).toBe(201);
  });
});

describe('ce qu’un ami voit', () => {
  it('aucun champ sensible ; activité arrondie au jour ; résumé court, null sans sauvegarde', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno_Fort');
    const carla = await account(api, 'Carla');
    await ask(api, bruno.cookie, 'Alice');
    await ask(api, carla.cookie, 'Alice');
    await api.call('POST', `/api/friends/${bruno.pseudo}/accept`, { cookie: alice.cookie });
    await api.call('POST', `/api/friends/${carla.pseudo}/accept`, { cookie: alice.cookie });
    await account(api, 'Daniel').then((daniel) => ask(api, daniel.cookie, 'Alice'));
    await ask(api, alice.cookie, 'Bruno_Fort').then((res) => {
      expect(res.json?.error).toBe('already_friends');
    });

    // Bruno joue : sauvegarde à 13 h 37, puis connexion le surlendemain à 21 h 05 (UTC).
    api.advance(13 * HOUR + 37 * 60_000);
    await api.call('PUT', '/api/save', {
      cookie: bruno.cookie,
      body: { baseRev: 0, save: advanced() },
    });
    api.advance(2 * DAY + 7 * HOUR + 28 * 60_000);
    await api.login('Bruno_Fort', undefined, '203.0.113.99');
    const loginAt = api.now();
    expect(loginAt % DAY).not.toBe(0);

    const res = await api.call('GET', '/api/friends', { cookie: alice.cookie });
    const body = res.json as { friends: Json[]; received: Json[]; sent: Json[] };
    // Bruno, actif aujourd'hui, avant Carla, active il y a 2 jours.
    expect(body.friends.map((f) => f.pseudo)).toEqual(['Bruno_Fort', 'Carla']);
    const [brunoSeen, carlaSeen] = body.friends;
    expect(brunoSeen?.lastActiveDay).toBe(Math.floor(loginAt / DAY) * DAY);
    expect(carlaSeen?.lastActiveDay).toBe(Date.UTC(2026, 9, 27));
    for (const friend of body.friends) {
      expect(Object.keys(friend).sort()).toEqual(
        ['lastActiveDay', 'progress', 'pseudo', 'since'].sort(),
      );
      expect((friend.lastActiveDay as number) % DAY).toBe(0);
    }
    for (const request of [...body.received, ...body.sent]) {
      expect(Object.keys(request).sort()).toEqual(['at', 'pseudo']);
    }
    expect(body.received.map((r) => r.pseudo)).toEqual(['Daniel']);

    const profile = advanced().profile;
    const team = profile.team.map((id) => profile.heroes[id]?.level ?? 0);
    expect(brunoSeen?.progress).toEqual({
      team: { min: Math.min(...team), max: Math.max(...team) },
      dungeons: { cleared: 1, total: content.dungeons.length },
    });
    expect(carlaSeen?.progress).toBeNull();

    // Ni hash, ni jeton, ni clé de pseudo, ni heure exacte.
    const text = JSON.stringify(body);
    for (const word of SENSITIVE) expect(text).not.toContain(word);
    expect(text).not.toContain('"bruno_fort"');
    expect(text).not.toContain(String(loginAt));
    const rows = api.db.raw.prepare('SELECT pw_hash FROM users').all() as { pw_hash: string }[];
    for (const { pw_hash } of rows) expect(text).not.toContain(pw_hash);
    const tokens = api.db.raw.prepare('SELECT token_hash FROM sessions').all() as {
      token_hash: string;
    }[];
    for (const { token_hash } of tokens) expect(text).not.toContain(token_hash);
    expect(text).not.toContain((alice.cookie ?? '').split('=')[1] ?? 'absent');

    // Sauvegarde illisible : résumé inconnu, pas une erreur.
    api.db.raw.prepare('UPDATE saves SET data = ? WHERE user_id = ?').run('{"x":1}', bruno.id);
    const broken = await list(api, alice.cookie);
    expect(broken.friends.find((f) => f.pseudo === 'Bruno_Fort')?.progress).toBeNull();
  });
});

describe('suppression de compte', () => {
  it('efface ses amitiés et ses demandes, et un compte qui reprendrait son identifiant n’en hérite pas', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const carla = await account(api, 'Carla');
    const bruno = await account(api, 'Bruno');
    await ask(api, bruno.cookie, 'Alice');
    await api.call('POST', `/api/friends/${bruno.pseudo}/accept`, { cookie: alice.cookie });
    await ask(api, bruno.cookie, 'Carla');
    await ask(api, bruno.cookie, 'Personne');
    expect((await list(api, carla.cookie)).received).toHaveLength(1);

    const deleted = await api.call('DELETE', '/api/account', {
      cookie: bruno.cookie,
      body: { password: 'cheval agrafe batterie' },
    });
    expect(deleted.status).toBe(204);
    expect(await list(api, alice.cookie)).toEqual({ friends: [], received: [], sent: [] });
    expect(await list(api, carla.cookie)).toEqual({ friends: [], received: [], sent: [] });
    expect(
      api.db.raw
        .prepare('SELECT COUNT(*) AS n FROM friendships WHERE user_a = ? OR user_b = ?')
        .get(bruno.id, bruno.id),
    ).toEqual({ n: 0 });
    expect(
      api.db.raw
        .prepare("SELECT COUNT(*) AS n FROM throttle WHERE key LIKE 'friend-request:%'")
        .get(),
    ).toEqual({ n: 0 });

    const next = await account(api, 'Nouveau');
    expect(next.id).toBe(bruno.id);
    expect(await list(api, next.cookie)).toEqual({ friends: [], received: [], sent: [] });
  });
});

describe('cohérence', () => {
  it('une demande vers un compte supprimé entre la lecture et l’écriture ne laisse aucune ligne', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    // Bruno disparaît juste avant l'écriture de la demande (suppression simultanée).
    const prepare = api.db.prepare.bind(api.db);
    api.db.prepare = (sql: string) => {
      if (sql.includes('INSERT OR IGNORE INTO friendships')) {
        api.db.raw.prepare('DELETE FROM users WHERE id = ?').run(bruno.id);
      }
      return prepare(sql);
    };
    const res = await ask(api, alice.cookie, 'Bruno');
    expect(res.status).toBe(404);
    expect(res.json?.error).toBe('friend_unknown');
    expect(api.db.raw.prepare('SELECT COUNT(*) AS n FROM friendships').get()).toEqual({ n: 0 });
  });

  it('les routes désignent l’autre par son pseudo, sans distinction de casse', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    await ask(api, alice.cookie, 'Bruno');
    const res = await api.call('POST', '/api/friends/aLiCe/accept', { cookie: bruno.cookie });
    expect(res.status).toBe(200);
    const unknown = await api.call('DELETE', '/api/friends/Personne', { cookie: bruno.cookie });
    expect(unknown.status).toBe(404);
    expect(unknown.json).toEqual({ error: 'not_found' });
    expect(JSON.stringify(res.json)).not.toMatch(/"id"/);
  });
});

describe('export des données', () => {
  it('contient les amitiés, les demandes envoyées et reçues, et les compteurs du compte', async () => {
    const api = server();
    const alice = await account(api, 'Alice');
    const bruno = await account(api, 'Bruno');
    const carla = await account(api, 'Carla');
    await account(api, 'Dan');
    const start = api.now();
    await ask(api, bruno.cookie, 'Alice');
    api.advance(1_000);
    await api.call('POST', `/api/friends/${bruno.pseudo}/accept`, { cookie: alice.cookie });
    api.advance(1_000);
    await ask(api, alice.cookie, 'Dan');
    await ask(api, alice.cookie, 'Personne');
    await ask(api, carla.cookie, 'Alice');
    const res = await api.call('GET', '/api/account/export', { cookie: alice.cookie });
    expect(res.status).toBe(200);
    const iso = (ms: number) => new Date(ms).toISOString();
    expect(res.json?.friends).toEqual([
      {
        pseudo: 'Bruno',
        status: 'accepted',
        direction: 'received',
        requestedAt: iso(start),
        acceptedAt: iso(start + 1_000),
      },
      {
        pseudo: 'Carla',
        status: 'pending',
        direction: 'received',
        requestedAt: iso(start + 2_000),
        acceptedAt: null,
      },
      {
        pseudo: 'Dan',
        status: 'pending',
        direction: 'sent',
        requestedAt: iso(start + 2_000),
        acceptedAt: null,
      },
    ]);
    expect(res.json?.counters).toEqual({
      friendRequests: { count: 2, windowStart: iso(start + 2_000), blockedUntil: null },
    });
    const text = JSON.stringify(res.json);
    for (const word of ['pw_hash', 'pseudo_key', 'token_hash']) expect(text).not.toContain(word);
  });
});
