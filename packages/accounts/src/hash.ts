import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Hachage des mots de passe, partagé par le Worker (node:crypto, actif par défaut dans Workers
 * depuis la date de compatibilité 2026-08-04) et l'outil d'administration (Node).
 *
 * Algorithme : scrypt (résistant en mémoire). argon2 n'est pas disponible dans Workers et PBKDF2
 * ne résiste pas aux cartes graphiques. Les paramètres voyagent avec le hash :
 * `scrypt$N$r$p$sel$hash` (base64url), pour pouvoir les durcir plus tard ; un compte haché avec
 * des paramètres plus faibles que `CURRENT` est re-haché à sa prochaine connexion.
 * Le choix des paramètres et ses limites sont expliqués dans docs/DECISIONS.md.
 */

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export const CURRENT: ScryptParams = { N: 2 ** 14, r: 8, p: 1 };

const KEY_BYTES = 32;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const { N, r, p } = params;
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_BYTES,
      { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
      (error, key) => {
        if (error === null) resolve(key);
        else reject(error);
      },
    );
  });
}

const b64 = (bytes: Buffer): string => bytes.toString('base64url');

export async function hashPassword(
  password: string,
  params: ScryptParams = CURRENT,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, b64(salt), b64(key)].join('$');
}

interface Parsed {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (N === undefined || r === undefined || p === undefined) return null;
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  return {
    params: { N, r, p },
    salt: Buffer.from(parts[4] ?? '', 'base64url'),
    key: Buffer.from(parts[5] ?? '', 'base64url'),
  };
}

export interface Verified {
  readonly ok: boolean;
  /** Vrai si le hash stocké utilise des paramètres plus faibles que `CURRENT`. */
  readonly rehash: boolean;
}

/** Vérifie un mot de passe ; la comparaison finale est à temps constant. */
export async function verifyPassword(password: string, stored: string): Promise<Verified> {
  const parsed = parse(stored);
  if (parsed === null || parsed.key.length !== KEY_BYTES) return { ok: false, rehash: false };
  const key = await derive(password, parsed.salt, parsed.params);
  const ok = timingSafeEqual(key, parsed.key);
  const { N, r, p } = parsed.params;
  const weaker = N * r * p < CURRENT.N * CURRENT.r * CURRENT.p || N < CURRENT.N;
  return { ok, rehash: ok && weaker };
}

let dummy: Promise<string> | null = null;

/**
 * Vérification factice pour un pseudo inconnu : même coût qu'une vraie, toujours fausse. Sans
 * elle, la durée de la réponse révélerait si le pseudo existe.
 */
export async function verifyAgainstNothing(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummy);
}

/** Jeton aléatoire de 256 bits, en hexadécimal. */
export function randomToken(): string {
  return randomBytes(32).toString('hex');
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Alphabet sans caractères ambigus (0/O, 1/l/I) pour un mot de passe dicté au joueur. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ2345679';

/** Mot de passe temporaire aléatoire de 16 caractères (≈ 92 bits), tirage sans biais. */
export function temporaryPassword(length = 16): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out.push(ALPHABET[byte % ALPHABET.length] ?? '');
    }
  }
  return out.join('');
}
