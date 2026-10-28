import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { handle, type RoomNamespace } from '../src/index';
import { SqliteDatabase } from '../src/testing';

export const ORIGIN = 'https://jeu.example';
export const GOOD = 'cheval agrafe batterie';

export function envelope(gold = 0) {
  const profile = { ...newProfile(loadContent(), 7, 1_000), gold };
  return { version: profile.version, profile };
}

/** Un serveur en mémoire, une horloge réglable et des appels qui gardent le cookie. */
export function server(pvp?: RoomNamespace) {
  const db = new SqliteDatabase();
  let now = Date.UTC(2026, 9, 27);
  const call = async (
    method: string,
    path: string,
    options: { body?: unknown; cookie?: string | null; origin?: string | null; ip?: string } = {},
  ) => {
    const headers: Record<string, string> = { 'CF-Connecting-IP': options.ip ?? '203.0.113.7' };
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
    if (options.cookie != null) headers.Cookie = options.cookie;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await handle(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers,
        body:
          options.body === undefined
            ? undefined
            : typeof options.body === 'string'
              ? options.body
              : JSON.stringify(options.body),
      }),
      pvp === undefined ? { DB: db } : { DB: db, PVP: pvp },
      now,
    );
    const text = await response.text();
    const set = response.headers.get('Set-Cookie');
    return {
      status: response.status,
      json: (text === '' ? null : JSON.parse(text)) as Record<string, unknown> | null,
      /** Valeur « nom=jeton » à renvoyer dans l'en-tête Cookie. */
      cookie: set?.split(';')[0] ?? null,
      setCookie: set,
      headers: response.headers,
    };
  };
  const register = async (pseudo: string, password = GOOD, ip?: string) =>
    call('POST', '/api/register', { body: { pseudo, password, accept: true }, ip });
  const login = async (pseudo: string, password = GOOD, ip?: string) =>
    call('POST', '/api/login', { body: { pseudo, password }, ip });
  /** Une requête GET avec des en-têtes à la main (mise à niveau WebSocket), réponse brute. */
  const fetchRaw = (path: string, headers: Record<string, string>) =>
    handle(
      new Request(`${ORIGIN}${path}`, { headers }),
      pvp === undefined ? { DB: db } : { DB: db, PVP: pvp },
      now,
    );
  return {
    db,
    call,
    fetchRaw,
    register,
    login,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
