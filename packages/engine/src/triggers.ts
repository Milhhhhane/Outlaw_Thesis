import type { EventKind } from '@outlaw/data';
import { unitById, type Draft, type DraftUnit, type Signal } from './draft';
import { applyEffect } from './effects';
import type { TriggerState } from './types';

interface Match {
  readonly subject: DraftUnit | undefined;
  readonly other: DraftUnit | undefined;
}

/** Sujet et « autre » d'un signal pour un type d'événement, ou null si le signal ne correspond pas. */
function participants(
  on: EventKind,
  sig: Signal,
  owner: DraftUnit,
): { subject: string; other: string | null } | null {
  switch (on) {
    case 'combat_start':
      return sig.kind === 'combat_start' ? { subject: owner.def.id, other: null } : null;
    case 'turn_start':
    case 'turn_end':
      return sig.kind === on ? { subject: sig.unit, other: null } : null;
    case 'spell_cast':
      return sig.kind === 'spell_cast' ? { subject: sig.unit, other: sig.target } : null;
    case 'damage_dealt':
      return sig.kind === 'damage' ? { subject: sig.dealer, other: sig.victim } : null;
    case 'damage_taken':
    case 'hp_crossed':
      return sig.kind === 'damage' ? { subject: sig.victim, other: sig.dealer } : null;
    case 'unit_down':
      return sig.kind === 'unit_down' ? { subject: sig.unit, other: sig.killer } : null;
    case 'status_applied':
      return sig.kind === 'status_applied' ? { subject: sig.unit, other: sig.source } : null;
  }
}

/** Conditions propres au déclencheur : emplacements, altération, seuil de PV. */
function conditionsHold(state: TriggerState, sig: Signal): boolean {
  const { trigger } = state;
  if (sig.kind === 'spell_cast' && trigger.slots !== undefined) {
    return trigger.slots.includes(sig.slot);
  }
  if (sig.kind === 'status_applied' && trigger.status !== undefined) {
    return trigger.status === sig.status;
  }
  if (sig.kind === 'damage') {
    if (
      trigger.targetHasStatus !== undefined &&
      !sig.victimStatuses.includes(trigger.targetHasStatus)
    ) {
      return false;
    }
    if (trigger.on === 'hp_crossed') {
      const threshold = (trigger.thresholdPct ?? 0) * sig.maxHp;
      return sig.hpBefore * 100 > threshold && sig.hpAfter * 100 <= threshold;
    }
  }
  return true;
}

function subjectHolds(
  state: TriggerState,
  owner: DraftUnit,
  subject: DraftUnit | undefined,
): boolean {
  if (subject === undefined) return false;
  switch (state.trigger.subject) {
    case 'self':
      return subject === owner;
    case 'ally':
      return subject.def.side === owner.def.side;
    case 'enemy':
      return subject.def.side !== owner.def.side;
    case 'any':
      return true;
  }
}

function withinLimit(state: TriggerState, actionCount: number): boolean {
  const { limit } = state.trigger;
  if (limit === undefined) return true;
  if (limit.per === 'combat') return state.uses < limit.count;
  return state.turnStamp !== actionCount || state.turnUses < limit.count;
}

function find(draft: Draft, owner: DraftUnit, state: TriggerState, sig: Signal): Match | null {
  const ids = participants(state.trigger.on, sig, owner);
  if (ids === null) return null;
  const subject = unitById(draft.units, ids.subject);
  const other = ids.other === null ? undefined : unitById(draft.units, ids.other);
  // Un porteur tombé ne déclenche plus rien, sauf « quand je tombe ».
  const ownDeath = state.trigger.on === 'unit_down' && subject === owner;
  if (!owner.alive && !ownDeath) return null;
  if (!subjectHolds(state, owner, subject)) return null;
  if (!conditionsHold(state, sig)) return null;
  if (!withinLimit(state, draft.actionCount)) return null;
  return { subject, other };
}

function fire(draft: Draft, owner: DraftUnit, state: TriggerState, match: Match): void {
  const now = draft.actionCount;
  owner.triggers = owner.triggers.map((t) =>
    t.key === state.key
      ? {
          ...t,
          uses: t.uses + 1,
          turnUses: t.turnStamp === now ? t.turnUses + 1 : 1,
          turnStamp: now,
        }
      : t,
  );
  draft.events.push({
    type: 'trigger_fired',
    unit: owner.def.id,
    source: state.source,
    on: state.trigger.on,
  });
  draft.inTrigger = true;
  const ctx = {
    caster: owner,
    element: owner.def.element,
    source: state.key,
    cause: 'trigger' as const,
    primary: [],
    subject: match.subject,
    other: match.other,
  };
  state.trigger.effects.forEach((effect, index) => {
    applyEffect(draft, ctx, effect, index);
  });
  draft.inTrigger = false;
}

/**
 * Propose les signaux de l'action aux déclencheurs, dans l'ordre : signal par signal, unité par unité
 * (héros puis ennemis, par emplacement). Les effets d'un déclencheur n'émettent aucun signal :
 * un passif n'en déclenche jamais un autre.
 */
export function flushSignals(draft: Draft): void {
  for (let sig = draft.signals.shift(); sig !== undefined; sig = draft.signals.shift()) {
    for (const owner of draft.units) {
      for (const snapshot of [...owner.triggers]) {
        const state = owner.triggers.find((t) => t.key === snapshot.key);
        if (state === undefined) continue;
        const match = find(draft, owner, state, sig);
        if (match !== null) fire(draft, owner, state, match);
      }
    }
  }
}
