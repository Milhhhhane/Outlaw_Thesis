import { pseudoKey, pseudoProblem } from '@outlaw/accounts';
import { hashPassword, temporaryPassword } from '@outlaw/accounts/hash';

/**
 * Réinitialisation d'un mot de passe par le propriétaire (docs/ACCOUNTS.md). La base est
 * atteinte par `wrangler d1 execute`, qui n'accepte pas de paramètres liés : les valeurs sont
 * insérées dans le SQL, après validation (pseudo) ou parce qu'elles sont générées ici (hash).
 */
export interface AdminDb {
  query(sql: string): Promise<Record<string, unknown>[]>;
}

export interface Summary {
  readonly id: number;
  readonly pseudo: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly heroes: readonly { readonly id: string; readonly level: number }[];
  readonly gold: number | null;
  readonly materials: readonly number[] | null;
  readonly dungeonsCleared: number | null;
  readonly saveUpdatedAt: string | null;
}

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const iso = (ms: unknown): string | null =>
  typeof ms === 'number' ? new Date(ms).toISOString() : null;

interface SaveData {
  profile?: {
    heroes?: Record<string, { level?: number }>;
    gold?: number;
    materials?: number[];
    dungeons?: Record<string, { clears?: number }>;
  };
}

export async function summarize(db: AdminDb, pseudo: string): Promise<Summary | null> {
  if (pseudoProblem(pseudo) === 'pseudo_chars' || pseudo.length > 20) return null;
  const rows = await db.query(
    `SELECT u.id, u.pseudo, u.created_at, u.last_login_at, s.data, s.updated_at
     FROM users u LEFT JOIN saves s ON s.user_id = u.id
     WHERE u.pseudo_key = ${quote(pseudoKey(pseudo))}`,
  );
  const row = rows[0];
  if (row === undefined) return null;
  const data = typeof row.data === 'string' ? (JSON.parse(row.data) as SaveData) : ({} as SaveData);
  const profile = data.profile;
  return {
    id: Number(row.id),
    pseudo: String(row.pseudo),
    createdAt: iso(row.created_at) ?? '?',
    lastLoginAt: iso(row.last_login_at),
    heroes: Object.entries(profile?.heroes ?? {}).map(([id, h]) => ({ id, level: h.level ?? 1 })),
    gold: profile?.gold ?? null,
    materials: profile?.materials ?? null,
    dungeonsCleared:
      profile?.dungeons === undefined
        ? null
        : Object.values(profile.dungeons).reduce((n, d) => n + (d.clears ?? 0), 0),
    saveUpdatedAt: iso(row.updated_at),
  };
}

export function describe(summary: Summary): string {
  const heroes =
    summary.heroes.length === 0
      ? 'aucun'
      : summary.heroes.map((h) => `${h.id} niv. ${String(h.level)}`).join(', ');
  return [
    `Pseudo             : ${summary.pseudo}`,
    `Compte créé le     : ${summary.createdAt}`,
    `Dernière connexion : ${summary.lastLoginAt ?? 'jamais'}`,
    `Sauvegarde du      : ${summary.saveUpdatedAt ?? 'aucune sauvegarde en ligne'}`,
    `Héros              : ${heroes}`,
    `Or                 : ${summary.gold === null ? '?' : String(summary.gold)}`,
    `Matériaux          : ${summary.materials === null ? '?' : summary.materials.join(' / ')}`,
    `Donjons terminés   : ${summary.dungeonsCleared === null ? '?' : String(summary.dungeonsCleared)}`,
  ].join('\n');
}

/**
 * Écrit un mot de passe temporaire (haché par le module partagé), exige son changement et
 * révoque toutes les sessions. Renvoie le mot de passe en clair, à transmettre une seule fois.
 */
export async function resetPassword(db: AdminDb, summary: Summary): Promise<string> {
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const id = String(summary.id);
  await db.query(`UPDATE users SET pw_hash = ${quote(hash)}, must_change = 1 WHERE id = ${id}`);
  await db.query(`DELETE FROM sessions WHERE user_id = ${id}`);
  await db.query(`DELETE FROM throttle WHERE key = ${quote(`login:${pseudoKey(summary.pseudo)}`)}`);
  return password;
}
