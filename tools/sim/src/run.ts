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
  /** Actions jouées par les héros seuls (un tour d'équipe ≈ 3 actions de joueur). */
  readonly playerActions?: number;
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
  let playerActions = 0;
  while (state.result === null) {
    const action = policy(state);
    if (state.units.find((u) => u.def.id === state.active)?.def.side === 'player') playerActions++;
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
  return { result: state.result, actions: state.actionCount, playerActions };
}

export interface ScenarioRow {
  readonly scenario: string;
  readonly battles: number;
  readonly wins: number;
  readonly winRate: number;
  readonly avgActions: number;
  /** Actions de joueur : moyenne, minimum et maximum (0 si non mesuré). */
  readonly avgPlayer: number;
  readonly minPlayer: number;
  readonly maxPlayer: number;
}

export function summarize(scenario: string, outcomes: readonly BattleOutcome[]): ScenarioRow {
  const wins = outcomes.filter((o) => o.result.winner === 'player').length;
  const actions = outcomes.reduce((sum, o) => sum + o.actions, 0);
  const battles = outcomes.length;
  const player = outcomes.map((o) => o.playerActions ?? 0);
  return {
    scenario,
    battles,
    wins,
    winRate: battles === 0 ? 0 : wins / battles,
    avgActions: battles === 0 ? 0 : actions / battles,
    avgPlayer: battles === 0 ? 0 : player.reduce((a, b) => a + b, 0) / battles,
    minPlayer: battles === 0 ? 0 : Math.min(...player),
    maxPlayer: battles === 0 ? 0 : Math.max(...player),
  };
}

/** CSV stable (séparateur virgule, 4 décimales, fin de ligne LF) pour comparaison exacte. */
export function toCsv(rows: readonly ScenarioRow[]): string {
  const lines = ['scenario,battles,wins,win_rate,avg_actions,avg_player,min_player,max_player'];
  for (const row of rows) {
    lines.push(
      [
        row.scenario,
        row.battles,
        row.wins,
        row.winRate.toFixed(4),
        row.avgActions.toFixed(2),
        row.avgPlayer.toFixed(2),
        row.minPlayer,
        row.maxPlayer,
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
