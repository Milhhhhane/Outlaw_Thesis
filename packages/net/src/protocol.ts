import { idSchema, MAX_SIDE } from '@outlaw/data';
import { z } from 'zod';
import { roomRulesSchema } from './rules';
import { battleSetupSchema, loggedActionSchema, sideSchema } from './schemas';
import { TEAM_ERROR_CODES, shortIdSchema, teamHeroesSchema } from './team';

/** Version du protocole : à incrémenter dès qu'un message ou la logique du salon change de sens. */
export const PROTOCOL_VERSION = 1;

/** Taille maximale d'un message client, en octets UTF-8. */
export const MAX_MESSAGE_BYTES = 4096;

/** Émotes prédéfinies : pas de texte libre. Identifiants de 0 à 5. */
export const EMOTE_COUNT = 6;

/** Délai minimal entre deux émotes d'un même joueur, en ms. */
export const EMOTE_COOLDOWN_MS = 1500;

const hashSchema = z.string().min(1).max(64);
const detailSchema = z.string().max(200);
const timeSchema = z.number().int().min(0);

/* ------------------------------------------------------------------ client → serveur */

const actionFields = {
  spell: shortIdSchema,
  target: z.string().min(1).max(64).optional(),
};

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello'), v: z.number().int(), contentHash: hashSchema }),
  z.strictObject({ type: z.literal('set_rules'), rules: roomRulesSchema }),
  z.strictObject({ type: z.literal('set_team'), heroes: teamHeroesSchema }),
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('action'), ...actionFields }),
  z.strictObject({ type: z.literal('claim_timeout') }),
  z.strictObject({
    type: z.literal('emote'),
    id: z
      .number()
      .int()
      .min(0)
      .max(EMOTE_COUNT - 1),
  }),
  z.strictObject({ type: z.literal('resync') }),
  z.strictObject({ type: z.literal('rematch') }),
  z.strictObject({ type: z.literal('leave') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];

export type ParseFailure = 'too_large' | 'bad_json' | 'bad_schema';
export type ParsedClientMessage =
  | { readonly ok: true; readonly msg: ClientMessage }
  | { readonly ok: false; readonly code: ParseFailure; readonly detail?: string };

/** Taille d'un texte en octets UTF-8, sans dépendre d'un encodeur (ni du DOM, ni de Node). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // Paire de substituts : un point de code de 4 octets (un substitut isolé compte 3, comme U+FFFD).
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'message invalide';
  const where = issue.path.length === 0 ? 'racine' : issue.path.join('.');
  return `${where} : ${issue.message}`.slice(0, 200);
}

/** Lit un message client : taille, JSON, schéma strict. Ne lève jamais d'exception. */
export function parseClientMessage(text: string): ParsedClientMessage {
  if (typeof text !== 'string') return { ok: false, code: 'bad_json', detail: 'texte attendu' };
  if (utf8Length(text) > MAX_MESSAGE_BYTES) return { ok: false, code: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: 'bad_json' };
  }
  const parsed = clientMessageSchema.safeParse(json);
  if (!parsed.success)
    return { ok: false, code: 'bad_schema', detail: describeIssue(parsed.error) };
  return { ok: true, msg: parsed.data };
}

/* ------------------------------------------------------------------ serveur → client */

export const ERROR_CODES = [
  'too_large',
  'bad_json',
  'bad_schema',
  'version_mismatch',
  'content_mismatch',
  'hello_required',
  'not_host',
  'wrong_phase',
  'no_profile',
  'team_required',
  'team_rejected',
  'not_your_turn',
  'illegal_action',
  'not_expired',
  'rate_limited',
  'opponent_absent',
  'room_closed',
  ...TEAM_ERROR_CODES,
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const RESULT_REASONS = ['annihilation', 'action_limit', 'forfeit', 'disconnect'] as const;

/** Issue d'un combat. winner null = nul (anéantissement simultané, ou égalité de ratio de PV à la limite). */
export const roomResultSchema = z.strictObject({
  winner: sideSchema.nullable(),
  reason: z.enum(RESULT_REASONS),
  draw: z.literal(true).optional(),
});
export type RoomResult = z.infer<typeof roomResultSchema>;

const teamHeroViewSchema = z.strictObject({
  hero: idSchema,
  slot: z
    .number()
    .int()
    .min(0)
    .max(MAX_SIDE - 1),
  level: z.number().int().min(1),
  talents: z.array(idSchema),
  items: z.array(z.strictObject({ id: idSchema, upgrade: z.number().int().min(0) })),
});

/** L'état du salon tel que le voit un joueur : l'équipe adverse reste cachée jusqu'au début du combat. */
export const roomViewSchema = z.strictObject({
  phase: z.enum(['lobby', 'battle', 'ended']),
  you: z.enum(['p1', 'p2']),
  side: sideSchema,
  host: z.boolean(),
  rules: roomRulesSchema,
  /** Numéro du combat dans le salon : 0 pour le premier, +1 à chaque revanche. */
  battle: z.number().int().min(0),
  me: z.strictObject({
    connected: z.boolean(),
    ready: z.boolean(),
    team: z.array(teamHeroViewSchema).nullable(),
  }),
  opponent: z.strictObject({
    present: z.boolean(),
    connected: z.boolean(),
    ready: z.boolean(),
    hasTeam: z.boolean(),
    /** Fin de la période de grâce de l'adversaire déconnecté en plein combat, sinon null. */
    graceUntil: timeSchema.nullable(),
  }),
  rematch: z.strictObject({ me: z.boolean(), opponent: z.boolean() }),
  result: roomResultSchema.nullable(),
});
export type RoomView = z.infer<typeof roomViewSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('room'), room: roomViewSchema }),
  z.strictObject({
    type: z.literal('battle_start'),
    setup: battleSetupSchema,
    rules: roomRulesSchema,
    firstSide: sideSchema,
    /** Camp du destinataire. */
    you: sideSchema,
    /** Actions déjà jouées : vide au départ, pleine à la reprise (resync, reconnexion). */
    actions: z.array(loggedActionSchema),
    /** Empreinte de l'état après ces actions (voir hashState du moteur). */
    stateHash: hashSchema,
    /** Échéance de l'action en cours, en ms (horloge du serveur) ; null si le combat est fini. */
    deadline: timeSchema.nullable(),
    serverNow: timeSchema,
  }),
  z.strictObject({
    type: z.literal('applied'),
    actor: z.string().min(1).max(64),
    action: z.strictObject(actionFields),
    /** Présent quand le serveur a joué à la place du joueur. 'forfeit' est réservé (v1 : un forfait s'annonce par « result »). */
    auto: z.enum(['timeout', 'forfeit']).optional(),
    stateHash: hashSchema,
    deadline: timeSchema.nullable(),
    serverNow: timeSchema,
  }),
  roomResultSchema.extend({ type: z.literal('result') }),
  z.strictObject({
    type: z.literal('emote'),
    id: z
      .number()
      .int()
      .min(0)
      .max(EMOTE_COUNT - 1),
  }),
  /** Pseudos des deux places, envoyés par le serveur (le salon lui-même ne connaît pas les comptes). */
  z.strictObject({
    type: z.literal('names'),
    you: z.string().min(1).max(64),
    opponent: z.string().min(1).max(64).nullable(),
  }),
  z.strictObject({
    type: z.literal('error'),
    code: errorCodeSchema,
    detail: detailSchema.optional(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type ParsedServerMessage =
  | { readonly ok: true; readonly msg: ServerMessage }
  | { readonly ok: false; readonly detail: string };

/** Lit un message du serveur (côté client) ; sans limite de taille, le serveur est de confiance mais pas le réseau. */
export function parseServerMessage(text: string): ParsedServerMessage {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, detail: 'JSON invalide' };
  }
  const parsed = serverMessageSchema.safeParse(json);
  if (!parsed.success) return { ok: false, detail: describeIssue(parsed.error) };
  return { ok: true, msg: parsed.data };
}

/** Texte à envoyer sur la connexion. */
export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
