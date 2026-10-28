import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { lootRates } from '../src/loot';
import {
  completeDungeon,
  enterDungeon,
  newProfile,
  sandboxProfile,
  type Outcome,
} from '../src/progression';
import {
  tierCleared,
  tierCount,
  tierFrontier,
  tierLevel,
  tierNumeral,
  tierOpen,
  tierRareWeight,
  tierReached,
  tierRewardFactor,
  tierTargetLevel,
} from '../src/tiers';

const content = loadContent();
const { tiers } = content.balance;
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
const ember = content.dungeonById.get('ember_wastes')!;
const throne = content.dungeonById.get('hollow_throne')!;

describe('paliers : formule', () => {
  it('niveau des ennemis, niveau visé, récompenses, rare et coffre suivent balance.tiers', () => {
    expect(tierCount(content)).toBe(tiers.count);
    expect(tierLevel(content, ember, 1)).toBe(ember.recommendedLevel);
    expect(tierLevel(content, ember, 3)).toBe(ember.recommendedLevel + 2 * tiers.levelsPerTier);
    expect(tierTargetLevel(content, throne, 3)).toBe(content.balance.progression.maxLevel);
    expect(tierTargetLevel(content, ember, 2)).toBe(ember.recommendedLevel + tiers.levelsPerTier);
    expect(tierRewardFactor(content, 1, 'gold')).toBe(1);
    expect(tierRewardFactor(content, 3, 'gold')).toBeCloseTo(
      1 + (2 * tiers.rewardPctPerTier.gold) / 100,
    );
    expect(tierRareWeight(content, 1)).toBe(0);
    expect(tierRareWeight(content, 2)).toBe(tiers.rareWeightPerTier);
    expect(tierNumeral(2)).toBe('II');
    expect(tierNumeral(42)).toBe('42');
    // Le rare pèse plus lourd à chaque palier.
    const rare = (tier: number): number => lootRates(content, ember, 0, tier)[1]?.pct ?? 0;
    expect(rare(2)).toBeGreaterThan(rare(1));
    expect(rare(3)).toBeGreaterThan(rare(2));
  });
});

describe('paliers : progression', () => {
  it('palier I par défaut ; terminer un palier ouvre le suivant, jusqu’au dernier', () => {
    let profile = newProfile(content, 5);
    expect(tierReached(content, profile, 'ember_wastes')).toBe(1);
    expect(tierOpen(content, profile, 'ember_wastes', 1)).toBe(true);
    expect(tierOpen(content, profile, 'ember_wastes', 2)).toBe(false);
    expect(tierOpen(content, profile, 'ember_wastes', 0)).toBe(false);
    expect(tierOpen(content, profile, 'ember_wastes', 1.5)).toBe(false);
    expect(reason(enterDungeon(content, profile, 'ember_wastes', 0, 2))).toBe('tier_locked');
    expect(reason(completeDungeon(content, profile, 'ember_wastes', 2))).toBe('tier_locked');

    const first = value(completeDungeon(content, profile, 'ember_wastes'));
    profile = first.profile;
    expect(first.report).toMatchObject({ tier: 1, tierUnlocked: 2, firstClear: true });
    expect(tierReached(content, profile, 'ember_wastes')).toBe(2);
    expect(tierCleared(profile, 'ember_wastes', 1)).toBe(true);
    expect(tierCleared(profile, 'ember_wastes', 2)).toBe(false);
    expect(reason(enterDungeon(content, profile, 'ember_wastes', 0, 2))).toBe('ok');
    expect(reason(enterDungeon(content, profile, 'ember_wastes', 0, 3))).toBe('tier_locked');
    // Rejouer le palier I n'ouvre rien de plus et n'est plus un premier passage.
    const again = value(completeDungeon(content, profile, 'ember_wastes', 1));
    expect(again.report).toMatchObject({ tier: 1, tierUnlocked: null, firstClear: false });
    expect(tierReached(content, again.profile, 'ember_wastes')).toBe(2);

    // Le palier II : premier passage (rare et coffre garantis), ouvre le III.
    const second = value(completeDungeon(content, profile, 'ember_wastes', 2));
    expect(second.report).toMatchObject({ tier: 2, tierUnlocked: 3, firstClear: true });
    expect(second.report.chest).not.toBeNull();
    expect(second.report.item.guaranteed).toBe(true);
    profile = second.profile;
    expect(profile.dungeons.ember_wastes?.tier).toBe(3);
    const third = value(completeDungeon(content, profile, 'ember_wastes', 3));
    expect(third.report).toMatchObject({ tier: 3, tierUnlocked: null, firstClear: true });
    profile = third.profile;
    // Tous les paliers terminés : le palier atteint reste le dernier, plus aucun premier passage.
    expect(profile.dungeons.ember_wastes?.tier).toBe(tiers.count + 1);
    expect(tierReached(content, profile, 'ember_wastes')).toBe(tiers.count);
    expect(value(completeDungeon(content, profile, 'ember_wastes', 3)).report.firstClear).toBe(
      false,
    );
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('récompenses du palier : or et poussière multipliés, XP selon la formule', () => {
    const base = value(completeDungeon(content, newProfile(content, 5), 'ember_wastes')).profile;
    const one = value(completeDungeon(content, base, 'ember_wastes', 1)).report;
    const two = value(completeDungeon(content, base, 'ember_wastes', 2)).report;
    const gold = tierRewardFactor(content, 2, 'gold');
    const materials = tierRewardFactor(content, 2, 'materials');
    const xp = tierRewardFactor(content, 2, 'xp');
    expect(two.gold).toBe(Math.round(ember.rewards.gold * gold));
    expect(two.materials.amount).toBe(Math.round(ember.rewards.materials.amount * materials));
    expect(two.xp.pyra?.gained).toBe(Math.round(ember.rewards.xp * xp));
    expect(one.gold).toBe(ember.rewards.gold);
    expect(one.materials.amount).toBe(ember.rewards.materials.amount);
  });

  it('ancienne sauvegarde : un donjon terminé compte comme palier I terminé', () => {
    const legacy = {
      ...newProfile(content, 1),
      dungeons: { ember_wastes: { clears: 3 } },
    };
    const read = profileSchema.parse(legacy);
    expect(read.dungeons.ember_wastes).toEqual({ clears: 3, dry: 0, tier: 1 });
    expect(tierFrontier(read.dungeons.ember_wastes)).toBe(2);
    expect(tierFrontier(undefined)).toBe(1);
    expect(tierReached(content, read, 'ember_wastes')).toBe(2);
    expect(tierReached(content, read, 'drowned_halls')).toBe(1);
    // Le palier II est un premier passage ; le palier I ne l'est plus.
    expect(value(completeDungeon(content, read, 'ember_wastes', 2)).report.firstClear).toBe(true);
    expect(value(completeDungeon(content, read, 'ember_wastes', 1)).report.firstClear).toBe(false);
  });

  it('mode test : tous les paliers sont ouverts', () => {
    const sandbox: Profile = sandboxProfile(content);
    expect(tierOpen(content, sandbox, 'hollow_throne', tiers.count)).toBe(true);
    expect(tierOpen(content, sandbox, 'hollow_throne', tiers.count + 1)).toBe(false);
  });
});
