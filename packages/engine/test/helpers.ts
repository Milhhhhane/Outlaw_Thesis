import { loadContent, type Balance, type Effect, type Element, type SpellSlot } from '@outlaw/data';
import { createBattle, legalActions, step } from '../src/battle';
import type {
  Action,
  BattleEvent,
  BattleSetup,
  BattleState,
  ResolvedSpell,
  ScriptStep,
  Side,
  UnitDef,
} from '../src/types';

export const balance: Balance = loadContent().balance;

const { costs, delays, teamPoints } = balance.combat;

export function spell(
  id: string,
  slot: SpellSlot,
  effects: readonly Effect[],
  options: Partial<Pick<ResolvedSpell, 'targeting' | 'element'>> = {},
): ResolvedSpell {
  return {
    id,
    slot,
    targeting: options.targeting ?? 'enemy',
    element: options.element ?? 'fire',
    cost: slot === 'basic' ? 0 : costs[slot],
    gain: slot === 'basic' ? teamPoints.basicGain : 0,
    delay: delays[slot],
    effects,
  };
}

export const hit = (power = 100): Effect => ({ kind: 'damage', target: 'primary', power });

export interface UnitOptions {
  readonly id: string;
  readonly side: Side;
  readonly slot?: number;
  readonly element?: Element;
  readonly stats?: Partial<UnitDef['stats']>;
  readonly spells?: readonly ResolvedSpell[];
  readonly script?: readonly ScriptStep[];
}

/** Unité de test : les héros sont pilotés, les ennemis suivent leur script (attaque de base par défaut). */
export function unit(options: UnitOptions): UnitDef {
  const element = options.element ?? 'fire';
  const basic = spell(`${options.id}_basic`, 'basic', [hit()], { element });
  const spells = options.spells ?? [basic];
  const scripted = options.side === 'enemy';
  return {
    id: options.id,
    kind: options.id,
    side: options.side,
    slot: options.slot ?? 0,
    element,
    role: null,
    boss: false,
    stats: { hp: 400, atk: 50, def: 20, vit: 100, ...options.stats },
    spells,
    triggers: [],
    controller: scripted ? 'script' : 'policy',
    script: scripted
      ? (options.script ?? [{ spell: spells[0]?.id ?? basic.id, target: 'first' }])
      : [],
  };
}

export type Policy = (state: BattleState) => Action;

/** Politique de test : le sort le plus cher possible, première cible proposée. */
export const greedy: Policy = (state) => {
  const actions = legalActions(state);
  const casterSpells = state.units.find((u) => u.def.id === state.active)?.def.spells ?? [];
  const cost = (action: Action): number =>
    casterSpells.find((s) => s.id === action.spell)?.cost ?? 0;
  let best = actions[0];
  for (const action of actions) if (best === undefined || cost(action) > cost(best)) best = action;
  if (best === undefined) throw new Error('aucune action possible');
  return best;
};

/** Joue un combat jusqu'au bout avec une politique ; renvoie l'état final, le journal et les actions. */
export function playout(
  setup: BattleSetup,
  policy: Policy = greedy,
): { state: BattleState; events: BattleEvent[]; actions: Action[] } {
  const created = createBattle(setup, balance);
  let state = created.state;
  const events = [...created.events];
  const actions: Action[] = [];
  while (state.result === null) {
    const action = policy(state);
    actions.push(action);
    const next = step(state, action);
    state = next.state;
    events.push(...next.events);
  }
  return { state, events, actions };
}

export function ofType<T extends BattleEvent['type']>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
