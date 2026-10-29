import { loadContent } from '@outlaw/data';
import { heroStars, newProfile, tierReached } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import { server } from './helpers';

/** Administration : réservée aux pseudos du secret `ADMIN_PSEUDOS`, invisible pour les autres. */

const content = loadContent();
const DAY = 86_400_000;
const SENSITIVE = ['pw_hash', 'pseudo_key', 'token', 'token_hash', 'scrypt'];

type Json = Record<string, unknown>;

/** Une partie avancée : or, objets, un donjon terminé deux fois (palier II ouvert), un succès. */
function advanced() {
  const base = newProfile(content, 7, 1_000);
  const [first, second] = base.team;
  const item = content.items[0]?.id ?? 'x';
  const dungeon = content.dungeons[0]?.id ?? 'x';
  const heroes = { ...base.heroes };
  if (first !== undefined && second !== undefined) {
    heroes[first] = { ...heroes[first]!, level: 12 };
    heroes[second] = { ...heroes[second]!, level: 3 };
  }
  const profile = {
    ...base,
    gold: 345,
    heroes,
    items: [
      { uid: 1, item, upgrade: 0, copies: 2 },
      { uid: 2, item, upgrade: 1, copies: 0 },
    ],
    nextUid: 3,
    dungeons: { [dungeon]: { clears: 2, dry: 0, tier: 2 } },
    quests: { ...base.quests, achievements: ['ach_first_win'] },
  };
  return { version: profile.version, profile };
}

/** Un serveur avec l'administrateur « Patron_Fictif » (casse différente dans le secret) et trois joueurs. */
async function populated() {
  const api = server(undefined, ' patron_fictif , Autre_Chef ');
  const admin = (await api.register('Patron_Fictif', undefined, '192.0.2.1')).cookie;
  api.advance(1_000);
  const bob = (await api.register('Bob_42', undefined, '192.0.2.2')).cookie;
  api.advance(1_000);
  await api.call('PUT', '/api/save', { cookie: bob, body: { baseRev: 0, save: advanced() } });
  api.advance(1_000);
  const carol = (await api.register('Carol', undefined, '192.0.2.3')).cookie;
  api.advance(1_000);
  await api.register('Dave', undefined, '192.0.2.4');
  // Sauvegarde abîmée (écrite à la main) : l'avancement est inconnu, pas une erreur.
  api.db.raw
    .prepare('INSERT INTO saves (user_id, rev, data, updated_at) VALUES (4, 1, \'{"x":1}\', ?)')
    .run(api.now());
  return { api, admin, bob, carol };
}

const ids = (list: Json | null) => (list?.accounts as Json[]).map((a) => a.pseudo as string);

describe('accès à l’administration', () => {
  it('exige une session (401)', async () => {
    const api = server(undefined, 'Patron_Fictif');
    for (const path of ['/api/admin/users', '/api/admin/users/1']) {
      const res = await api.call('GET', path);
      expect(res.status).toBe(401);
      expect(res.json?.error).toBe('unauthenticated');
    }
  });

  it('répond à un non-administrateur comme à une route inconnue (404)', async () => {
    const { api, carol } = await populated();
    const unknown = await api.call('GET', '/api/nulle-part', { cookie: carol });
    for (const path of ['/api/admin/users', '/api/admin/users/1', '/api/admin/users?limit=5']) {
      const res = await api.call('GET', path, { cookie: carol });
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: 'not_found' });
      expect(res.json).toEqual(unknown.json);
    }
    expect((await api.call('GET', '/api/me', { cookie: carol })).json).toEqual({
      pseudo: 'Carol',
      mustChangePassword: false,
      admin: false,
    });
  });

  it('sans secret, ou secret vide, personne n’est administrateur', async () => {
    for (const secret of [undefined, '', ' , ,']) {
      const api = server(undefined, secret);
      const { cookie, json } = await api.register('Patron_Fictif');
      expect(json?.admin).toBe(false);
      expect((await api.call('GET', '/api/me', { cookie })).json?.admin).toBe(false);
      expect((await api.call('GET', '/api/admin/users', { cookie })).status).toBe(404);
    }
  });

  it('reconnaît le pseudo administrateur sans distinction de casse', async () => {
    const api = server(undefined, 'PATRON_FICTIF');
    const created = await api.register('Patron_Fictif');
    expect(created.json).toEqual({
      pseudo: 'Patron_Fictif',
      mustChangePassword: false,
      admin: true,
    });
    const login = await api.login('patron_fictif');
    expect(login.json?.admin).toBe(true);
    expect((await api.call('GET', '/api/me', { cookie: login.cookie })).json?.admin).toBe(true);
    expect((await api.call('GET', '/api/admin/users', { cookie: login.cookie })).status).toBe(200);
  });

  it('n’accepte que la lecture', async () => {
    const { api, admin } = await populated();
    expect((await api.call('POST', '/api/admin/users', { cookie: admin, body: {} })).status).toBe(
      404,
    );
    expect((await api.call('DELETE', '/api/admin/users/2', { cookie: admin })).status).toBe(404);
  });
});

describe('liste des comptes', () => {
  it('donne chaque compte, sa dernière activité et son avancement, sans rien de sensible', async () => {
    const { api, admin } = await populated();
    const res = await api.call('GET', '/api/admin/users', { cookie: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = res.json;
    expect(body?.total).toEqual({ accounts: 4, active24h: 4, active7d: 4 });
    expect(body?.limit).toBe(20);
    expect(body?.offset).toBe(0);
    // La sauvegarde de Dave est la plus récente, puis son inscription… l'administrateur en dernier.
    expect(ids(body)).toEqual(['Dave', 'Carol', 'Bob_42', 'Patron_Fictif']);

    const text = JSON.stringify(body);
    for (const word of SENSITIVE) expect(text).not.toContain(word);
    const hashes = api.db.raw.prepare('SELECT pw_hash FROM users').all() as { pw_hash: string }[];
    for (const { pw_hash } of hashes) expect(text).not.toContain(pw_hash);

    const accounts = body?.accounts as Json[];
    for (const account of accounts) {
      expect(Object.keys(account).sort()).toEqual(
        [
          'activeSessions',
          'createdAt',
          'id',
          'lastActivityAt',
          'lastLoginAt',
          'lastSaveAt',
          'progress',
          'pseudo',
        ].sort(),
      );
    }
    const [dave, carol, bob] = accounts;
    expect(carol?.progress).toBeNull();
    expect(carol?.lastSaveAt).toBeNull();
    expect(dave?.progress).toBeNull();
    expect(dave?.lastSaveAt).toBe(api.now());

    const start = Date.UTC(2026, 9, 27);
    const profile = advanced().profile;
    const team = profile.team.map((id) => profile.heroes[id]?.level ?? 0);
    expect(bob).toEqual({
      id: 2,
      pseudo: 'Bob_42',
      createdAt: start + 1_000,
      lastLoginAt: start + 1_000,
      lastSaveAt: start + 2_000,
      lastActivityAt: start + 2_000,
      activeSessions: 1,
      progress: {
        heroes: { unlocked: profile.unlocked.length, total: content.heroes.length },
        team: { min: Math.min(...team), max: Math.max(...team) },
        dungeons: { cleared: 1, total: content.dungeons.length, bestTier: 2 },
        gold: 345,
        items: 2,
        quests: { achievements: 1, total: content.quests.achievements.length },
      },
    });
    expect(team).toContain(12);
  });

  it('compte l’activité sur 24 h et 7 jours, sessions actives comprises', async () => {
    const { api, admin } = await populated();
    api.advance(3 * DAY);
    // Bob revient (connexion) ; l'administrateur garde sa session ouverte et s'en sert.
    await api.login('Bob_42', undefined, '192.0.2.9');
    const res = await api.call('GET', '/api/admin/users', { cookie: admin });
    expect(res.json?.total).toEqual({ accounts: 4, active24h: 2, active7d: 4 });
    expect(ids(res.json).slice(0, 2).sort()).toEqual(['Bob_42', 'Patron_Fictif']);
    const bob = (res.json?.accounts as Json[]).find((a) => a.pseudo === 'Bob_42');
    expect(bob?.activeSessions).toBe(2);
    api.advance(10 * DAY);
    const later = await api.call('GET', '/api/admin/users', { cookie: admin });
    expect(later.json?.total).toEqual({ accounts: 4, active24h: 1, active7d: 1 });
  });

  it('pagine avec une taille bornée', async () => {
    const { api, admin } = await populated();
    const page = async (query: string) =>
      (await api.call('GET', `/api/admin/users${query}`, { cookie: admin })).json;
    const first = await page('?limit=2');
    const second = await page('?limit=2&offset=2');
    expect(ids(first)).toEqual(['Dave', 'Carol']);
    expect(ids(second)).toEqual(['Bob_42', 'Patron_Fictif']);
    expect(second?.offset).toBe(2);
    expect(ids(await page('?limit=2&offset=4'))).toEqual([]);
    expect((await page('?limit=1000'))?.limit).toBe(100);
    for (const query of ['?limit=0', '?limit=-3', '?limit=abc', '?limit=2.5&offset=-1']) {
      const body = await page(query);
      expect(body?.limit).toBeGreaterThanOrEqual(1);
      expect(body?.limit).toBeLessThanOrEqual(100);
      expect(body?.offset).toBe(0);
    }
    expect((await page('?offset=99999999999999999999'))?.accounts).toEqual([]);
  });
});

describe('détail d’un compte', () => {
  it('donne chaque héros débloqué et chaque donjon', async () => {
    const { api, admin } = await populated();
    const res = await api.call('GET', '/api/admin/users/2', { cookie: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { profile } = advanced();
    expect(res.json?.pseudo).toBe('Bob_42');
    expect(res.json?.progress).not.toBeNull();
    expect(res.json?.heroes).toEqual(
      profile.unlocked.map((id) => {
        const hero = profile.heroes[id]!;
        return { id, level: hero.level, stars: heroStars(hero, content) };
      }),
    );
    expect(res.json?.dungeons).toEqual(
      content.dungeons.map((d) => ({
        id: d.id,
        clears: profile.dungeons[d.id]?.clears ?? 0,
        tier: tierReached(content, profile, d.id),
      })),
    );
    const text = JSON.stringify(res.json);
    for (const word of SENSITIVE) expect(text).not.toContain(word);
  });

  it('sans sauvegarde valide : avancement inconnu ; id inconnu : 404', async () => {
    const { api, admin } = await populated();
    for (const id of [3, 4]) {
      const res = await api.call('GET', `/api/admin/users/${String(id)}`, { cookie: admin });
      expect(res.status).toBe(200);
      expect(res.json?.progress).toBeNull();
      expect(res.json?.heroes).toBeNull();
      expect(res.json?.dungeons).toBeNull();
    }
    // Sauvegarde antérieure aux quêtes : le reste de l'avancement est connu, les quêtes non.
    const old = advanced() as { version: number; profile: Record<string, unknown> };
    delete old.profile.quests;
    api.db.raw.prepare('UPDATE saves SET data = ? WHERE user_id = 4').run(JSON.stringify(old));
    const dave = await api.call('GET', '/api/admin/users/4', { cookie: admin });
    expect((dave.json?.progress as Json).quests).toBeNull();
    expect((dave.json?.progress as Json).gold).toBe(345);
    for (const path of ['/api/admin/users/99', '/api/admin/users/0', '/api/admin/users/abc']) {
      const res = await api.call('GET', path, { cookie: admin });
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: 'not_found' });
    }
  });
});
