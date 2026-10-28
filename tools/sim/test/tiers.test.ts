import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { tierGear, tiers } from '../src/tiers';

const content = loadContent();

describe('paliers de donjon (simulation)', () => {
  it('équipement visé : rien au palier I, objets bruts au II, au maximum au dernier', () => {
    const { slots, maxUpgradeLevel } = content.balance.progression.items;
    expect(tierGear(content, 1)).toEqual({ items: 0, upgrade: 0 });
    expect(tierGear(content, 2)).toEqual({ items: slots, upgrade: 0 });
    expect(tierGear(content, content.balance.tiers.count)).toEqual({
      items: slots,
      upgrade: maxUpgradeLevel,
    });
  });

  it('une ligne par donjon et par palier, déterministe', () => {
    const a = tiers(content, 2, 1);
    const b = tiers(content, 2, 1);
    expect(a).toEqual(b);
    expect(a.rows).toHaveLength(content.dungeons.length * content.balance.tiers.count);
    expect(a.rows[0]?.scenario).toBe('tier_ember_wastes_1_expert');
    for (const rates of Object.values(a.rates)) {
      expect(rates).toHaveLength(content.balance.tiers.count);
    }
  });
});
