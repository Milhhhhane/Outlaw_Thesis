import type { Effect, Element, ModifiableStat, StatusKind, Trigger } from '@outlaw/data';
import { changePoints, opposing, signal, type Draft, type DraftUnit } from './draft';
import { effectiveStat, elementMultiplier, modTotal, TIME_SCALE } from './stats';
import { resolveRef } from './targets';
import type { Cause, StatusState } from './types';

export interface EffectContext {
  /** Unité dont les stats servent au calcul : lanceur du sort ou porteur du déclencheur. */
  readonly caster: DraftUnit;
  /** Élément par défaut des dégâts. */
  readonly element: Element;
  /** Origine (sort ou déclencheur) : sert de clé aux modifications et déclencheurs posés. */
  readonly source: string;
  readonly cause: Cause;
  readonly primary: readonly DraftUnit[];
  readonly subject?: DraftUnit | undefined;
  readonly other?: DraftUnit | undefined;
}

export function statusOf(unit: DraftUnit, kind: StatusState['kind']): StatusState | undefined {
  return unit.statuses.find((status) => status.kind === kind);
}

function withStatus(unit: DraftUnit, status: StatusState): void {
  unit.statuses = [...unit.statuses.filter((s) => s.kind !== status.kind), status];
}

/** Atténuation par la DEF effective : K ÷ (K + DEF). */
function mitigation(draft: Draft, target: DraftUnit): number {
  const k = draft.balance.combat.defenseScale;
  return k / (k + Math.max(0, effectiveStat(target, 'def', draft.balance)));
}

/**
 * Dégâts = ATK × puissance % × K ÷ (K + DEF) × élément × (1 + marque %), arrondis, au moins minDamage.
 */
export function computeDamage(
  draft: Draft,
  caster: DraftUnit,
  target: DraftUnit,
  power: number,
  element: Element,
): { amount: number; multiplier: number } {
  const { combat } = draft.balance;
  const multiplier = elementMultiplier(element, target.def.element, combat.element);
  const mark = statusOf(target, 'mark');
  const markFactor = 1 + (mark?.power ?? 0) / 100;
  const atk = effectiveStat(caster, 'atk', draft.balance);
  const raw = ((atk * power) / 100) * mitigation(draft, target) * multiplier * markFactor;
  return { amount: Math.max(combat.minDamage, Math.round(raw)), multiplier };
}

/** Applique un coup : le bouclier absorbe d'abord, puis les PV. */
export function hit(
  draft: Draft,
  source: string,
  target: DraftUnit,
  amount: number,
  cause: Cause,
  multiplier: number,
): void {
  const hpBefore = target.hp;
  const victimStatuses = target.statuses
    .map((s) => s.kind)
    .filter((kind): kind is StatusKind => kind !== 'stun_immunity');
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  if (target.shield === 0) target.shieldTurns = 0;
  target.hp = Math.max(0, target.hp - (amount - absorbed));
  const killed = target.hp === 0;
  draft.events.push({
    type: 'damage',
    source,
    target: target.def.id,
    cause,
    amount,
    absorbed,
    multiplier,
    hpAfter: target.hp,
    shieldAfter: target.shield,
    killed,
  });
  signal(draft, {
    kind: 'damage',
    dealer: source,
    victim: target.def.id,
    hpBefore,
    hpAfter: target.hp,
    maxHp: target.def.stats.hp,
    victimStatuses,
  });
  if (killed) {
    target.alive = false;
    draft.events.push({ type: 'unit_down', unit: target.def.id });
    signal(draft, { kind: 'unit_down', unit: target.def.id, killer: source });
  }
}

function damage(
  draft: Draft,
  ctx: EffectContext,
  target: DraftUnit,
  power: number,
  element: Element,
) {
  const { amount, multiplier } = computeDamage(draft, ctx.caster, target, power, element);
  hit(draft, ctx.caster.def.id, target, amount, ctx.cause, multiplier);
}

/** Le soin s'appuie sur l'ATK du lanceur et ne dépasse pas les PV max. */
function heal(draft: Draft, ctx: EffectContext, target: DraftUnit, power: number): void {
  const raw = Math.round((effectiveStat(ctx.caster, 'atk', draft.balance) * power) / 100);
  const amount = Math.min(raw, target.def.stats.hp - target.hp);
  if (amount <= 0) return;
  target.hp += amount;
  draft.events.push({
    type: 'heal',
    source: ctx.caster.def.id,
    target: target.def.id,
    cause: ctx.cause,
    amount,
    hpAfter: target.hp,
  });
}

/** Bouclier : ATK du lanceur × puissance %, cumulable jusqu'au plafond (en % des PV max). */
function shield(
  draft: Draft,
  ctx: EffectContext,
  target: DraftUnit,
  power: number,
  turns: number,
): void {
  const raw = Math.round((effectiveStat(ctx.caster, 'atk', draft.balance) * power) / 100);
  const cap = Math.round((target.def.stats.hp * draft.balance.combat.shieldCapPctMaxHp) / 100);
  const total = Math.max(target.shield, Math.min(cap, target.shield + raw));
  const amount = total - target.shield;
  target.shield = total;
  target.shieldTurns = Math.max(target.shieldTurns, turns);
  target.shieldSince = draft.actionCount;
  draft.events.push({
    type: 'shield',
    source: ctx.caster.def.id,
    target: target.def.id,
    amount,
    total,
    turns: target.shieldTurns,
  });
}

/** Tempo : avance (négatif) ou retarde (positif) le prochain tour, jamais avant l'instant présent. */
function tempo(draft: Draft, ctx: EffectContext, target: DraftUnit, amount: number): void {
  const before = target.nextTime;
  target.nextTime = Math.max(draft.clock, before + Math.round(amount * TIME_SCALE));
  draft.events.push({
    type: 'tempo',
    source: ctx.caster.def.id,
    target: target.def.id,
    delta: target.nextTime - before,
    nextTime: target.nextTime,
  });
}

function statMod(
  draft: Draft,
  ctx: EffectContext,
  target: DraftUnit,
  stat: ModifiableStat,
  percent: number,
  turns: number,
): void {
  const key = `${ctx.caster.def.id}:${ctx.source}:${stat}`;
  target.mods = [
    ...target.mods.filter((mod) => mod.key !== key),
    { key, stat, percent, turns, since: draft.actionCount, source: ctx.caster.def.id },
  ];
  draft.events.push({
    type: 'stat_mod',
    source: ctx.caster.def.id,
    target: target.def.id,
    stat,
    percent,
    turns,
    total: modTotal(target, stat, draft.balance),
  });
}

/**
 * Altérations : une seule de chaque sorte par unité. Une nouvelle pose garde la plus longue durée
 * et la plus forte puissance. L'étourdissement est refusé pendant l'immunité qui suit le précédent.
 */
function status(
  draft: Draft,
  ctx: EffectContext,
  target: DraftUnit,
  kind: StatusKind,
  turns: number,
  power: number | undefined,
): void {
  const { combat } = draft.balance;
  const current = statusOf(target, kind);
  const base = { source: ctx.caster.def.id, since: draft.actionCount };
  let resisted = false;
  if (kind === 'stun') {
    resisted = current !== undefined || statusOf(target, 'stun_immunity') !== undefined;
    if (!resisted) withStatus(target, { ...base, kind, turns, power: 0 });
  } else {
    const value =
      kind === 'mark'
        ? (power ?? combat.markBonusPct)
        : Math.max(
            1,
            Math.round(
              ((effectiveStat(ctx.caster, 'atk', draft.balance) * (power ?? combat.burnPowerPct)) /
                100) *
                mitigation(draft, target),
            ),
          );
    withStatus(target, {
      ...base,
      kind,
      turns: Math.max(turns, current?.turns ?? 0),
      power: Math.max(value, current?.power ?? 0),
    });
  }
  draft.events.push({
    type: 'status',
    source: ctx.caster.def.id,
    target: target.def.id,
    status: kind,
    turns: resisted ? 0 : (statusOf(target, kind)?.turns ?? turns),
    resisted,
  });
  if (!resisted) {
    signal(draft, {
      kind: 'status_applied',
      unit: target.def.id,
      source: ctx.caster.def.id,
      status: kind,
    });
  }
}

function addTrigger(
  draft: Draft,
  ctx: EffectContext,
  target: DraftUnit,
  trigger: Trigger,
  turns: number | null,
  index: number,
): void {
  const key = `${ctx.caster.def.id}:${ctx.source}#${index}`;
  target.triggers = [
    ...target.triggers.filter((t) => t.key !== key),
    {
      key,
      source: ctx.source,
      trigger,
      turns,
      since: draft.actionCount,
      uses: 0,
      turnUses: 0,
      turnStamp: -1,
    },
  ];
  draft.events.push({
    type: 'trigger_added',
    source: ctx.caster.def.id,
    target: target.def.id,
    key,
    turns,
  });
}

/** Applique une brique d'effet. `index` : position de la brique dans son sort (clé des déclencheurs posés). */
export function applyEffect(draft: Draft, ctx: EffectContext, effect: Effect, index = 0): void {
  if (effect.kind === 'teamPoints') {
    const side = effect.side === 'own' ? ctx.caster.def.side : opposing(ctx.caster.def.side);
    changePoints(draft, side, effect.amount, 'effect');
    return;
  }
  const targets = resolveRef(effect.target, {
    units: draft.units,
    caster: ctx.caster,
    primary: ctx.primary,
    subject: ctx.subject,
    other: ctx.other,
  });
  for (const target of targets) {
    if (!target.alive) continue;
    applyToTarget(draft, ctx, effect, target, index);
  }
}

function applyToTarget(
  draft: Draft,
  ctx: EffectContext,
  effect: Exclude<Effect, { kind: 'teamPoints' }>,
  target: DraftUnit,
  index: number,
): void {
  switch (effect.kind) {
    case 'damage':
      damage(draft, ctx, target, effect.power, effect.element ?? ctx.element);
      return;
    case 'heal':
      heal(draft, ctx, target, effect.power);
      return;
    case 'shield':
      shield(draft, ctx, target, effect.power, effect.duration);
      return;
    case 'tempo':
      tempo(draft, ctx, target, effect.amount);
      return;
    case 'statMod':
      statMod(draft, ctx, target, effect.stat, effect.percent, effect.duration);
      return;
    case 'status':
      status(draft, ctx, target, effect.status, effect.duration, effect.power);
      return;
    case 'trigger':
      addTrigger(draft, ctx, target, effect.trigger, effect.duration ?? null, index);
      return;
  }
}
