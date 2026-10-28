/**
 * @outlaw/net doit tourner sous Node comme dans un Durable Object ou un navigateur : aucune
 * entrée/sortie, aucune horloge, aucun hasard, aucun import hors des trois dépendances prévues.
 * Le linter du dépôt ne couvre que le moteur ; ce test garde le même contrat pour ce paquet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const files = readdirSync(srcDir).filter((name) => name.endsWith('.ts'));

/** Le code sans ses commentaires ni ses chaînes : les mots interdits ne comptent que dans le code. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, "''");
}

const FORBIDDEN: readonly [string, RegExp][] = [
  ['horloge', /\bDate\b|\bperformance\b/],
  ['hasard', /\bMath\.random\b|\bcrypto\b/],
  ['minuteries', /\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b/],
  ['réseau', /\bfetch\b|\bWebSocket\b|\bXMLHttpRequest\b/],
  ['navigateur', /\bwindow\b|\bdocument\b|\blocalStorage\b|\bsessionStorage\b|\bnavigator\b/],
  ['Node', /\bprocess\b|\bBuffer\b|\brequire\b|\b__dirname\b/],
  ['journal', /\bconsole\b/],
  ['Cloudflare', /\bDurableObject\b|\bcloudflare\b|\bKVNamespace\b|\bD1Database\b/i],
  ['encodeurs', /\bTextEncoder\b|\bTextDecoder\b/],
];

describe('pureté du paquet', () => {
  it('le dossier src contient les modules attendus', () => {
    expect(files.sort()).toEqual([
      'content.ts',
      'index.ts',
      'persist.ts',
      'players.ts',
      'protocol.ts',
      'room.ts',
      'rules.ts',
      'schemas.ts',
      'team.ts',
    ]);
  });

  it.each(files)('%s : ni horloge, ni hasard, ni entrée/sortie', (file) => {
    const text = code(readFileSync(join(srcDir, file), 'utf8'));
    for (const [what, pattern] of FORBIDDEN) {
      expect(pattern.test(text), `${file} : ${what}`).toBe(false);
    }
  });

  it.each(files)('%s : seuls les imports prévus', (file) => {
    const text = readFileSync(join(srcDir, file), 'utf8');
    const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
    for (const specifier of specifiers) {
      const allowed =
        specifier.startsWith('./') || ['@outlaw/data', '@outlaw/engine', 'zod'].includes(specifier);
      expect(allowed, `${file} importe ${specifier}`).toBe(true);
    }
  });

  it('le paquet ne dépend que des données, du moteur et de Zod', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@outlaw/data',
      '@outlaw/engine',
      'zod',
    ]);
  });

  it('la détection voit bien un mot interdit (le test n’est pas aveugle)', () => {
    expect(FORBIDDEN.some(([, pattern]) => pattern.test(code('const t = Date.now();')))).toBe(true);
    expect(FORBIDDEN.some(([, pattern]) => pattern.test(code('// Date.now()\nconst a = 1;')))).toBe(
      false,
    );
    expect(FORBIDDEN.some(([, pattern]) => pattern.test(code("const a = 'Date';")))).toBe(false);
  });
});
