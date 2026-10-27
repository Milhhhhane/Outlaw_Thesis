import { spawnSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { describe, resetPassword, summarize, type AdminDb } from './reset';

/**
 * `pnpm admin:reset-password <pseudo> [--local]`
 * À lancer sur la machine du propriétaire, connecté à Cloudflare (`wrangler login`).
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DATABASE = 'outlaw-thesis';

function wranglerDb(local: boolean, persistTo: string | undefined): AdminDb {
  return {
    query(sql) {
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'wrangler',
          'd1',
          'execute',
          DATABASE,
          local ? '--local' : '--remote',
          '--json',
          ...(persistTo === undefined ? [] : ['--persist-to', persistTo]),
          '--command',
          sql,
        ],
        { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' },
      );
      if (result.status !== 0) {
        throw new Error(`wrangler a échoué :\n${result.stderr || result.stdout}`);
      }
      const parsed = JSON.parse(result.stdout) as { results?: Record<string, unknown>[] }[];
      return Promise.resolve(parsed[0]?.results ?? []);
    },
  };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const local = args.includes('--local');
  // Base locale de `wrangler dev --persist-to …` (essais du propriétaire).
  const persistIndex = args.indexOf('--persist-to');
  const persistTo = persistIndex === -1 ? undefined : args[persistIndex + 1];
  const pseudo = args.find((a, i) => !a.startsWith('--') && i !== persistIndex + 1);
  if (pseudo === undefined) {
    console.error('Usage : pnpm admin:reset-password <pseudo> [--local] [--persist-to <dossier>]');
    return 2;
  }
  const db = wranglerDb(local || persistTo !== undefined, persistTo);
  const summary = await summarize(db, pseudo);
  if (summary === null) {
    console.error(`Aucun compte « ${pseudo} ».`);
    return 1;
  }
  console.log(`\n${describe(summary)}\n`);
  console.log('Compare ce résumé aux réponses du joueur (docs/ACCOUNTS.md) avant de continuer.');
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `Tape « ${summary.pseudo} » pour réinitialiser, autre chose pour annuler : `,
  );
  rl.close();
  if (answer.trim() !== summary.pseudo) {
    console.log('Annulé : rien n’a changé.');
    return 1;
  }
  const password = await resetPassword(db, summary);
  console.log('\nMot de passe temporaire (affiché une seule fois, à transmettre au joueur) :\n');
  console.log(`    ${password}\n`);
  console.log('Toutes les sessions sont révoquées ; le joueur devra le changer à la connexion.');
  return 0;
}

process.exitCode = await main();
