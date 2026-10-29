import {
  ADMIN_PAGE_DEFAULT,
  ADMIN_PAGE_MAX,
  pseudoKey,
  saveEnvelopeSchema,
  SESSION_MS,
  type AdminAccount,
  type AdminAccountDetail,
  type AdminAccountList,
  type AdminProgress,
} from '@outlaw/accounts';
import { loadContent, type Content, type Profile } from '@outlaw/data';
import { heroStars, tierReached } from '@outlaw/engine';
import type { Database } from './db';

/**
 * Administration en lecture seule (`GET /api/admin/*`) : comptes, activité et avancement. Les
 * administrateurs sont les pseudos du secret Cloudflare `ADMIN_PSEUDOS` (séparés par des virgules,
 * comparés comme à l'inscription, sans distinction de casse) ; rien n'est écrit dans le dépôt.
 * Le routage et le refus (404, comme une route inconnue) sont dans `index.ts`.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Au-delà, une page est forcément vide : la borne évite de passer n'importe quoi à SQLite. */
const MAX_OFFSET = 1_000_000_000;

/** Vrai si le pseudo figure dans le secret `ADMIN_PSEUDOS` (absent ou vide : personne). */
export function isAdmin(secret: string | undefined, pseudo: string): boolean {
  if (secret === undefined) return false;
  const key = pseudoKey(pseudo);
  return secret.split(',').some((entry) => {
    const name = entry.trim();
    return name !== '' && pseudoKey(name) === key;
  });
}

let loaded: Content | null = null;
/** Contenu du jeu, validé une seule fois par instance du Worker. */
function gameContent(): Content {
  loaded ??= loadContent();
  return loaded;
}

interface ReadSave {
  readonly profile: Profile;
  /** La sauvegarde contient déjà l'état des quêtes (sinon, elle les précède). */
  readonly quests: boolean;
}

/** Profil d'une sauvegarde, validé par le schéma du jeu ; null si absente ou invalide. */
function readSave(data: string | null): ReadSave | null {
  if (data === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = saveEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return null;
  // La validation remplit les champs absents par défaut : on regarde la donnée d'origine.
  const quests = (raw as { profile: Record<string, unknown> }).profile.quests !== undefined;
  return { profile: parsed.data.profile, quests };
}

/** Résumé d'avancement d'un profil (toutes les valeurs viennent du profil et du contenu). */
export function progressOf(content: Content, save: ReadSave): AdminProgress {
  const { profile } = save;
  const levels = profile.team.flatMap((id) => {
    const hero = profile.heroes[id];
    return hero === undefined ? [] : [hero.level];
  });
  const tiers = content.dungeons.map((d) => tierReached(content, profile, d.id));
  return {
    heroes: { unlocked: profile.unlocked.length, total: content.heroes.length },
    team: levels.length === 0 ? null : { min: Math.min(...levels), max: Math.max(...levels) },
    dungeons: {
      cleared: content.dungeons.filter((d) => (profile.dungeons[d.id]?.clears ?? 0) > 0).length,
      total: content.dungeons.length,
      bestTier: Math.max(1, ...tiers),
    },
    gold: profile.gold,
    items: profile.items.length,
    quests: save.quests
      ? {
          achievements: profile.quests.achievements.length,
          total: content.quests.achievements.length,
        }
      : null,
  };
}

/**
 * Dernière activité : la plus récente de la création, de la connexion, de la sauvegarde et de
 * l'usage d'une session. Une session repousse son expiration au plus une fois par jour (index.ts) :
 * `expires_at − SESSION_MS` date donc son dernier usage à un jour près, sans écriture de plus.
 */
const ACTIVITY = `MAX(
  u.created_at,
  COALESCE(u.last_login_at, 0),
  COALESCE(s.updated_at, 0),
  COALESCE((SELECT MAX(x.expires_at) FROM sessions x WHERE x.user_id = u.id), 0) - ?
)`;

/** Colonnes lues ; ni hash, ni jeton, ni clé de pseudo. Paramètres : SESSION_MS, maintenant. */
const ACCOUNT_SELECT = `SELECT u.id, u.pseudo, u.created_at, u.last_login_at,
  s.updated_at AS save_at, s.data,
  ${ACTIVITY} AS active_at,
  (SELECT COUNT(*) FROM sessions x WHERE x.user_id = u.id AND x.expires_at > ?) AS sessions
  FROM users u LEFT JOIN saves s ON s.user_id = u.id`;

interface AccountRow {
  id: number;
  pseudo: string;
  created_at: number;
  last_login_at: number | null;
  save_at: number | null;
  data: string | null;
  active_at: number;
  sessions: number;
}

function account(row: AccountRow, save: ReadSave | null): AdminAccount {
  return {
    id: row.id,
    pseudo: row.pseudo,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastSaveAt: row.save_at,
    lastActivityAt: row.active_at,
    activeSessions: row.sessions,
    progress: save === null ? null : progressOf(gameContent(), save),
  };
}

/** Entier lu dans la requête, borné ; absent ou mal formé : la valeur par défaut. */
function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** `GET /api/admin/users?limit=&offset=` : une page de comptes et les totaux. */
export async function listAccounts(db: Database, url: URL, now: number): Promise<AdminAccountList> {
  const limit = intParam(url, 'limit', ADMIN_PAGE_DEFAULT, 1, ADMIN_PAGE_MAX);
  const offset = intParam(url, 'offset', 0, 0, MAX_OFFSET);
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS accounts,
         COALESCE(SUM(active_at > ?), 0) AS active24h,
         COALESCE(SUM(active_at > ?), 0) AS active7d
       FROM (SELECT ${ACTIVITY} AS active_at FROM users u LEFT JOIN saves s ON s.user_id = u.id)`,
    )
    .bind(now - DAY, now - 7 * DAY, SESSION_MS)
    .first<AdminAccountList['total']>();
  const { results } = await db
    .prepare(`${ACCOUNT_SELECT} ORDER BY active_at DESC, u.id DESC LIMIT ? OFFSET ?`)
    .bind(SESSION_MS, now, limit, offset)
    .all<AccountRow>();
  return {
    total: totals ?? { accounts: 0, active24h: 0, active7d: 0 },
    limit,
    offset,
    accounts: results.map((row) => account(row, readSave(row.data))),
  };
}

/** `GET /api/admin/users/<id>` : un compte, ses héros débloqués et chaque donjon ; null si inconnu. */
export async function accountDetail(
  db: Database,
  id: number,
  now: number,
): Promise<AdminAccountDetail | null> {
  const row = await db
    .prepare(`${ACCOUNT_SELECT} WHERE u.id = ?`)
    .bind(SESSION_MS, now, id)
    .first<AccountRow>();
  if (row === null) return null;
  const save = readSave(row.data);
  if (save === null) return { ...account(row, null), heroes: null, dungeons: null };
  const content = gameContent();
  const { profile } = save;
  return {
    ...account(row, save),
    heroes: profile.unlocked.flatMap((heroId) => {
      const hero = profile.heroes[heroId];
      return hero === undefined
        ? []
        : [{ id: heroId, level: hero.level, stars: heroStars(hero, content) }];
    }),
    dungeons: content.dungeons.map((d) => ({
      id: d.id,
      clears: profile.dungeons[d.id]?.clears ?? 0,
      tier: tierReached(content, profile, d.id),
    })),
  };
}
