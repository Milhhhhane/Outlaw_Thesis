// Vérifie que le build sert les polices comme fichiers de même origine, jamais en `data:`.
// La CSP de production (`apps/web/public/_headers`) dit `font-src 'self'` : une police intégrée
// en `data:` y est bloquée et le texte retombe sur une autre police (voir `apps/web/vite.config.ts`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
const fontsDir = fileURLToPath(new URL('../apps/web/src/assets/fonts', import.meta.url));
const INLINE_FONT = /data:(?:font|application\/font|application\/x-font)/i;

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

const errors = [];

for (const file of files.filter((f) => ['.css', '.js', '.html'].includes(extname(f)))) {
  const match = INLINE_FONT.exec(readFileSync(file, 'utf8'));
  if (match !== null) {
    const rel = file.slice(distDir.length + 1).replaceAll('\\', '/');
    errors.push(`${rel} contient une police intégrée (« ${match[0]} »).`);
  }
}

const emitted = readdirSync(join(distDir, 'assets'));
const sources = readdirSync(fontsDir).filter((f) => extname(f) === '.woff2');
for (const font of sources) {
  const base = font.slice(0, -'.woff2'.length);
  // Vite ajoute une empreinte au nom : `Nom-<empreinte>.woff2`.
  const found = emitted.find(
    (f) => f === font || (f.startsWith(`${base}-`) && f.endsWith('.woff2')),
  );
  if (found === undefined) errors.push(`${font} absent de dist/assets.`);
  else console.log(`${font.padEnd(40)} → assets/${found}`);
}

if (sources.length === 0) errors.push(`Aucune police .woff2 trouvée dans ${fontsDir}.`);

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error('Polices : toutes doivent être servies en fichiers (CSP font-src self).');
  process.exit(1);
}
console.log(`${sources.length} polices servies en fichiers, aucune en data:.`);
