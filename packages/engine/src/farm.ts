import {
  PRESET_NAME_MAX,
  PRESET_SLOTS,
  type Content,
  type OwnedItem,
  type Profile,
  type TeamPreset,
} from '@outlaw/data';
import { chestCount, starCost } from './chests';
import { talentPoints } from './compile';
import { upgradeCost } from './items';
import {
  atStarGate,
  canLevelUp,
  energyAt,
  enterDungeon,
  setTeam,
  type DungeonReport,
  type Outcome,
  type Refusal,
} from './progression';

/**
 * Confort de farm : équipes enregistrées, choses à faire au camp, séries de passages et leur
 * bilan. Fonctions pures : (profil, demande) → nouveau profil, refus motivé ou résumé. Aucune
 * règle de récompense ici : le bilan additionne les `DungeonReport` de `completeDungeon`.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

// ===== Équipes enregistrées =====

/** Les emplacements d'équipe, toujours `PRESET_SLOTS` (null : vide). */
export function presetSlots(profile: Profile): (TeamPreset | null)[] {
  return Array.from({ length: PRESET_SLOTS }, (_, slot) => profile.presets[slot] ?? null);
}

const validSlot = (slot: number): boolean =>
  Number.isInteger(slot) && slot >= 0 && slot < PRESET_SLOTS;

/**
 * Enregistre l'équipe courante dans un emplacement, sous un nom (espaces de bord retirés, 1 à
 * `PRESET_NAME_MAX` caractères). Un emplacement déjà rempli est remplacé.
 */
export function savePreset(
  content: Content,
  profile: Profile,
  slot: number,
  name: string,
): Outcome {
  if (!validSlot(slot)) return refuse('no_preset');
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > PRESET_NAME_MAX) return refuse('bad_name');
  const size = content.balance.progression.teamSize;
  if (profile.team.length < 1 || profile.team.length > size) return refuse('bad_team');
  const presets = presetSlots(profile);
  presets[slot] = { name: trimmed, team: [...profile.team] };
  return ok({ ...profile, presets });
}

/** Héros d'une équipe enregistrée qui ne sont plus disponibles (non débloqués ou inconnus). */
export function presetMissing(content: Content, profile: Profile, slot: number): string[] {
  const preset = validSlot(slot) ? profile.presets[slot] : null;
  if (preset === null || preset === undefined) return [];
  return preset.team.filter((id) => !content.heroById.has(id) || !profile.unlocked.includes(id));
}

/**
 * Charge une équipe enregistrée comme équipe courante. Refus clair si l'emplacement est vide ou si
 * un de ses héros n'est plus disponible (`presetMissing` dit lequel) ; l'équipe reste alors telle
 * quelle.
 */
export function loadPreset(content: Content, profile: Profile, slot: number): Outcome {
  const preset = validSlot(slot) ? profile.presets[slot] : null;
  if (preset === null || preset === undefined) return refuse('no_preset');
  if (presetMissing(content, profile, slot).length > 0) return refuse('preset_unavailable');
  return setTeam(content, profile, preset.team);
}

// ===== Choses à faire au camp =====

/** Ce qu'un héros attend du joueur. */
export interface HeroTodo {
  /** Un niveau est payable (XP et poussière, pas d'étoile en attente). */
  readonly levelUp: boolean;
  /** Points de talent non placés. */
  readonly talents: number;
  /** L'étoile suivante est payable (héros au plafond, assez de fragments). */
  readonly star: boolean;
}

/** Ce que le joueur peut faire tout de suite, entrée par entrée du camp. */
export interface CampTodo {
  /** Héros dont un niveau est payable. */
  readonly levelUp: number;
  /** Points de talent à placer, tous héros confondus. */
  readonly talents: number;
  /** Héros dont l'étoile est payable. */
  readonly stars: number;
  /** Objets améliorables tout de suite (copies, or et poussière suffisants). */
  readonly items: number;
  /** Coffres fermés. */
  readonly chests: number;
}

const NOTHING: CampTodo = { levelUp: 0, talents: 0, stars: 0, items: 0, chests: 0 };

/** Ce qu'un héros débloqué attend ; rien pour un héros absent du profil. */
export function heroTodo(content: Content, profile: Profile, heroId: string): HeroTodo {
  const hero = profile.heroes[heroId];
  if (hero === undefined || !profile.unlocked.includes(heroId)) {
    return { levelUp: false, talents: 0, star: false };
  }
  const cost = starCost(content, hero);
  return {
    levelUp: canLevelUp(content, profile, hero),
    talents: Math.max(0, talentPoints(hero.level, content.balance) - hero.talents.length),
    star: cost !== null && atStarGate(hero, content) && (profile.fragments[heroId] ?? 0) >= cost,
  };
}

/** L'amélioration suivante de l'objet est payable tout de suite. */
export function canUpgradeItem(content: Content, profile: Profile, owned: OwnedItem): boolean {
  const cost = upgradeCost(content, owned.item, owned.upgrade);
  if (cost === null) return false;
  return (
    owned.copies >= cost.copies &&
    profile.gold >= cost.gold &&
    (profile.materials[cost.materials.tier - 1] ?? 0) >= cost.materials.amount
  );
}

/** Totaux des choses à faire. Le mode test n'a rien à faire : tout y est gratuit ou réglable. */
export function campTodo(content: Content, profile: Profile): CampTodo {
  if (profile.testMode) return NOTHING;
  let levelUp = 0;
  let talents = 0;
  let stars = 0;
  for (const id of profile.unlocked) {
    const todo = heroTodo(content, profile, id);
    if (todo.levelUp) levelUp += 1;
    if (todo.star) stars += 1;
    talents += todo.talents;
  }
  return {
    levelUp,
    talents,
    stars,
    items: profile.items.filter((owned) => canUpgradeItem(content, profile, owned)).length,
    chests: chestCount(profile),
  };
}

// ===== Séries de passages =====

/** Nombres de passages proposés ; « energy » : jusqu'à ce que l'énergie manque. */
export const FARM_RUNS = [1, 3, 5, 10, 'energy'] as const;
export type FarmRuns = (typeof FARM_RUNS)[number];

/**
 * Passages visés par une série : le nombre choisi, ou ce que l'énergie permet maintenant (au
 * moins un). null : pas de borne (entrée gratuite) ; la série s'arrête alors sur défaite ou sur
 * action du joueur.
 */
export function farmTarget(
  content: Content,
  profile: Profile,
  runs: FarmRuns,
  now: number,
): number | null {
  if (runs !== 'energy') return runs;
  const cost = content.balance.energy.costPerDungeon;
  if (cost <= 0) return null;
  return Math.max(1, Math.floor(energyAt(content, profile, now) / cost));
}

/** Pourquoi une série s'arrête d'elle-même : tous les passages joués, ou entrée refusée. */
export type SeriesStop = 'complete' | Refusal;

/**
 * Après `played` passages gagnés, la série continue-t-elle ? null : oui ; sinon la raison
 * (`complete`, ou le refus de `enterDungeon` : énergie insuffisante…).
 */
export function seriesNext(
  content: Content,
  profile: Profile,
  dungeonId: string,
  tier: number,
  now: number,
  played: number,
  target: number | null,
): SeriesStop | null {
  if (target !== null && played >= target) return 'complete';
  const entry = enterDungeon(content, profile, dungeonId, now, tier);
  return entry.ok ? null : entry.reason;
}

/** Un objet obtenu pendant la série. */
export interface SeriesItem {
  readonly item: string;
  /** Fois où il est tombé. */
  readonly count: number;
  /** Il était neuf à sa première chute. */
  readonly isNew: boolean;
  /** Chutes devenues des copies. */
  readonly copies: number;
  /** Chutes dissoutes en poussière (objet déjà au maximum). */
  readonly salvaged: number;
}

/** Bilan d'une série : la somme de ses `DungeonReport`. */
export interface SeriesSummary {
  readonly wins: number;
  readonly losses: number;
  readonly gold: number;
  /** Poussière gagnée par palier (récompenses et copies dissoutes). */
  readonly materials: Profile['materials'];
  /** Objets dans l'ordre de leur première chute. */
  readonly items: readonly SeriesItem[];
  readonly newItems: number;
  readonly copies: number;
  readonly salvaged: number;
  /** Coffres gagnés par palier de coffre. */
  readonly chests: Readonly<Record<string, number>>;
  /** Héros qui ont, à la fin, l'XP de leur niveau suivant (dernier rapport). */
  readonly levelReady: readonly string[];
  /** Rangs de maîtrise gagnés, dans l'ordre. */
  readonly mastery: readonly { readonly dungeon: string; readonly rank: number }[];
  /** Paliers de donjon ouverts. */
  readonly tiersUnlocked: readonly { readonly dungeon: string; readonly tier: number }[];
  /** Héros débloqués. */
  readonly heroes: readonly string[];
}

/** Additionne les rapports d'une série (passages gagnés) ; `losses` : passages perdus. */
export function summarizeSeries(reports: readonly DungeonReport[], losses = 0): SeriesSummary {
  const materials: Profile['materials'] = [0, 0, 0];
  const addDust = (tier: number, amount: number): void => {
    const index = tier - 1;
    materials[index] = (materials[index] ?? 0) + amount;
  };
  const items = new Map<string, SeriesItem>();
  const chests: Record<string, number> = {};
  let gold = 0;
  for (const report of reports) {
    gold += report.gold;
    addDust(report.materials.tier, report.materials.amount);
    const { item } = report;
    if (item.salvaged !== null) addDust(item.salvaged.tier, item.salvaged.amount);
    const previous = items.get(item.item);
    const copy = !item.isNew && item.salvaged === null ? 1 : 0;
    const salvaged = item.salvaged === null ? 0 : 1;
    items.set(item.item, {
      item: item.item,
      count: (previous?.count ?? 0) + 1,
      isNew: previous?.isNew ?? item.isNew,
      copies: (previous?.copies ?? 0) + copy,
      salvaged: (previous?.salvaged ?? 0) + salvaged,
    });
    if (report.chest !== null) chests[report.chest] = (chests[report.chest] ?? 0) + 1;
  }
  const list = [...items.values()];
  const last = reports.at(-1);
  return {
    wins: reports.length,
    losses,
    gold,
    materials,
    items: list,
    newItems: list.filter((i) => i.isNew).length,
    copies: list.reduce((sum, i) => sum + i.copies, 0),
    salvaged: list.reduce((sum, i) => sum + i.salvaged, 0),
    chests,
    levelReady:
      last === undefined
        ? []
        : Object.entries(last.xp)
            .filter(([, gain]) => gain.ready)
            .map(([hero]) => hero),
    mastery: reports
      .filter((r) => r.mastery.rankUp)
      .map((r) => ({ dungeon: r.dungeon, rank: r.mastery.rank })),
    tiersUnlocked: reports.flatMap((r) =>
      r.tierUnlocked === null ? [] : [{ dungeon: r.dungeon, tier: r.tierUnlocked }],
    ),
    heroes: reports.flatMap((r) => (r.unlockedHero === null ? [] : [r.unlockedHero])),
  };
}
