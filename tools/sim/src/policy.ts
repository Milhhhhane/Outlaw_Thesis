import { legalActions, type Action, type BattleState } from '@outlaw/engine';

export type Policy = (state: BattleState) => Action;

/**
 * Politique gloutonne de référence : le sort le plus coûteux abordable,
 * sur l'ennemi aux PV les plus bas (à égalité, le premier proposé). Déterministe.
 */
export const greedy: Policy = (state) => {
  const caster = state.units.find((unit) => unit.def.id === state.active);
  if (caster === undefined) throw new Error('aucune unité active');
  const cost = (action: Action): number =>
    caster.def.spells.find((spell) => spell.id === action.spell)?.cost ?? 0;
  const hp = (action: Action): number =>
    state.units.find((unit) => unit.def.id === action.target)?.hp ?? 0;

  let best: Action | undefined;
  for (const action of legalActions(state)) {
    if (
      best === undefined ||
      cost(action) > cost(best) ||
      (cost(action) === cost(best) && hp(action) < hp(best))
    ) {
      best = action;
    }
  }
  if (best === undefined) throw new Error(`aucune action possible pour ${caster.def.id}`);
  return best;
};
