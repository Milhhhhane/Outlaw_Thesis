/**
 * Accès à D1 : le sous-ensemble de l'API utilisé ici (ce qui permet aussi de tester le Worker
 * sous Node avec SQLite, voir `testing.ts`) et les migrations de schéma versionnées.
 */

// Les paramètres de type reprennent la signature de l'API D1 (le type du résultat est choisi par l'appelant).
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

export interface Database {
  prepare(sql: string): Statement;
  /** Exécute les requêtes dans une transaction : tout ou rien. */
  batch(statements: Statement[]): Promise<unknown>;
}

/**
 * Migrations, dans l'ordre. Une migration publiée ne se modifie plus : on en ajoute une. Le
 * Worker les applique lui-même au premier appel (table `_schema`), si bien qu'un déploiement ne
 * demande aucune commande manuelle. Chaque instruction est idempotente (IF NOT EXISTS) pour que
 * deux instances qui démarrent ensemble ne se gênent pas.
 */
export const MIGRATIONS: readonly { readonly id: number; readonly sql: readonly string[] }[] = [
  {
    id: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        pseudo TEXT NOT NULL,
        pseudo_key TEXT NOT NULL UNIQUE,
        pw_hash TEXT NOT NULL,
        must_change INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
      `CREATE TABLE IF NOT EXISTS saves (
        user_id INTEGER PRIMARY KEY,
        rev INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS throttle (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
    ],
  },
  {
    // Amis : une ligne par paire, le plus petit identifiant en `user_a` (unicité de la paire).
    id: 2,
    sql: [
      `CREATE TABLE IF NOT EXISTS friendships (
        user_a INTEGER NOT NULL,
        user_b INTEGER NOT NULL,
        requested_by INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
        created_at INTEGER NOT NULL,
        accepted_at INTEGER,
        PRIMARY KEY (user_a, user_b),
        CHECK (user_a < user_b),
        CHECK (requested_by IN (user_a, user_b))
      )`,
      // La clé primaire sert les recherches par `user_a` ; celles par `user_b` ont leur index.
      'CREATE INDEX IF NOT EXISTS friendships_b ON friendships (user_b)',
      // Plafond des demandes envoyées en attente.
      'CREATE INDEX IF NOT EXISTS friendships_requester ON friendships (requested_by, status)',
    ],
  },
];

const ready = new WeakSet<Database>();

export async function ensureSchema(db: Database, now: number): Promise<void> {
  if (ready.has(db)) return;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS _schema (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
    )
    .run();
  const { results } = await db.prepare('SELECT id FROM _schema').all<{ id: number }>();
  const applied = new Set(results.map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.batch([
      ...migration.sql.map((sql) => db.prepare(sql)),
      db
        .prepare('INSERT OR IGNORE INTO _schema (id, applied_at) VALUES (?, ?)')
        .bind(migration.id, now),
    ]);
  }
  ready.add(db);
}
