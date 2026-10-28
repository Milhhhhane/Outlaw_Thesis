import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  achievementStatus,
  claimableCount,
  claimAchievement,
  claimBonus,
  claimQuest,
  completeDungeon,
  drawQuests,
  levelUp,
  metricValue,
  newProfile,
  openChest,
  periodEnd,
  periodOf,
  questReward,
  questStatus,
  resetIn,
  rewardValue,
  rollQuests,
  sandboxProfile,
  starUp,
  summonHero,
  upgradeItem,
  type Outcome,
} from '../src';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
/** Mercredi 28 octobre 2026, 15:00 UTC. */
const NOW = Date.UTC(2026, 9, 28, 15);
const DAY = 86_400_000;

function win(profile: Profile, dungeon = 'ember_wastes', tier = 1): Profile {
  return value(completeDungeon(content, profile, dungeon, tier)).profile;
}

describe('quêtes : périodes', () => {
  it('jour UTC et semaine du lundi 00:00 UTC', () => {
    expect(periodEnd('daily', periodOf('daily', NOW))).toBe(Date.UTC(2026, 9, 29));
    expect(periodEnd('weekly', periodOf('weekly', NOW))).toBe(Date.UTC(2026, 10, 2));
    expect(resetIn('daily', NOW)).toBe(9 * 3_600_000);
    // Dimanche 23:59 et lundi 00:00 : deux semaines différentes ; lundi et mercredi : la même.
    const monday = Date.UTC(2026, 10, 2);
    expect(periodOf('weekly', monday - 1)).toBe(periodOf('weekly', NOW));
    expect(periodOf('weekly', monday)).toBe(periodOf('weekly', NOW) + 1);
  });
});

describe('quêtes : compteurs tenus par le moteur', () => {
  it('chaque action existante avance son compteur', () => {
    let p = win(newProfile(content, 7));
    p = win(p, 'ember_wastes', 2);
    p = win(p, 'ember_wastes', 3);
    expect(p.stats).toMatchObject({ wins: 3, wins_tier2: 2, wins_tier3: 1 });
    const hero = p.team[0] ?? '';
    p = value(levelUp(content, p, hero));
    expect(p.stats['levels']).toBe(1);
    const chest = Object.keys(p.chests).find((k) => (p.chests[k] ?? 0) > 0) ?? '';
    p = value(openChest(content, p, chest)).profile;
    expect(p.stats['chests']).toBe(1);
    const rich: Profile = {
      ...p,
      gold: 10_000,
      materials: [100, 100, 100],
      items: p.items.map((o) => ({ ...o, copies: 5 })),
      fragments: { [hero]: 999 },
      heroes: { ...p.heroes, [hero]: { ...p.heroes[hero]!, level: 10, xp: 0 } },
    };
    const upgraded = value(upgradeItem(content, rich, rich.items[0]?.uid ?? 0));
    expect(upgraded.stats['upgrades']).toBe(1);
    const other = content.heroes.find((h) => !rich.unlocked.includes(h.id))?.id ?? '';
    const summoned = value(summonHero(content, { ...rich, fragments: { [other]: 999 } }, other));
    expect(summoned.stats['summons']).toBe(1);
    expect(value(starUp(content, rich, hero)).stats['stars']).toBe(1);
  });
});

describe('quêtes du jour et de la semaine', () => {
  it('tirage déterministe, distinct, limité aux quêtes possibles', () => {
    const a = drawQuests(content, 'daily', 100, 42, 0);
    expect(a).toEqual(drawQuests(content, 'daily', 100, 42, 0));
    expect(new Set(a).size).toBe(content.balance.quests.daily.count);
    // Sans victoire : seules les quêtes sans condition.
    const open = content.quests.daily.filter((q) => q.minWins === 0).map((q) => q.id);
    expect(a.every((id) => open.includes(id))).toBe(true);
    // Plus tard, toute la réserve peut sortir : un autre jour ou une autre graine change le tirage.
    const later = new Set(
      Array.from({ length: 30 }, (_, d) => drawQuests(content, 'daily', d, 42, 500)).flat(),
    );
    expect(later.size).toBe(content.quests.daily.length);
  });

  it('nouvelle période : nouveau tirage, départ aux compteurs d’avant l’action', () => {
    const fresh = newProfile(content, 3);
    const p = rollQuests(content, fresh, NOW);
    expect(p.quests.daily.period).toBe(periodOf('daily', NOW));
    expect(p.quests.weekly.ids).toHaveLength(content.balance.quests.weekly.count);
    // Même jour : rien ne change (même objet).
    expect(rollQuests(content, p, NOW + 1000)).toBe(p);
    // Une victoire faite juste après minuit compte pour le nouveau jour.
    const played = win(p);
    const next = rollQuests(content, played, NOW + DAY, p);
    expect(next.quests.daily.period).toBe(periodOf('daily', NOW) + 1);
    expect(next.quests.daily.base).toEqual(p.stats);
    expect(next.quests.weekly).toBe(played.quests.weekly);
    // Mode test : pas de quêtes.
    const sandbox = sandboxProfile(content);
    expect(rollQuests(content, sandbox, NOW)).toBe(sandbox);
    expect(claimableCount(content, sandbox, NOW)).toBe(0);
  });

  it('réclamer : quête faite seulement, une fois, puis le bonus du jour', () => {
    let p = rollQuests(content, newProfile(content, 3), NOW);
    expect(claimQuest(content, p, 'daily', 'nope', NOW)).toEqual({
      ok: false,
      reason: 'unknown_quest',
    });
    const daily = p.quests.daily.ids;
    const first = daily[0] ?? '';
    expect(claimQuest(content, p, 'daily', first, NOW)).toEqual({
      ok: false,
      reason: 'quest_not_done',
    });
    // Tout est fait : les compteurs dépassent chaque objectif.
    const stats = Object.fromEntries(content.quests.daily.map((q) => [q.metric, 999]));
    p = { ...p, stats };
    expect(questStatus(content, p, 'daily').every((s) => s.done && !s.claimed)).toBe(true);
    expect(claimableCount(content, p, NOW)).toBeGreaterThanOrEqual(daily.length);
    const reward = questReward(content, p, 'daily');
    const claimed = value(claimQuest(content, p, 'daily', first, NOW));
    expect(claimed.gold).toBe(p.gold + reward.gold);
    expect(claimed.materials[reward.dust.tier - 1]).toBe(
      (p.materials[reward.dust.tier - 1] ?? 0) + reward.dust.amount,
    );
    expect(claimQuest(content, claimed, 'daily', first, NOW)).toEqual({
      ok: false,
      reason: 'already_claimed',
    });
    expect(claimBonus(content, claimed, NOW)).toEqual({ ok: false, reason: 'quest_not_done' });
    let all = claimed;
    for (const id of daily.slice(1)) all = value(claimQuest(content, all, 'daily', id, NOW));
    const bonus = value(claimBonus(content, all, NOW));
    const chest = content.balance.quests.daily.bonus.chest ?? '';
    expect(bonus.chests[chest]).toBe((all.chests[chest] ?? 0) + 1);
    expect(claimBonus(content, bonus, NOW)).toEqual({ ok: false, reason: 'already_claimed' });
    expect(claimBonus(content, sandboxProfile(content), NOW)).toEqual({
      ok: false,
      reason: 'test_mode',
    });
    expect(claimQuest(content, sandboxProfile(content), 'weekly', 'x', NOW)).toEqual({
      ok: false,
      reason: 'test_mode',
    });
    // Le lendemain, la réclamation repart de zéro.
    expect(claimQuest(content, bonus, 'daily', first, NOW + DAY).ok).toBe(false);
  });

  it('la récompense suit le donjon le plus avancé terminé', () => {
    const reward = { passagePct: 50, chest: null };
    const start = rewardValue(content, newProfile(content), reward);
    const first = content.dungeons[0]!;
    expect(start).toEqual({
      gold: first.rewards.gold / 2,
      dust: { tier: first.rewards.materials.tier, amount: first.rewards.materials.amount / 2 },
      chest: null,
    });
    const last = content.dungeons.at(-1)!;
    const late = {
      ...newProfile(content),
      dungeons: { [last.id]: { clears: 1, dry: 0, tier: 2 } },
    };
    expect(rewardValue(content, late, reward).gold).toBe(Math.round(last.rewards.gold / 2));
  });
});

describe('succès', () => {
  it('mesures lues dans le profil : une ancienne sauvegarde garde ses succès', () => {
    let p = win(newProfile(content, 5));
    p = win(p, 'ember_wastes', 2);
    p = win(p, 'ember_wastes', 3);
    expect(metricValue(content, p, 'dungeons_cleared')).toBe(1);
    expect(metricValue(content, p, 'clears_total')).toBe(3);
    expect(metricValue(content, p, 'tier3_cleared')).toBe(1);
    expect(metricValue(content, p, 'mastery_rank')).toBe(0);
    expect(metricValue(content, p, 'items_owned')).toBeGreaterThan(0);
    expect(metricValue(content, p, 'items_maxed')).toBe(0);
    expect(metricValue(content, p, 'heroes')).toBe(p.unlocked.length);
    expect(metricValue(content, p, 'stars_total')).toBe(0);
    expect(metricValue(content, p, 'hero_level')).toBe(1);
    expect(metricValue(content, p, 'wins')).toBe(3);
    // Sauvegarde d'avant les quêtes : ni compteurs ni quêtes, les valeurs par défaut s'appliquent.
    const legacy: Partial<Profile> = { ...p };
    delete legacy.stats;
    delete legacy.quests;
    const read = profileSchema.parse(JSON.parse(JSON.stringify(legacy)));
    expect(read.stats).toEqual({});
    expect(read.quests.achievements).toEqual([]);
    expect(metricValue(content, read, 'clears_total')).toBe(3);
    const done = achievementStatus(content, read).filter((s) => s.done);
    expect(done.map((s) => s.achievement.id)).toContain('ach_first_win');
  });

  it('réclamé une seule fois, avec le coffre de sa classe', () => {
    const p = win(newProfile(content, 5));
    const claimed = value(claimAchievement(content, p, 'ach_first_win'));
    const chest = content.balance.quests.achievements.small.chest ?? '';
    expect(claimed.chests[chest]).toBe((p.chests[chest] ?? 0) + 1);
    expect(claimed.gold).toBeGreaterThan(p.gold);
    expect(claimAchievement(content, claimed, 'ach_first_win')).toEqual({
      ok: false,
      reason: 'already_claimed',
    });
    expect(claimAchievement(content, p, 'ach_conqueror')).toEqual({
      ok: false,
      reason: 'quest_not_done',
    });
    expect(claimAchievement(content, p, 'nope')).toEqual({ ok: false, reason: 'unknown_quest' });
    expect(claimAchievement(content, sandboxProfile(content), 'ach_first_win')).toEqual({
      ok: false,
      reason: 'test_mode',
    });
  });
});
