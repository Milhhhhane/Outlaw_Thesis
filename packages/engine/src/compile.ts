import {
  SCALABLE_FIELDS,
  type Balance,
  type Content,
  type DungeonModifier,
  type Effect,
  type Hero,
  type Item,
  type SpellLevels,
  type SpellMod,
  type TalentNode,
  type Trigger,
} from '@outlaw/data';
import { InvalidSetupError } from './errors';
import { statsAtLevel } from './stats';
import type { ResolvedSpell, ResolvedTrigger, Side, UnitDef } from './types';

/**
 * Compilation : héros + niveau + talents + objets → unité de combat immuable.
 * Les talents modifient les sorts, les objets modifient le passif : chacun son terrain.
 */

export interface EquippedItem {
  readonly id: string;
  /** Niveau d'amélioration, de 0 (brut) à balance.progression.items.maxUpgradeLevel. */
  readonly upgrade: number;
}

export interface HeroBuild {
  readonly hero: string;
  readonly level: number;
  /** Nœuds de talents choisis (identifiants). */
  readonly talents: readonly string[];
  readonly items: readonly EquippedItem[];
  /** Niveau de chaque sort (montée des sorts) ; absent : tous au niveau 1. */
  readonly spells?: Readonly<SpellLevels>;
  /** Héros éveillé : `balance.awakening` (stats et passif). Absent : non éveillé. */
  readonly awakened?: boolean;
}

type ScalableField = 'power' | 'duration' | 'amount' | 'percent';

/** Points de talent disponibles à un niveau. */
export function talentPoints(level: number, balance: Balance): number {
  return balance.progression.talentPointLevels.filter((l) => l <= level).length;
}

/** Nombre de pages de talents débloquées à un niveau. */
export function unlockedPages(level: number, balance: Balance): number {
  return balance.progression.pageUnlockLevels.filter((l) => l <= level).length;
}

interface NodeRef {
  readonly page: number;
  readonly index: number;
  readonly node: TalentNode;
}

function nodeIndex(hero: Hero): Map<string, NodeRef> {
  const map = new Map<string, NodeRef>();
  hero.pages.forEach((page, p) => {
    page.nodes.forEach((node, index) => map.set(node.id, { page: p, index, node }));
  });
  return map;
}

/** Problèmes d'un build (vide si valide). Messages destinés au développeur et aux tests. */
export function validateBuild(content: Content, build: HeroBuild): string[] {
  const { balance } = content;
  const hero = content.heroById.get(build.hero);
  if (hero === undefined) return [`héros inconnu : ${build.hero}`];
  const issues: string[] = [];
  const { maxLevel } = balance.progression;
  if (!Number.isInteger(build.level) || build.level < 1 || build.level > maxLevel) {
    issues.push(`niveau ${build.level} hors de 1..${maxLevel}`);
  }

  const nodes = nodeIndex(hero);
  const chosen = new Set<string>();
  const groups = new Map<string, string>();
  for (const id of build.talents) {
    const ref = nodes.get(id);
    if (ref === undefined) {
      issues.push(`talent inconnu pour ${hero.id} : ${id}`);
      continue;
    }
    if (chosen.has(id)) issues.push(`talent pris deux fois : ${id}`);
    chosen.add(id);
    if (ref.page >= unlockedPages(build.level, balance)) {
      issues.push(`page de ${id} verrouillée au niveau ${build.level}`);
    }
    const group = ref.node.group;
    if (group !== undefined) {
      const taken = groups.get(group);
      if (taken !== undefined && taken !== id) issues.push(`choix exclusif : ${taken} ou ${id}`);
      groups.set(group, id);
    }
  }
  for (const id of chosen) {
    const requires = nodes.get(id)?.node.requires;
    if (requires !== undefined && !chosen.has(requires)) {
      issues.push(`${id} exige ${requires}`);
    }
  }
  const points = talentPoints(build.level, balance);
  if (chosen.size > points) {
    issues.push(`${chosen.size} talents pour ${points} points au niveau ${build.level}`);
  }

  const { slots, maxUpgradeLevel } = balance.progression.items;
  if (build.items.length > slots)
    issues.push(`${build.items.length} objets pour ${slots} emplacements`);
  const seen = new Set<string>();
  for (const equipped of build.items) {
    if (!content.itemById.has(equipped.id)) issues.push(`objet inconnu : ${equipped.id}`);
    if (seen.has(equipped.id)) issues.push(`objet équipé deux fois : ${equipped.id}`);
    seen.add(equipped.id);
    if (
      !Number.isInteger(equipped.upgrade) ||
      equipped.upgrade < 0 ||
      equipped.upgrade > maxUpgradeLevel
    ) {
      issues.push(`amélioration ${equipped.upgrade} hors de 0..${maxUpgradeLevel}`);
    }
  }
  const { max } = balance.spellLevels;
  for (const [slot, level] of Object.entries(build.spells ?? {})) {
    if (!Number.isInteger(level) || level < 1 || level > max) {
      issues.push(`sort ${slot} au niveau ${level} hors de 1..${max}`);
    }
  }
  return issues;
}

/** Normalise une valeur ajustée : durées et puissances ≥ 1, montants entiers non nuls. */
function normalize(field: ScalableField, value: number, original: number): number {
  const rounded = Math.round(value);
  if (field === 'duration' || field === 'power') return Math.max(1, rounded);
  return rounded === 0 ? Math.sign(original) : rounded;
}

function adjust<E extends Effect>(effect: E, field: ScalableField, op: (v: number) => number): E {
  const value: unknown = (effect as Record<string, unknown>)[field];
  if (typeof value !== 'number') return effect;
  return { ...effect, [field]: normalize(field, op(value), value) };
}

/** Multiplie tous les champs ajustables d'une brique (amélioration d'objet). */
function scaleAll(effect: Effect, factor: number): Effect {
  if (effect.kind === 'trigger' || factor === 1) return effect;
  let result: Effect = effect;
  for (const field of SCALABLE_FIELDS[effect.kind]) {
    result = adjust(result, field, (v) => v * factor);
  }
  return result;
}

type MutableSpell = { -readonly [K in keyof ResolvedSpell]: ResolvedSpell[K] };

function applySpellMod(spells: MutableSpell[], mod: SpellMod): void {
  const target = (slot: ResolvedSpell['slot']): MutableSpell[] =>
    spells.filter((spell) => spell.slot === slot);
  switch (mod.type) {
    case 'addEffect':
      for (const spell of target(mod.slot)) spell.effects = [...spell.effects, mod.effect];
      return;
    case 'scaleEffect':
      for (const spell of target(mod.slot)) {
        spell.effects = spell.effects.map((effect) =>
          effect.kind === mod.kind
            ? adjust(effect, mod.field, (v) => (v + (mod.add ?? 0)) * (1 + (mod.mulPct ?? 0) / 100))
            : effect,
        );
      }
      return;
    case 'cost':
      for (const spell of target(mod.slot)) spell.cost = Math.max(0, spell.cost + mod.delta);
      return;
    case 'gain':
      for (const spell of target('basic')) spell.gain = Math.max(0, spell.gain + mod.delta);
      return;
    case 'delay':
      for (const spell of target(mod.slot)) spell.delay = Math.max(1, spell.delay + mod.delta);
      return;
    case 'retarget':
      for (const spell of target(mod.slot)) spell.targeting = mod.targeting;
      return;
  }
}

/** Bonus de puissance (en %) d'un sort à ce niveau : `powerPctPerLevel` par niveau au-delà du premier. */
export function spellPowerPct(balance: Balance, level: number): number {
  return balance.spellLevels.powerPctPerLevel * Math.max(0, level - 1);
}

/** Briques dont la montée des sorts renforce la puissance. */
const LEVELED_KINDS: ReadonlySet<Effect['kind']> = new Set(['damage', 'heal', 'shield']);

/**
 * Montée des sorts, après les talents (les briques ajoutées par un talent montent aussi) :
 * puissance des dégâts, soins et boucliers + `spellPowerPct` %, et au niveau maximum le bonus
 * `capstone` de l'emplacement (coût en points, délai).
 */
function applySpellLevels(
  spells: MutableSpell[],
  levels: Readonly<SpellLevels> | undefined,
  balance: Balance,
): void {
  if (levels === undefined) return;
  const { max, capstone } = balance.spellLevels;
  for (const spell of spells) {
    const level = levels[spell.slot];
    const pct = spellPowerPct(balance, level);
    if (pct > 0) {
      spell.effects = spell.effects.map((effect) =>
        LEVELED_KINDS.has(effect.kind)
          ? adjust(effect, 'power', (v) => v * (1 + pct / 100))
          : effect,
      );
    }
    if (level >= max && max > 1) {
      const bonus = capstone[spell.slot];
      spell.cost = Math.max(0, spell.cost + bonus.cost);
      spell.delay = Math.max(1, spell.delay + bonus.delay);
    }
  }
}

function baseSpells(
  spells: Hero['spells'],
  element: Hero['element'],
  balance: Balance,
): MutableSpell[] {
  const { costs, delays, teamPoints } = balance.combat;
  return spells.map((spell) => ({
    id: spell.id,
    slot: spell.slot,
    targeting: spell.targeting,
    element: spell.element ?? element,
    cost: spell.slot === 'basic' ? 0 : costs[spell.slot],
    gain: spell.slot === 'basic' ? teamPoints.basicGain : 0,
    delay: delays[spell.slot],
    effects: [...spell.effects],
  }));
}

/** Applique les objets au passif. Chaque niveau d'amélioration renforce les valeurs de l'objet. */
function applyItems(
  triggers: readonly Trigger[],
  items: readonly [Item, number][],
  balance: Balance,
) {
  const { upgradeScalePct } = balance.progression.items;
  let result = triggers.map((t) => ({ ...t, effects: [...t.effects] }));
  for (const [item, upgrade] of items) {
    const factor = 1 + (upgrade * upgradeScalePct) / 100;
    for (const mod of item.mods) {
      switch (mod.type) {
        case 'scale':
          result = result.map((t) => ({
            ...t,
            effects: t.effects.map((e) =>
              adjust(e, mod.field, (v) => v * (1 + (mod.mulPct * factor) / 100)),
            ),
          }));
          break;
        case 'addEffect': {
          const added = scaleAll(mod.effect, factor);
          result = result.map((t) =>
            t.effects.length < 4 ? { ...t, effects: [...t.effects, added] as typeof t.effects } : t,
          );
          break;
        }
        case 'threshold':
          result = result.map((t) =>
            t.thresholdPct === undefined
              ? t
              : {
                  ...t,
                  thresholdPct: Math.min(
                    99,
                    Math.max(1, Math.round(t.thresholdPct + mod.delta * factor)),
                  ),
                },
          );
          break;
        case 'limit':
          result = result.map((t) =>
            t.limit?.per === 'combat'
              ? { ...t, limit: { per: 'combat', count: Math.max(1, t.limit.count + mod.delta) } }
              : t,
          );
          break;
      }
    }
  }
  return result;
}

export interface Placement {
  readonly side: Side;
  readonly slot: number;
}

export function unitId(placement: Placement): string {
  return `${placement.side === 'player' ? 'h' : 'e'}${placement.slot}`;
}

export function compileHero(
  content: Content,
  build: HeroBuild,
  placement: Placement,
  extraTriggers: readonly ResolvedTrigger[] = [],
): UnitDef {
  const issues = validateBuild(content, build);
  const hero = content.heroById.get(build.hero);
  if (issues.length > 0 || hero === undefined) {
    throw new InvalidSetupError(`build invalide : ${issues.join(' ; ')}`);
  }
  const { balance } = content;
  const { maxLevel, growth, items: itemRules } = balance.progression;

  const nodes = nodeIndex(hero);
  const ordered = build.talents
    .map((id) => nodes.get(id))
    .filter((ref): ref is NodeRef => ref !== undefined)
    .sort((a, b) => a.page - b.page || a.index - b.index);
  const spells = baseSpells(hero.spells, hero.element, balance);
  for (const ref of ordered) for (const mod of ref.node.mods) applySpellMod(spells, mod);
  applySpellLevels(spells, build.spells, balance);

  const equipped = build.items
    .map((e): [Item, number] | null => {
      const item = content.itemById.get(e.id);
      return item === undefined ? null : [item, e.upgrade];
    })
    .filter((pair): pair is [Item, number] => pair !== null);

  const bonus = { hp: 0, atk: 0, def: 0 };
  for (const [item, upgrade] of equipped) {
    if (item.stat !== undefined) {
      bonus[item.stat.stat] += item.stat.pct * (1 + (upgrade * itemRules.upgradeScalePct) / 100);
    }
  }
  const leveled = statsAtLevel(hero.stats, build.level, growth.hero, maxLevel);
  // L'éveil s'ajoute hors du plafond des objets : son propre pourcentage est borné par le schéma.
  const { awakening } = balance;
  const awake = build.awakened === true;
  const extra = awake ? awakening.statPct : 0;
  const withBonus = (value: number, pct: number): number =>
    Math.round(value * (1 + (Math.min(itemRules.statCapPct, pct) + extra) / 100));

  // Les modifications de passif de l'éveil passent par le même chemin que celles des objets.
  const awakeMods: [Item, number][] = awake
    ? [[{ id: 'awakening', rarity: 'common', mods: awakening.mods }, 0]]
    : [];
  const passive = applyItems(hero.passive.triggers, [...equipped, ...awakeMods], balance);
  return {
    id: unitId(placement),
    kind: hero.id,
    side: placement.side,
    slot: placement.slot,
    element: hero.element,
    role: hero.role,
    boss: false,
    stats: {
      hp: withBonus(leveled.hp, bonus.hp),
      atk: withBonus(leveled.atk, bonus.atk),
      def: withBonus(leveled.def, bonus.def),
      vit: leveled.vit,
    },
    spells,
    triggers: [
      ...passive.map((trigger) => ({ source: hero.passive.id, trigger })),
      ...extraTriggers,
    ],
    controller: 'policy',
    script: [],
    ...(awake ? { awakened: true as const } : {}),
  };
}

/** Échelle globale des monstres (balance.enemyScale) : PV et ATK, arrondis. */
function scaled(stats: UnitDef['stats'], scale: { hp: number; atk: number }): UnitDef['stats'] {
  return {
    ...stats,
    hp: Math.max(1, Math.round(stats.hp * scale.hp)),
    atk: Math.max(1, Math.round(stats.atk * scale.atk)),
  };
}

export function compileEnemy(
  content: Content,
  enemyId: string,
  level: number,
  slot: number,
  extraTriggers: readonly ResolvedTrigger[] = [],
): UnitDef {
  const enemy = content.enemyById.get(enemyId);
  if (enemy === undefined) throw new InvalidSetupError(`ennemi inconnu : ${enemyId}`);
  const { balance } = content;
  const { maxLevel, growth } = balance.progression;
  const passive = enemy.passive?.triggers.map((trigger) => ({
    source: enemy.passive?.id ?? enemy.id,
    trigger,
  }));
  return {
    id: unitId({ side: 'enemy', slot }),
    kind: enemy.id,
    side: 'enemy',
    slot,
    element: enemy.element,
    role: null,
    boss: enemy.boss,
    stats: scaled(
      statsAtLevel(enemy.stats, Math.min(maxLevel, Math.max(1, level)), growth.enemy, maxLevel),
      balance.enemyScale,
    ),
    spells: baseSpells(enemy.skills, enemy.element, balance),
    triggers: [...(passive ?? []), ...extraTriggers],
    controller: 'script',
    script: enemy.script.map((step) => ({ spell: step.skill, target: step.target })),
  };
}

/** Déclencheurs d'un modificateur de donjon pour un camp. */
export function modifierTriggers(
  modifier: DungeonModifier | undefined,
  side: Side,
): ResolvedTrigger[] {
  if (modifier === undefined) return [];
  const appliesTo = side === 'player' ? 'heroes' : 'enemies';
  return modifier.rules
    .filter((rule) => rule.appliesTo === appliesTo)
    .map((rule) => ({ source: modifier.id, trigger: rule.trigger }));
}

/** Une équipe de héros (1 à 3) pour un camp, de gauche à droite. */
export function compileTeam(
  content: Content,
  builds: readonly HeroBuild[],
  side: Side = 'player',
  modifier?: DungeonModifier,
): UnitDef[] {
  const heroes = new Set(builds.map((b) => b.hero));
  if (heroes.size !== builds.length) {
    throw new InvalidSetupError('une équipe n’accepte pas deux fois le même héros');
  }
  const extra = modifierTriggers(modifier, side);
  return builds.map((build, slot) => compileHero(content, build, { side, slot }, extra));
}

/** Les ennemis d'un combat de donjon. */
export function compileEncounter(
  content: Content,
  enemies: readonly string[],
  level: number,
  modifier?: DungeonModifier,
  /** PV de la rencontre, en % (le champ hpPct d'un combat de donjon). */
  hpPct = 100,
  /** ATK de la rencontre, en % (le champ atkPct d'un combat de donjon). */
  atkPct = 100,
): UnitDef[] {
  const extra = modifierTriggers(modifier, 'enemy');
  return enemies.map((id, slot) => {
    const unit = compileEnemy(content, id, level, slot, extra);
    if (hpPct === 100 && atkPct === 100) return unit;
    const hp = Math.max(1, Math.round((unit.stats.hp * hpPct) / 100));
    const atk = Math.max(1, Math.round((unit.stats.atk * atkPct) / 100));
    return { ...unit, stats: { ...unit.stats, hp, atk } };
  });
}
