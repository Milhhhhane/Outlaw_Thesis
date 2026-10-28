import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { towerSim } from '../src/tower';

const content = loadContent();

describe('tour à étages (simulation)', () => {
  it('une ligne par étage, déterministe, et les règles signalent un étage ingagnable', () => {
    const a = towerSim(content, 1, 1);
    expect(a).toEqual(towerSim(content, 1, 1));
    expect(a.rows).toHaveLength(content.balance.tower.floors);
    expect(a.rows[0]?.scenario).toBe('tower_1_expert');
    expect(a.rates).toHaveLength(content.balance.tower.floors);
    // Des ennemis dix fois plus forts : chaque étage tombe sous le seuil de l'expert.
    const hard = {
      ...content,
      balance: { ...content.balance, enemyScale: { hp: 10, atk: 10 } },
    };
    const report = towerSim(hard, 1, 1);
    expect(report.problems.some((p) => p.startsWith('étage 1 :'))).toBe(true);
  });
});
