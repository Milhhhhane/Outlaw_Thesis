// Vérifie que le bundle JS + CSS de production reste sous 300 ko gzippé (budget du MVP).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 300 * 1024;
const distDir = fileURLToPath(new URL('../apps/web/dist', import.meta.url));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

let files;
try {
  files = listFiles(distDir);
} catch {
  console.error(`Dossier introuvable : ${distDir}. Lancez d'abord « pnpm build ».`);
  process.exit(1);
}

const counted = files.filter((f) => ['.js', '.css', '.html'].includes(extname(f)));
const rows = counted.map((f) => ({
  file: f.slice(distDir.length + 1).replaceAll('\\', '/'),
  gzip: gzipSync(readFileSync(f)).length,
}));
const total = rows.reduce((sum, r) => sum + r.gzip, 0);

for (const r of rows) console.log(`${String(r.gzip).padStart(8)} o  ${r.file}`);
console.log(`${String(total).padStart(8)} o  TOTAL gzip (budget ${BUDGET_BYTES} o)`);

if (total > BUDGET_BYTES) {
  console.error('Budget de taille dépassé.');
  process.exit(1);
}
