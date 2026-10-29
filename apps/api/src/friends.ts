import {
  FRIEND_REQUESTS_PENDING_MAX,
  FRIEND_REQUESTS_PER_HOUR,
  FRIENDS_MAX,
  pseudoKey,
  SESSION_MS,
  type Friend,
  type FriendList,
  type FriendPending,
  type FriendProgress,
  type FriendRequest,
  type FriendRequestAck,
} from '@outlaw/accounts';
import { ACTIVITY, saveProgress } from './admin';
import type { Database, Statement } from './db';
import { HttpError, tooMany } from './http';
import { allow } from './throttle';

/**
 * Amis (`/api/friends*`, routage dans `index.ts`). Une ligne de `friendships` par paire de comptes,
 * le plus petit identifiant en `user_a` ; état `pending` (demande de `requested_by`) ou `accepted`.
 * Un ami voit le pseudo, le jour de la dernière activité (jamais l'heure) et un résumé d'avancement
 * calculé ici depuis la sauvegarde validée ; une demande ne montre que le pseudo et la date.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Clé de limite de débit des demandes d'un compte (table `throttle`). */
export function requestThrottleKey(userId: number): string {
  return `friend-request:${String(userId)}`;
}

/** La paire dans l'ordre de la table : le plus petit identifiant d'abord. */
function pair(me: number, other: number): readonly [number, number] {
  return me < other ? [me, other] : [other, me];
}

interface Relation {
  status: 'pending' | 'accepted';
  requested_by: number;
}

async function relation(db: Database, me: number, other: number): Promise<Relation | null> {
  const [a, b] = pair(me, other);
  return db
    .prepare('SELECT status, requested_by FROM friendships WHERE user_a = ? AND user_b = ?')
    .bind(a, b)
    .first<Relation>();
}

/** Amis acceptés d'un compte (sous-requête : paramètres id, id). */
const ACCEPTED = `(SELECT COUNT(*) FROM friendships
  WHERE status = 'accepted' AND (user_a = ? OR user_b = ?))`;

async function friendCount(db: Database, id: number): Promise<number> {
  const row = await db.prepare(`SELECT ${ACCEPTED} AS n`).bind(id, id).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Demandes envoyées encore en attente (sous-requête : paramètre id). */
const PENDING_SENT = `(SELECT COUNT(*) FROM friendships
  WHERE requested_by = ? AND status = 'pending')`;

interface ListRow {
  id: number;
  pseudo: string;
  status: 'pending' | 'accepted';
  requested_by: number;
  created_at: number;
  accepted_at: number | null;
  data: string | null;
  active_at: number | null;
}

/** Le résumé montré aux amis : niveau de l'équipe et donjons terminés, rien d'autre. */
function friendProgress(data: string | null): FriendProgress | null {
  const progress = saveProgress(data);
  if (progress === null) return null;
  return {
    team: progress.team,
    dungeons: { cleared: progress.dungeons.cleared, total: progress.dungeons.total },
  };
}

/** `GET /api/friends` : amis, demandes reçues, demandes envoyées. */
export async function listFriends(db: Database, me: number): Promise<FriendList> {
  // Sauvegarde et activité ne sont lues que pour les amis acceptés. Ni hash, ni jeton, ni clé de
  // pseudo dans les colonnes (la clé ne sert qu'au tri).
  const { results } = await db
    .prepare(
      `SELECT u.id, u.pseudo, f.status, f.requested_by, f.created_at, f.accepted_at,
         CASE WHEN f.status = 'accepted' THEN s.data END AS data,
         CASE WHEN f.status = 'accepted' THEN ${ACTIVITY} END AS active_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       LEFT JOIN saves s ON s.user_id = u.id
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY u.pseudo_key`,
    )
    .bind(SESSION_MS, me, me, me)
    .all<ListRow>();
  const friends: Friend[] = [];
  const received: FriendRequest[] = [];
  const sent: FriendRequest[] = [];
  for (const row of results) {
    if (row.status === 'accepted') {
      friends.push({
        id: row.id,
        pseudo: row.pseudo,
        since: row.accepted_at ?? row.created_at,
        // Arrondi au jour (UTC) : l'heure de connexion d'un ami n'est jamais transmise.
        lastActiveDay: Math.floor((row.active_at ?? 0) / DAY) * DAY,
        progress: friendProgress(row.data),
      });
    } else {
      (row.requested_by === me ? sent : received).push({
        id: row.id,
        pseudo: row.pseudo,
        at: row.created_at,
      });
    }
  }
  // Tri stable : à jour égal (ou à date égale), l'ordre des pseudos est gardé. L'ordre ne dit
  // donc rien de plus que le jour.
  friends.sort((x, y) => y.lastActiveDay - x.lastActiveDay);
  received.sort((x, y) => y.at - x.at);
  sent.sort((x, y) => y.at - x.at);
  return { friends, received, sent };
}

/** `GET /api/friends/pending` : le compte des demandes reçues (badge du camp, sans sauvegarde lue). */
export async function pendingFriends(db: Database, me: number): Promise<FriendPending> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS received FROM friendships
       WHERE status = 'pending' AND requested_by != ? AND (user_a = ? OR user_b = ?)`,
    )
    .bind(me, me, me)
    .first<FriendPending>();
  return { received: row?.received ?? 0 };
}

/** Les deux comptes doivent rester sous le plafond d'amis. */
async function checkRoom(db: Database, me: number, other: number): Promise<void> {
  if ((await friendCount(db, me)) >= FRIENDS_MAX) throw new HttpError(409, 'friends_full');
  if ((await friendCount(db, other)) >= FRIENDS_MAX) throw new HttpError(409, 'friend_full');
}

/** Accepte la demande de `other` ; les plafonds sont revérifiés dans l'écriture elle-même. */
async function accept(db: Database, me: number, other: number, now: number): Promise<void> {
  await checkRoom(db, me, other);
  const [a, b] = pair(me, other);
  const done = await db
    .prepare(
      `UPDATE friendships SET status = 'accepted', accepted_at = ?
       WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?
         AND ${ACCEPTED} < ? AND ${ACCEPTED} < ?`,
    )
    .bind(now, a, b, other, me, me, FRIENDS_MAX, other, other, FRIENDS_MAX)
    .run();
  // Deux requêtes simultanées : l'autre a changé l'état entre la lecture et l'écriture.
  if (done.meta.changes === 0) throw new HttpError(409, 'conflict');
}

/**
 * `POST /api/friends/requests` : demande par pseudo (comparé comme à l'inscription). Chaque essai
 * compte dans la limite de débit, réussi ou non : on ne peut pas sonder les pseudos sans limite.
 */
export async function requestFriend(
  db: Database,
  me: { readonly id: number; readonly pseudo: string },
  pseudo: string,
  now: number,
): Promise<FriendRequestAck> {
  const key = pseudoKey(pseudo.trim());
  if (key === pseudoKey(me.pseudo)) throw new HttpError(400, 'friend_self');
  if (!(await allow(db, requestThrottleKey(me.id), FRIEND_REQUESTS_PER_HOUR, HOUR, now))) {
    throw tooMany(HOUR);
  }
  const target = await db
    .prepare('SELECT id FROM users WHERE pseudo_key = ?')
    .bind(key)
    .first<{ id: number }>();
  if (target === null) throw new HttpError(404, 'friend_unknown');
  const other = target.id;
  const existing = await relation(db, me.id, other);
  if (existing?.status === 'accepted') throw new HttpError(409, 'already_friends');
  if (existing !== null) {
    if (existing.requested_by === me.id) throw new HttpError(409, 'already_requested');
    // Demande croisée : l'autre m'avait déjà demandé, c'est une amitié.
    await accept(db, me.id, other, now);
    return { outcome: 'accepted', list: await listFriends(db, me.id) };
  }
  await checkRoom(db, me.id, other);
  const [a, b] = pair(me.id, other);
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO friendships (user_a, user_b, requested_by, status, created_at)
       SELECT ?, ?, ?, 'pending', ? WHERE ${PENDING_SENT} < ?`,
    )
    .bind(a, b, me.id, now, me.id, FRIEND_REQUESTS_PENDING_MAX)
    .run();
  if (inserted.meta.changes === 0) {
    // Plafond des demandes en attente, ou demande arrivée en même temps de l'autre côté.
    const pending = await db
      .prepare(`SELECT ${PENDING_SENT} AS n`)
      .bind(me.id)
      .first<{ n: number }>();
    if ((pending?.n ?? 0) >= FRIEND_REQUESTS_PENDING_MAX) throw new HttpError(409, 'requests_full');
    throw new HttpError(409, 'conflict');
  }
  return { outcome: 'sent', list: await listFriends(db, me.id) };
}

/** `POST /api/friends/<id>/accept` : seulement le destinataire d'une demande en attente. */
export async function acceptFriend(
  db: Database,
  me: number,
  other: number,
  now: number,
): Promise<FriendList> {
  const existing = await relation(db, me, other);
  if (existing?.status === 'accepted') throw new HttpError(409, 'already_friends');
  if (existing?.requested_by !== other) throw new HttpError(404, 'not_found');
  await accept(db, me, other, now);
  return listFriends(db, me);
}

/** `POST /api/friends/<id>/decline` : le destinataire refuse ; la demande disparaît. */
export async function declineFriend(db: Database, me: number, other: number): Promise<FriendList> {
  const [a, b] = pair(me, other);
  const done = await db
    .prepare(
      `DELETE FROM friendships
       WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?`,
    )
    .bind(a, b, other)
    .run();
  if (done.meta.changes === 0) throw new HttpError(404, 'not_found');
  return listFriends(db, me);
}

/** `DELETE /api/friends/<id>` : retirer un ami, ou annuler (ou refuser) une demande. */
export async function removeFriend(db: Database, me: number, other: number): Promise<FriendList> {
  const [a, b] = pair(me, other);
  const done = await db
    .prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?')
    .bind(a, b)
    .run();
  if (done.meta.changes === 0) throw new HttpError(404, 'not_found');
  return listFriends(db, me);
}

/** Suppression d'un compte : ses amitiés, ses demandes et son compteur de demandes. */
export function forgetFriends(db: Database, userId: number): Statement[] {
  return [
    db.prepare('DELETE FROM friendships WHERE user_a = ? OR user_b = ?').bind(userId, userId),
    db.prepare('DELETE FROM throttle WHERE key = ?').bind(requestThrottleKey(userId)),
  ];
}
