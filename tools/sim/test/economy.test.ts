import { loadContent } from '@outlaw/data';
import { dungeonPrerequisite, tierReached, tierTargetLevel } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import {
  essencePick,
  pickRun,
  questEffect,
  simulateEconomy,
  summarizeAwakening,
  summarizeEconomy,
} from '../src/economy';

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
    // L'or paie aussi les niveaux et les étoiles : la réserve est exactement gagné − dépensé.
    expect(ledger.gold.levels).toBeGreaterThan(0);
    expect(ledger.gold.stars).toBeGreaterThan(0);
    const { items, levels, stars } = ledger.gold;
    expect(profile.gold).toBe(ledger.gold.earned - items - levels - stars);
    expect(a.goldAt.teamMaxLevel?.reserve).toBeLessThanOrEqual(a.goldAt.teamMaxLevel?.earned ?? 0);
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

  it('chapitres parallèles : chapitre 2 joué dès son ouverture (route principale : en fin de partie)', () => {
    const second = content.dungeons.filter((d) => d.map.chapter === 2);
    expect(second.length).toBeGreaterThan(0);
    const main = simulateEconomy(content, 2, 600, null, null, 'main');
    const levelled = main.milestones.teamMaxLevel ?? Infinity;
    // Route principale : aucun donjon du chapitre 2 avant l'équipe au niveau 30, tous ensuite.
    for (const d of second)
      expect(main.milestones.firstClears[d.id] ?? 0).toBeGreaterThan(levelled);
    expect(main.milestones.collectionAll).not.toBeNull();
    expect(main.milestones.collectionAll ?? 0).toBeGreaterThan(main.milestones.collection ?? 0);
    // Route parallèle (par défaut) : chaque donjon du chapitre 2 après celui qui l'ouvre ; les
    // quatre premiers (niveaux 2 à 11) s'ouvrent avec la Citadelle de cendre et passent juste
    // après elle.
    const parallel = simulateEconomy(content, 2);
    const clears = parallel.milestones.firstClears;
    for (const d of second)
      expect(clears[d.id]).toBeGreaterThan(clears[dungeonPrerequisite(content, d.id) ?? ''] ?? 0);
    const citadel = clears.cinder_citadel ?? 0;
    for (const d of second.slice(0, 4)) {
      expect(dungeonPrerequisite(content, d.id)).toBe('cinder_citadel');
      expect(clears[d.id]).toBeLessThanOrEqual(citadel + 4);
    }
    expect(parallel.milestones.collectionAll).not.toBeNull();
  });

  it('résume plusieurs graines', () => {
    const summary = summarizeEconomy(content, 2);
    expect(summary.seeds).toBe(2);
    expect(summary.unreached).toBe(0);
    expect(summary.milestones.teamMaxLevel).toBeGreaterThan(summary.milestones.firstStar ?? 0);
  });

  // Cibles du réglage (docs/BALANCE.md, « Économie : réglage ») : un début rapide, un craft de fin
  // qui demande du grind. Une valeur de balance.json ou de dungeons.json qui sort de ces bornes
  // casse la CI : la retoucher, c'est rouvrir le réglage et le justifier par un chiffre. Toutes les
  // bornes de ce fichier et de boss.test.ts portent sur la route parallèle (par défaut : le vrai
  // joueur, qui joue chaque chapitre dès son ouverture ; docs/ECONOMY.md, « Chapitre 2 »).
  it('jalons du joueur modèle dans les bornes du réglage (20 graines)', () => {
    const { milestones: m, goldAt, ledger, unreached } = summarizeEconomy(content, 20);
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
    // 155 (140 sur la seule route du chapitre 1) : sur la route parallèle, le chapitre 2 prend plus
    // d'un quart des passages avant le niveau 30, donc les rares du chapitre 1 portés reçoivent
    // leurs copies plus tard (152,1 mesuré ; aucun réglage du butin du chapitre 2 ne passe sous
    // 140 sans casser une autre borne, voir docs/ECONOMY.md, « Chapitre 2 »).
    within(m.teamMaxed, 100, 155);
    within(m.collection, 200, 300);
    // Montée des sorts (docs/BALANCE.md) : un héros au milieu de partie, l'équipe après ses objets.
    within(m.spellsOneHero, 50, 100);
    within(m.spellsTeam, 120, 200);
    // Les doublons paient les sorts : il reste des fragments aux héros de l'équipe.
    expect(ledger.teamFragmentsLeft).toBeGreaterThan(72);
    // L'or et la poussière pure servent : au moins les trois quarts de ce qui tombe est dépensé.
    expect(ledger.gold.items).toBeGreaterThan(0.75 * ledger.gold.earned);
    // L'or est rare au milieu de partie (docs/ECONOMY.md, « L'or paie les niveaux et les
    // étoiles ») : au plus un quart de l'or gagné reste en réserve quand l'équipe est équipée et
    // quand elle atteint le niveau 30.
    for (const key of ['teamEquipped', 'teamMaxLevel'] as const) {
      const at = goldAt[key];
      expect(at).not.toBeNull();
      expect(at?.reserve ?? Infinity).toBeLessThanOrEqual(0.25 * (at?.earned ?? 0));
    }
    const pure = (ledger.dust.levels[2] ?? 0) + (ledger.dust.items[2] ?? 0);
    expect(pure).toBeGreaterThan(
      0.75 * ((ledger.dust.earned[2] ?? 0) + (ledger.dust.salvage[2] ?? 0)),
    );
  }, 60_000);

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
  }, 60_000);

  // Cible de l'éveil (docs/BALANCE.md, « Éveil ») : un héros vers le milieu de partie, l'équipe en
  // fin de progression, passages d'essence compris. Route parallèle, comme les jalons.
  it('éveil : premier héros vers le milieu de partie, équipe en fin de partie (5 graines)', () => {
    const a = summarizeAwakening(content, 5);
    expect(a.first).not.toBeNull();
    expect(a.team).not.toBeNull();
    expect(a.first ?? 0).toBeGreaterThanOrEqual(60);
    expect(a.first ?? 0).toBeLessThanOrEqual(100);
    expect(a.team ?? 0).toBeGreaterThanOrEqual(110);
    expect(a.team ?? 0).toBeLessThanOrEqual(170);
    expect(a.essenceRunsFirst ?? 0).toBeLessThanOrEqual(20);
    // L'équipe au niveau 30 avec l'éveil : borne fixée à 177 sur la route principale (160,7 passages
    // sur 20 graines avant le coût en or des niveaux, + 10 %) ; route parallèle : 172,6.
    expect(a.teamMaxLevel).not.toBeNull();
    expect(a.teamMaxLevel ?? Infinity).toBeLessThanOrEqual(177);
    // Rien à farmer tant que les donjons d'essence sont fermés.
    expect(essencePick(content, simulateEconomy(content, 1, 10).profile)).toBeNull();
  }, 60_000);
});
