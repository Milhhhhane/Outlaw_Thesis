import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { withSpellLevel } from '../src/builds';
import { spellGap } from '../src/skillups';

const content = loadContent();

describe('montée des sorts', () => {
  it('tous les sorts au maximum : écart borné par targets.spellLevelsMaxGapPoints', () => {
    // Échantillon réduit (12 équipes, un build) ; la mesure complète est
    // `pnpm --filter @outlaw/sim skillups` (docs/BALANCE.md).
    const gap = spellGap(content, 1, 12, 1);
    expect(gap.late.max).toBeGreaterThan(gap.late.base);
    expect(gap.late.gap).toBeLessThanOrEqual(content.balance.targets.spellLevelsMaxGapPoints);
    expect(gap.ok).toBe(true);
  }, 120_000);

  it('un build au niveau 1 reste identique (la référence ne bouge pas)', () => {
    const build = { hero: 'pyra', level: 5, talents: [], items: [] };
    expect(withSpellLevel(build, 1)).toBe(build);
    expect(withSpellLevel(build, 5).spells).toEqual({ basic: 5, a: 5, b: 5, ult: 5 });
  });
});
