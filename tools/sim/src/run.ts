import type { Balance } from '@outlaw/data';
import {
  createBattle,
  replay,
  step,
  type Action,
  type BattleEvent,
  type BattleResult,
  type BattleSetup,
} from '@outlaw/engine';
import type { Policy } from './policy';

export interface BattleOutcome {
  readonly result: BattleResult;
  readonly actions: number;
}

/**
 * Joue un combat jusqu'au bout. Toute erreur du moteur remonte : la simulation ne la masque pas.
 * Avec verifyReplay, le combat est rejoué à partir de ses actions et le journal doit être identique.
 */
export function runBattle(
  setup: BattleSetup,
  balance: Balance,
  policy: Policy,
  verifyReplay = false,
): BattleOutcome {
  const created = createBattle(setup, balance);
  let state = created.state;
  const events: BattleEvent[] = [...created.events];
  const actions: Action[] = [];
  while (state.result === null) {
    const action = policy(state);
    actions.push(action);
    const next = step(state, action);
    state = next.state;
    events.push(...next.events);
  }
  if (verifyReplay) {
    const replayed = replay(setup, balance, actions);
    if (JSON.stringify(replayed.events) !== JSON.stringify(events)) {
      throw new Error('journal non rejouable : le rejeu diffère de la partie');
    }
  }
  return { result: state.result, actions: state.actionCount };
}

export interface ScenarioRow {
  readonly scenario: string;
  readonly battles: number;
  readonly wins: number;
  readonly winRate: number;
  readonly avgActions: number;
}

export function summarize(scenario: string, outcomes: readonly BattleOutcome[]): ScenarioRow {
  const wins = outcomes.filter((o) => o.result.winner === 'player').length;
  const actions = outcomes.reduce((sum, o) => sum + o.actions, 0);
  const battles = outcomes.length;
  return {
    scenario,
    battles,
    wins,
    winRate: battles === 0 ? 0 : wins / battles,
    avgActions: battles === 0 ? 0 : actions / battles,
  };
}

/** CSV stable (séparateur virgule, 4 décimales, fin de ligne LF) pour comparaison exacte. */
export function toCsv(rows: readonly ScenarioRow[]): string {
  const lines = ['scenario,battles,wins,win_rate,avg_actions'];
  for (const row of rows) {
    lines.push(
      [row.scenario, row.battles, row.wins, row.winRate.toFixed(4), row.avgActions.toFixed(2)].join(
        ',',
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}
