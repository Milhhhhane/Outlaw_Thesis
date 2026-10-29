import { loadContent, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  achievementStatus,
  claimAchievement,
  claimBonus,
  claimQuest,
  completeBoss,
  completeDungeon,
  completeEssence,
  completeTower,
  newProfile,
  openChest,
  rollQuests,
  setTeam,
  type Outcome,
} from '../src';

// Seuls les héros de l'équipe qui a combattu gagnent de l'XP, quel que soit le mode de jeu.
const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
/** Un lundi, 00:00 UTC. */
const MONDAY = Date.UTC(2026, 10, 2);
/** Deux héros en équipe, deux autres débloqués au repos ; tous les donjons terminés. */
const TEAM = ['pyra', 'maree'];
const RESTING = ['ronce', 'cendre'];
const veteran = (): Profile => ({
  ...value(setTeam(content, newProfile(content, 5), TEAM)),
  dungeons: Object.fromEntries(content.dungeons.map((d) => [d.id, { clears: 1, dry: 0, tier: 2 }])),
});
/** XP et niveau de chaque héros du profil. */
const progress = (p: Profile): Record<string, { xp: number; level: number }> =>
  Object.fromEntries(Object.entries(p.heroes).map(([id, h]) => [id, { xp: h.xp, level: h.level }]));

describe('XP : seuls les combattants en gagnent', () => {
  it('donjon : l’équipe gagne, les héros au repos ne gagnent rien et ne sont pas au bilan', () => {
    const start = value(setTeam(content, newProfile(content, 3), TEAM));
    expect(RESTING.every((id) => start.unlocked.includes(id))).toBe(true);
    for (const tier of [1, 2, 3]) {
      const before = { ...veteran(), dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 3 } } };
      const { profile, report } = value(completeDungeon(content, before, 'ember_wastes', tier));
      expect(Object.keys(report.xp).sort()).toEqual([...TEAM].sort());
      for (const id of TEAM) {
        expect(report.xp[id]?.gained).toBeGreaterThan(0);
        const gained = report.xp[id]?.gained ?? 0;
        expect(profile.heroes[id]?.xp).toBe((before.heroes[id]?.xp ?? 0) + gained);
      }
      for (const id of RESTING) expect(profile.heroes[id]).toEqual(before.heroes[id]);
    }
    // Premier passage aussi.
    const first = value(completeDungeon(content, start, 'ember_wastes'));
    expect(Object.keys(first.report.xp).sort()).toEqual([...TEAM].sort());
    for (const id of RESTING) expect(first.profile.heroes[id]).toEqual(start.heroes[id]);
  });

  it('aucune autre source ne donne d’XP : tour, boss, essences, quêtes, succès, coffres', () => {
    const p = veteran();
    const same = (after: Profile): void => {
      expect(progress(after)).toEqual(progress(p));
    };
    same(value(completeTower(content, p, 1)).profile);
    const top = content.balance.boss.difficulties[0]!.thresholds.at(-1)!;
    same(value(completeBoss(content, p, 1, top, MONDAY)).profile);
    const essence = content.essenceDungeons[0]!;
    same(value(completeEssence(content, p, essence.id, 1)).profile);
    // Quêtes du jour, bonus et succès : tout est fait.
    let q = rollQuests(content, p, MONDAY);
    const metrics = [...content.quests.daily, ...content.quests.achievements].map((x) => x.metric);
    q = { ...q, stats: Object.fromEntries(metrics.map((m) => [m, 999])) };
    for (const id of q.quests.daily.ids) q = value(claimQuest(content, q, 'daily', id, MONDAY));
    q = value(claimBonus(content, q, MONDAY));
    const done = achievementStatus(content, q).find((s) => s.done && !s.claimed);
    expect(done).toBeDefined();
    q = value(claimAchievement(content, q, done?.achievement.id ?? ''));
    same(q);
    const chests = { ...p, chests: { gold: 1 } };
    same(value(openChest(content, chests, 'gold')).profile);
  });
});
