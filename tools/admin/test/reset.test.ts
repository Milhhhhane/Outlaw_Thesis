import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { handle } from '@outlaw/api';
import { SqliteDatabase } from '@outlaw/api/testing';
import { describe as group, expect, it } from 'vitest';
import { describe, resetPassword, summarize, type AdminDb } from '../src/reset';

const ORIGIN = 'https://jeu.example';
const GOOD = 'cheval agrafe batterie';

function setup() {
  const db = new SqliteDatabase();
  const now = Date.UTC(2026, 9, 27);
  const call = async (method: string, path: string, body?: unknown, cookie?: string | null) => {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (cookie != null) headers.Cookie = cookie;
    const res = await handle(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { DB: db },
      now,
    );
    const text = await res.text();
    return {
      status: res.status,
      json: (text === '' ? null : JSON.parse(text)) as Record<string, unknown> | null,
      cookie: res.headers.get('Set-Cookie')?.split(';')[0] ?? null,
    };
  };
  // Même accès que `wrangler d1 execute` : du SQL sans paramètres liés.
  const admin: AdminDb = {
    query: (sql) => {
      const statement = db.raw.prepare(sql);
      return Promise.resolve(
        /^\s*select/i.test(sql)
          ? (statement.all() as Record<string, unknown>[])
          : (statement.run(), []),
      );
    },
  };
  return { call, admin };
}

group('réinitialisation par le propriétaire', () => {
  it('résume le compte, révoque les sessions et force le changement', async () => {
    const { call, admin } = setup();
    const phone = (
      await call('POST', '/api/register', { pseudo: 'Bob_42', password: GOOD, accept: true })
    ).cookie;
    const laptop = (await call('POST', '/api/login', { pseudo: 'Bob_42', password: GOOD })).cookie;
    const profile = { ...newProfile(loadContent(), 3, 0), gold: 321 };
    await call(
      'PUT',
      '/api/save',
      { baseRev: 0, save: { version: profile.version, profile } },
      phone,
    );

    const summary = await summarize(admin, 'bob_42');
    expect(summary?.pseudo).toBe('Bob_42');
    expect(summary?.gold).toBe(321);
    expect(summary?.heroes.length).toBeGreaterThan(0);
    expect(describe(summary!)).toContain('Or                 : 321');
    expect(await summarize(admin, 'Personne')).toBeNull();
    expect(await summarize(admin, "x' OR '1'='1")).toBeNull();

    const temporary = await resetPassword(admin, summary!);
    expect(temporary).toMatch(/^[a-zA-Z2-9]{16}$/);

    // Toutes les sessions sont révoquées.
    expect((await call('GET', '/api/me', undefined, phone)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, laptop)).status).toBe(401);
    // L'ancien mot de passe ne marche plus, le temporaire oui, avec changement exigé.
    expect((await call('POST', '/api/login', { pseudo: 'Bob_42', password: GOOD })).status).toBe(
      401,
    );
    const login = await call('POST', '/api/login', { pseudo: 'Bob_42', password: temporary });
    expect(login.json).toEqual({ pseudo: 'Bob_42', mustChangePassword: true });
    expect((await call('GET', '/api/save', undefined, login.cookie)).status).toBe(403);
    const changed = await call(
      'POST',
      '/api/password',
      { oldPassword: temporary, newPassword: 'ma nouvelle phrase à moi' },
      login.cookie,
    );
    expect(changed.status).toBe(204);
    const save = await call('GET', '/api/save', undefined, login.cookie);
    expect((save.json?.save as { profile: { gold: number } }).profile.gold).toBe(321);
  });
});
