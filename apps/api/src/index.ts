import {
  credentialsSchema,
  deleteAccountSchema,
  MAX_SAVE_BYTES,
  passwordChangeSchema,
  passwordProblem,
  pseudoKey,
  pseudoProblem,
  registerSchema,
  savePutSchema,
  SESSION_MS,
  type ApiError,
  type CloudSave,
  type Me,
  type SaveAck,
} from '@outlaw/accounts';
import { isCommonPassword } from '@outlaw/accounts/common-passwords';
import {
  hashPassword,
  randomToken,
  sha256Hex,
  verifyAgainstNothing,
  verifyPassword,
} from '@outlaw/accounts/hash';
import type { z } from 'zod';
import { accountDetail, isAdmin, listAccounts } from './admin';
import { ensureSchema, type Database } from './db';
import { allow, clear, fail, ipId, waitFor } from './throttle';

export { PvpRoom } from './pvp-room';

/**
 * Worker des comptes : seules les routes `/api/*` l'atteignent (`run_worker_first`), le reste du
 * site est servi directement par les fichiers statiques. Aucun journal n'est écrit ici.
 * Les salons PvP (`/api/pvp/*`) sont des Durable Objects, branchés par `PVP` (voir pvp-room.ts).
 */

/** Le sous-ensemble de l'espace de noms des Durable Objects utilisé ici (testable sans Cloudflare). */
export interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface Env {
  readonly DB: Database;
  readonly ASSETS?: { fetch(request: Request): Promise<Response> };
  readonly PVP?: RoomNamespace;
  /**
   * Secret Cloudflare (jamais dans le dépôt) : pseudos administrateurs séparés par des virgules.
   * Absent ou vide : personne n'est administrateur. Voir docs/DEPLOY.md.
   */
  readonly ADMIN_PSEUDOS?: string;
}

const COOKIE = '__Host-session';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Limites (voir docs/ACCOUNTS.md). */
const LIMITS = {
  /** Comptes créés par adresse IP et par heure. */
  registerPerIp: 5,
  /** Tentatives de connexion par adresse IP sur 10 minutes, réussies ou non. */
  loginPerIp: 30,
  /** Échecs gratuits avant le délai croissant, par pseudo puis par adresse IP. */
  freeFailuresPseudo: 5,
  freeFailuresIp: 10,
  /** Salons PvP créés par compte et par heure. */
  roomsPerHour: 20,
  /** Connexions à un salon par compte et par minute (reconnexions comprises). */
  socketsPerMinute: 30,
} as const;

interface UserRow {
  id: number;
  pseudo: string;
  pw_hash: string;
  must_change: number;
  created_at: number;
  last_login_at: number | null;
}

interface Session {
  readonly tokenHash: string;
  readonly user: UserRow;
  /** Cookie à renvoyer quand l'expiration glissante a été repoussée. */
  readonly refresh: string | null;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError,
    readonly extra: Readonly<Record<string, unknown>> = {},
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(code);
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function cookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}
const CLEAR_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(request: Request): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE && value !== undefined && /^[0-9a-f]{64}$/.test(value)) return value;
  }
  return null;
}

async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const raw = await request.text();
  if (raw.length > MAX_SAVE_BYTES + 1024) throw new HttpError(413, 'too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new HttpError(400, 'invalid');
  return result.data;
}

async function newSession(db: Database, userId: number, now: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(sha256Hex(token), userId, now, now + SESSION_MS)
    .run();
  return token;
}

async function session(request: Request, db: Database, now: number): Promise<Session | null> {
  const token = readCookie(request);
  if (token === null) return null;
  const tokenHash = sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.expires_at, u.id, u.pseudo, u.pw_hash, u.must_change, u.created_at, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<UserRow & { expires_at: number }>();
  if (row === null) return null;
  let refresh: string | null = null;
  // Expiration glissante, repoussée au plus une fois par jour pour épargner les écritures.
  if (row.expires_at - now < SESSION_MS - DAY) {
    await db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_MS, tokenHash)
      .run();
    refresh = cookie(token);
  }
  const user: UserRow = {
    id: row.id,
    pseudo: row.pseudo,
    pw_hash: row.pw_hash,
    must_change: row.must_change,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  };
  return { tokenHash, user, refresh };
}

function tooMany(waitMs: number): HttpError {
  const retryAfter = Math.ceil(waitMs / 1000);
  return new HttpError(429, 'too_many', { retryAfter }, { 'Retry-After': String(retryAfter) });
}

/** Réponse « qui suis-je » ; le drapeau d'administration vient du secret du Worker, jamais du client. */
function meOf(env: Env, pseudo: string, mustChange: boolean): Me {
  return { pseudo, mustChangePassword: mustChange, admin: isAdmin(env.ADMIN_PSEUDOS, pseudo) };
}

async function register(request: Request, env: Env, db: Database, ip: string, now: number) {
  const { pseudo, password } = await body(request, registerSchema);
  const problem = pseudoProblem(pseudo) ?? passwordProblem(password, pseudo);
  if (problem !== null) throw new HttpError(400, problem);
  if (isCommonPassword(password)) throw new HttpError(400, 'password_common');
  if (!(await allow(db, `register:${ip}`, LIMITS.registerPerIp, HOUR, now))) throw tooMany(HOUR);
  const key = pseudoKey(pseudo);
  const taken = await db.prepare('SELECT 1 AS x FROM users WHERE pseudo_key = ?').bind(key).first();
  if (taken !== null) throw new HttpError(409, 'pseudo_taken');
  const hash = await hashPassword(password);
  try {
    await db
      .prepare(
        'INSERT INTO users (pseudo, pseudo_key, pw_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(pseudo, key, hash, now, now)
      .run();
  } catch {
    // Deux inscriptions simultanées du même pseudo : la contrainte UNIQUE tranche.
    throw new HttpError(409, 'pseudo_taken');
  }
  const user = await db
    .prepare('SELECT id FROM users WHERE pseudo_key = ?')
    .bind(key)
    .first<{ id: number }>();
  if (user === null) throw new HttpError(500, 'invalid');
  const token = await newSession(db, user.id, now);
  return json(201, meOf(env, pseudo, false), { 'Set-Cookie': cookie(token) });
}

async function login(request: Request, env: Env, db: Database, ip: string, now: number) {
  const { pseudo, password } = await body(request, credentialsSchema);
  const userKey = `login:${pseudoKey(pseudo)}`;
  const ipKey = `login-ip:${ip}`;
  const wait = Math.max(await waitFor(db, userKey, now), await waitFor(db, ipKey, now));
  if (wait > 0) throw tooMany(wait);
  if (!(await allow(db, `attempts:${ip}`, LIMITS.loginPerIp, 10 * 60 * 1000, now)))
    throw tooMany(10 * 60 * 1000);
  const user = await db
    .prepare(
      'SELECT id, pseudo, pw_hash, must_change, created_at, last_login_at FROM users WHERE pseudo_key = ?',
    )
    .bind(pseudoKey(pseudo))
    .first<UserRow>();
  let verified = { ok: false, rehash: false };
  if (user === null) await verifyAgainstNothing(password);
  else verified = await verifyPassword(password, user.pw_hash);
  if (user === null || !verified.ok) {
    await fail(db, userKey, LIMITS.freeFailuresPseudo, now);
    await fail(db, ipKey, LIMITS.freeFailuresIp, now);
    // Même réponse pour un pseudo inconnu et un mauvais mot de passe.
    throw new HttpError(401, 'bad_credentials');
  }
  await clear(db, userKey);
  if (verified.rehash) {
    await db
      .prepare('UPDATE users SET pw_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), user.id)
      .run();
  }
  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, user.id).run();
  const token = await newSession(db, user.id, now);
  return json(200, meOf(env, user.pseudo, user.must_change === 1), {
    'Set-Cookie': cookie(token),
  });
}

async function changePassword(request: Request, db: Database, s: Session, now: number) {
  const { oldPassword, newPassword } = await body(request, passwordChangeSchema);
  const key = `password:${String(s.user.id)}`;
  const wait = await waitFor(db, key, now);
  if (wait > 0) throw tooMany(wait);
  if (!(await verifyPassword(oldPassword, s.user.pw_hash)).ok) {
    await fail(db, key, LIMITS.freeFailuresPseudo, now);
    throw new HttpError(401, 'bad_credentials');
  }
  const problem = passwordProblem(newPassword, s.user.pseudo);
  if (problem !== null) throw new HttpError(400, problem);
  if (isCommonPassword(newPassword)) throw new HttpError(400, 'password_common');
  await clear(db, key);
  // Les autres sessions (appareils, ou celle d'un intrus) sont révoquées ; celle-ci reste.
  await db.batch([
    db
      .prepare('UPDATE users SET pw_hash = ?, must_change = 0 WHERE id = ?')
      .bind(await hashPassword(newPassword), s.user.id),
    db
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
      .bind(s.user.id, s.tokenHash),
  ]);
  return json(204, null);
}

async function deleteAccount(request: Request, db: Database, s: Session, now: number) {
  const { password } = await body(request, deleteAccountSchema);
  const key = `password:${String(s.user.id)}`;
  const wait = await waitFor(db, key, now);
  if (wait > 0) throw tooMany(wait);
  if (!(await verifyPassword(password, s.user.pw_hash)).ok) {
    await fail(db, key, LIMITS.freeFailuresPseudo, now);
    throw new HttpError(401, 'bad_credentials');
  }
  await db.batch([
    db.prepare('DELETE FROM saves WHERE user_id = ?').bind(s.user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(s.user.id),
    db.prepare('DELETE FROM throttle WHERE key = ?').bind(key),
    db.prepare('DELETE FROM users WHERE id = ?').bind(s.user.id),
  ]);
  return json(204, null, { 'Set-Cookie': CLEAR_COOKIE });
}

interface SaveRow {
  rev: number;
  data: string;
  updated_at: number;
}

async function cloudSave(db: Database, userId: number): Promise<CloudSave> {
  const row = await db
    .prepare('SELECT rev, data, updated_at FROM saves WHERE user_id = ?')
    .bind(userId)
    .first<SaveRow>();
  return row === null
    ? { rev: 0, updatedAt: null, save: null }
    : { rev: row.rev, updatedAt: row.updated_at, save: JSON.parse(row.data) as CloudSave['save'] };
}

async function putSave(request: Request, db: Database, s: Session, now: number) {
  const { baseRev, save } = await body(request, savePutSchema);
  if (save.version !== save.profile.version) throw new HttpError(400, 'invalid');
  const data = JSON.stringify(save);
  if (new TextEncoder().encode(data).length > MAX_SAVE_BYTES) throw new HttpError(413, 'too_large');
  // Écriture conditionnelle : elle n'a lieu que si le cloud est encore à `baseRev`.
  const updated =
    baseRev === 0
      ? await db
          .prepare(
            'INSERT INTO saves (user_id, rev, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT (user_id) DO NOTHING',
          )
          .bind(s.user.id, data, now)
          .run()
      : await db
          .prepare(
            'UPDATE saves SET rev = rev + 1, data = ?, updated_at = ? WHERE user_id = ? AND rev = ?',
          )
          .bind(data, now, s.user.id, baseRev)
          .run();
  if (updated.meta.changes === 0) {
    // Un autre appareil a écrit entre-temps : jamais d'écrasement silencieux.
    throw new HttpError(409, 'conflict', { ...(await cloudSave(db, s.user.id)) });
  }
  const ack: SaveAck = { rev: baseRev + 1, updatedAt: now };
  return json(200, ack);
}

async function exportData(db: Database, s: Session) {
  const { user } = s;
  const save = await cloudSave(db, user.id);
  const data = {
    pseudo: user.pseudo,
    createdAt: new Date(user.created_at).toISOString(),
    lastLoginAt: user.last_login_at === null ? null : new Date(user.last_login_at).toISOString(),
    save,
  };
  return json(200, data, {
    'Content-Disposition': `attachment; filename="outlaw-thesis-${user.pseudo}.json"`,
  });
}

/* ------------------------------------------------------------------ PvP */

/** Code de salon : 6 caractères sans 0/O/1/I (faciles à dicter), 32^6 ≈ un milliard de codes. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PVP_SOCKET = /^\/api\/pvp\/rooms\/([A-HJ-NP-Z2-9]{6})\/ws$/;

export function newRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  // 256 est un multiple de 32 : aucun biais.
  return Array.from(bytes, (byte) => CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length)).join('');
}

/** L'identité vérifiée par le Worker, transmise au salon (jamais lue dans les en-têtes du client). */
function identity(s: Session, headers: Headers = new Headers()): Headers {
  headers.set('X-Outlaw-Account', String(s.user.id));
  headers.set('X-Outlaw-Pseudo', encodeURIComponent(s.user.pseudo));
  return headers;
}

async function pvpCreate(env: Env, db: Database, s: Session, now: number): Promise<Response> {
  const rooms = env.PVP;
  if (rooms === undefined) throw new HttpError(503, 'unavailable');
  if (!(await allow(db, `pvp-create:${String(s.user.id)}`, LIMITS.roomsPerHour, HOUR, now)))
    throw tooMany(HOUR);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const stub = rooms.get(rooms.idFromName(code));
    const created = await stub.fetch(
      new Request(`https://pvp.internal/init?code=${code}`, {
        method: 'POST',
        headers: identity(s),
      }),
    );
    if (created.status === 201) return json(201, { code });
    // 409 : ce code existe déjà (rarissime), on en tire un autre.
    if (created.status !== 409) break;
  }
  throw new HttpError(503, 'unavailable');
}

async function pvpConnect(
  request: Request,
  env: Env,
  db: Database,
  s: Session,
  code: string,
  now: number,
): Promise<Response> {
  const rooms = env.PVP;
  if (rooms === undefined) throw new HttpError(503, 'unavailable');
  // Une connexion WebSocket n'est pas couverte par la vérification des requêtes qui modifient :
  // le navigateur envoie toujours l'origine de la page, on la compare ici (anti-détournement).
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    throw new HttpError(403, 'bad_origin');
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new HttpError(400, 'invalid');
  }
  if (!(await allow(db, `pvp-ws:${String(s.user.id)}`, LIMITS.socketsPerMinute, 60 * 1000, now)))
    throw tooMany(60 * 1000);
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  const stub = rooms.get(rooms.idFromName(code));
  const response = await stub.fetch(
    new Request('https://pvp.internal/ws', { method: 'GET', headers: identity(s, headers) }),
  );
  if (response.status === 101) return response;
  if (response.status === 404) throw new HttpError(404, 'room_not_found');
  if (response.status === 409) throw new HttpError(409, 'room_full');
  throw new HttpError(503, 'unavailable');
}

/* ------------------------------------------------------------ Administration */

const ADMIN_ROUTE = /^\/api\/admin\/users(?:\/([0-9]{1,15}))?$/;

async function adminRoute(
  db: Database,
  url: URL,
  id: string | undefined,
  now: number,
): Promise<Response> {
  if (id === undefined) return json(200, await listAccounts(db, url, now));
  const detail = await accountDetail(db, Number(id), now);
  if (detail === null) throw new HttpError(404, 'not_found');
  return json(200, detail);
}

/** Routes accessibles pendant qu'un changement de mot de passe est exigé. */
const ALLOWED_WHEN_LOCKED = new Set(['GET /api/me', 'POST /api/password', 'POST /api/logout']);

async function route(request: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(request.url);
  const db = env.DB;
  const route = `${request.method} ${url.pathname}`;
  // Toute requête qui modifie doit venir du jeu lui-même (protection contre le CSRF).
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    throw new HttpError(403, 'bad_origin');
  }
  await ensureSchema(db, now);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';

  if (route === 'POST /api/register')
    return register(request, env, db, await ipId(db, ip, now), now);
  if (route === 'POST /api/login') return login(request, env, db, await ipId(db, ip, now), now);

  const s = await session(request, db, now);
  if (route === 'POST /api/logout') {
    if (s !== null)
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.tokenHash).run();
    return json(204, null, { 'Set-Cookie': CLEAR_COOKIE });
  }
  if (s === null) throw new HttpError(401, 'unauthenticated', {}, { 'Set-Cookie': CLEAR_COOKIE });
  if (s.user.must_change === 1 && !ALLOWED_WHEN_LOCKED.has(route)) {
    throw new HttpError(403, 'must_change_password');
  }

  if (route === 'POST /api/pvp/rooms') return pvpCreate(env, db, s, now);
  const socket = request.method === 'GET' ? PVP_SOCKET.exec(url.pathname) : null;
  if (socket !== null) return pvpConnect(request, env, db, s, socket[1] ?? '', now);

  let response: Response;
  switch (route) {
    case 'GET /api/me':
      response = json(200, meOf(env, s.user.pseudo, s.user.must_change === 1));
      break;
    case 'POST /api/password':
      response = await changePassword(request, db, s, now);
      break;
    case 'DELETE /api/account':
      return deleteAccount(request, db, s, now);
    case 'GET /api/save':
      response = json(200, await cloudSave(db, s.user.id));
      break;
    case 'PUT /api/save':
      response = await putSave(request, db, s, now);
      break;
    case 'GET /api/account/export':
      response = await exportData(db, s);
      break;
    default: {
      // Administration : un non-administrateur reçoit la réponse d'une route inconnue.
      const admin = request.method === 'GET' ? ADMIN_ROUTE.exec(url.pathname) : null;
      if (admin === null || !isAdmin(env.ADMIN_PSEUDOS, s.user.pseudo)) {
        throw new HttpError(404, 'not_found');
      }
      response = await adminRoute(db, url, admin[1], now);
    }
  }
  if (s.refresh !== null) response.headers.append('Set-Cookie', s.refresh);
  return response;
}

/** Point d'entrée testable : l'horloge est injectée. */
export async function handle(request: Request, env: Env, now: number): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/')) {
    return env.ASSETS === undefined ? json(404, { error: 'not_found' }) : env.ASSETS.fetch(request);
  }
  try {
    return await route(request, env, now);
  } catch (error) {
    if (error instanceof HttpError) {
      return json(error.status, { error: error.code, ...error.extra }, { ...error.headers });
    }
    // Aucune donnée de la requête n'est journalisée : seulement le type d'erreur.
    console.error('api: erreur interne', error instanceof Error ? error.name : 'inconnue');
    return json(500, { error: 'internal' });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, Date.now());
  },
};
