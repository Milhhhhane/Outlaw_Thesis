import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { availableNodes, randomBuild } from '../src/builds';
import { createRng } from '../src/rng';
import { summarize, toCsv } from '../src/run';
import { teams } from '../src/rules';
import { randomBattles, sprint0Scenarios } from '../src/scenarios';
import { validateBuild } from '@outlaw/engine';

const content = loadContent();
const { balance } = content;

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

  it('le CSV est stable', () => {
    expect(toCsv(sprint0Scenarios(balance))).toBe(toCsv(rows));
    expect(toCsv([summarize('x', [])])).toBe(
      'scenario,battles,wins,win_rate,avg_actions,avg_player,min_player,max_player\nx,0,0,0.0000,0.00,0.00,0,0\n',
    );
  });

  it('les combats aléatoires sont reproductibles à graine égale', () => {
    const a = toCsv(randomBattles(content, { battles: 30, seed: 3 }));
    expect(toCsv(randomBattles(content, { battles: 30, seed: 3 }))).toBe(a);
    expect(toCsv(randomBattles(content, { battles: 30, seed: 4 }))).not.toBe(a);
  });
});

describe('builds aléatoires', () => {
  it('dépensent tous les points dans des nœuds valides', () => {
    const rng = createRng(9);
    for (let i = 0; i < 100; i++) {
      const level = rng.int(1, 30);
      const hero = rng.pick(content.heroes).id;
      const build = randomBuild(content, hero, level, rng);
      expect(validateBuild(content, build)).toEqual([]);
    }
    const pyra = content.heroById.get('pyra')!;
    expect(availableNodes(pyra, 1, new Set(), content)).toEqual(['pyra_exe_core']);
  });

  it('mélange sans perte', () => {
    const rng = createRng(1);
    expect(rng.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
    expect(() => rng.pick([])).toThrow();
  });
});

describe('règles d’équilibre', () => {
  it('les 20 équipes possibles : 3 héros parmi 6, sans doublon', () => {
    const all = teams(content);
    expect(all).toHaveLength(20);
    expect(new Set(all.map((team) => team.join('+'))).size).toBe(20);
    expect(all.every((team) => new Set(team).size === 3)).toBe(true);
  });
});
