import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Database, Statement } from './db';

/**
 * D1 simulé par SQLite (module intégré à Node) pour les tests du Worker et de l'outil
 * d'administration. Même dialecte SQL que D1 ; seules les méthodes utilisées existent.
 */
export class SqliteDatabase implements Database {
  readonly raw = new DatabaseSync(':memory:');

  prepare(sql: string): Statement {
    return this.statement(sql, []);
  }

  private statement(sql: string, values: SQLInputValue[]): Statement {
    const raw = this.raw;
    /* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- signature de D1 */
    return {
      bind: (...next) => this.statement(sql, next),
      first: <T>() => Promise.resolve((raw.prepare(sql).get(...values) as T | undefined) ?? null),
      all: <T>() => Promise.resolve({ results: raw.prepare(sql).all(...values) as T[] }),
      /* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
      run: () => {
        const { changes } = raw.prepare(sql).run(...values);
        return Promise.resolve({ meta: { changes: Number(changes) } });
      },
    };
  }

  batch(statements: Statement[]): Promise<unknown> {
    this.raw.exec('BEGIN');
    try {
      // Sans `await` entre les instructions : rien d'autre ne s'intercale, comme dans un lot
      // D1 (atomique). `run` exécute la requête tout de suite et lève l'erreur sur place.
      for (const statement of statements) void statement.run();
      this.raw.exec('COMMIT');
    } catch (error) {
      this.raw.exec('ROLLBACK');
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return Promise.resolve(null);
  }
}
