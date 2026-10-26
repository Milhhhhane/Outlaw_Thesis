import {
  legalActions,
  step,
  type Action,
  type BattleState,
  type Side,
  type UnitState,
} from '@outlaw/engine';

export type Policy = (state: BattleState) => Action;

function casterOf(state: BattleState): UnitState {
  const caster = state.units.find((unit) => unit.def.id === state.active);
  if (caster === undefined) throw new Error('aucune unité active');
  return caster;
}

/**
 * Politique gloutonne de référence : le sort le plus coûteux abordable,
 * sur l'ennemi aux PV les plus bas (à égalité, le premier proposé). Déterministe.
 */
export const greedy: Policy = (state) => {
  const caster = casterOf(state);
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

/** Valeur d'une unité pour son camp : PV, bouclier, altérations et modifications. */
function unitValue(unit: UnitState): number {
  if (!unit.alive) return 0;
  const max = unit.def.stats.hp;
  let value = 1000 + (1000 * unit.hp) / max + (300 * Math.min(unit.shield, max)) / max;
  for (const status of unit.statuses) {
    if (status.kind === 'mark') value -= 3 * status.power;
    if (status.kind === 'burn') value -= 2 * status.power * status.turns;
    if (status.kind === 'stun') value -= 150;
  }
  for (const mod of unit.mods) value += mod.percent * Math.min(mod.turns, 3);
  return value;
}

/** Évaluation d'un état du point de vue d'un camp. */
export function evaluate(state: BattleState, side: Side): number {
  if (state.result !== null) return state.result.winner === side ? 1e7 : -1e7;
  let score = 0;
  for (const unit of state.units) {
    score += unit.def.side === side ? unitValue(unit) : -1.2 * unitValue(unit);
  }
  const other: Side = side === 'player' ? 'enemy' : 'player';
  return score + 25 * state.points[side] - 25 * state.points[other];
}

/**
 * Anticipation d'un coup : chaque action possible est jouée (le moteur est pur),
 * jusqu'à la prochaine décision, puis l'état obtenu est évalué. Déterministe.
 */
export const lookahead: Policy = (state) => {
  const side = casterOf(state).def.side;
  let best: Action | undefined;
  let bestScore = -Infinity;
  for (const action of legalActions(state)) {
    const score = evaluate(step(state, action).state, side);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  if (best === undefined) throw new Error('aucune action possible');
  return best;
};

/**
 * Joueur débutant : l'ultime dès qu'il est payable, sinon l'attaque de base, sur la première cible
 * proposée. Sert à vérifier qu'un nouveau venu peut finir les premiers donjons.
 */
export const novice: Policy = (state) => {
  const caster = casterOf(state);
  const actions = legalActions(state);
  const slot = (action: Action): string | undefined =>
    caster.def.spells.find((spell) => spell.id === action.spell)?.slot;
  const pick =
    actions.find((a) => slot(a) === 'ult') ??
    actions.find((a) => slot(a) === 'basic') ??
    actions[0];
  if (pick === undefined) throw new Error('aucune action possible');
  return pick;
};
