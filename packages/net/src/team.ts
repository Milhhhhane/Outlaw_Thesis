import type { Balance, Content, Profile } from '@outlaw/data';
import { idSchema, MAX_SIDE, NODES_PER_PAGE, PAGES_PER_HERO } from '@outlaw/data';
import {
  compileTeam,
  talentPoints,
  unlockedPages,
  validateBuild,
  type HeroBuild,
  type UnitDef,
} from '@outlaw/engine';
import { z } from 'zod';
import { sideOf, type PlayerId } from './players';
import type { RoomRules } from './rules';

/** Héros par équipe : la taille d'équipe du jeu (`balance.progression.teamSize`), la même qu'en PvE. */
export function teamSizeOf(balance: Balance): number {
  return balance.progression.teamSize;
}

/** Identifiant court : tout champ texte d'un message client est borné. */
export const shortIdSchema = idSchema.max(64);

/**
 * Un héros de l'équipe demandée. Les objets sont des exemplaires du profil (uid) ;
 * le niveau n'est pas envoyé : il vient du profil et du plafond du salon.
 */
export const teamHeroSchema = z.strictObject({
  hero: shortIdSchema,
  /** Emplacement dans la ligne, de gauche à droite : l'équipe couvre 0 à `teamSize` − 1. */
  slot: z.number().int().min(0).max(99),
  talents: z.array(shortIdSchema).max(NODES_PER_PAGE.max * PAGES_PER_HERO),
  items: z.array(z.number().int().min(0)).max(4),
});

/** Bornes larges : c'est validateTeam qui refuse avec un code précis (team_size, bad_slots…). */
export const teamHeroesSchema = z.array(teamHeroSchema).max(2 * MAX_SIDE);
export const teamRequestSchema = z.strictObject({ heroes: teamHeroesSchema });
export type TeamRequest = z.infer<typeof teamRequestSchema>;

export const TEAM_ERROR_CODES = [
  'team_size',
  'bad_slots',
  'duplicate_hero',
  'hero_not_owned',
  'items_forbidden',
  'item_not_owned',
  'unknown_talent',
  'talent_invalid',
  'talents_over_budget',
  'tier_budget_exceeded',
] as const;
export type TeamErrorCode = (typeof TEAM_ERROR_CODES)[number];

export interface ValidatedTeam {
  readonly ok: true;
  /** Builds finaux (niveau plafonné), classés par emplacement : l'indice est l'emplacement. */
  readonly builds: readonly HeroBuild[];
  /** Somme des paliers des héros de l'équipe. */
  readonly tier: number;
}
export interface RejectedTeam {
  readonly ok: false;
  readonly code: TeamErrorCode;
  readonly detail?: string;
}
export type TeamCheck = ValidatedTeam | RejectedTeam;

export interface TeamInput {
  readonly profile: Profile;
  readonly request: TeamRequest;
  readonly rules: RoomRules;
  readonly content: Content;
  /** Équilibrage utilisé pour les points de talent et le niveau maximal ; par défaut celui du contenu. */
  readonly balance?: Balance;
}

const reject = (code: TeamErrorCode, detail?: string): RejectedTeam =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail };

interface TalentNode {
  readonly requires?: string | undefined;
  readonly group?: string | undefined;
}

/** Talent pris deux fois, prérequis manquant ou choix exclusif violé : le premier problème, ou null. */
function invalidTalent(talents: readonly string[], nodes: ReadonlyMap<string, TalentNode>) {
  const chosen = new Set<string>();
  const groups = new Map<string, string>();
  for (const id of talents) {
    if (chosen.has(id)) return `${id} pris deux fois`;
    chosen.add(id);
    const group = nodes.get(id)?.group;
    if (group === undefined) continue;
    const taken = groups.get(group);
    if (taken !== undefined) return `choix exclusif : ${taken} ou ${id}`;
    groups.set(group, id);
  }
  for (const id of chosen) {
    const requires = nodes.get(id)?.requires;
    if (requires !== undefined && !chosen.has(requires)) return `${id} exige ${requires}`;
  }
  return null;
}

/**
 * Valide l'équipe demandée par un joueur contre son profil et les règles du salon.
 *
 * Ordre des contrôles (le premier refus l'emporte) : team_size, bad_slots, duplicate_hero,
 * hero_not_owned, items_forbidden, puis par héros dans l'ordre des emplacements : bad_slots
 * (trop d'objets, ou deux fois le même objet), item_not_owned, unknown_talent, talent_invalid,
 * talents_over_budget ; enfin tier_budget_exceeded.
 *
 * Le niveau de chaque héros est min(niveau du profil, plafond du salon). Les talents sont libres
 * dans la limite des points et des pages du niveau plafonné : ceux enregistrés dans le profil ne
 * comptent pas. Les objets doivent être des exemplaires du profil, chacun pour un seul héros.
 */
export function validateTeam(input: TeamInput): TeamCheck {
  const { profile, request, rules, content } = input;
  const balance = input.balance ?? content.balance;
  const heroes = [...request.heroes].sort((a, b) => a.slot - b.slot);

  if (heroes.length !== teamSizeOf(balance)) return reject('team_size', String(heroes.length));
  if (heroes.some((entry, index) => entry.slot !== index)) return reject('bad_slots');

  const seen = new Set<string>();
  for (const entry of heroes) {
    if (seen.has(entry.hero)) return reject('duplicate_hero', entry.hero);
    seen.add(entry.hero);
  }
  for (const entry of heroes) {
    const owned =
      content.heroById.has(entry.hero) &&
      profile.unlocked.includes(entry.hero) &&
      profile.heroes[entry.hero] !== undefined;
    if (!owned) return reject('hero_not_owned', entry.hero);
  }
  if (!rules.items && heroes.some((entry) => entry.items.length > 0)) {
    return reject('items_forbidden');
  }

  const { slots: itemSlots, maxUpgradeLevel } = balance.progression.items;
  const usedUids = new Set<number>();
  const builds: HeroBuild[] = [];
  let tier = 0;
  for (const entry of heroes) {
    const def = content.heroById.get(entry.hero);
    const progress = profile.heroes[entry.hero];
    if (def === undefined || progress === undefined) return reject('hero_not_owned', entry.hero);
    const level = Math.min(progress.level, rules.maxLevel, balance.progression.maxLevel);

    if (entry.items.length > itemSlots) return reject('bad_slots', `${entry.hero} : objets`);
    const items: { id: string; upgrade: number }[] = [];
    for (const uid of entry.items) {
      const owned = profile.items.find((candidate) => candidate.uid === uid);
      // Un exemplaire ne sert qu'à un héros à la fois ; une amélioration hors bornes est suspecte.
      if (owned === undefined || usedUids.has(uid) || owned.upgrade > maxUpgradeLevel) {
        return reject('item_not_owned', String(uid));
      }
      if (!content.itemById.has(owned.item)) return reject('item_not_owned', String(uid));
      if (items.some((equipped) => equipped.id === owned.item)) {
        return reject('bad_slots', `${entry.hero} : ${owned.item} deux fois`);
      }
      usedUids.add(uid);
      items.push({ id: owned.item, upgrade: owned.upgrade });
    }

    const nodes = new Map<string, { page: number; requires?: string; group?: string }>();
    def.pages.forEach((page, index) => {
      for (const node of page.nodes) {
        nodes.set(node.id, { page: index, requires: node.requires, group: node.group });
      }
    });
    const unknown = entry.talents.find((id) => !nodes.has(id));
    if (unknown !== undefined) return reject('unknown_talent', unknown);
    const invalid = invalidTalent(entry.talents, nodes);
    if (invalid !== null) return reject('talent_invalid', `${entry.hero} : ${invalid}`);

    const pages = unlockedPages(level, balance);
    const locked = entry.talents.find((id) => (nodes.get(id)?.page ?? 0) >= pages);
    if (locked !== undefined) {
      return reject('talents_over_budget', `${entry.hero} : page de ${locked} verrouillée`);
    }
    const points = talentPoints(level, balance);
    if (entry.talents.length > points) {
      return reject('talents_over_budget', `${entry.hero} : ${entry.talents.length} > ${points}`);
    }
    const build: HeroBuild = { hero: entry.hero, level, talents: [...entry.talents], items };
    // Filet de sécurité : le moteur doit être d'accord avec les contrôles ci-dessus.
    if (validateBuild(content, build).length > 0) return reject('talent_invalid', entry.hero);
    builds.push(build);
    tier += def.tier;
  }

  if (rules.tierBudget !== null && tier > rules.tierBudget) {
    return reject('tier_budget_exceeded', `${tier} > ${rules.tierBudget}`);
  }
  return { ok: true, builds, tier };
}

/** Unités de combat d'un joueur : héros pilotés, identifiants « p1_<héros> » / « p2_<héros> ». */
export function compilePlayerTeam(
  content: Content,
  builds: readonly HeroBuild[],
  player: PlayerId,
): UnitDef[] {
  return compileTeam(content, builds, sideOf(player)).map((def) => ({
    ...def,
    id: `${player}_${def.kind}`,
  }));
}
