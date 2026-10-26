import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { summarize, toCsv } from '../src/run';
import { sprint0Scenarios } from '../src/scenarios';

const balance = loadContent().balance;

describe('simulation', () => {
  const rows = sprint0Scenarios(balance);
  const byName = new Map(rows.map((row) => [row.scenario, row]));

  it('l’avantage élémentaire décide un duel à stats égales', () => {
    expect(byName.get('duel_fire_vs_nature')?.wins).toBe(1);
    expect(byName.get('duel_fire_vs_water')?.wins).toBe(0);
    // Miroir : le héros joue en premier à égalité, il gagne.
    expect(byName.get('duel_water_vs_water')?.wins).toBe(1);
  });

  it('la limite d’actions tranche un combat sans issue', () => {
    expect(byName.get('action_limit_wall')).toMatchObject({
      wins: 0,
      avgActions: balance.combat.actionLimit,
    });
  });

  it('le CSV est stable et deux exécutions sont identiques', () => {
    expect(toCsv(sprint0Scenarios(balance))).toBe(toCsv(rows));
    expect(toCsv([summarize('x', [])])).toBe(
      'scenario,battles,wins,win_rate,avg_actions\nx,0,0,0.0000,0.00\n',
    );
  });
});
