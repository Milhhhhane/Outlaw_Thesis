import { PROFILE_VERSION, profileSchema, type Content, type Profile } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';

/**
 * Sauvegarde locale versionnée. Chaque format passé a une migration vers le suivant ; une
 * sauvegarde illisible est mise de côté (clé « .bak ») et une nouvelle partie commence.
 */
export const SAVE_KEY = 'outlaw-thesis/save';

interface Envelope {
  readonly version: number;
  readonly profile: unknown;
}

/** Migrations : version N → N + 1. Vide tant que le format n'a pas changé. */
export const migrations: Readonly<
  Record<number, (profile: Record<string, unknown>) => Record<string, unknown>>
> = {};

export interface Loaded {
  readonly profile: Profile;
  /** Vrai si une sauvegarde existait mais était illisible. */
  readonly recovered: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function migrate(envelope: Envelope): unknown {
  let { version } = envelope;
  let profile = envelope.profile as Record<string, unknown>;
  while (version < PROFILE_VERSION) {
    const step = migrations[version];
    if (step === undefined) throw new Error(`aucune migration depuis la version ${version}`);
    profile = { ...step(profile), version: version + 1 };
    version += 1;
  }
  return profile;
}

export function parseSave(raw: string, content: Content): Profile {
  const envelope = JSON.parse(raw) as Envelope;
  const profile = profileSchema.parse(migrate(envelope));
  // Les héros et objets inconnus du contenu actuel rendraient la partie injouable.
  for (const id of Object.keys(profile.heroes)) {
    if (!content.heroById.has(id)) throw new Error(`héros inconnu : ${id}`);
  }
  for (const owned of profile.items) {
    if (!content.itemById.has(owned.item)) throw new Error(`objet inconnu : ${owned.item}`);
  }
  return profile;
}

export function loadProfile(content: Content, now: number): Loaded {
  const store = storage();
  const raw = store?.getItem(SAVE_KEY) ?? null;
  if (raw === null)
    return { profile: newProfile(content, Math.floor(now % 2 ** 31), now), recovered: false };
  try {
    return { profile: parseSave(raw, content), recovered: false };
  } catch {
    try {
      store?.setItem(`${SAVE_KEY}.bak`, raw);
    } catch {
      // Stockage plein ou bloqué : la copie de secours est perdue, la partie continue.
    }
    return { profile: newProfile(content, Math.floor(now % 2 ** 31), now), recovered: true };
  }
}

export function saveProfile(profile: Profile): void {
  try {
    const envelope: Envelope = { version: profile.version, profile };
    storage()?.setItem(SAVE_KEY, JSON.stringify(envelope));
  } catch {
    // Navigation privée ou stockage bloqué : la partie continue sans sauvegarde.
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // Rien à faire.
  }
}
