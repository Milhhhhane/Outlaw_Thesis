import {
  createBattle,
  step,
  type Action,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type StepResult,
} from '@outlaw/engine';
import { useCallback, useEffect, useReducer } from 'react';
import { content } from './session';
import { logLine } from './log';
import { applyEvent, eventDuration, viewFromState, type BattleView } from './view';

export interface LogEntry {
  readonly key: number;
  readonly text: string;
}

export interface Model {
  readonly setup: BattleSetup;
  /** État du moteur : la vérité. */
  readonly state: BattleState;
  /** Ce qui est affiché : rattrape l'état en rejouant les événements en attente. */
  readonly view: BattleView;
  readonly queue: readonly BattleEvent[];
  readonly log: readonly LogEntry[];
  readonly counter: number;
  /** Temps d'affichage (ms) du dernier événement montré, à attendre avant le suivant. */
  readonly hold: number;
}

type Msg =
  | { readonly type: 'reset'; readonly setup: BattleSetup }
  | { readonly type: 'act'; readonly action: Action }
  | { readonly type: 'advance' }
  | { readonly type: 'flush' };

const LOG_SIZE = 80;

function withResult(model: Model, result: StepResult): Model {
  return {
    ...model,
    state: result.state,
    queue: [...model.queue, ...result.events],
    hold: model.queue.length > 0 ? model.hold : 0,
  };
}

/** Joue les événements en attente jusqu'au premier qui demande du temps d'affichage (inclus). */
function advance(model: Model, all: boolean): Model {
  let { view, counter, log } = model;
  const queue = [...model.queue];
  const lines: LogEntry[] = [];
  let hold = 0;
  for (let event = queue.shift(); event !== undefined; event = queue.shift()) {
    counter += 1;
    view = applyEvent(view, event, counter);
    const text = logLine(event, model.state.units);
    if (text !== null) lines.push({ key: counter, text });
    hold = eventDuration(event);
    if (!all && hold > 0) break;
  }
  if (lines.length > 0) log = [...log, ...lines].slice(-LOG_SIZE);
  if (queue.length === 0) {
    // Fin du rejeu : on se recale exactement sur l'état du moteur.
    view = { ...viewFromState(model.state), flashes: view.flashes, cast: view.cast };
  }
  return { ...model, view, queue, counter, log, hold };
}

export function init(setup: BattleSetup): Model {
  const result = createBattle(setup, content.balance);
  const current = viewFromState(result.state);
  const start = content.balance.combat.teamPoints.start;
  // La vue de départ précède tout événement : PV pleins, aucun effet ; le journal fait le reste.
  const view: BattleView = {
    ...current,
    units: current.units.map((u) => ({
      ...u,
      hp: u.maxHp,
      shield: 0,
      alive: true,
      statuses: [],
      mods: {},
    })),
    points: { player: start, enemy: start },
  };
  return withResult(
    { setup, state: result.state, view, queue: [], log: [], counter: 0, hold: 0 },
    result,
  );
}

export function reducer(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'reset':
      return init(msg.setup);
    case 'act':
      if (model.queue.length > 0 || model.state.active === null) return model;
      return withResult(model, step(model.state, msg.action));
    case 'advance':
      return advance(model, false);
    case 'flush':
      return advance(model, true);
  }
}

/** Combat interactif : l'état du moteur, sa vue animée et les commandes. `pace` : 1 normal, 0,5 à ×2. */
export function useBattle(setup: BattleSetup, pace = 1) {
  const [model, dispatch] = useReducer(reducer, setup, init);

  useEffect(() => {
    const next = model.queue[0];
    if (next === undefined) return;
    // On laisse au dernier événement montré le temps de s'afficher avant de jouer le suivant.
    const delay = model.hold * pace;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'advance' });
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [model.queue, model.counter, model.hold, pace]);

  const act = useCallback((action: Action) => {
    dispatch({ type: 'act', action });
  }, []);
  const skip = useCallback(() => {
    dispatch({ type: 'flush' });
  }, []);
  const reset = useCallback(() => {
    dispatch({ type: 'reset', setup });
  }, [setup]);

  return { model, busy: model.queue.length > 0, act, skip, reset };
}
