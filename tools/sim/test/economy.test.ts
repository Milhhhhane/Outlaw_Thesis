import { loadContent } from '@outlaw/data';
import { tierReached, tierTargetLevel } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import { pickRun, questEffect, simulateEconomy, summarizeEconomy } from '../src/economy';

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
    expect(pickRun(content, fresh)).toMatchObject({ dungeon: 'ember_wastes', tier: 1, level: 1 });
    const later = simulateEconomy(content, 1, 25).profile;
    const pick = pickRun(content, later);
    const level = Math.min(...later.team.map((id) => later.heroes[id]?.level ?? 1));
    expect(pick.level).toBeLessThanOrEqual(level);
    const dungeon = content.dungeonById.get(pick.dungeon)!;
    expect(tierTargetLevel(content, dungeon, pick.tier)).toBe(pick.level);
    expect(pick.tier).toBeLessThanOrEqual(tierReached(content, later, pick.dungeon));
    // Un donjon jamais terminé passe avant tout.
    const fresh2 = { ...later, dungeons: { ember_wastes: { clears: 2, dry: 0, tier: 3 } } };
    expect(pickRun(content, fresh2)).toMatchObject({ dungeon: 'drowned_halls', tier: 1 });
  });

  it('résume plusieurs graines', () => {
    const summary = summarizeEconomy(content, 2);
    expect(summary.seeds).toBe(2);
    expect(summary.unreached).toBe(0);
    expect(summary.milestones.teamMaxLevel).toBeGreaterThan(summary.milestones.firstStar ?? 0);
  });

  // Cibles du réglage (docs/BALANCE.md, « Économie : réglage ») : un début rapide, un craft de fin
  // qui demande du grind. Une valeur de balance.json ou de dungeons.json qui sort de ces bornes
  // casse la CI : la retoucher, c'est rouvrir le réglage et le justifier par un chiffre.
  it('jalons du joueur modèle dans les bornes du réglage (20 graines)', () => {
    const { milestones: m, ledger, unreached } = summarizeEconomy(content, 20);
    expect(unreached).toBe(0);
    const within = (value: number | null, lo: number, hi: number): void => {
      expect(value).not.toBeNull();
      expect(value ?? 0).toBeGreaterThanOrEqual(lo);
      expect(value ?? 0).toBeLessThanOrEqual(hi);
    };
    within(m.firstMaxItem, 4, 14);
    within(m.firstStar, 15, 30);
    within(m.teamEquipped, 25, 55);
    within(m.teamMaxLevel, 85, 120);
    within(m.teamMaxed, 100, 140);
    within(m.collection, 200, 300);
    // L'or et la poussière pure servent : au moins les trois quarts de ce qui tombe est dépensé.
    expect(ledger.gold.items).toBeGreaterThan(0.75 * ledger.gold.earned);
    const pure = (ledger.dust.levels[2] ?? 0) + (ledger.dust.items[2] ?? 0);
    expect(pure).toBeGreaterThan(
      0.75 * ((ledger.dust.earned[2] ?? 0) + (ledger.dust.salvage[2] ?? 0)),
    );
  });

  // Quêtes et succès (docs/BALANCE.md, « Quêtes et succès ») : une raison de revenir, pas un
  // raccourci. À 5 et 10 passages gagnants par jour, aucun jalon n'arrive plus de 15 % plus tôt.
  it('les quêtes ne raccourcissent aucun jalon de plus de 15 % (5 et 10 passages par jour)', () => {
    const base = summarizeEconomy(content, 20);
    for (const perDay of [5, 10]) {
      const withQuests = summarizeEconomy(content, 20, 600, { perDay });
      expect(withQuests.unreached).toBe(0);
      expect(withQuests.ledger.quests.claims).toBeGreaterThan(0);
      for (const shortening of Object.values(questEffect(base, withQuests))) {
        expect(shortening).not.toBeNull();
        expect(shortening ?? 0).toBeLessThanOrEqual(15);
      }
    }
  });
});
