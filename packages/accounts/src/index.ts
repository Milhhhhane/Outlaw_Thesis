import { profileSchema } from '@outlaw/data';
import { z } from 'zod';

/**
 * Règles des comptes, partagées par le jeu (messages immédiats), le Worker (seul juge) et l'outil
 * d'administration. Aucun accès réseau, stockage ou cryptographie ici : le module tourne partout.
 */

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 20;
export const PASSWORD_MIN = 10;
/** Borne haute : le hachage coûte du temps processeur, un texte géant ne doit pas l'aggraver. */
export const PASSWORD_MAX = 128;
/** Taille maximale d'une sauvegarde envoyée au serveur (200 Ko). */
export const MAX_SAVE_BYTES = 200 * 1024;
/** Durée de vie glissante d'une session. */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const PSEUDO_RE = /^[A-Za-z0-9_-]+$/;

/** Clé d'unicité d'un pseudo : sans distinction de casse. */
export function pseudoKey(pseudo: string): string {
  return pseudo.toLowerCase();
}

/**
 * Mots refusés dans un pseudo. Courte liste volontaire : usurpation du créateur ou de l'équipe,
 * et quelques insultes. Les mots longs sont cherchés partout dans le pseudo, les courts doivent
 * être le pseudo entier (sinon « computer » tomberait).
 */
const BANNED_ANYWHERE = [
  'admin',
  'moderat',
  'createur',
  'officiel',
  'official',
  'connard',
  'salope',
  'encule',
  'hitler',
  'fuck',
  'bitch',
];
const BANNED_EXACT = [
  'root',
  'staff',
  'support',
  'modo',
  'system',
  'systeme',
  'pute',
  'nazi',
  'pd',
];

/** Forme de comparaison : minuscules, chiffres déguisés en lettres, séparateurs retirés. */
function folded(pseudo: string): string {
  const leet: Readonly<Record<string, string>> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
  };
  return Array.from(pseudo.toLowerCase().replace(/[_-]/g, ''))
    .map((c) => leet[c] ?? c)
    .join('');
}

export type PseudoProblem = 'pseudo_length' | 'pseudo_chars' | 'pseudo_banned';

export function pseudoProblem(pseudo: string): PseudoProblem | null {
  if (pseudo.length < PSEUDO_MIN || pseudo.length > PSEUDO_MAX) return 'pseudo_length';
  if (!PSEUDO_RE.test(pseudo)) return 'pseudo_chars';
  const f = folded(pseudo);
  if (BANNED_EXACT.includes(f) || BANNED_ANYWHERE.some((w) => f.includes(w)))
    return 'pseudo_banned';
  return null;
}

export type PasswordProblem = 'password_length' | 'password_pseudo' | 'password_common';

/**
 * Règles du mot de passe : longueur seulement (pas de composition imposée), différent du pseudo.
 * La liste des mots de passe courants est vérifiée par le serveur (`isCommonPassword`).
 */
export function passwordProblem(password: string, pseudo: string): PasswordProblem | null {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) return 'password_length';
  if (password.toLowerCase().includes(pseudo.toLowerCase()) && pseudo.length >= PSEUDO_MIN)
    return 'password_pseudo';
  return null;
}

/** Enveloppe de sauvegarde : le même format que le stockage local du jeu. */
export const saveEnvelopeSchema = z.strictObject({
  version: z.number().int(),
  profile: profileSchema,
});
export type SaveEnvelope = z.infer<typeof saveEnvelopeSchema>;

const text = z.string().max(256);

export const credentialsSchema = z.strictObject({ pseudo: text, password: text });
export const registerSchema = z.strictObject({
  pseudo: text,
  password: text,
  /** La case « pas de récupération automatique » a été cochée. */
  accept: z.literal(true),
});
export const passwordChangeSchema = z.strictObject({ oldPassword: text, newPassword: text });
export const deleteAccountSchema = z.strictObject({ password: text });
export const savePutSchema = z.strictObject({
  baseRev: z.number().int().min(0),
  save: saveEnvelopeSchema,
});

/** Réponses de l'API. */
export interface Me {
  readonly pseudo: string;
  readonly mustChangePassword: boolean;
}
export interface CloudSave {
  readonly rev: number;
  readonly updatedAt: number | null;
  readonly save: SaveEnvelope | null;
}
export interface SaveAck {
  readonly rev: number;
  readonly updatedAt: number;
}

/** Codes d'erreur renvoyés par l'API (`{ error }`), traduits par le jeu. */
export type ApiError =
  | PseudoProblem
  | PasswordProblem
  | 'invalid'
  | 'too_large'
  | 'bad_origin'
  | 'bad_credentials'
  | 'pseudo_taken'
  | 'too_many'
  | 'unauthenticated'
  | 'must_change_password'
  | 'conflict'
  | 'not_found';
