import type { BattleEvent, BattleState, Side, UnitState } from '@outlaw/engine';

/**
 * Ce que l'écran affiche. Il est mis à jour événement par événement en rejouant le journal
 * (chaque événement porte déjà ses valeurs finales : PV restants, total de bouclier…),
 * puis recalé sur l'état du moteur à la fin. L'interface ne calcule aucune règle.
 */
export interface StatusView {
  readonly kind: string;
  readonly turns: number;
}

export interface UnitView {
  readonly id: string;
  readonly kind: string;
  readonly side: Side;
  readonly slot: number;
  readonly element: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
  readonly alive: boolean;
  readonly statuses: readonly StatusView[];
  /** Total des modifications de stat en cours, en %. */
  readonly mods: Readonly<Record<string, number>>;
}

export interface Flash {
  /** Identifiant unique : relance l'animation à chaque nouvel événement. */
  readonly key: number;
  readonly unit: string;
  readonly text: string;
  readonly tone: 'damage' | 'heal' | 'shield' | 'status' | 'tempo';
  /** Effet visuel à jouer sur l'unité (nom d'une animation de l'atlas), ou aucun. */
  readonly fx: string | null;
}

/** Sort en cours d'animation : le lanceur, ses cibles et son élément. */
export interface CastView {
  readonly key: number;
  readonly unit: string;
  readonly targets: readonly string[];
  readonly element: string;
}

export interface BattleView {
  readonly units: readonly UnitView[];
  readonly points: Readonly<Record<Side, number>>;
  readonly flashes: readonly Flash[];
  /** Unité qui vient d'agir (mise en avant pendant l'animation). */
  readonly acting: string | null;
  readonly cast: CastView | null;
}

function modsOf(unit: UnitState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const mod of unit.mods) totals[mod.stat] = (totals[mod.stat] ?? 0) + mod.percent;
  return totals;
}

/** Vue exacte d'un état du moteur. */
export function viewFromState(state: BattleState): BattleView {
  return {
    units: state.units.map((unit) => ({
      id: unit.def.id,
      kind: unit.def.kind,
      side: unit.def.side,
      slot: unit.def.slot,
      element: unit.def.element,
      hp: unit.hp,
      maxHp: unit.def.stats.hp,
      shield: unit.shield,
      alive: unit.alive,
      statuses: unit.statuses.map((s) => ({ kind: s.kind, turns: s.turns })),
      mods: modsOf(unit),
    })),
    points: { ...state.points },
    flashes: [],
    acting: null,
    cast: null,
  };
}

function update(view: BattleView, id: string, change: (unit: UnitView) => UnitView): BattleView {
  return { ...view, units: view.units.map((unit) => (unit.id === id ? change(unit) : unit)) };
}

function flash(
  view: BattleView,
  key: number,
  unit: string,
  text: string,
  tone: Flash['tone'],
  fx: string | null = null,
): BattleView {
  return { ...view, flashes: [...view.flashes.slice(-5), { key, unit, text, tone, fx }] };
}

function elementOf(view: BattleView, id: string): string {
  return view.units.find((u) => u.id === id)?.element ?? 'fire';
}

const STATUS_FX: Readonly<Record<string, string>> = { burn: 'burn', stun: 'stun', mark: 'mark' };

/** Applique un événement du journal à la vue. `key` : position de l'événement, pour les animations. */
export function applyEvent(view: BattleView, event: BattleEvent, key: number): BattleView {
  switch (event.type) {
    case 'turn_start':
      return { ...view, acting: event.unit };
    case 'cast':
      return {
        ...view,
        acting: event.unit,
        cast: {
          key,
          unit: event.unit,
          targets: event.targets,
          element: elementOf(view, event.unit),
        },
      };
    case 'damage': {
      const next = update(view, event.target, (u) => ({
        ...u,
        hp: event.hpAfter,
        shield: event.shieldAfter,
        alive: event.hpAfter > 0,
      }));
      const element = event.cause === 'burn' ? 'fire' : elementOf(view, event.source);
      return flash(
        next,
        key,
        event.target,
        `−${event.amount - event.absorbed}`,
        'damage',
        `burst_${element}`,
      );
    }
    case 'heal':
      return flash(
        update(view, event.target, (u) => ({ ...u, hp: event.hpAfter })),
        key,
        event.target,
        `+${event.amount}`,
        'heal',
        'heal',
      );
    case 'shield':
      return flash(
        update(view, event.target, (u) => ({ ...u, shield: event.total })),
        key,
        event.target,
        `+${event.amount}`,
        'shield',
        'shield',
      );
    case 'status':
      if (event.resisted) return view;
      return flash(
        update(view, event.target, (u) => ({
          ...u,
          statuses: [
            ...u.statuses.filter((s) => s.kind !== event.status),
            { kind: event.status, turns: event.turns },
          ],
        })),
        key,
        event.target,
        '',
        'status',
        STATUS_FX[event.status] ?? null,
      );
    case 'stat_mod':
      return flash(
        update(view, event.target, (u) => ({
          ...u,
          mods: { ...u.mods, [event.stat]: event.total },
        })),
        key,
        event.target,
        '',
        'status',
        event.percent >= 0 ? 'buff' : 'debuff',
      );
    case 'tempo':
      return flash(view, key, event.target, event.delta < 0 ? '«' : '»', 'tempo');
    case 'points':
      return { ...view, points: { ...view.points, [event.side]: event.total } };
    case 'expired':
      if (event.effect === 'shield') return update(view, event.unit, (u) => ({ ...u, shield: 0 }));
      return update(view, event.unit, (u) => ({
        ...u,
        statuses: u.statuses.filter((s) => s.kind !== event.effect),
      }));
    case 'unit_down':
      return update(view, event.unit, (u) => ({ ...u, alive: false, hp: 0 }));
    default:
      return view;
  }
}

/** Durée d'affichage d'un événement (ms) : seuls les événements visibles prennent du temps. */
export function eventDuration(event: BattleEvent): number {
  switch (event.type) {
    case 'cast':
      return 380;
    case 'damage':
    case 'heal':
    case 'shield':
      return 260;
    case 'status':
    case 'tempo':
    case 'turn_skipped':
    case 'unit_down':
    case 'trigger_fired':
      return 200;
    default:
      return 0;
  }
}
