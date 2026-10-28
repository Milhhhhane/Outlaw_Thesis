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
  /** Coup lourd (au moins 30 % des PV max, ou mortel) : secousse et gros impact. */
  readonly heavy: boolean;
  /** L'effet se joue aux pieds (poussière) plutôt que sur le corps. */
  readonly feet: boolean;
}

/** Sort en cours d'animation : le lanceur, ses cibles et son élément. */
export interface CastView {
  readonly key: number;
  /** Rang du sort dans le combat : sa parité alterne les noms d'animation (a/b) d'un sort au suivant. */
  readonly seq: number;
  readonly unit: string;
  readonly targets: readonly string[];
  readonly element: string;
  /** Ultime : flash d'écran et zoom bref. */
  readonly ult: boolean;
  /** Attaque de base sur un seul ennemi : le sprite court jusqu'à sa cible et frappe au contact. */
  readonly dash: boolean;
}

export interface BattleView {
  readonly units: readonly UnitView[];
  readonly points: Readonly<Record<Side, number>>;
  readonly flashes: readonly Flash[];
  /** Unité qui vient d'agir (mise en avant pendant l'animation). */
  readonly acting: string | null;
  readonly cast: CastView | null;
  /** Dernière secousse d'écran : clé de l'événement et force (1 légère, 2 forte). */
  readonly shake: { readonly key: number; readonly power: number } | null;
  /** Dernier coup reçu par un héros (voile rouge) : clé de l'événement. */
  readonly hurt: number | null;
  /** Premier coup d'un ultime qui touche (flash blanc et grosse secousse) : clé de l'événement. */
  readonly ultHit: number | null;
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
    shake: null,
    hurt: null,
    ultHit: null,
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
  extra: Partial<Pick<Flash, 'heavy' | 'feet'>> = {},
): BattleView {
  const entry: Flash = { key, unit, text, tone, fx, heavy: false, feet: false, ...extra };
  return { ...view, flashes: [...view.flashes.slice(-5), entry] };
}

function elementOf(view: BattleView, id: string): string {
  return view.units.find((u) => u.id === id)?.element ?? 'fire';
}

const STATUS_FX: Readonly<Record<string, string>> = { burn: 'burn', stun: 'stun', mark: 'mark' };

/** Applique un événement du journal à la vue. `key` : position de l'événement, pour les animations. */
export function applyEvent(view: BattleView, event: BattleEvent, key: number): BattleView {
  const next = applyOne(view, event, key);
  // Premier effet d'un ultime (coup, soin, bouclier, altération, tempo…) : le flash d'écran part
  // à l'impact, pas au lancer. Les ultimes sans dégâts ont aussi le leur.
  const cast = view.cast;
  const strikes =
    'source' in event &&
    cast !== null &&
    cast.ult &&
    cast.unit === event.source &&
    event.type !== 'trigger_fired' &&
    (view.ultHit === null || view.ultHit < cast.key);
  return strikes ? { ...next, ultHit: key } : next;
}

function applyOne(view: BattleView, event: BattleEvent, key: number): BattleView {
  switch (event.type) {
    case 'turn_start':
      return { ...view, acting: event.unit };
    case 'cast': {
      const caster = view.units.find((u) => u.id === event.unit);
      const only = event.targets.length === 1 ? event.targets[0] : undefined;
      const target = view.units.find((u) => u.id === only);
      return {
        ...view,
        acting: event.unit,
        cast: {
          key,
          seq: (view.cast?.seq ?? 0) + 1,
          unit: event.unit,
          targets: event.targets,
          element: caster?.element ?? 'fire',
          ult: event.slot === 'ult',
          dash:
            event.slot === 'basic' &&
            caster !== undefined &&
            target !== undefined &&
            target.side !== caster.side,
        },
      };
    }
    case 'damage': {
      const next = update(view, event.target, (u) => ({
        ...u,
        hp: event.hpAfter,
        shield: event.shieldAfter,
        alive: event.hpAfter > 0,
      }));
      const element = event.cause === 'burn' ? 'fire' : elementOf(view, event.source);
      const target = view.units.find((u) => u.id === event.target);
      const dealt = event.amount - event.absorbed;
      // Coup d'un ultime : toujours lourd.
      const fromUlt =
        event.cause === 'spell' && view.cast?.ult === true && view.cast.unit === event.source;
      const heavy =
        fromUlt ||
        (event.cause !== 'burn' &&
          (event.killed || (target !== undefined && dealt >= target.maxHp * 0.3)));
      const shaken = {
        ...next,
        shake: event.cause === 'burn' ? next.shake : { key, power: heavy ? 2 : 1 },
        hurt: target?.side === 'player' && event.cause !== 'burn' ? key : next.hurt,
      };
      // Bouclier brisé sans que rien ne passe : la bulle éclate à la place de l'impact.
      const shattered = event.absorbed > 0 && event.shieldAfter === 0 && dealt === 0;
      return flash(
        shaken,
        key,
        event.target,
        `−${dealt}`,
        'damage',
        shattered ? 'shatter' : heavy ? `impact_${element}` : `burst_${element}`,
        { heavy },
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
      return flash(
        update(view, event.unit, (u) => ({ ...u, alive: false, hp: 0 })),
        key,
        event.unit,
        '',
        'status',
        'dust',
        { feet: true },
      );
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
