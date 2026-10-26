import type { Balance, BaseStats, Element, ModifiableStat } from '@outlaw/data';
import type { UnitState } from './types';

/** Le temps est compté en centièmes d'unité : des entiers, donc aucune dérive de flottants. */
export const TIME_SCALE = 100;

/**
 * Délai avant le prochain tour : maintenant + délai × 100 ÷ VIT, en centièmes d'unité de temps.
 * Une VIT de 100 et un délai de 100 donnent 100 unités.
 */
export function interval(delay: number, speed: number): number {
  return Math.round((delay * 100 * TIME_SCALE) / speed);
}

export type GrowthCaps = Balance['progression']['growth']['hero'];

/**
 * Statistiques au niveau demandé : croissance linéaire du niveau 1 au niveau maximum,
 * plafonnée par growth (1 = +100 % au niveau max). La VIT ne croît pas : elle sert d'options, pas de farm.
 */
export function statsAtLevel(
  base: BaseStats,
  level: number,
  growth: GrowthCaps,
  maxLevel: number,
): BaseStats {
  if (!Number.isInteger(level) || level < 1 || level > maxLevel) {
    throw new RangeError(`niveau ${level} hors de 1..${maxLevel}`);
  }
  const progress = (level - 1) / (maxLevel - 1);
  const scale = (value: number, cap: number): number => Math.round(value * (1 + cap * progress));
  return {
    hp: scale(base.hp, growth.hp),
    atk: scale(base.atk, growth.atk),
    def: scale(base.def, growth.def),
    vit: base.vit,
  };
}

/** Triangle des éléments : feu > nature > eau > feu. */
const BEATS: Readonly<Record<Element, Element>> = {
  fire: 'nature',
  nature: 'water',
  water: 'fire',
};

export function elementMultiplier(
  attacker: Element,
  defender: Element,
  element: Balance['combat']['element'],
): number {
  if (BEATS[attacker] === defender) return element.advantage;
  if (BEATS[defender] === attacker) return element.disadvantage;
  return 1;
}

/** VIT plafonnée : la vitesse est un levier d'options, pas une stat à accumuler. */
export function cappedSpeed(vit: number, balance: Balance): number {
  return Math.max(1, Math.min(balance.combat.speedCap, vit));
}

/** Modification totale d'une stat, en %, après cumul additif et bornes. */
export function modTotal(unit: UnitState, stat: ModifiableStat, balance: Balance): number {
  let sum = 0;
  for (const mod of unit.mods) if (mod.stat === stat) sum += mod.percent;
  const { minPct, maxPct } = balance.combat.statMod;
  return Math.min(maxPct, Math.max(minPct, sum));
}

/** Stat effective (non arrondie) : stat de l'unité × (1 + modifications). */
export function effectiveStat(unit: UnitState, stat: ModifiableStat, balance: Balance): number {
  return unit.def.stats[stat] * (1 + modTotal(unit, stat, balance) / 100);
}

/** VIT effective de l'unité, modifications comprises, plafonnée. */
export function effectiveSpeed(unit: UnitState, balance: Balance): number {
  return cappedSpeed(effectiveStat(unit, 'vit', balance), balance);
}
