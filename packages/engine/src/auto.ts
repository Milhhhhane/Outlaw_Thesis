import type { SpellSlot } from '@outlaw/data';
import { legalActions } from './battle';
import { targetSide } from './targets';
import type { Action, BattleState, ResolvedSpell, UnitState } from './types';

/**
 * Combat automatique : la décision du bouton « Auto ». Une règle simple et lisible, pas une
 * anticipation : elle ne bat pas un joueur attentif (voir `docs/BALANCE.md`), elle épargne les clics.
 *
 * - le sort le plus cher que la réserve permet, l'attaque de base sinon ;
 * - un sort de soutien seulement s'il sert : soin si un allié est blessé, bouclier si une cible n'en
 *   a pas, amélioration si elle n'est pas déjà active ;
 * - cible : l'ennemi aux PV les plus bas ; pour un soin, l'allié le plus blessé.
 *
 * Aucune hypothèse sur la taille des équipes : tout vient des actions légales et des unités vivantes.
 * Pure et déterministe : même état, même action.
 */

const RANK: Readonly<Record<SpellSlot, number>> = { ult: 3, b: 2, a: 1, basic: 0 };

/** Un allié compte comme blessé à 70 % de PV ou moins. */
const WOUNDED = 0.7;

function offensive(spell: ResolvedSpell): boolean {
  return spell.targeting === 'enemy' || spell.targeting === 'all_enemies';
}

/** Cette unité profite déjà d'une amélioration lancée par ce sort (même lanceur). */
function buffed(unit: UnitState, caster: UnitState, spell: ResolvedSpell): boolean {
  const prefix = `${caster.def.id}:${spell.id}:`;
  return unit.mods.some((mod) => mod.key.startsWith(prefix));
}

/** Unités touchées par un sort de soutien : la cible choisie, le lanceur, ou tout le camp. */
function recipients(
  state: BattleState,
  caster: UnitState,
  spell: ResolvedSpell,
  target: UnitState | undefined,
): UnitState[] {
  if (spell.targeting === 'self') return [caster];
  if (spell.targeting === 'ally') return target === undefined ? [] : [target];
  return state.units.filter((unit) => unit.alive && unit.def.side === targetSide(caster, spell));
}

function ratio(unit: UnitState): number {
  return unit.hp / unit.def.stats.hp;
}

/** Le sort sert-il maintenant, sur cette cible ? */
function useful(
  state: BattleState,
  caster: UnitState,
  spell: ResolvedSpell,
  target: UnitState | undefined,
): boolean {
  if (offensive(spell)) return true;
  const group = recipients(state, caster, spell, target);
  const kinds = new Set(spell.effects.map((effect) => effect.kind));
  return (
    (kinds.has('heal') && group.some((unit) => ratio(unit) <= WOUNDED)) ||
    (kinds.has('shield') && group.some((unit) => unit.shield === 0)) ||
    (kinds.has('statMod') && group.some((unit) => !buffed(unit, caster, spell)))
  );
}

/** Plus petit = mieux : ennemi le plus faible, allié le plus blessé (sans bouclier d'abord). */
function aim(spell: ResolvedSpell, target: UnitState | undefined): number {
  if (target === undefined) return 0;
  if (offensive(spell)) return target.hp;
  return (target.shield > 0 ? 10 : 0) + ratio(target);
}

interface Candidate {
  readonly action: Action;
  readonly useful: boolean;
  readonly cost: number;
  readonly rank: number;
  readonly aim: number;
}

/** Action choisie par le combat automatique pour l'unité active. */
export function autoAction(state: BattleState): Action {
  const caster = state.units.find((unit) => unit.def.id === state.active);
  if (caster === undefined) throw new Error('aucune unité active');
  let best: Candidate | undefined;
  for (const action of legalActions(state)) {
    const spell = caster.def.spells.find((candidate) => candidate.id === action.spell);
    if (spell === undefined) continue;
    const target = state.units.find((unit) => unit.def.id === action.target);
    const candidate: Candidate = {
      action,
      useful: useful(state, caster, spell, target),
      cost: spell.cost,
      rank: RANK[spell.slot],
      aim: aim(spell, target),
    };
    if (best === undefined || better(candidate, best)) best = candidate;
  }
  if (best === undefined) throw new Error('aucune action possible');
  return best.action;
}

/** Ordre strict : utile, plus cher, plus haut emplacement, meilleure cible ; le premier gagne. */
function better(a: Candidate, b: Candidate): boolean {
  if (a.useful !== b.useful) return a.useful;
  if (a.cost !== b.cost) return a.cost > b.cost;
  if (a.rank !== b.rank) return a.rank > b.rank;
  return a.aim < b.aim;
}
