import { describe, expect, it } from 'vitest';
import { envelope, GOOD, server } from './helpers';

describe('création de compte', () => {
  it('crée le compte, ouvre une session et protège le cookie', async () => {
    const api = server();
    const res = await api.register('Bob_42');
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ pseudo: 'Bob_42', mustChangePassword: false, admin: false });
    expect(res.setCookie).toMatch(/^__Host-session=[0-9a-f]{64}; /);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000'])
      expect(res.setCookie).toContain(flag);
    const me = await api.call('GET', '/api/me', { cookie: res.cookie });
    expect(me.json).toEqual({ pseudo: 'Bob_42', mustChangePassword: false, admin: false });
  });

  it('refuse un pseudo déjà pris sans distinction de casse', async () => {
    const api = server();
    await api.register('Bob_42');
    const res = await api.register('bob_42');
    expect(res.status).toBe(409);
    expect(res.json?.error).toBe('pseudo_taken');
  });

  it('refuse les mots de passe trop courts ou courants et la case non cochée', async () => {
    const api = server();
    expect((await api.register('Alice', 'court')).json?.error).toBe('password_length');
    expect((await api.register('Alice', '1234567890')).json?.error).toBe('password_common');
    expect((await api.register('ad', GOOD)).json?.error).toBe('pseudo_length');
    const unchecked = await api.call('POST', '/api/register', {
      body: { pseudo: 'Alice', password: GOOD, accept: false },
    });
    expect(unchecked.status).toBe(400);
  });
});

describe('connexion et déconnexion', () => {
  it('répond pareil pour un pseudo inconnu et un mauvais mot de passe', async () => {
    const api = server();
    await api.register('Bob_42');
    const wrong = await api.login('Bob_42', 'mauvais mot de passe');
    const unknown = await api.login('Personne', 'mauvais mot de passe');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
  });

  it('connecte sans distinction de casse, puis la déconnexion révoque la session', async () => {
    const api = server();
    await api.register('Bob_42');
    const res = await api.login('BOB_42');
    expect(res.status).toBe(200);
    expect(res.json?.pseudo).toBe('Bob_42');
    expect((await api.call('GET', '/api/me', { cookie: res.cookie })).status).toBe(200);
    const out = await api.call('POST', '/api/logout', { cookie: res.cookie });
    expect(out.status).toBe(204);
    expect(out.setCookie).toContain('Max-Age=0');
    expect((await api.call('GET', '/api/me', { cookie: res.cookie })).status).toBe(401);
  });

  it('fait glisser l’expiration de la session et la laisse expirer après 30 jours', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    api.advance(20 * 86_400_000);
    const used = await api.call('GET', '/api/me', { cookie });
    expect(used.setCookie).toContain('Max-Age=2592000');
    api.advance(25 * 86_400_000);
    expect((await api.call('GET', '/api/me', { cookie })).status).toBe(200);
    api.advance(31 * 86_400_000);
    expect((await api.call('GET', '/api/me', { cookie })).status).toBe(401);
  });
});

describe('limitation de débit', () => {
  it('impose un délai croissant après cinq échecs sur un pseudo', async () => {
    const api = server();
    await api.register('Bob_42');
    for (let i = 0; i < 5; i += 1)
      expect((await api.login('Bob_42', 'xxxxxxxxxx')).status).toBe(401);
    expect((await api.login('Bob_42', 'xxxxxxxxxx')).status).toBe(401);
    // Sixième échec : 2 s d'attente, même avec le bon mot de passe.
    const blocked = await api.login('Bob_42');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('2');
    expect((await api.login('Bob_42', 'xxxxxxxxxx', '198.51.100.1')).status).toBe(429);
    api.advance(2_001);
    expect((await api.login('Bob_42', 'xxxxxxxxxx')).status).toBe(401);
    expect((await api.login('Bob_42')).json?.error).toBe('too_many');
    api.advance(4_001);
    expect((await api.login('Bob_42')).status).toBe(200);
  });

  it('limite les créations de comptes par adresse IP', async () => {
    const api = server();
    for (let i = 0; i < 5; i += 1) expect((await api.register(`Joueur${i}`)).status).toBe(201);
    expect((await api.register('Joueur5')).status).toBe(429);
    expect((await api.register('Joueur5', GOOD, '198.51.100.1')).status).toBe(201);
  });

  it('compte atomiquement les inscriptions simultanées d’une même adresse', async () => {
    const api = server();
    await api.call('GET', '/api/me');
    const statuses = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        api.register(`Rafale${String(i)}`).then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(45);
  });

  it('compte chaque échec de connexion, même simultané', async () => {
    const api = server();
    await api.register('Bob_42');
    const statuses = await Promise.all(
      Array.from({ length: 12 }, () => api.login('Bob_42', 'xxxxxxxxxx').then((r) => r.status)),
    );
    expect(statuses.every((s) => s === 401)).toBe(true);
    const row = api.db.raw
      .prepare("SELECT count, blocked_until FROM throttle WHERE key = 'login:bob_42'")
      .get() as { count: number; blocked_until: number };
    expect(row.count).toBe(12);
    // Sept échecs au-delà des cinq gratuits : 2⁷ s d'attente.
    expect(row.blocked_until).toBe(api.now() + 128_000);
  });

  it('ne garde aucune adresse IP en clair', async () => {
    const api = server();
    await api.login('Bob_42', 'xxxxxxxxxx');
    const keys = api.db.raw.prepare('SELECT key FROM throttle').all() as { key: string }[];
    expect(keys.length).toBeGreaterThan(0);
    for (const { key } of keys) expect(key).not.toContain('203.0.113.7');
  });
});

describe('contrôle de l’origine', () => {
  it('refuse toute requête qui modifie sans en-tête Origin du jeu', async () => {
    const api = server();
    const body = { pseudo: 'Bob_42', password: GOOD, accept: true };
    expect((await api.call('POST', '/api/register', { body, origin: null })).status).toBe(403);
    const forged = await api.call('POST', '/api/register', {
      body,
      origin: 'https://evil.example',
    });
    expect(forged.status).toBe(403);
    expect(forged.json?.error).toBe('bad_origin');
    const { cookie } = await api.register('Bob_42');
    const put = await api.call('PUT', '/api/save', {
      cookie,
      origin: 'https://evil.example',
      body: { baseRev: 0, save: envelope() },
    });
    expect(put.status).toBe(403);
  });
});

describe('sauvegarde', () => {
  it('versionne la sauvegarde et refuse une écriture obsolète (409)', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    expect((await api.call('GET', '/api/save', { cookie })).json).toEqual({
      rev: 0,
      updatedAt: null,
      save: null,
    });
    const first = await api.call('PUT', '/api/save', {
      cookie,
      body: { baseRev: 0, save: envelope(10) },
    });
    expect(first.json?.rev).toBe(1);
    // Un deuxième appareil, resté à la révision 0, ne doit rien écraser.
    const stale = await api.call('PUT', '/api/save', {
      cookie,
      body: { baseRev: 0, save: envelope(99) },
    });
    expect(stale.status).toBe(409);
    expect(stale.json?.rev).toBe(1);
    expect((stale.json?.save as { profile: { gold: number } }).profile.gold).toBe(10);
    const second = await api.call('PUT', '/api/save', {
      cookie,
      body: { baseRev: 1, save: envelope(20) },
    });
    expect(second.json?.rev).toBe(2);
    const read = await api.call('GET', '/api/save', { cookie });
    expect((read.json?.save as { profile: { gold: number } }).profile.gold).toBe(20);
  });

  it('valide le profil et limite sa taille', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    const bad = envelope();
    const invalid = await api.call('PUT', '/api/save', {
      cookie,
      body: { baseRev: 0, save: { ...bad, profile: { ...bad.profile, gold: -1 } } },
    });
    expect(invalid.status).toBe(400);
    const huge = await api.call('PUT', '/api/save', {
      cookie,
      body: `{"baseRev":0,"save":"${'x'.repeat(210 * 1024)}"}`,
    });
    expect(huge.status).toBe(413);
  });

  it('exige une session', async () => {
    const api = server();
    expect((await api.call('GET', '/api/save')).status).toBe(401);
  });
});

describe('mot de passe et suppression', () => {
  it('change le mot de passe avec l’ancien et révoque les autres sessions', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    const other = (await api.login('Bob_42')).cookie;
    const NEW = 'nouvelle phrase secrète';
    const wrong = await api.call('POST', '/api/password', {
      cookie,
      body: { oldPassword: 'pas le bon !', newPassword: NEW },
    });
    expect(wrong.status).toBe(401);
    const ok = await api.call('POST', '/api/password', {
      cookie,
      body: { oldPassword: GOOD, newPassword: NEW },
    });
    expect(ok.status).toBe(204);
    expect((await api.call('GET', '/api/me', { cookie })).status).toBe(200);
    expect((await api.call('GET', '/api/me', { cookie: other })).status).toBe(401);
    expect((await api.login('Bob_42')).status).toBe(401);
    expect((await api.login('Bob_42', NEW)).status).toBe(200);
  });

  it('supprime réellement le compte et ses données, mot de passe exigé', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    await api.call('PUT', '/api/save', { cookie, body: { baseRev: 0, save: envelope() } });
    const refused = await api.call('DELETE', '/api/account', {
      cookie,
      body: { password: 'pas le bon !' },
    });
    expect(refused.status).toBe(401);
    const done = await api.call('DELETE', '/api/account', { cookie, body: { password: GOOD } });
    expect(done.status).toBe(204);
    for (const table of ['users', 'sessions', 'saves']) {
      const { n } = api.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(n).toBe(0);
    }
    expect((await api.login('Bob_42')).status).toBe(401);
    expect((await api.register('Bob_42', GOOD, '198.51.100.9')).status).toBe(201);
  });

  it('exporte les données du compte', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    const res = await api.call('GET', '/api/account/export', { cookie });
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.json?.pseudo).toBe('Bob_42');
    expect(JSON.stringify(res.json)).not.toContain('scrypt');
  });
});

describe('changement de mot de passe exigé', () => {
  it('bloque tout sauf le changement de mot de passe tant que le drapeau est levé', async () => {
    const api = server();
    const { cookie } = await api.register('Bob_42');
    api.db.raw.prepare('UPDATE users SET must_change = 1').run();
    const blocked = await api.call('GET', '/api/save', { cookie });
    expect(blocked.status).toBe(403);
    expect(blocked.json?.error).toBe('must_change_password');
    expect((await api.call('GET', '/api/me', { cookie })).json?.mustChangePassword).toBe(true);
    await api.call('POST', '/api/password', {
      cookie,
      body: { oldPassword: GOOD, newPassword: 'une toute autre phrase' },
    });
    expect((await api.call('GET', '/api/save', { cookie })).status).toBe(200);
  });
});
