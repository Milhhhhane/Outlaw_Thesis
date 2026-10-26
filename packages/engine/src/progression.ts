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
  | 'no_energy';

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

function freshHero(level: number, slots: number): HeroProgress {
  return {
    level,
    xp: 0,
    talents: [],
    items: Array.from({ length: slots }, () => null),
    freeRespecUsed: false,
  };
}

export function newProfile(content: Content, seed = 1, now = 0): Profile {
  const starters = starterHeroes(content);
  const slots = content.balance.progression.items.slots;
  return {
    version: PROFILE_VERSION,
    seed,
    gold: 0,
    materials: [0, 0, 0],
    energy: { value: content.balance.energy.cap, updatedAt: now },
    heroes: Object.fromEntries(starters.map((id) => [id, freshHero(1, slots)])),
    unlocked: starters,
    team: starters.slice(0, 3),
    items: [],
    nextUid: 1,
    dungeons: {},
    sinceRare: 0,
    testMode: false,
  };
}

/** XP pour passer du niveau `level` au suivant. */
export function xpToNext(level: number, content: Content): number {
  const { base, exponent } = content.balance.progression.xp;
  return Math.round(base * level ** exponent);
}

/** Ajoute de l'XP ; renvoie le héros et le nombre de niveaux gagnés. */
export function addXp(
  hero: HeroProgress,
  amount: number,
  content: Content,
): { hero: HeroProgress; levels: number } {
  const max = content.balance.progression.maxLevel;
  let { level, xp } = hero;
  xp += amount;
  let levels = 0;
  while (level < max && xp >= xpToNext(level, content)) {
    xp -= xpToNext(level, content);
    level += 1;
    levels += 1;
  }
  if (level >= max) xp = 0;
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

/** Équipe de 1 à 3 héros débloqués, sans doublon. */
export function setTeam(profile: Profile, team: readonly string[]): Outcome {
  if (team.length < 1 || team.length > 3 || new Set(team).size !== team.length)
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

/** Taux d'obtention affichés au joueur, en %. */
export function lootRates(dungeon: Dungeon): { item: string; pct: number }[] {
  const total = dungeon.loot.reduce((sum, entry) => sum + entry.weight, 0);
  return dungeon.loot.map((entry) => ({ item: entry.item, pct: (entry.weight * 100) / total }));
}

function pick(entries: Dungeon['loot'], roll: number): string {
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
  readonly item: { readonly uid: number; readonly item: string; readonly guaranteed: boolean };
  readonly unlockedHero: string | null;
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

  // Butin : la garantie remplace un tirage commun par un tirage parmi les rares.
  const roll = nextRandom(profile.seed);
  let item = pick(dungeon.loot, roll.value);
  let seed = roll.seed;
  const isRare = (id: string): boolean => content.itemById.get(id)?.rarity === 'rare';
  let guaranteed = false;
  if (!isRare(item) && profile.sinceRare + 1 >= balance.economy.rareGuaranteeAfter) {
    const rares = dungeon.loot.filter((e) => isRare(e.item));
    const reroll = nextRandom(seed);
    seed = reroll.seed;
    item = pick(rares, reroll.value);
    guaranteed = true;
  }
  const uid = profile.nextUid;

  const materials: Profile['materials'] = [...profile.materials];
  const tier = dungeon.rewards.materials.tier - 1;
  const amount = gain(dungeon.rewards.materials.amount);
  materials[tier] = (materials[tier] ?? 0) + amount;

  let unlocked = profile.unlocked;
  let unlockedHero: string | null = null;
  const reward = dungeon.unlocksHero;
  if (reward !== undefined && !unlocked.includes(reward)) {
    unlocked = [...unlocked, reward];
    unlockedHero = reward;
    // Le nouveau héros arrive au niveau recommandé du donjon qui le débloque.
    heroes[reward] = freshHero(
      Math.min(balance.progression.maxLevel, dungeon.recommendedLevel),
      balance.progression.items.slots,
    );
  }

  const next: Profile = {
    ...profile,
    seed,
    gold: profile.gold + gain(dungeon.rewards.gold),
    materials,
    heroes,
    unlocked,
    items: [...profile.items, { uid, item, upgrade: 0 }],
    nextUid: uid + 1,
    dungeons: {
      ...profile.dungeons,
      [dungeonId]: { clears: (profile.dungeons[dungeonId]?.clears ?? 0) + 1 },
    },
    sinceRare: isRare(item) ? 0 : profile.sinceRare + 1,
  };
  return ok({
    profile: next,
    report: {
      dungeon: dungeonId,
      firstClear,
      xp,
      gold: gain(dungeon.rewards.gold),
      materials: { tier: dungeon.rewards.materials.tier, amount },
      item: { uid, item, guaranteed },
      unlockedHero,
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
