import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { bossSim, quantile, reach } from '../src/boss';
import { questEffect, summarizeEconomy } from '../src/economy';

const content = loadContent();

describe('boss de la semaine (simulation)', () => {
  // Règles `targets.boss` (docs/BALANCE.md, « Boss de la semaine ») : le premier palier de la
  // première difficulté est à la portée du joueur moyen ; le dernier palier de la dernière
  // difficulté demande de l'équipement (atteint équipé au maximum, presque jamais sans objets).
  it('paliers placés : règles tenues, mesure déterministe', () => {
    const report = bossSim(content, 16, 1);
    expect(report.problems).toEqual([]);
    const avg = report.samples.find((s) => s.difficulty === 1 && s.who === 'average')!;
    expect(reach(avg, Number.POSITIVE_INFINITY)).toBe(0);
    expect(quantile([], 0.5)).toBe(0);
    // Le boss ne tombe pas : c'est le temps qui finit le combat.
    expect(report.samples.every((s) => s.kills === 0)).toBe(true);
    // Un dernier palier hors d'atteinte est signalé.
    const d = content.balance.boss.difficulties;
    const hard = {
      ...content,
      balance: {
        ...content.balance,
        boss: {
          ...content.balance.boss,
          difficulties: d.map((x) => ({ ...x, thresholds: x.thresholds.map((t) => t * 100) })),
        },
      },
    };
    expect(bossSim(hard, 1, 1).problems.length).toBeGreaterThan(0);
  });

  // Économie (docs/ECONOMY.md) : même en payant tous les paliers de toutes les difficultés
  // ouvertes chaque semaine (borne haute), aucun jalon n'arrive plus de 10 % plus tôt.
  it('le boss ne raccourcit aucun jalon de plus de 10 % (5 et 10 passages par jour)', () => {
    const base = summarizeEconomy(content, 20);
    for (const perDay of [5, 10]) {
      const withBoss = summarizeEconomy(content, 20, 600, { perDay, noQuests: true, boss: true });
      expect(withBoss.unreached).toBe(0);
      expect(withBoss.ledger.boss.claims).toBeGreaterThan(0);
      expect(withBoss.ledger.quests.claims).toBe(0);
      for (const shortening of Object.values(questEffect(base, withBoss)))
        expect(shortening ?? 0).toBeLessThanOrEqual(10);
    }
  });
});
