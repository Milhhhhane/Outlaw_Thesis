import { rulesOf } from './rules';
import { effectiveSpeed, interval } from './stats';
import type { BattleState, QueueEntry, Side, UnitState } from './types';

interface Timed {
  readonly def: UnitState['def'];
  readonly nextTime: number;
}

/**
 * Ordre des tours : instant, puis camp prioritaire (les héros par défaut), puis emplacement.
 * Entièrement déterministe.
 */
export function compareTurnOrder(a: Timed, b: Timed, firstSide: Side = 'player'): number {
  if (a.nextTime !== b.nextTime) return a.nextTime - b.nextTime;
  if (a.def.side !== b.def.side) return a.def.side === firstSide ? -1 : 1;
  return a.def.slot - b.def.slot;
}

/** Prochaine unité à jouer parmi les vivantes, ou null si aucune. */
export function nextActor<T extends UnitState>(
  units: readonly T[],
  firstSide: Side = 'player',
): T | null {
  let best: T | null = null;
  for (const unit of units) {
    if (unit.alive && (best === null || compareTurnOrder(unit, best, firstSide) < 0)) best = unit;
  }
  return best;
}

/**
 * File d'initiative visible : les prochaines actions dans l'ordre.
 * Les actions futures ne sont pas connues : chaque unité est projetée avec son attaque de base.
 */
export function projectQueue(
  state: BattleState,
  horizon: number = state.balance.combat.queueHorizon,
): QueueEntry[] {
  if (state.result !== null) return [];
  const { firstSide } = rulesOf(state);
  const projected = state.units
    .filter((unit) => unit.alive)
    .map((unit) => {
      const basic = unit.def.spells.find((spell) => spell.slot === 'basic');
      const delay = basic?.delay ?? state.balance.combat.delays.basic;
      return {
        def: unit.def,
        nextTime: unit.nextTime,
        step: interval(delay, effectiveSpeed(unit, state.balance)),
      };
    });

  const entries: QueueEntry[] = [];
  while (entries.length < horizon && projected.length > 0) {
    let best = projected[0];
    for (const candidate of projected) {
      if (best === undefined || compareTurnOrder(candidate, best, firstSide) < 0) best = candidate;
    }
    if (best === undefined) break;
    entries.push({ unit: best.def.id, time: best.nextTime });
    best.nextTime += best.step;
  }
  return entries;
}
