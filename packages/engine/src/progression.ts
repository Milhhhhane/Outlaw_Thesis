import {
  BASE_SPELL_LEVELS,
  PROFILE_VERSION,
  type Content,
  type HeroProgress,
  type Profile,
} from '@outlaw/data';
import { validateBuild, type HeroBuild } from './compile';
import { lootTable, masteryMaterialsFactor, masteryNext, masteryRank, ownedItem } from './loot';
import { salvageOf } from './items';
import { rollChest, tierFrontier, tierOpen, tierRewardFactor } from './tiers';

/**
 * Progression hors combat : XP, niveaux, talents, respec, objets, récompenses et butin.
 * Fonctions pures : (profil, demande) → nouveau profil ou refus motivé. Le seul hasard (le butin)
 * vient d'un générateur à graine stockée dans le profil : même profil, même tirage.
 */

export type Refusal =
  | 'unknown_hero'
  | 'locked_hero'
  | 'unknown_node'
  | 'talent_invalid'
  | 'no_talent'
  | 'not_enough_gold'
  | 'not_enough_materials'
  | 'not_enough_copies'
  | 'unknown_item'
  | 'max_upgrade'
  | 'bad_slot'
  | 'bad_team'
  | 'unknown_dungeon'
  | 'no_energy'
  | 'test_only'
  | 'test_mode'
  | 'no_chest'
  | 'not_enough_fragments'
  | 'already_unlocked'
  | 'not_at_cap'
  | 'max_star'
  | 'max_level'
  | 'star_gate'
  | 'not_enough_xp'
  | 'tier_locked'
  | 'not_enough_grimoires'
  | 'max_spell_level'
  | 'unknown_floor'
  | 'floor_locked';

export type Outcome<T = Profile> = { ok: true; value: T } | { ok: false; reason: Refusal };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

/** Héros disponibles dès le début : ceux marqués « starter » (les autres viennent des donjons ou des coffres). */
export function starterHeroes(content: Content): string[] {
  return content.heroes.filter((h) => h.starter).map((h) => h.id);
}

/** Palier (étoile) que implique un niveau : le niveau 10 est encore à l'étoile 0, le 11 à l'étoile 1. */
export function starsForLevel(level: number, content: Content): number {
  return Math.max(0, Math.ceil(level / content.balance.progression.levelsPerStar) - 1);
}

/**
 * Étoiles d'un héros : le plus grand de celles payées et de celles que son niveau implique. Une
 * ancienne sauvegarde (niveau 25, aucune étoile enregistrée) garde donc ses niveaux.
 */
export function heroStars(hero: HeroProgress, content: Content): number {
  return Math.max(hero.stars, starsForLevel(hero.level, content));
}

/** Niveau que le héros ne peut pas dépasser tant qu'il n'a pas payé l'étoile suivante. */
export function levelCap(hero: HeroProgress, content: Content): number {
  const { maxLevel, levelsPerStar } = content.balance.progression;
  return Math.min(maxLevel, (heroStars(hero, content) + 1) * levelsPerStar);
}

/** Vrai si le héros attend une étoile pour continuer (niveau plafonné, mais pas au maximum du jeu). */
export function atStarGate(hero: HeroProgress, content: Content): boolean {
  return hero.level >= levelCap(hero, content) && hero.level < content.balance.progression.maxLevel;
}

export function freshHero(level: number, content: Content): HeroProgress {
  return {
    level,
    xp: 0,
    talents: [],
    items: Array.from({ length: content.balance.progression.items.slots }, () => null),
    freeRespecUsed: false,
    stars: starsForLevel(level, content),
    spells: BASE_SPELL_LEVELS,
  };
}

export function newProfile(content: Content, seed = 1, now = 0): Profile {
  const starters = starterHeroes(content);
  return {
    version: PROFILE_VERSION,
    seed,
    gold: 0,
    materials: [0, 0, 0],
    energy: { value: content.balance.energy.cap, updatedAt: now },
    heroes: Object.fromEntries(starters.map((id) => [id, freshHero(1, content)])),
    unlocked: starters,
    team: starters.slice(0, content.balance.progression.teamSize),
    items: [],
    nextUid: 1,
    dungeons: {},
    sinceRare: 0,
    fragments: {},
    chests: {},
    grimoires: 0,
    focus: null,
    tower: { cleared: 0 },
    testMode: false,
  };
}

/** XP pour passer du niveau `level` au suivant. */
export function xpToNext(level: number, content: Content): number {
  const { base, exponent } = content.balance.progression.xp;
  return Math.round(base * level ** exponent);
}

/**
 * Ajoute de l'XP à la banque du héros. Elle ne monte pas le niveau : c'est le joueur qui paie
 * chaque niveau (`levelUp`), en XP et en poussière. Au niveau maximum, rien n'est gardé.
 */
export function addXp(hero: HeroProgress, amount: number, content: Content): HeroProgress {
  if (hero.level >= content.balance.progression.maxLevel) return { ...hero, xp: 0 };
  return { ...hero, xp: hero.xp + amount };
}

/** Palier de poussière (1 à 3) demandé pour quitter ce niveau. */
export function levelDustTier(content: Content, level: number): number {
  const { tierFrom } = content.balance.progression.levelUp;
  return tierFrom.filter((from) => level >= from).length || 1;
}

/** Poussière demandée pour quitter ce niveau : palier et quantité (croissante dans le palier). */
export function levelDust(content: Content, level: number): { tier: number; amount: number } {
  const { tierFrom, dust, dustPerLevel } = content.balance.progression.levelUp;
  const tier = levelDustTier(content, level);
  const from = tierFrom[tier - 1] ?? 1;
  return { tier, amount: (dust[tier - 1] ?? 0) + (dustPerLevel[tier - 1] ?? 0) * (level - from) };
}

export interface LevelUpCost {
  readonly xp: number;
  readonly dust: { readonly tier: number; readonly amount: number };
}

/** Coût du niveau suivant, ou null au niveau maximum. */
export function levelUpCost(content: Content, hero: HeroProgress): LevelUpCost | null {
  if (hero.level >= content.balance.progression.maxLevel) return null;
  return { xp: xpToNext(hero.level, content), dust: levelDust(content, hero.level) };
}

/** Le héros a ce qu'il faut (XP, poussière, pas d'étoile en attente) pour monter d'un niveau. */
export function canLevelUp(content: Content, profile: Profile, hero: HeroProgress): boolean {
  const cost = levelUpCost(content, hero);
  if (cost === null || atStarGate(hero, content)) return false;
  return hero.xp >= cost.xp && (profile.materials[cost.dust.tier - 1] ?? 0) >= cost.dust.amount;
}

/** Monte un héros d'un niveau contre son XP et de la poussière. */
export function levelUp(content: Content, profile: Profile, heroId: string): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined || !profile.unlocked.includes(heroId)) return refuse('locked_hero');
  const cost = levelUpCost(content, hero);
  if (cost === null) return refuse('max_level');
  if (atStarGate(hero, content)) return refuse('star_gate');
  if (hero.xp < cost.xp) return refuse('not_enough_xp');
  const tier = cost.dust.tier - 1;
  if ((profile.materials[tier] ?? 0) < cost.dust.amount) return refuse('not_enough_materials');
  const materials: Profile['materials'] = [...profile.materials];
  materials[tier] = (materials[tier] ?? 0) - cost.dust.amount;
  const level = hero.level + 1;
  const xp = level >= content.balance.progression.maxLevel ? 0 : hero.xp - cost.xp;
  return ok({
    ...profile,
    materials,
    heroes: { ...profile.heroes, [heroId]: { ...hero, level, xp } },
  });
}

/** Monte un héros autant de niveaux que l'XP et la poussière le permettent (au moins un). */
export function levelUpMax(content: Content, profile: Profile, heroId: string): Outcome {
  let current = levelUp(content, profile, heroId);
  if (!current.ok) return current;
  for (;;) {
    const next = levelUp(content, current.value, heroId);
    if (!next.ok) return current;
    current = next;
  }
}

/** Build de combat d'un héros du profil. */
export function heroBuild(profile: Profile, heroId: string): HeroBuild {
  const hero = profile.heroes[heroId];
  if (hero === undefined) return { hero: heroId, level: 1, talents: [], items: [] };
  const items = hero.items
    .map((uid) => profile.items.find((owned) => owned.uid === uid))
    .filter((owned) => owned !== undefined)
    .map((owned) => ({ id: owned.item, upgrade: owned.upgrade }));
  return { hero: heroId, level: hero.level, talents: hero.talents, items, spells: hero.spells };
}

function withHero(profile: Profile, heroId: string, hero: HeroProgress): Profile {
  return { ...profile, heroes: { ...profile.heroes, [heroId]: hero } };
}

/** Prend un nœud de talent si le build reste valide (points, page, prérequis, choix exclusif). */
export function takeTalent(
  content: Content,
  profile: Profile,
  heroId: string,
  nodeId: string,
): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  const def = content.heroById.get(heroId);
  if (def === undefined || !def.pages.some((p) => p.nodes.some((n) => n.id === nodeId))) {
    return refuse('unknown_node');
  }
  if (hero.talents.includes(nodeId)) return refuse('talent_invalid');
  const build = { ...heroBuild(profile, heroId), talents: [...hero.talents, nodeId] };
  if (validateBuild(content, build).length > 0) return refuse('talent_invalid');
  return ok(withHero(profile, heroId, { ...hero, talents: build.talents }));
}

/** Coût d'un respec : gratuit en mode test et la première fois, puis or × niveau. */
export function respecCost(content: Content, profile: Profile, heroId: string): number {
  const hero = profile.heroes[heroId];
  if (hero === undefined || profile.testMode) return 0;
  const { firstFreePerHero, goldPerHeroLevel } = content.balance.progression.respec;
  if (firstFreePerHero && !hero.freeRespecUsed) return 0;
  return goldPerHeroLevel * hero.level;
}

/** Retire tous les talents d'un héros contre le coût du respec. */
export function respec(content: Content, profile: Profile, heroId: string): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  if (hero.talents.length === 0) return refuse('no_talent');
  const cost = respecCost(content, profile, heroId);
  if (cost > profile.gold) return refuse('not_enough_gold');
  const updated = withHero(profile, heroId, {
    ...hero,
    talents: [],
    freeRespecUsed: profile.testMode ? hero.freeRespecUsed : true,
  });
  return ok({ ...updated, gold: profile.gold - cost });
}

/** Équipe un objet possédé (ou vide l'emplacement avec null). Un objet ne peut servir qu'à un héros. */
export function equip(
  content: Content,
  profile: Profile,
  heroId: string,
  slot: number,
  uid: number | null,
): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  if (!Number.isInteger(slot) || slot < 0 || slot >= content.balance.progression.items.slots) {
    return refuse('bad_slot');
  }
  if (uid !== null) {
    const owned = profile.items.find((i) => i.uid === uid);
    if (owned === undefined) return refuse('unknown_item');
    // Deux exemplaires du même objet sur un héros : refusé (mêmes effets, aucun intérêt).
    const itemIn = (u: number | null): string | undefined =>
      profile.items.find((o) => o.uid === u)?.item;
    const twice = hero.items.some((u, i) => i !== slot && u !== uid && itemIn(u) === owned.item);
    if (twice) return refuse('bad_slot');
  }
  // L'objet quitte le héros qui le portait.
  const heroes = Object.fromEntries(
    Object.entries(profile.heroes).map(([id, h]) => [
      id,
      { ...h, items: h.items.map((u) => (u === uid && uid !== null ? null : u)) },
    ]),
  );
  const target = heroes[heroId] ?? hero;
  heroes[heroId] = { ...target, items: target.items.map((u, i) => (i === slot ? uid : u)) };
  return ok({ ...profile, heroes });
}

/** Équipe de 1 à `teamSize` héros débloqués, sans doublon. */
export function setTeam(content: Content, profile: Profile, team: readonly string[]): Outcome {
  const size = content.balance.progression.teamSize;
  if (team.length < 1 || team.length > size || new Set(team).size !== team.length)
    return refuse('bad_team');
  if (team.some((id) => !profile.unlocked.includes(id))) return refuse('locked_hero');
  return ok({ ...profile, team: [...team] });
}

/** Énergie disponible à l'instant `now` (régénération jusqu'au plafond). */
export function energyAt(content: Content, profile: Profile, now: number): number {
  const { cap, regenPerMinute } = content.balance.energy;
  const minutes = Math.max(0, now - profile.energy.updatedAt) / 60000;
  return Math.min(cap, Math.floor(profile.energy.value + minutes * regenPerMinute));
}

/** Entrée dans un donjon, au palier donné (ouvert) : consomme l'énergie (coût 0 dans le MVP). */
export function enterDungeon(
  content: Content,
  profile: Profile,
  dungeonId: string,
  now: number,
  tier = 1,
): Outcome {
  if (!content.dungeonById.has(dungeonId)) return refuse('unknown_dungeon');
  if (!tierOpen(content, profile, dungeonId, tier)) return refuse('tier_locked');
  if (profile.team.length === 0) return refuse('bad_team');
  const cost = content.balance.energy.costPerDungeon;
  const available = energyAt(content, profile, now);
  if (available < cost) return refuse('no_energy');
  return ok({ ...profile, energy: { value: available - cost, updatedAt: now } });
}

/** Générateur à graine (mulberry32) : renvoie la valeur dans [0, 1) et la graine suivante. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

function pick(
  entries: readonly { readonly item: string; readonly weight: number }[],
  roll: number,
): string {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let cursor = roll * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.item;
  }
  return entries.at(-1)?.item ?? '';
}

export interface DungeonReport {
  readonly dungeon: string;
  /** Palier joué, et palier qu'il vient d'ouvrir (null : rien de nouveau). */
  readonly tier: number;
  readonly tierUnlocked: number | null;
  /** Premier passage de ce palier du donjon. */
  readonly firstClear: boolean;
  /** XP gagnée par héros ; `ready` : il a l'XP du niveau suivant (reste la poussière à payer). */
  readonly xp: Readonly<Record<string, { gained: number; ready: boolean }>>;
  readonly gold: number;
  readonly materials: { readonly tier: number; readonly amount: number };
  readonly item: {
    readonly uid: number;
    readonly item: string;
    /** Rare garanti (premier passage, ou trop de passages sans rare dans ce donjon). */
    readonly guaranteed: boolean;
    /** Première fois que le joueur trouve cet objet. */
    readonly isNew: boolean;
    /** Copies en réserve après ce passage (0 pour un objet neuf ou dissous). */
    readonly copies: number;
    /** Objet déjà au niveau maximum : la copie est dissoute en poussière. */
    readonly salvaged: { readonly tier: number; readonly amount: number } | null;
  };
  /** Maîtrise du donjon après ce passage. */
  readonly mastery: {
    readonly rank: number;
    readonly rankUp: boolean;
    readonly clears: number;
    /** Prochain palier de victoires, ou null au rang maximum. */
    readonly next: number | null;
  };
  readonly unlockedHero: string | null;
  /** Coffre gagné, ou null (pas de coffre à ce passage). */
  readonly chest: string | null;
  /** Grimoires gagnés (selon le palier joué, `spellLevels.grimoires.tiers`). */
  readonly grimoires: number;
}

/**
 * Récompenses d'un donjon terminé à un palier : XP (au repos : taux réduit), or et poussière (plus
 * avec la maîtrise du donjon et le palier), un objet de ce donjon (rare garanti au premier passage
 * du palier et au bout de N passages sans rare ici), coffre du palier, déblocage éventuel d'un
 * héros et du palier suivant. Un objet déjà possédé devient une copie.
 */
export function completeDungeon(
  content: Content,
  profile: Profile,
  dungeonId: string,
  tier = 1,
): Outcome<{ profile: Profile; report: DungeonReport }> {
  const dungeon = content.dungeonById.get(dungeonId);
  if (dungeon === undefined) return refuse('unknown_dungeon');
  // Mode test : rien n'est gagné.
  if (profile.testMode) return refuse('test_mode');
  if (!tierOpen(content, profile, dungeonId, tier)) return refuse('tier_locked');
  const { balance } = content;
  const progress = profile.dungeons[dungeonId] ?? { clears: 0, dry: 0, tier: 1 };
  const frontier = tierFrontier(progress);
  const firstClear = tier >= frontier;
  const rank = masteryRank(content, progress.clears);
  const rate = firstClear ? 1 : balance.economy.replayRewardRate;
  const factor = (reward: 'xp' | 'gold' | 'materials'): number =>
    rate * tierRewardFactor(content, tier, reward);
  const gain = (n: number, reward: 'xp' | 'gold' | 'materials'): number =>
    Math.round(n * factor(reward));

  const heroes = { ...profile.heroes };
  const xp: Record<string, { gained: number; ready: boolean }> = {};
  for (const id of profile.unlocked) {
    const hero = heroes[id];
    if (hero === undefined) continue;
    const gained = Math.round(
      gain(dungeon.rewards.xp, 'xp') *
        (profile.team.includes(id) ? 1 : balance.progression.restXpRate),
    );
    heroes[id] = addXp(hero, gained, content);
    const cost = levelUpCost(content, heroes[id]);
    xp[id] = { gained, ready: cost !== null && heroes[id].xp >= cost.xp };
  }

  // Butin : un objet de la table du donjon, pondéré par sa rareté (et la maîtrise). Le rare est
  // garanti au premier passage et au bout de `rarePity` passages sans rare dans CE donjon.
  const { loot: lootRules } = balance.economy;
  const table = lootTable(content, dungeon, rank, tier);
  const roll = nextRandom(profile.seed);
  let item = pick(table, roll.value);
  let seed = roll.seed;
  const isRare = (id: string): boolean => content.itemById.get(id)?.rarity === 'rare';
  let guaranteed = false;
  const mustBeRare =
    (firstClear && lootRules.firstClearRare) || progress.dry + 1 >= lootRules.rarePity;
  if (!isRare(item) && mustBeRare) {
    const rares = table.filter((e) => isRare(e.item));
    const reroll = nextRandom(seed);
    seed = reroll.seed;
    item = pick(rares, reroll.value);
    guaranteed = true;
  }

  // Un objet neuf entre dans l'inventaire ; sinon la copie sert à l'améliorer, ou se dissout en
  // poussière si l'objet est déjà au niveau maximum.
  const owned = ownedItem(profile, item);
  const maxUpgrade = balance.progression.items.maxUpgradeLevel;
  let items = profile.items;
  let nextUid = profile.nextUid;
  let uid = profile.nextUid;
  let copies = 0;
  let salvaged: { tier: number; amount: number } | null = null;
  if (owned === undefined) {
    items = [...items, { uid, item, upgrade: 0, copies: 0 }];
    nextUid += 1;
  } else {
    uid = owned.uid;
    if (owned.upgrade >= maxUpgrade) {
      salvaged = salvageOf(content, item);
      copies = owned.copies;
    } else {
      copies = owned.copies + 1;
      items = items.map((o) => (o.uid === uid ? { ...o, copies } : o));
    }
  }

  // Coffre : une chance par passage selon la difficulté du palier (`chestOdds`), au moins le plus
  // modeste au premier passage du palier ; tiré après le butin, qui ne bouge pas.
  const chestRoll = nextRandom(seed);
  seed = chestRoll.seed;
  const chest = rollChest(content, dungeon, tier, chestRoll.value, firstClear);

  const materials: Profile['materials'] = [...profile.materials];
  const dustTier = dungeon.rewards.materials.tier - 1;
  const amount = Math.round(
    dungeon.rewards.materials.amount * factor('materials') * masteryMaterialsFactor(content, rank),
  );
  materials[dustTier] = (materials[dustTier] ?? 0) + amount;
  if (salvaged !== null) {
    materials[salvaged.tier - 1] = (materials[salvaged.tier - 1] ?? 0) + salvaged.amount;
  }

  let unlocked = profile.unlocked;
  let unlockedHero: string | null = null;
  const reward = dungeon.unlocksHero;
  if (reward !== undefined && !unlocked.includes(reward)) {
    unlocked = [...unlocked, reward];
    unlockedHero = reward;
    // Le nouveau héros arrive au niveau recommandé du donjon qui le débloque.
    heroes[reward] = freshHero(
      Math.min(balance.progression.maxLevel, dungeon.recommendedLevel),
      content,
    );
  }

  const grimoires = balance.spellLevels.grimoires.tiers[tier - 1] ?? 0;
  const clears = progress.clears + 1;
  const rankAfter = masteryRank(content, clears);
  // Terminer le palier le plus avancé ouvre le suivant (au-delà du dernier : tous terminés).
  const reached = firstClear ? tier + 1 : frontier;
  const tierUnlocked = firstClear && tier < balance.tiers.count ? tier + 1 : null;
  const next: Profile = {
    ...profile,
    seed,
    gold: profile.gold + gain(dungeon.rewards.gold, 'gold'),
    materials,
    grimoires: profile.grimoires + grimoires,
    heroes,
    unlocked,
    items,
    nextUid,
    dungeons: {
      ...profile.dungeons,
      [dungeonId]: { clears, dry: isRare(item) ? 0 : progress.dry + 1, tier: reached },
    },
    chests:
      chest === null
        ? profile.chests
        : { ...profile.chests, [chest]: (profile.chests[chest] ?? 0) + 1 },
  };
  return ok({
    profile: next,
    report: {
      dungeon: dungeonId,
      tier,
      tierUnlocked,
      firstClear,
      xp,
      gold: gain(dungeon.rewards.gold, 'gold'),
      materials: { tier: dungeon.rewards.materials.tier, amount },
      item: { uid, item, guaranteed, isNew: owned === undefined, copies, salvaged },
      mastery: {
        rank: rankAfter,
        rankUp: rankAfter > rank,
        clears,
        next: masteryNext(content, clears),
      },
      unlockedHero,
      chest,
      grimoires,
    },
  });
}

/** Un donjon est ouvert si c'est le premier ou si le précédent a été terminé (ou en mode test). */
export function dungeonOpen(content: Content, profile: Profile, dungeonId: string): boolean {
  if (profile.testMode) return true;
  const index = content.dungeons.findIndex((d) => d.id === dungeonId);
  if (index <= 0) return index === 0;
  const previous = content.dungeons[index - 1];
  return previous !== undefined && (profile.dungeons[previous.id]?.clears ?? 0) > 0;
}

/** Exemplaires de chaque objet dans le bac à sable : un par membre d'équipe possible. */
export const SANDBOX_COPIES = 3;

/**
 * Mode test : tous les héros débloqués, tous les objets disponibles, niveau libre, respec gratuit ;
 * rien n'y est gagné ni dépensé et rien n'est sauvegardé. `builds` préremplit l'équipe (lien partagé).
 */
export function sandboxProfile(content: Content, builds: readonly HeroBuild[] = []): Profile {
  const { maxLevel, items: rules } = content.balance.progression;
  const base = newProfile(content);
  const items = content.items.flatMap((item, i) =>
    Array.from({ length: SANDBOX_COPIES }, (_, copy) => ({
      uid: i * SANDBOX_COPIES + copy + 1,
      item: item.id,
      upgrade: rules.maxUpgradeLevel,
      copies: 0,
    })),
  );
  const heroes = Object.fromEntries(
    content.heroes.map((h) => [h.id, freshHero(maxLevel, content)]),
  );
  builds.forEach((build, member) => {
    const slots = Array.from({ length: rules.slots }, (_, slot): number | null => {
      const equipped = build.items[slot];
      if (equipped === undefined) return null;
      const index = content.items.findIndex((i) => i.id === equipped.id);
      if (index < 0) return null;
      const uid = index * SANDBOX_COPIES + (member % SANDBOX_COPIES) + 1;
      const owned = items.find((o) => o.uid === uid);
      if (owned !== undefined) owned.upgrade = equipped.upgrade;
      return uid;
    });
    heroes[build.hero] = {
      level: build.level,
      xp: 0,
      talents: [...build.talents],
      items: slots,
      freeRespecUsed: false,
      stars: starsForLevel(build.level, content),
      spells: build.spells ?? BASE_SPELL_LEVELS,
    };
  });
  const all = content.heroes.map((h) => h.id);
  return {
    ...base,
    heroes,
    unlocked: all,
    team: builds.length > 0 ? builds.map((b) => b.hero) : base.team,
    items,
    nextUid: items.length + 1,
    testMode: true,
  };
}

/** Mode test : change le niveau d'un héros ; les talents en trop sont retirés, du dernier au premier. */
export function setLevel(
  content: Content,
  profile: Profile,
  heroId: string,
  level: number,
): Outcome {
  if (!profile.testMode) return refuse('test_only');
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  const clamped = Math.min(content.balance.progression.maxLevel, Math.max(1, Math.round(level)));
  let talents = [...hero.talents];
  const next = (): HeroBuild => ({ ...heroBuild(profile, heroId), level: clamped, talents });
  while (talents.length > 0 && validateBuild(content, next()).length > 0)
    talents = talents.slice(0, -1);
  return ok(
    withHero(profile, heroId, {
      ...hero,
      level: clamped,
      xp: 0,
      talents,
      stars: starsForLevel(clamped, content),
    }),
  );
}

/** Mode test : règle le niveau d'amélioration d'un objet. */
export function setUpgrade(
  content: Content,
  profile: Profile,
  uid: number,
  upgrade: number,
): Outcome {
  if (!profile.testMode) return refuse('test_only');
  if (!profile.items.some((i) => i.uid === uid)) return refuse('unknown_item');
  const value = Math.min(
    content.balance.progression.items.maxUpgradeLevel,
    Math.max(0, Math.round(upgrade)),
  );
  return ok({
    ...profile,
    items: profile.items.map((i) => (i.uid === uid ? { ...i, upgrade: value } : i)),
  });
}
