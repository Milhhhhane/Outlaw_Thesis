import { randomToken, sha256Hex } from '@outlaw/accounts/hash';
import type { Database } from './db';

/**
 * Limitation de débit, stockée dans D1 (un compteur par clé). La liaison « Rate Limiting » de
 * Workers est approximative, locale à chaque point de présence et limitée à des fenêtres de 10
 * ou 60 s : elle ne permet pas un délai croissant sur plusieurs minutes (docs/DECISIONS.md).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_DELAY = 15 * 60 * 1000;

interface Row {
  count: number;
  window_start: number;
  blocked_until: number;
}

async function read(db: Database, key: string): Promise<Row | null> {
  return db
    .prepare('SELECT count, window_start, blocked_until FROM throttle WHERE key = ?')
    .bind(key)
    .first<Row>();
}

async function write(db: Database, key: string, row: Row, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO throttle (key, count, window_start, blocked_until, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET count = excluded.count,
         window_start = excluded.window_start, blocked_until = excluded.blocked_until,
         updated_at = excluded.updated_at`,
    )
    .bind(key, row.count, row.window_start, row.blocked_until, now)
    .run();
}

/** Millisecondes restantes avant que la clé puisse réessayer (0 : libre). */
export async function waitFor(db: Database, key: string, now: number): Promise<number> {
  const row = await read(db, key);
  return row === null ? 0 : Math.max(0, row.blocked_until - now);
}

/**
 * Compte un échec. Les `free` premiers échecs d'une fenêtre d'une heure ne coûtent rien, chaque
 * échec suivant double l'attente (2 s, 4 s, 8 s… jusqu'à 15 min).
 */
export async function fail(db: Database, key: string, free: number, now: number): Promise<void> {
  const row = await read(db, key);
  const fresh = row === null || now - row.window_start > HOUR;
  const count = fresh ? 1 : row.count + 1;
  const over = count - free;
  const blocked_until = over > 0 ? now + Math.min(MAX_DELAY, 1000 * 2 ** over) : 0;
  await write(db, key, { count, window_start: fresh ? now : row.window_start, blocked_until }, now);
}

export async function clear(db: Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM throttle WHERE key = ?').bind(key).run();
}

/** Compte une tentative ; faux si la clé a déjà fait `limit` tentatives dans la fenêtre. */
export async function allow(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<boolean> {
  const row = await read(db, key);
  const fresh = row === null || now - row.window_start > windowMs;
  const count = fresh ? 1 : row.count + 1;
  if (count > limit) return false;
  await write(
    db,
    key,
    { count, window_start: fresh ? now : row.window_start, blocked_until: 0 },
    now,
  );
  return true;
}

/**
 * Identifiant d'adresse IP, jamais en clair : empreinte SHA-256 avec un sel aléatoire tiré
 * chaque jour et oublié le lendemain. Les compteurs de plus de 24 h sont effacés au passage.
 */
export async function ipId(db: Database, ip: string, now: number): Promise<string> {
  const day = Math.floor(now / DAY);
  const stored = await db.prepare("SELECT v FROM meta WHERE k = 'ip_salt'").first<{ v: string }>();
  let salt = stored?.v.startsWith(`${day}:`) === true ? stored.v : null;
  if (salt === null) {
    salt = `${day}:${randomToken()}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO meta (k, v) VALUES ('ip_salt', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
        )
        .bind(salt),
      db.prepare('DELETE FROM throttle WHERE updated_at < ?').bind(now - DAY),
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ]);
  }
  return sha256Hex(`${salt}|${ip}`).slice(0, 32);
}
