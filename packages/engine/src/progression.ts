import {
  PROFILE_VERSION,
  type Content,
  type Dungeon,
  type HeroProgress,
  type Profile,
} from '@outlaw/data';
import { validateBuild, type HeroBuild } from './compile';

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
  | 'max_star';

export type Outcome<T = Profile> = { ok: true; value: T } | { ok: false; reason: Refusal };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

/** Héros disponibles dès le début : ceux qu'aucun donjon ne débloque. */
export function starterHeroes(content: Content): string[] {
  const unlockable = new Set(
    content.dungeons.map((d) => d.unlocksHero).filter((id) => id !== undefined),
  );
  return content.heroes.map((h) => h.id).filter((id) => !unlockable.has(id));
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
    focus: null,
    testMode: false,
  };
}

/** XP pour passer du niveau `level` au suivant. */
export function xpToNext(level: number, content: Content): number {
  const { base, exponent } = content.balance.progression.xp;
  return Math.round(base * level ** exponent);
}

/**
 * Ajoute de l'XP ; renvoie le héros et le nombre de niveaux gagnés. Au plafond d'une étoile,
 * l'XP s'arrête au coût d'un niveau : elle sert dès que l'étoile est payée, sans s'accumuler au-delà.
 */
export function addXp(
  hero: HeroProgress,
  amount: number,
  content: Content,
): { hero: HeroProgress; levels: number } {
  const max = content.balance.progression.maxLevel;
  const cap = levelCap(hero, content);
  let { level, xp } = hero;
  xp += amount;
  let levels = 0;
  while (level < cap && xp >= xpToNext(level, content)) {
    xp -= xpToNext(level, content);
    level += 1;
    levels += 1;
  }
  if (level >= max) xp = 0;
  else if (level >= cap) xp = Math.min(xp, xpToNext(level, content));
  return { hero: { ...hero, level, xp }, levels };
}

/** Build de combat d'un héros du profil. */
export function heroBuild(profile: Profile, heroId: string): HeroBuild {
  const hero = profile.heroes[heroId];
  if (hero === undefined) return { hero: heroId, level: 1, talents: [], items: [] };
  const items = hero.items
    .map((uid) => profile.items.find((owned) => owned.uid === uid))
    .filter((owned) => owned !== undefined)
    .map((owned) => ({ id: owned.item, upgrade: owned.upgrade }));
  return { hero: heroId, level: hero.level, talents: hero.talents, items };
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

/** Coût de l'amélioration suivante d'un objet, ou null au niveau maximum. */
export function upgradeCost(content: Content, upgrade: number) {
  return content.balance.progression.items.upgradeCosts[upgrade] ?? null;
}

export function upgradeItem(content: Content, profile: Profile, uid: number): Outcome {
  const owned = profile.items.find((i) => i.uid === uid);
  if (owned === undefined) return refuse('unknown_item');
  const cost = upgradeCost(content, owned.upgrade);
  if (cost === null) return refuse('max_upgrade');
  if (cost.gold > profile.gold) return refuse('not_enough_gold');
  const tier = cost.materials.tier - 1;
  if ((profile.materials[tier] ?? 0) < cost.materials.amount) return refuse('not_enough_materials');
  const materials: Profile['materials'] = [...profile.materials];
  materials[tier] = (materials[tier] ?? 0) - cost.materials.amount;
  return ok({
    ...profile,
    gold: profile.gold - cost.gold,
    materials,
    items: profile.items.map((i) => (i.uid === uid ? { ...i, upgrade: i.upgrade + 1 } : i)),
  });
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

/** Entrée dans un donjon : consomme l'énergie (coût 0 dans le MVP). */
export function enterDungeon(
  content: Content,
  profile: Profile,
  dungeonId: string,
  now: number,
): Outcome {
  if (!content.dungeonById.has(dungeonId)) return refuse('unknown_dungeon');
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

interface Weighted {
  readonly item: string;
  readonly weight: number;
}

/** Table pondérée d'un donjon : chaque objet pèse le poids de sa rareté (balance.economy.loot). */
export function lootTable(content: Content, dungeon: Dungeon): Weighted[] {
  const { weights } = content.balance.economy.loot;
  return dungeon.loot.map((item) => ({
    item,
    weight: weights[content.itemById.get(item)?.rarity ?? 'common'],
  }));
}

/** Taux d'obtention affichés au joueur, en %. */
export function lootRates(content: Content, dungeon: Dungeon): { item: string; pct: number }[] {
  const table = lootTable(content, dungeon);
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  return table.map((entry) => ({ item: entry.item, pct: (entry.weight * 100) / total }));
}

function pick(entries: readonly Weighted[], roll: number): string {
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
  readonly firstClear: boolean;
  readonly xp: Readonly<Record<string, { gained: number; levels: number }>>;
  readonly gold: number;
  readonly materials: { readonly tier: number; readonly amount: number };
  readonly item: {
    readonly uid: number;
    readonly item: string;
    /** Rare garanti (premier passage, ou trop de donjons sans rare). */
    readonly guaranteed: boolean;
    /** Doublon de trop : l'objet n'est pas gardé, il est démonté en matériaux. */
    readonly salvaged: { readonly tier: number; readonly amount: number } | null;
  };
  readonly unlockedHero: string | null;
  /** Palier du coffre gagné, ou null (donjon rejoué sans chance). */
  readonly chest: string | null;
}

/**
 * Récompenses d'un donjon terminé : XP (au repos : taux réduit), or et matériaux communs, un objet
 * tiré dans la table (rare garanti au bout de N donjons sans rare), déblocage éventuel d'un héros.
 */
export function completeDungeon(
  content: Content,
  profile: Profile,
  dungeonId: string,
): Outcome<{ profile: Profile; report: DungeonReport }> {
  const dungeon = content.dungeonById.get(dungeonId);
  if (dungeon === undefined) return refuse('unknown_dungeon');
  // Mode test : rien n'est gagné.
  if (profile.testMode) return refuse('test_mode');
  const { balance } = content;
  const firstClear = (profile.dungeons[dungeonId]?.clears ?? 0) === 0;
  const rate = firstClear ? 1 : balance.economy.replayRewardRate;
  const gain = (n: number): number => Math.round(n * rate);

  const heroes = { ...profile.heroes };
  const xp: Record<string, { gained: number; levels: number }> = {};
  for (const id of profile.unlocked) {
    const hero = heroes[id];
    if (hero === undefined) continue;
    const gained = Math.round(
      gain(dungeon.rewards.xp) * (profile.team.includes(id) ? 1 : balance.progression.restXpRate),
    );
    const result = addXp(hero, gained, content);
    heroes[id] = result.hero;
    xp[id] = { gained, levels: result.levels };
  }

  // Butin : un objet de la table, pondéré par sa rareté. Le rare est garanti au premier passage
  // et au bout de N donjons sans rare ; un doublon de trop est démonté en matériaux.
  const { loot: lootRules } = balance.economy;
  const table = lootTable(content, dungeon);
  const roll = nextRandom(profile.seed);
  let item = pick(table, roll.value);
  let seed = roll.seed;
  const isRare = (id: string): boolean => content.itemById.get(id)?.rarity === 'rare';
  let guaranteed = false;
  const mustBeRare =
    (firstClear && lootRules.firstClearRare) ||
    profile.sinceRare + 1 >= balance.economy.rareGuaranteeAfter;
  if (!isRare(item) && mustBeRare) {
    const rares = table.filter((e) => isRare(e.item));
    const reroll = nextRandom(seed);
    seed = reroll.seed;
    item = pick(rares, reroll.value);
    guaranteed = true;
  }
  const uid = profile.nextUid;
  const copies = profile.items.filter((o) => o.item === item).length;
  const salvaged =
    copies >= lootRules.duplicateLimit ? lootRules.salvage[isRare(item) ? 'rare' : 'common'] : null;

  // Coffre : toujours au premier passage, sinon une chance (tirée après le butin, qui ne bouge pas).
  let chest: string | null = dungeon.chest;
  if (!firstClear) {
    const chestRoll = nextRandom(seed);
    seed = chestRoll.seed;
    if (chestRoll.value >= balance.chests.replayChestRate) chest = null;
  }

  const materials: Profile['materials'] = [...profile.materials];
  const tier = dungeon.rewards.materials.tier - 1;
  const amount = gain(dungeon.rewards.materials.amount);
  materials[tier] = (materials[tier] ?? 0) + amount;
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

  const next: Profile = {
    ...profile,
    seed,
    gold: profile.gold + gain(dungeon.rewards.gold),
    materials,
    heroes,
    unlocked,
    items: salvaged === null ? [...profile.items, { uid, item, upgrade: 0 }] : profile.items,
    nextUid: salvaged === null ? uid + 1 : profile.nextUid,
    dungeons: {
      ...profile.dungeons,
      [dungeonId]: { clears: (profile.dungeons[dungeonId]?.clears ?? 0) + 1 },
    },
    sinceRare: isRare(item) ? 0 : profile.sinceRare + 1,
    chests:
      chest === null
        ? profile.chests
        : { ...profile.chests, [chest]: (profile.chests[chest] ?? 0) + 1 },
  };
  return ok({
    profile: next,
    report: {
      dungeon: dungeonId,
      firstClear,
      xp,
      gold: gain(dungeon.rewards.gold),
      materials: { tier: dungeon.rewards.materials.tier, amount },
      item: { uid, item, guaranteed, salvaged },
      unlockedHero,
      chest,
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
