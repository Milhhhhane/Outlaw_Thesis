import type { Balance, SpellSlot, StatusKind } from '@outlaw/data';
import type {
  BattleEvent,
  BattleResult,
  BattleRules,
  BattleState,
  PointsReason,
  Side,
  StepResult,
  UnitState,
} from './types';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
/**
 * Unité de travail. Ses champs sont modifiables, mais ses tableaux (altérations, modifications,
 * déclencheurs) et leurs entrées ne le sont jamais : on les remplace. Une copie superficielle
 * suffit donc à protéger l'état reçu.
 */
export type DraftUnit = Mutable<UnitState>;

/** Ce qui s'est passé pendant une action, en attente d'être proposé aux déclencheurs. */
export type Signal =
  | { readonly kind: 'combat_start' }
  | { readonly kind: 'turn_start' | 'turn_end'; readonly unit: string }
  | {
      readonly kind: 'spell_cast';
      readonly unit: string;
      readonly slot: SpellSlot;
      readonly target: string | null;
    }
  | {
      readonly kind: 'damage';
      readonly dealer: string;
      readonly victim: string;
      readonly hpBefore: number;
      readonly hpAfter: number;
      readonly maxHp: number;
      /** Altérations de la victime au moment du coup. */
      readonly victimStatuses: readonly StatusKind[];
    }
  | { readonly kind: 'unit_down'; readonly unit: string; readonly killer: string | null }
  | {
      readonly kind: 'status_applied';
      readonly unit: string;
      readonly source: string;
      readonly status: StatusKind;
    };

/**
 * Copie de travail d'un état, modifiée pendant un pas puis figée en nouvel état.
 * L'état reçu n'est jamais touché : le moteur reste pur vu de l'extérieur.
 */
export interface Draft {
  readonly balance: Balance;
  /** Règles du combat, ou undefined : les valeurs par défaut s'appliquent (voir rulesOf). */
  readonly rules: BattleRules | undefined;
  readonly units: DraftUnit[];
  clock: number;
  readonly points: Record<Side, number>;
  actionCount: number;
  active: string | null;
  result: BattleResult | null;
  readonly events: BattleEvent[];
  /** Signaux à proposer aux déclencheurs une fois l'action résolue. */
  readonly signals: Signal[];
  /** Vrai pendant l'effet d'un déclencheur : ses conséquences n'émettent pas de signal (pas de chaîne). */
  inTrigger: boolean;
}

export function openDraft(state: BattleState): Draft {
  return {
    balance: state.balance,
    rules: state.rules,
    units: state.units.map((unit) => ({ ...unit })),
    clock: state.clock,
    points: { ...state.points },
    actionCount: state.actionCount,
    active: state.active,
    result: state.result,
    events: [],
    signals: [],
    inTrigger: false,
  };
}

export function closeDraft(draft: Draft): StepResult {
  const state: BattleState = {
    balance: draft.balance,
    // Sans règles explicites, l'état garde exactement sa forme d'avant (PvE inchangé).
    ...(draft.rules === undefined ? {} : { rules: draft.rules }),
    units: draft.units.map((unit) => ({ ...unit })),
    clock: draft.clock,
    points: { ...draft.points },
    actionCount: draft.actionCount,
    active: draft.active,
    result: draft.result,
  };
  return { state, events: [...draft.events] };
}

export function signal(draft: Draft, value: Signal): void {
  if (!draft.inTrigger) draft.signals.push(value);
}

export function opposing(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

/** Unités vivantes d'un camp, dans l'ordre des emplacements. */
export function aliveOf<T extends UnitState>(units: readonly T[], side: Side): T[] {
  return units.filter((unit) => unit.alive && unit.def.side === side);
}

export function unitById<T extends UnitState>(units: readonly T[], id: string): T | undefined {
  return units.find((unit) => unit.def.id === id);
}

/**
 * Modifie la réserve d'un camp, bornée entre 0 et le plafond.
 * N'émet un événement que si la réserve a réellement changé ; renvoie la variation effective.
 */
export function changePoints(
  draft: Draft,
  side: Side,
  delta: number,
  reason: PointsReason,
): number {
  const before = draft.points[side];
  const after = Math.min(draft.balance.combat.teamPoints.cap, Math.max(0, before + delta));
  if (after === before) return 0;
  draft.points[side] = after;
  draft.events.push({ type: 'points', side, delta: after - before, total: after, reason });
  return after - before;
}

/** Fin du combat si un camp n'a plus d'unité vivante. */
export function checkEnd(draft: Draft): void {
  if (draft.result !== null) return;
  const players = aliveOf(draft.units, 'player').length;
  const enemies = aliveOf(draft.units, 'enemy').length;
  if (players > 0 && enemies > 0) return;
  const winner: Side | null = players > 0 ? 'player' : enemies > 0 ? 'enemy' : null;
  finish(draft, { winner, reason: 'annihilation' });
}

export function finish(draft: Draft, result: BattleResult): void {
  draft.result = result;
  draft.active = null;
  draft.events.push({ type: 'battle_end', winner: result.winner, reason: result.reason });
}
