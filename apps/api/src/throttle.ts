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

/**
 * Compte une tentative en une seule requête (upsert atomique) et renvoie le nouveau compteur :
 * deux requêtes simultanées ne peuvent pas lire la même valeur et écrire chacune « +1 ». Une
 * fenêtre écoulée (plus de `windowMs` depuis son début) repart de 1 et efface l'attente.
 */
async function bump(
  db: Database,
  key: string,
  windowMs: number,
  now: number,
): Promise<{ count: number; window_start: number }> {
  const row = await db
    .prepare(
      `INSERT INTO throttle (key, count, window_start, blocked_until, updated_at)
       VALUES (?1, 1, ?2, 0, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN ?2 - throttle.window_start > ?3 THEN 1 ELSE throttle.count + 1 END,
         window_start = CASE WHEN ?2 - throttle.window_start > ?3 THEN ?2
           ELSE throttle.window_start END,
         blocked_until = CASE WHEN ?2 - throttle.window_start > ?3 THEN 0
           ELSE throttle.blocked_until END,
         updated_at = ?2
       RETURNING count, window_start`,
    )
    .bind(key, now, windowMs)
    .first<{ count: number; window_start: number }>();
  // RETURNING renvoie toujours la ligne écrite.
  return row ?? { count: 1, window_start: now };
}

/** Millisecondes restantes avant que la clé puisse réessayer (0 : libre). */
export async function waitFor(db: Database, key: string, now: number): Promise<number> {
  const row = await db
    .prepare('SELECT blocked_until FROM throttle WHERE key = ?')
    .bind(key)
    .first<{ blocked_until: number }>();
  return row === null ? 0 : Math.max(0, row.blocked_until - now);
}

/**
 * Compte un échec. Les `free` premiers échecs d'une fenêtre d'une heure ne coûtent rien, chaque
 * échec suivant double l'attente (2 s, 4 s, 8 s… jusqu'à 15 min).
 */
export async function fail(db: Database, key: string, free: number, now: number): Promise<void> {
  const { count } = await bump(db, key, HOUR, now);
  const over = count - free;
  if (over <= 0) return;
  // Chaque échec calcule l'attente de son propre rang ; MAX garde la plus longue si deux
  // échecs simultanés écrivent dans le désordre.
  await db
    .prepare('UPDATE throttle SET blocked_until = MAX(blocked_until, ?) WHERE key = ?')
    .bind(now + Math.min(MAX_DELAY, 1000 * 2 ** over), key)
    .run();
}

export async function clear(db: Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM throttle WHERE key = ?').bind(key).run();
}

/**
 * Compte une tentative ; faux si la clé a déjà fait `limit` tentatives dans la fenêtre. Le
 * compteur est incrémenté atomiquement : une rafale simultanée ne passe pas plus de `limit` fois.
 */
export async function allow(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<boolean> {
  const { count } = await bump(db, key, windowMs, now);
  return count <= limit;
}

/**
 * Identifiant d'adresse IP, jamais en clair : empreinte SHA-256 avec un sel aléatoire tiré
 * chaque jour et oublié le lendemain. Les compteurs de plus de 24 h sont effacés au passage.
 */
export async function ipId(db: Database, ip: string, now: number): Promise<string> {
  const day = Math.floor(now / DAY);
  const read = async () =>
    (await db.prepare("SELECT v FROM meta WHERE k = 'ip_salt'").first<{ v: string }>())?.v ?? null;
  let salt = await read();
  if (salt?.startsWith(`${day}:`) !== true) {
    // Le sel du jour n'est écrit que s'il manque encore : deux requêtes simultanées en début de
    // journée finissent avec le même sel (sinon la même adresse aurait deux empreintes, donc deux
    // compteurs). On relit celui qui a été gardé.
    await db.batch([
      db
        .prepare(
          `INSERT INTO meta (k, v) VALUES ('ip_salt', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v
           WHERE meta.v NOT LIKE ?`,
        )
        .bind(`${day}:${randomToken()}`, `${day}:%`),
      db.prepare('DELETE FROM throttle WHERE updated_at < ?').bind(now - DAY),
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ]);
    salt = (await read()) ?? `${day}:`;
  }
  return sha256Hex(`${salt}|${ip}`).slice(0, 32);
}
