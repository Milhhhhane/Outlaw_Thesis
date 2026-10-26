import type { Effect, Targeting, TargetRef, Trigger } from '@outlaw/data';
import type { ResolvedSpell } from '@outlaw/engine';
import { t, tk } from './index';

/**
 * Textes générés depuis les données : la description d'un sort est toujours celle de ses briques,
 * talents compris. Rien n'est écrit à la main, rien ne peut diverger.
 */

function duration(n: number | undefined): string {
  if (n === undefined) return t('fx.duration.combat');
  return n === 1 ? t('fx.duration.one') : t('fx.duration.many', { n });
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Suffixe de cible, omis quand la brique vise la cible naturelle du sort. */
function targetSuffix(ref: TargetRef, spellTargeting: Targeting | null): string {
  if (ref === 'primary') return spellTargeting === null ? t('fx.target.primary') : '';
  if (ref === 'self' && spellTargeting === 'self') return '';
  if (ref === 'all_enemies' && spellTargeting === 'all_enemies') return '';
  if (ref === 'all_allies' && spellTargeting === 'all_allies') return '';
  return tk(`fx.target.${ref}`);
}

export function describeEffect(effect: Effect, spellTargeting: Targeting | null = null): string {
  const target = 'target' in effect ? targetSuffix(effect.target, spellTargeting) : '';
  switch (effect.kind) {
    case 'damage':
      return t('fx.damage', { power: effect.power, target });
    case 'heal':
      return t('fx.heal', { power: effect.power, target });
    case 'shield':
      return t('fx.shield', { power: effect.power, target, duration: duration(effect.duration) });
    case 'tempo':
      return effect.amount < 0
        ? t('fx.tempo.advance', { amount: -effect.amount, target })
        : t('fx.tempo.delay', { amount: effect.amount, target });
    case 'statMod':
      return t('fx.statMod', {
        stat: tk(`stat.${effect.stat}`),
        signed: signed(effect.percent),
        target,
        duration: duration(effect.duration),
      });
    case 'status':
      if (effect.status === 'stun')
        return t('fx.stun', { target, duration: duration(effect.duration) });
      return tk(`fx.${effect.status}`, {
        target,
        power: effect.power ?? '?',
        duration: duration(effect.duration),
      });
    case 'teamPoints':
      return t(effect.side === 'own' ? 'fx.points.own' : 'fx.points.opposing', {
        signed: signed(effect.amount),
      });
    case 'trigger':
      return t('fx.trigger', {
        duration: duration(effect.duration),
        target,
        text: describeTrigger(effect.trigger),
      });
  }
}

function describeWhat(slots: Trigger['slots']): string {
  if (slots === undefined || slots.length === 4) return t('trigger.what.any');
  if (slots.length === 1 && slots[0] === 'ult') return t('trigger.what.ult');
  if (slots.length === 1 && slots[0] === 'basic') return t('trigger.what.basic');
  return t('trigger.what.skill');
}

function describeWhen(trigger: Trigger): string {
  const who = tk(`trigger.who.${trigger.subject}`);
  const of = tk(`trigger.of.${trigger.subject}`);
  const status = trigger.targetHasStatus ? tk(`trigger.onStatus.${trigger.targetHasStatus}`) : '';
  switch (trigger.on) {
    case 'combat_start':
      return t('trigger.combat_start');
    case 'turn_start':
    case 'turn_end':
      return t(`trigger.${trigger.on}`, { of });
    case 'spell_cast':
      return t('trigger.spell_cast', { who, what: describeWhat(trigger.slots) });
    case 'damage_dealt':
    case 'damage_taken':
      return t(`trigger.${trigger.on}`, { who, status });
    case 'hp_crossed':
      return t('trigger.hp_crossed', { who, threshold: trigger.thresholdPct ?? '?' });
    case 'unit_down':
      return t('trigger.unit_down', { who });
    case 'status_applied':
      return t('trigger.status_applied', {
        who,
        status: tk(`trigger.status.${trigger.status ?? 'mark'}`),
      });
  }
}

function describeLimit(limit: Trigger['limit']): string {
  if (limit === undefined) return '';
  return limit.count === 1
    ? t(limit.per === 'combat' ? 'trigger.limit.combat' : 'trigger.limit.turn')
    : t(limit.per === 'combat' ? 'trigger.limit.combat.many' : 'trigger.limit.turn.many', {
        count: limit.count,
      });
}

export function describeTrigger(trigger: Trigger): string {
  return t('trigger.sentence', {
    when: describeWhen(trigger),
    limit: describeLimit(trigger.limit),
    effects: trigger.effects.map((effect) => describeEffect(effect)).join(' ; '),
  });
}

/** Description complète d'un sort compilé : ses briques dans l'ordre. */
export function describeSpell(spell: ResolvedSpell): string[] {
  return spell.effects.map((effect) => describeEffect(effect, spell.targeting));
}
