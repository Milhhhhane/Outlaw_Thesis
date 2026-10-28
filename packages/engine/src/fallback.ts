import { aliveOf, unitById } from './draft';
import { IllegalActionError } from './errors';
import { lowestHp, targetSide } from './targets';
import type { Action, BattleState } from './types';

/**
 * Action jouée à la place d'un joueur absent ou trop lent : l'attaque de base de l'unité active.
 * Sort à cible choisie : le vivant aux PV les plus bas du camp visé, à égalité l'emplacement le plus
 * bas (un ennemi pour une attaque ordinaire, un allié ou soi si un talent a redirigé le sort).
 * Sort sans choix de cible (soi, tous les alliés ou ennemis) : aucune cible, le moteur la déduit.
 * L'attaque de base d'une unité pilotée est gratuite (voir validateSetup) : l'action est toujours légale.
 */
export function defaultAction(state: BattleState): Action {
  const caster = state.active === null ? undefined : unitById(state.units, state.active);
  if (caster === undefined) throw new IllegalActionError('aucune unité active');
  const basic = caster.def.spells.find((spell) => spell.slot === 'basic');
  if (basic === undefined)
    throw new IllegalActionError(`${caster.def.id} n'a pas d'attaque de base`);
  if (basic.targeting !== 'enemy' && basic.targeting !== 'ally') {
    return { type: 'cast', unit: caster.def.id, spell: basic.id };
  }
  // Les unités sont triées par emplacement dans chaque camp : lowestHp garde le premier à égalité.
  const target = lowestHp(aliveOf(state.units, targetSide(caster, basic)));
  if (target === undefined) throw new IllegalActionError('aucune cible vivante');
  return { type: 'cast', unit: caster.def.id, spell: basic.id, target: target.def.id };
}
