import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { pickRun, simulateEconomy, summarizeEconomy } from '../src/economy';

const content = loadContent();

describe('économie : joueur modèle', () => {
  it('est déterministe et cohérent : jalons atteints, rien dépensé qui ne soit tombé', () => {
    const a = simulateEconomy(content, 3);
    const b = simulateEconomy(content, 3);
    expect(a).toEqual(b);
    const { milestones, ledger, profile } = a;
    expect(milestones.firstMaxItem).not.toBeNull();
    expect(milestones.firstStar).not.toBeNull();
    expect(milestones.teamEquipped).not.toBeNull();
    expect(milestones.teamMaxLevel).not.toBeNull();
    expect(milestones.firstStar ?? 0).toBeLessThan(milestones.teamMaxLevel ?? 0);
    expect(Object.keys(milestones.firstClears)).toHaveLength(content.dungeons.length);
    for (const tier of [0, 1, 2]) {
      const earned = (ledger.dust.earned[tier] ?? 0) + (ledger.dust.salvage[tier] ?? 0);
      const spent = (ledger.dust.levels[tier] ?? 0) + (ledger.dust.items[tier] ?? 0);
      expect(spent).toBeLessThanOrEqual(earned);
      expect(profile.materials[tier]).toBe(earned - spent);
    }
    expect(ledger.gold.items).toBeLessThanOrEqual(ledger.gold.earned);
    expect(profile.team.every((id) => profile.heroes[id]?.level === 30)).toBe(true);
  });

  it('choisit le donjon le plus avancé à la portée du plus faible héros', () => {
    const fresh = simulateEconomy(content, 1, 0).profile;
    expect(pickRun(content, fresh)).toEqual({ dungeon: 'ember_wastes', tier: 1, level: 1 });
    const later = simulateEconomy(content, 1, 25).profile;
    const pick = pickRun(content, later);
    const level = Math.min(...later.team.map((id) => later.heroes[id]?.level ?? 1));
    expect(pick.level).toBeLessThanOrEqual(level);
    expect(content.dungeonById.get(pick.dungeon)?.recommendedLevel).toBe(pick.level);
  });

  it('résume plusieurs graines', () => {
    const summary = summarizeEconomy(content, 2);
    expect(summary.seeds).toBe(2);
    expect(summary.unreached).toBe(0);
    expect(summary.milestones.teamMaxLevel).toBeGreaterThan(summary.milestones.firstStar ?? 0);
  });
});
