import type { Effect, EffectKind, Element } from '@outlaw/data';
import { changePoints, opposing, type Draft, type DraftUnit } from './draft';
import { InvalidSetupError } from './errors';
import { elementMultiplier } from './stats';
import { resolveRef } from './targets';
import type { ResolvedSpell } from './types';

/**
 * Briques gérées par le moteur à ce stade. Le sprint 1 ajoute bouclier, tempo,
 * modification de stat, altérations et déclencheurs.
 */
export const SUPPORTED_EFFECTS: ReadonlySet<EffectKind> = new Set(['damage', 'heal', 'teamPoints']);

export interface CastContext {
  readonly caster: DraftUnit;
  readonly spell: ResolvedSpell;
  readonly primary: readonly DraftUnit[];
}

/**
 * Dégâts = ATK × puissance % × K ÷ (K + DEF) × élément, arrondis, au moins minDamage.
 * Renvoie le montant infligé.
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
  const mitigation = combat.defenseScale / (combat.defenseScale + target.def.stats.def);
  const raw = ((caster.def.stats.atk * power) / 100) * mitigation * multiplier;
  return { amount: Math.max(combat.minDamage, Math.round(raw)), multiplier };
}

function dealDamage(
  draft: Draft,
  caster: DraftUnit,
  target: DraftUnit,
  power: number,
  element: Element,
): void {
  const { amount, multiplier } = computeDamage(draft, caster, target, power, element);
  target.hp = Math.max(0, target.hp - amount);
  const killed = target.hp === 0;
  draft.events.push({
    type: 'damage',
    source: caster.def.id,
    target: target.def.id,
    amount,
    multiplier,
    hpAfter: target.hp,
    killed,
  });
  if (killed) {
    target.alive = false;
    draft.events.push({ type: 'unit_down', unit: target.def.id });
  }
}

/** Le soin s'appuie sur l'ATK du lanceur et ne dépasse pas les PV max. */
function heal(draft: Draft, caster: DraftUnit, target: DraftUnit, power: number): void {
  const raw = Math.round((caster.def.stats.atk * power) / 100);
  const amount = Math.min(raw, target.def.stats.hp - target.hp);
  if (amount <= 0) return;
  target.hp += amount;
  draft.events.push({
    type: 'heal',
    source: caster.def.id,
    target: target.def.id,
    amount,
    hpAfter: target.hp,
  });
}

export function applyEffect(draft: Draft, ctx: CastContext, effect: Effect): void {
  const targets = (): DraftUnit[] =>
    'target' in effect
      ? resolveRef(effect.target, { units: draft.units, caster: ctx.caster, primary: ctx.primary })
      : [];
  switch (effect.kind) {
    case 'damage': {
      const element = effect.element ?? ctx.spell.element;
      for (const target of targets()) dealDamage(draft, ctx.caster, target, effect.power, element);
      return;
    }
    case 'heal':
      for (const target of targets()) heal(draft, ctx.caster, target, effect.power);
      return;
    case 'teamPoints': {
      const side = effect.side === 'own' ? ctx.caster.def.side : opposing(ctx.caster.def.side);
      changePoints(draft, side, effect.amount, 'effect');
      return;
    }
    default:
      throw new InvalidSetupError(`brique « ${effect.kind} » pas encore gérée par le moteur`);
  }
}
