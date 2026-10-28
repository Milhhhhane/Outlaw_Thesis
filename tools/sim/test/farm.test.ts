import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { farmPlan } from '../src/farm';

const content = loadContent();

describe('rythme du farm', () => {
  it('un pas par paire de donjons, poussière du bon palier, cibles tenues', () => {
    const plan = farmPlan(content);
    expect(plan).toHaveLength(content.dungeons.length - 1);
    for (const step of plan) {
      expect(step.tierOk).toBe(true);
      expect(step.runs).toBeGreaterThanOrEqual(5);
      expect(step.runs).toBeLessThanOrEqual(18);
    }
    const total = plan.reduce((sum, step) => sum + step.runs, 0);
    expect(total).toBeGreaterThan(70);
    expect(total).toBeLessThan(110);
  });
});
