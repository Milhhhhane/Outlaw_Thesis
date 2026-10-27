import type { ZodType } from 'zod';
import { balanceSchema, type Balance } from './schemas/balance';
import { dungeonSchema, type Dungeon } from './schemas/dungeons';
import { enemySchema, type Enemy } from './schemas/enemies';
import { heroSchema, type Hero } from './schemas/heroes';
import { itemSchema, type Item } from './schemas/items';

export interface RawContent {
  balance: unknown;
  heroes: readonly unknown[];
  enemies: readonly unknown[];
  items: readonly unknown[];
  dungeons: readonly unknown[];
}

/** Contenu validé et indexé, prêt à être utilisé par le moteur, la simulation et l'interface. */
export interface Content {
  balance: Balance;
  heroes: readonly Hero[];
  enemies: readonly Enemy[];
  items: readonly Item[];
  dungeons: readonly Dungeon[];
  heroById: ReadonlyMap<string, Hero>;
  enemyById: ReadonlyMap<string, Enemy>;
  itemById: ReadonlyMap<string, Item>;
  dungeonById: ReadonlyMap<string, Dungeon>;
}

export class ContentError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Contenu invalide (${issues.length} problème(s)) :\n- ${issues.join('\n- ')}`);
    this.name = 'ContentError';
    this.issues = issues;
  }
}

function parseAll<T>(
  label: string,
  schema: ZodType<T>,
  raws: readonly unknown[],
  issues: string[],
): T[] {
  const out: T[] = [];
  raws.forEach((raw, index) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      out.push(result.data);
      return;
    }
    const id =
      typeof raw === 'object' && raw !== null && 'id' in raw ? String(raw.id) : `#${index}`;
    for (const issue of result.error.issues) {
      issues.push(`${label} « ${id} » : ${issue.path.join('.') || '(racine)'} : ${issue.message}`);
    }
  });
  return out;
}

function indexById<T extends { id: string }>(
  label: string,
  list: readonly T[],
  issues: string[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const entry of list) {
    if (map.has(entry.id)) issues.push(`${label} : identifiant en double « ${entry.id} »`);
    map.set(entry.id, entry);
  }
  return map;
}

/** Valide le contenu brut (schémas Zod) puis ses références croisées. Lève ContentError au moindre problème. */
export function parseContent(raw: RawContent): Content {
  const issues: string[] = [];

  const balanceResult = balanceSchema.safeParse(raw.balance);
  if (!balanceResult.success) {
    for (const issue of balanceResult.error.issues) {
      issues.push(`balance : ${issue.path.join('.') || '(racine)'} : ${issue.message}`);
    }
    throw new ContentError(issues);
  }
  const balance = balanceResult.data;

  const heroes = parseAll('héros', heroSchema, raw.heroes, issues);
  const enemies = parseAll('ennemi', enemySchema, raw.enemies, issues);
  const items = parseAll('objet', itemSchema, raw.items, issues);
  const dungeons = parseAll('donjon', dungeonSchema, raw.dungeons, issues);

  const heroById = indexById('héros', heroes, issues);
  const enemyById = indexById('ennemi', enemies, issues);
  const itemById = indexById('objet', items, issues);
  const dungeonById = indexById('donjon', dungeons, issues);

  // Identifiants de sorts, passifs et nœuds : uniques sur tout le jeu (le texte s'y rattache).
  const globalIds = new Map<string, string>();
  const claim = (id: string, owner: string): void => {
    const previous = globalIds.get(id);
    if (previous !== undefined)
      issues.push(`identifiant « ${id} » utilisé par ${previous} et ${owner}`);
    else globalIds.set(id, owner);
  };
  for (const hero of heroes) {
    for (const spell of hero.spells) claim(spell.id, `le héros ${hero.id}`);
    claim(hero.passive.id, `le héros ${hero.id}`);
    for (const page of hero.pages) {
      claim(page.id, `le héros ${hero.id}`);
      for (const node of page.nodes) claim(node.id, `le héros ${hero.id}`);
    }
  }
  for (const enemy of enemies) {
    for (const skill of enemy.skills) claim(skill.id, `l’ennemi ${enemy.id}`);
    if (enemy.passive) claim(enemy.passive.id, `l’ennemi ${enemy.id}`);
  }

  // Un héros doit toujours laisser des nœuds de côté : sinon il n'y a plus de build à choisir.
  const points = balance.progression.talentPointLevels.length;
  for (const hero of heroes) {
    const nodes = hero.pages.reduce((n, page) => n + page.nodes.length, 0);
    if (points >= nodes) {
      issues.push(
        `balance : ${hero.id} n'a que ${String(nodes)} nœuds pour ${String(points)} points de talent (il en faut moins de points que de nœuds, sinon plus de build)`,
      );
    }
  }

  for (const item of items) {
    if (item.stat && item.stat.pct > balance.progression.items.statCapPct) {
      issues.push(
        `objet « ${item.id} » : stat ${item.stat.pct} % > plafond ${balance.progression.items.statCapPct} %`,
      );
    }
  }

  for (const dungeon of dungeons) {
    const where = `donjon « ${dungeon.id} »`;
    if (dungeon.recommendedLevel > balance.progression.maxLevel) {
      issues.push(`${where} : niveau recommandé au-dessus du niveau maximum`);
    }
    dungeon.encounters.forEach((encounter, index) => {
      for (const enemyId of encounter.enemies) {
        if (!enemyById.has(enemyId)) issues.push(`${where} : ennemi inconnu « ${enemyId} »`);
      }
      const hasBoss = encounter.enemies.some((id) => enemyById.get(id)?.boss === true);
      const isLast = index === dungeon.encounters.length - 1;
      if (isLast && !hasBoss) issues.push(`${where} : le dernier combat doit contenir un boss`);
      if (!isLast && hasBoss) issues.push(`${where} : seul le dernier combat contient un boss`);
    });
    let hasRare = false;
    for (const entry of dungeon.loot) {
      const item = itemById.get(entry);
      if (!item) issues.push(`${where} : objet de butin inconnu « ${entry} »`);
      else if (item.rarity === 'rare') hasRare = true;
    }
    if (new Set(dungeon.loot).size !== dungeon.loot.length)
      issues.push(`${where} : objet de butin en double`);
    if (!hasRare) issues.push(`${where} : la table de butin doit contenir au moins un objet rare`);
    if (dungeon.unlocksHero !== undefined && !heroById.has(dungeon.unlocksHero)) {
      issues.push(`${where} : héros débloqué inconnu « ${dungeon.unlocksHero} »`);
    }
  }

  for (const a of dungeons) {
    for (const b of dungeons) {
      if (a.id >= b.id || a.map.chapter !== b.map.chapter) continue;
      if (Math.hypot(a.map.x - b.map.x, a.map.y - b.map.y) < 24)
        issues.push(`carte : « ${a.id} » et « ${b.id} » sont trop proches (moins de 24 px)`);
    }
  }

  if (issues.length > 0) throw new ContentError(issues);

  return {
    balance,
    heroes,
    enemies,
    items,
    dungeons,
    heroById,
    enemyById,
    itemById,
    dungeonById,
  };
}
