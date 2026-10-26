import type { EnemyTargetRule, TargetRef } from '@outlaw/data';
import { aliveOf, opposing } from './draft';
import { InvalidSetupError } from './errors';
import type { ResolvedSpell, UnitState } from './types';

/** Unité aux PV les plus bas ; à égalité, l'emplacement le plus bas. */
export function lowestHp<T extends UnitState>(pool: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const unit of pool) if (best === undefined || unit.hp < best.hp) best = unit;
  return best;
}

function highestAtk<T extends UnitState>(pool: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const unit of pool) {
    if (best === undefined || unit.def.stats.atk > best.def.stats.atk) best = unit;
  }
  return best;
}

/** Camp dans lequel un sort choisit sa cible. */
export function targetSide(caster: UnitState, spell: ResolvedSpell): UnitState['def']['side'] {
  return spell.targeting === 'ally' ||
    spell.targeting === 'all_allies' ||
    spell.targeting === 'self'
    ? caster.def.side
    : opposing(caster.def.side);
}

/** Cible choisie par le script d'un ennemi, ou undefined pour les sorts sans choix de cible. */
export function scriptTarget<T extends UnitState>(
  units: readonly T[],
  caster: T,
  spell: ResolvedSpell,
  rule: EnemyTargetRule,
): T | undefined {
  const pool = aliveOf(units, targetSide(caster, spell));
  switch (rule) {
    case 'auto':
      return undefined;
    case 'lowest_hp':
      return lowestHp(pool);
    case 'highest_atk':
      return highestAtk(pool);
    case 'first':
      return pool[0];
    case 'last':
      return pool[pool.length - 1];
  }
}

export interface TargetContext<T extends UnitState> {
  readonly units: readonly T[];
  readonly caster: T;
  /** Cibles du sort (choisies ou implicites). */
  readonly primary: readonly T[];
}

/** Unités visées par une brique, vivantes au moment où la brique s'applique. */
export function resolveRef<T extends UnitState>(ref: TargetRef, ctx: TargetContext<T>): T[] {
  const { units, caster } = ctx;
  const allies = aliveOf(units, caster.def.side);
  const enemies = aliveOf(units, opposing(caster.def.side));
  const one = (unit: T | undefined): T[] => (unit === undefined ? [] : [unit]);
  switch (ref) {
    case 'primary':
      return ctx.primary.filter((unit) => unit.alive);
    case 'self':
      return caster.alive ? [caster] : [];
    case 'all_allies':
      return allies;
    case 'other_allies':
      return allies.filter((unit) => unit !== caster);
    case 'all_enemies':
      return enemies;
    case 'lowest_hp_ally':
      return one(lowestHp(allies));
    case 'lowest_hp_enemy':
      return one(lowestHp(enemies));
    case 'subject':
    case 'other':
      throw new InvalidSetupError(`cible « ${ref} » réservée aux déclencheurs`);
  }
}
