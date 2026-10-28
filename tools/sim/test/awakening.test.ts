import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { awakenAll, awakeningGap, essenceSim } from '../src/awakening';

const content = loadContent();

describe('éveil (simulation)', () => {
  it('donjons d’essence : une ligne par palier, et la règle signale un palier ingagnable', () => {
    const a = essenceSim(content, 1, 1);
    expect(a).toEqual(essenceSim(content, 1, 1));
    expect(a.rows).toHaveLength(content.essenceDungeons.length * content.balance.tiers.count);
    const hard = { ...content, balance: { ...content.balance, enemyScale: { hp: 10, atk: 10 } } };
    expect(essenceSim(hard, 1, 1).problems.length).toBeGreaterThan(0);
  });

  it('écart d’un héros éveillé : une mesure par héros, la règle signale un dépassement', () => {
    const strict = {
      ...content,
      balance: {
        ...content.balance,
        targets: {
          ...content.balance.targets,
          awakening: { ...content.balance.targets.awakening, maxGapPoints: -1 },
        },
      },
    };
    const report = awakeningGap(strict, 1, 1);
    expect(report.gaps).toHaveLength(content.heroes.length);
    expect(report.problems).toHaveLength(1);
    expect(awakenAll([{ hero: 'pyra', level: 1, talents: [], items: [] }])[0]?.awakened).toBe(true);
  });
});
