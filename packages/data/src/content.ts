import type { ZodType } from 'zod';
import { balanceSchema, type Balance } from './schemas/balance';
import { dungeonSchema, type Dungeon, type DungeonModifier } from './schemas/dungeons';
import { enemySchema, type Enemy } from './schemas/enemies';
import { heroSchema, type Hero } from './schemas/heroes';
import { itemSchema, type Item } from './schemas/items';
import { towerSchema, type TowerData } from './schemas/tower';

export interface RawContent {
  balance: unknown;
  heroes: readonly unknown[];
  enemies: readonly unknown[];
  items: readonly unknown[];
  dungeons: readonly unknown[];
  tower: unknown;
}

/** Tour à étages résolue : les modificateurs des étages de boss sont ceux des donjons cités. */
export interface Tower {
  readonly pools: TowerData['pools'];
  readonly bosses: readonly {
    readonly enemies: readonly string[];
    readonly hpPct: number;
    readonly atkPct: number;
    readonly modifier?: DungeonModifier;
  }[];
}

/** Contenu validé et indexé, prêt à être utilisé par le moteur, la simulation et l'interface. */
export interface Content {
  balance: Balance;
  heroes: readonly Hero[];
  enemies: readonly Enemy[];
  items: readonly Item[];
  dungeons: readonly Dungeon[];
  tower: Tower;
  heroById: ReadonlyMap<string, Hero>;
  enemyById: ReadonlyMap<string, Enemy>;
  itemById: ReadonlyMap<string, Item>;
  dungeonById: ReadonlyMap<string, Dungeon>;
  /** Donjon qui donne chaque objet : le butin est exclusif, un objet n'a qu'une origine. */
  itemOrigin: ReadonlyMap<string, string>;
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

/** Rareté maximale d'un héros de départ ou offert par un donjon (rare). */
export const FREE_HERO_MAX_TIER = 2;

/** Budget de stats d'une rareté : % d'indice de stats en plus par palier au-dessus de commun. */
export const TIER_STAT_BUDGET_PCT = 2;

/**
 * Indice de stats d'un héros : somme de ses quatre stats rapportées chacune à la moyenne des
 * héros de référence (4 pour un héros moyen). Sert à borner les stats par rareté.
 */
export function statIndex(reference: readonly Hero[]): (hero: Hero) => number {
  const mean = (pick: (hero: Hero) => number): number =>
    reference.reduce((sum, hero) => sum + pick(hero), 0) / reference.length;
  const hp = mean((h) => h.stats.hp);
  const atk = mean((h) => h.stats.atk);
  const def = mean((h) => h.stats.def);
  const vit = mean((h) => h.stats.vit);
  return (hero) =>
    hero.stats.hp / hp + hero.stats.atk / atk + hero.stats.def / def + hero.stats.vit / vit;
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

  const itemOrigin = new Map<string, string>();
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
    let hasCommon = false;
    for (const entry of dungeon.loot) {
      const item = itemById.get(entry);
      if (!item) issues.push(`${where} : objet de butin inconnu « ${entry} »`);
      else if (item.rarity === 'rare') hasRare = true;
      else hasCommon = true;
      // Butin exclusif : chaque objet vient d'un seul donjon, c'est ce qui rend le farm ciblé.
      const origin = itemOrigin.get(entry);
      if (origin !== undefined && origin !== dungeon.id)
        issues.push(`${where} : l'objet « ${entry} » est déjà le butin de « ${origin} »`);
      itemOrigin.set(entry, itemOrigin.get(entry) ?? dungeon.id);
    }
    if (new Set(dungeon.loot).size !== dungeon.loot.length)
      issues.push(`${where} : objet de butin en double`);
    if (!hasRare) issues.push(`${where} : la table de butin doit contenir au moins un objet rare`);
    if (!hasCommon)
      issues.push(`${where} : la table de butin doit contenir au moins un objet commun`);
    if (dungeon.unlocksHero !== undefined && !heroById.has(dungeon.unlocksHero)) {
      issues.push(`${where} : héros débloqué inconnu « ${dungeon.unlocksHero} »`);
    }
  }

  // Obtention : une équipe de départ, des héros offerts par les donjons (communs ou rares), les
  // autres par invocation. Une rareté haute ne s'obtient jamais sans fragments.
  const dungeonHeroes = new Set(dungeons.flatMap((d) => d.unlocksHero ?? []));
  if (!heroes.some((hero) => hero.starter))
    issues.push('héros : aucun héros de départ (« starter »)');
  for (const hero of heroes) {
    if (hero.starter && dungeonHeroes.has(hero.id))
      issues.push(`héros « ${hero.id} » : de départ et débloqué par un donjon`);
    if ((hero.starter || dungeonHeroes.has(hero.id)) && hero.tier > FREE_HERO_MAX_TIER)
      issues.push(
        `héros « ${hero.id} » : un héros de départ ou de donjon est commun ou rare (rareté ${String(hero.tier)})`,
      );
  }

  // La rareté enrichit le kit, pas les stats : au plus TIER_STAT_BUDGET_PCT % par palier au-dessus
  // du héros commun le mieux doté (indice : chaque stat rapportée à la moyenne des communs).
  const commons = heroes.filter((hero) => hero.tier === 1);
  if (commons.length > 0) {
    const index = statIndex(commons);
    const ceiling = Math.max(...commons.map((hero) => index(hero)));
    for (const hero of heroes) {
      const cap = ceiling * (1 + (TIER_STAT_BUDGET_PCT * (hero.tier - 1)) / 100);
      if (index(hero) > cap + 1e-9)
        issues.push(
          `héros « ${hero.id} » : stats au-dessus du budget de sa rareté (${index(hero).toFixed(3)} > ${cap.toFixed(3)})`,
        );
    }
  }

  for (const item of items) {
    if (!itemOrigin.has(item.id))
      issues.push(`objet « ${item.id} » : aucun donjon ne le donne (butin exclusif obligatoire)`);
  }

  for (const a of dungeons) {
    for (const b of dungeons) {
      if (a.id >= b.id || a.map.chapter !== b.map.chapter) continue;
      if (Math.hypot(a.map.x - b.map.x, a.map.y - b.map.y) < 24)
        issues.push(`carte : « ${a.id} » et « ${b.id} » sont trop proches (moins de 24 px)`);
    }
  }

  const tower = resolveTower(raw.tower, balance, enemyById, dungeonById, issues);

  if (issues.length > 0) throw new ContentError(issues);

  return {
    balance,
    heroes,
    enemies,
    items,
    dungeons,
    tower,
    heroById,
    enemyById,
    itemById,
    dungeonById,
    itemOrigin,
  };
}

/** Valide la tour et ses références (ennemis, boss, donjons des modificateurs). */
function resolveTower(
  raw: unknown,
  balance: Balance,
  enemyById: ReadonlyMap<string, Enemy>,
  dungeonById: ReadonlyMap<string, Dungeon>,
  issues: string[],
): Tower {
  const parsed = towerSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      issues.push(`tour : ${issue.path.join('.') || '(racine)'} : ${issue.message}`);
    const empty = { enemies: [], hpPct: 100, atkPct: 100 };
    return { pools: { fire: empty, water: empty, nature: empty }, bosses: [] };
  }
  const { pools, bosses } = parsed.data;
  for (const [element, pool] of Object.entries(pools)) {
    for (const id of pool.enemies) {
      const enemy = enemyById.get(id);
      if (enemy === undefined) issues.push(`tour : ennemi inconnu « ${id} »`);
      else if (enemy.boss === true) issues.push(`tour : « ${id} » est un boss (groupe ${element})`);
    }
  }
  const expected = balance.tower.floors / balance.tower.bossEvery;
  if (bosses.length !== expected)
    issues.push(`tour : ${String(bosses.length)} étages de boss pour ${String(expected)} attendus`);
  const resolved = bosses.map((boss, i) => {
    for (const id of boss.enemies)
      if (!enemyById.has(id)) issues.push(`tour : ennemi inconnu « ${id} »`);
    if (!boss.enemies.some((id) => enemyById.get(id)?.boss === true))
      issues.push(`tour : l’étage de boss n° ${String(i + 1)} n’a pas de boss`);
    const { modifierOf, ...floor } = boss;
    if (modifierOf === undefined) return floor;
    const dungeon = dungeonById.get(modifierOf);
    if (dungeon === undefined) issues.push(`tour : donjon inconnu « ${modifierOf} »`);
    return { ...floor, modifier: dungeon?.modifier };
  });
  return { pools, bosses: resolved };
}
