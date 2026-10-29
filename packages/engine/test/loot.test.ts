import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  completeDungeon,
  copiesToMax,
  dissolveCopies,
  itemTier,
  lootRates,
  masteryNext,
  masteryRank,
  mergeItems,
  newProfile,
  nextRandom,
  salvageOf,
  upgradeCost,
  upgradeItem,
  type Outcome,
} from '../src';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const { loot: rules } = content.balance.economy;

/** Profil qui possède déjà un exemplaire de chaque objet donné. */
function owning(
  entries: readonly { item: string; upgrade?: number; copies?: number }[],
  base: Profile = newProfile(content, 5),
): Profile {
  const items = entries.map((e, i) => ({
    uid: i + 1,
    item: e.item,
    upgrade: e.upgrade ?? 0,
    copies: e.copies ?? 0,
  }));
  return { ...base, items, nextUid: items.length + 1 };
}

describe('butin exclusif', () => {
  it('chaque objet vient d’un seul donjon, chaque donjon a un commun et un rare', () => {
    const seen = new Map<string, string>();
    for (const dungeon of content.dungeons) {
      const rarities = dungeon.loot.map((id) => content.itemById.get(id)?.rarity);
      expect(rarities).toContain('common');
      expect(rarities).toContain('rare');
      for (const id of dungeon.loot) {
        expect(seen.get(id)).toBeUndefined();
        seen.set(id, dungeon.id);
        expect(content.itemOrigin.get(id)).toBe(dungeon.id);
      }
    }
    expect([...seen.keys()].sort()).toEqual(content.items.map((i) => i.id).sort());
  });

  it('le palier de poussière d’un objet est celui de son donjon', () => {
    expect(itemTier(content, 'ember_charm')).toBe(1);
    expect(itemTier(content, 'storm_sigil')).toBe(2);
    expect(itemTier(content, 'throne_relic')).toBe(3);
    expect(itemTier(content, 'inconnu')).toBe(1);
  });
});

describe('maîtrise', () => {
  it('un rang par palier de victoires, prochain palier annoncé', () => {
    const [a = 0, b = 0] = rules.mastery.clears;
    expect(masteryRank(content, 0)).toBe(0);
    expect(masteryRank(content, a - 1)).toBe(0);
    expect(masteryRank(content, a)).toBe(1);
    expect(masteryRank(content, b)).toBe(2);
    expect(masteryRank(content, 10_000)).toBe(rules.mastery.clears.length);
    expect(masteryNext(content, 0)).toBe(a);
    expect(masteryNext(content, a)).toBe(b);
    expect(masteryNext(content, 10_000)).toBeNull();
  });

  it('les taux affichés suivent la rareté puis le rang', () => {
    const dungeon = content.dungeonById.get('ember_wastes')!;
    const { common, rare } = rules.weights;
    const base = lootRates(content, dungeon);
    expect(base.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
    expect(base[0]).toEqual({ item: 'ember_charm', pct: (common * 100) / (common + rare) });
    const boosted = rules.mastery.rareWeightPerRank * 2;
    const rank2 = lootRates(content, dungeon, 2);
    expect(rank2[1]?.pct).toBeCloseTo(((rare + boosted) * 100) / (common + rare + boosted));
    expect(rank2[1]?.pct).toBeGreaterThan(base[1]?.pct ?? 0);
  });

  it('plus de poussière au rang élevé, rang annoncé au passage', () => {
    const start = newProfile(content, 3);
    const rewards = content.dungeonById.get('hollow_throne')!.rewards.materials;
    const plain = value(completeDungeon(content, start, 'hollow_throne'));
    expect(plain.report.materials.amount).toBe(rewards.amount);
    expect(plain.report.mastery).toEqual({
      rank: 0,
      rankUp: false,
      clears: 1,
      next: rules.mastery.clears[0],
    });
    const max = rules.mastery.clears.at(-1) ?? 0;
    const veteran = {
      ...start,
      dungeons: { hollow_throne: { clears: max, dry: 0, tier: 1 } },
    };
    const run = value(completeDungeon(content, veteran, 'hollow_throne'));
    const factor = 1 + (rules.mastery.clears.length * rules.mastery.materialsPctPerRank) / 100;
    expect(run.report.materials.amount).toBe(Math.round(rewards.amount * factor));
    expect(run.report.mastery.next).toBeNull();
    const edge = {
      ...start,
      dungeons: { ember_wastes: { clears: (rules.mastery.clears[0] ?? 1) - 1, dry: 0, tier: 1 } },
    };
    const up = value(completeDungeon(content, edge, 'ember_wastes'));
    expect(up.report.mastery).toMatchObject({ rank: 1, rankUp: true });
  });
});

describe('butin d’un passage', () => {
  it('même profil, même butin ; le premier passage donne le rare du donjon', () => {
    const profile = newProfile(content, 99);
    const first = value(completeDungeon(content, profile, 'ember_wastes'));
    expect(first.report.item).toEqual(
      value(completeDungeon(content, profile, 'ember_wastes')).report.item,
    );
    expect(first.report.item).toMatchObject({
      item: 'eternal_ember',
      guaranteed: true,
      isNew: true,
      copies: 0,
      salvaged: null,
    });
    expect(first.profile.items).toEqual([{ uid: 1, item: 'eternal_ember', upgrade: 0, copies: 0 }]);
    expect(profileSchema.parse(first.profile)).toEqual(first.profile);
    expect(completeDungeon(content, profile, 'nowhere')).toEqual({
      ok: false,
      reason: 'unknown_dungeon',
    });
  });

  it('seuls les objets du donjon tombent ; un objet déjà possédé devient une copie', () => {
    const dungeon = content.dungeonById.get('drowned_halls')!;
    let current = newProfile(content, 11);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const before = current;
      const { profile, report } = value(completeDungeon(content, current, dungeon.id));
      expect(dungeon.loot).toContain(report.item.item);
      seen.add(report.item.item);
      const entries = profile.items.filter((o) => o.item === report.item.item);
      expect(entries).toHaveLength(1);
      if (report.item.isNew) {
        expect(profile.items).toHaveLength(before.items.length + 1);
      } else {
        expect(profile.items).toHaveLength(before.items.length);
        expect(entries[0]?.copies).toBe(report.item.copies);
        expect(report.item.copies).toBeGreaterThan(0);
      }
      current = profile;
    }
    expect(seen.size).toBe(dungeon.loot.length);
  });

  it('garantie du rare par donjon : compteur propre à chaque donjon', () => {
    let current = newProfile(content, 42);
    current = value(completeDungeon(content, current, 'ember_wastes')).profile;
    let dry = 0;
    for (let i = 0; i < 80; i++) {
      const { profile, report } = value(completeDungeon(content, current, 'ember_wastes'));
      const rare = content.itemById.get(report.item.item)?.rarity === 'rare';
      if (dry + 1 >= rules.rarePity) expect(rare).toBe(true);
      if (report.item.guaranteed) expect(dry + 1).toBe(rules.rarePity);
      dry = rare ? 0 : dry + 1;
      expect(profile.dungeons.ember_wastes?.dry).toBe(dry);
      // Un autre donjon ne bouge pas ce compteur.
      expect(profile.dungeons.drowned_halls).toBeUndefined();
      current = profile;
    }
  });

  it('objet déjà au niveau maximum : la copie est dissoute en poussière', () => {
    const max = content.balance.progression.items.maxUpgradeLevel;
    const profile = owning([
      { item: 'ember_charm', upgrade: max },
      { item: 'eternal_ember', upgrade: max },
    ]);
    for (let seed = 1; seed <= 5; seed++) {
      const { profile: next, report } = value(
        completeDungeon(content, { ...profile, seed }, 'ember_wastes'),
      );
      const gain = salvageOf(content, report.item.item);
      expect(report.item.salvaged).toEqual(gain);
      expect(report.item.isNew).toBe(false);
      expect(next.items).toEqual(profile.items);
      const extra = report.materials.tier === gain.tier ? report.materials.amount : 0;
      expect(next.materials[gain.tier - 1]).toBe(
        (profile.materials[gain.tier - 1] ?? 0) + gain.amount + extra,
      );
    }
  });

  it('générateur à graine', () => {
    const a = nextRandom(5);
    expect(nextRandom(5)).toEqual(a);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });
});

describe('amélioration par copies', () => {
  const rich = (profile: Profile): Profile => ({
    ...profile,
    gold: 10_000,
    materials: [100, 100, 100],
  });

  it('coût : copies, or, poussière du palier d’origine, null au maximum', () => {
    const [first] = content.balance.progression.items.upgradeCosts;
    expect(upgradeCost(content, 'ember_charm', 0)).toEqual({
      copies: first?.copies,
      gold: first?.gold,
      materials: { tier: 1, amount: first?.materials },
    });
    expect(upgradeCost(content, 'throne_relic', 0)?.materials.tier).toBe(3);
    expect(
      upgradeCost(content, 'ember_charm', content.balance.progression.items.maxUpgradeLevel),
    ).toBeNull();
  });

  it('refuse sans copies, sans or, sans poussière, puis consomme tout', () => {
    const cost = upgradeCost(content, 'ember_charm', 0)!;
    const bare = owning([{ item: 'ember_charm', copies: cost.copies - 1 }]);
    expect(upgradeItem(content, rich(bare), 1)).toEqual({ ok: false, reason: 'not_enough_copies' });
    const stocked = owning([{ item: 'ember_charm', copies: cost.copies + 1 }]);
    expect(upgradeItem(content, stocked, 1)).toEqual({ ok: false, reason: 'not_enough_gold' });
    expect(upgradeItem(content, { ...stocked, gold: cost.gold }, 1)).toEqual({
      ok: false,
      reason: 'not_enough_materials',
    });
    const funded = {
      ...stocked,
      gold: cost.gold + 7,
      materials: [cost.materials.amount + 2, 0, 0] as Profile['materials'],
    };
    const upgraded = value(upgradeItem(content, funded, 1));
    expect(upgraded.gold).toBe(7);
    expect(upgraded.materials).toEqual([2, 0, 0]);
    expect(upgraded.items[0]).toEqual({ uid: 1, item: 'ember_charm', upgrade: 1, copies: 1 });
    expect(upgradeItem(content, rich(stocked), 42)).toEqual({ ok: false, reason: 'unknown_item' });
  });

  it('plus d’amélioration au niveau maximum ; copies nécessaires jusqu’au bout', () => {
    const max = content.balance.progression.items.maxUpgradeLevel;
    const maxed = owning([{ item: 'ember_charm', upgrade: max, copies: 9 }]);
    expect(upgradeItem(content, rich(maxed), 1)).toEqual({ ok: false, reason: 'max_upgrade' });
    const total = (item: string): number =>
      Array.from({ length: max }, (_, level) => upgradeCost(content, item, level)!.copies).reduce(
        (s, c) => s + c,
        0,
      );
    expect(copiesToMax(content, { uid: 1, item: 'ember_charm', upgrade: 0, copies: 0 })).toBe(
      total('ember_charm'),
    );
    expect(copiesToMax(content, maxed.items[0]!)).toBe(0);
  });

  it('le coût grimpe avec le palier de poussière de l’objet (tierCostPct)', () => {
    const { upgradeCosts, tierCostPct } = content.balance.progression.items;
    const last = upgradeCosts.length - 1;
    for (const [item, tier] of [
      ['ember_charm', 1],
      ['thorn_ring', 2],
      ['throne_relic', 3],
    ] as const) {
      const cost = upgradeCost(content, item, last)!;
      const step = upgradeCosts[last]!;
      expect(cost.materials.tier).toBe(tier);
      expect(cost.copies).toBe(
        Math.max(1, Math.round((step.copies * tierCostPct.copies[tier - 1]!) / 100)),
      );
      expect(cost.gold).toBe(Math.round((step.gold * tierCostPct.gold[tier - 1]!) / 100));
      expect(cost.materials.amount).toBe(
        Math.round((step.materials * tierCostPct.materials[tier - 1]!) / 100),
      );
    }
    // Un objet du début demande moins de copies qu'un objet de fin de jeu.
    const full = (item: string): number =>
      copiesToMax(content, { uid: 1, item, upgrade: 0, copies: 0 });
    expect(full('ember_charm')).toBeLessThan(full('thorn_ring'));
    expect(full('thorn_ring')).toBeLessThan(full('throne_relic'));
  });

  it('dissoudre des copies donne de la poussière du palier de l’objet', () => {
    const profile = owning([{ item: 'storm_sigil', copies: 3 }]);
    const gain = salvageOf(content, 'storm_sigil');
    expect(gain.tier).toBe(2);
    const one = value(dissolveCopies(content, profile, 1));
    expect(one.items[0]?.copies).toBe(2);
    expect(one.materials[1]).toBe(gain.amount);
    const two = value(dissolveCopies(content, profile, 1, 3));
    expect(two.items[0]?.copies).toBe(0);
    expect(two.materials[1]).toBe(gain.amount * 3);
    expect(dissolveCopies(content, profile, 1, 4)).toEqual({
      ok: false,
      reason: 'not_enough_copies',
    });
    expect(dissolveCopies(content, profile, 1, 0)).toEqual({
      ok: false,
      reason: 'not_enough_copies',
    });
    expect(dissolveCopies(content, profile, 9)).toEqual({ ok: false, reason: 'unknown_item' });
  });
});

describe('anciennes sauvegardes', () => {
  it('objets sans copies et donjons sans compteur : valeurs par défaut', () => {
    const legacy = {
      ...newProfile(content, 1),
      items: [{ uid: 1, item: 'ember_charm', upgrade: 1 }],
      dungeons: { ember_wastes: { clears: 2 } },
    };
    const read = profileSchema.parse(legacy);
    expect(read.items[0]).toEqual({ uid: 1, item: 'ember_charm', upgrade: 1, copies: 0 });
    expect(read.dungeons.ember_wastes).toEqual({ clears: 2, dry: 0, tier: 1 });
  });

  it('les exemplaires en trop deviennent des copies, sans rien retirer aux héros', () => {
    const base = owning([
      { item: 'ember_charm', upgrade: 0 },
      { item: 'ember_charm', upgrade: 2, copies: 1 },
      { item: 'ember_charm', upgrade: 1 },
      { item: 'iron_band', upgrade: 1 },
    ]);
    const merged = mergeItems(base);
    expect(merged.items).toEqual([
      { uid: 2, item: 'ember_charm', upgrade: 2, copies: 3 },
      { uid: 4, item: 'iron_band', upgrade: 1, copies: 0 },
    ]);
    expect(mergeItems(merged)).toBe(merged);
    expect(profileSchema.parse(merged)).toEqual(merged);

    // Un exemplaire porté n'est jamais retiré, même en double.
    const worn = {
      ...base,
      heroes: {
        ...base.heroes,
        pyra: { ...base.heroes.pyra!, items: [1, null] },
        maree: { ...base.heroes.maree!, items: [3, null] },
      },
    };
    const kept = mergeItems(worn);
    expect(kept.items.map((i) => i.uid)).toEqual([1, 2, 3, 4]);
    expect(kept.items.find((i) => i.uid === 2)?.copies).toBe(1);
  });
});
