import { MAX_SIDE } from '@outlaw/data';
import { z } from 'zod';
import { roomResultSchema } from './protocol';
import { roomRulesSchema } from './rules';
import { battleSetupSchema, loggedActionSchema, sideSchema, unitDefSchema } from './schemas';
import { ROOM_FORMAT, type Room } from './room';
import { teamRequestSchema } from './team';

const teamEntrySchema = z.strictObject({
  request: teamRequestSchema,
  builds: z.array(
    z.strictObject({
      hero: z.string(),
      level: z.number().int().min(1),
      talents: z.array(z.string()),
      items: z.array(z.strictObject({ id: z.string(), upgrade: z.number().int().min(0) })),
    }),
  ),
  units: z.array(unitDefSchema).max(MAX_SIDE),
});

const playerSchema = z.strictObject({
  joined: z.boolean(),
  connected: z.boolean(),
  ready: z.boolean(),
  team: teamEntrySchema.nullable(),
  graceUntil: z.number().int().min(0).nullable(),
  timeouts: z.number().int().min(0),
  emoteAt: z.number().int().min(0).nullable(),
  rematch: z.boolean(),
});

/**
 * Forme exacte d'un salon stocké : vérifiée à chaque lecture, un stockage abîmé ne doit rien jouer.
 * Typé z.ZodType<Room> : le compilateur vérifie qu'il décrit exactement le type Room.
 */
export const roomSchema: z.ZodType<Room> = z.strictObject({
  format: z.literal(ROOM_FORMAT),
  phase: z.enum(['lobby', 'battle', 'ended']),
  rules: roomRulesSchema,
  players: z.strictObject({ p1: playerSchema, p2: playerSchema }),
  battle: z
    .strictObject({
      index: z.number().int().min(0),
      firstSide: sideSchema,
      setup: battleSetupSchema,
      actions: z.array(loggedActionSchema),
      deadline: z.number().int().min(0).nullable(),
    })
    .nullable(),
  result: roomResultSchema.nullable(),
});

export class RoomFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomFormatError';
  }
}

/** Salon → texte JSON (pour le stockage du Durable Object). */
export function serializeRoom(room: Room): string {
  return JSON.stringify(room);
}

/** Texte JSON → salon. Lève RoomFormatError si le texte n'est pas un salon valide de ce format. */
export function deserializeRoom(text: string): Room {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RoomFormatError('JSON invalide');
  }
  const parsed = roomSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RoomFormatError(
      `salon invalide : ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}
