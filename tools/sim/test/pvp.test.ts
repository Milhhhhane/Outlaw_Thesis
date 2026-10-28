import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { DURATION_TARGET, evaluatePvp, formatReport, proposals, type PvpReport } from '../src/pvp';

const content = loadContent();
const small = { samples: 1, mirrorSamples: 2, seed: 1, level: 30 };

/** Combinaisons de k parmi n. */
function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

describe('mesure du PVP', () => {
  const report = evaluatePvp(content, small);

  it('compte les combats attendus', () => {
    const heroes = content.heroes.length;
    const size = content.balance.progression.teamSize;
    // Compositions de `teamSize` héros parmi ceux du jeu : 15 pour quatre parmi six.
    const compositions = choose(heroes, size);
    expect(size).toBe(4);
    // Deux builds par composition en miroir.
    expect(report.mirror.battles).toBe(compositions * 2);
    // Toutes les paires ordonnées, un jeu de builds.
    expect(report.cross.battles).toBe(compositions * (compositions - 1));
    // Un héros est dans `withHero` compositions : avec chacune des autres, il n'est que d'un côté, deux sens.
    const withHero = choose(heroes - 1, size - 1);
    for (const row of report.heroes) {
      expect(row.battles).toBe(2 * withHero * (compositions - withHero));
      expect(row.mirrorBattles).toBe(withHero * 2);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('mesure des durées et des taux cohérents', () => {
    expect(report.mirror.firstPlayerRate).toBeGreaterThan(0);
    expect(report.mirror.firstPlayerRate).toBeLessThan(1);
    expect(report.mirror.minActions).toBeLessThanOrEqual(report.mirror.avgActions);
    expect(report.mirror.maxActions).toBeLessThanOrEqual(content.balance.combat.actionLimit);
    expect(report.avgActions).toBeGreaterThan(0);
    expect(report.cross.limitRate).toBeGreaterThanOrEqual(0);
    expect(report.cross.limitRate).toBeLessThanOrEqual(1);
  });

  it('est reproductible à graine égale', () => {
    expect(evaluatePvp(content, small)).toEqual(report);
    expect(evaluatePvp(content, { ...small, seed: 2 })).not.toEqual(report);
    // Deux mesures de 15 × 2 miroirs et 15 × 14 croisés à quatre héros : plusieurs secondes sur une machine chargée.
  }, 60_000);

  it('imprime un rapport qui précise que rien n’est appliqué', () => {
    const text = formatReport(report);
    expect(text).toContain('premier joueur');
    expect(text).toContain('par joueur');
    for (const row of report.heroes) expect(text).toContain(row.hero);
    const out = proposals(report);
    if (out.length > 0) expect(text).toContain('rien n’est appliqué');
    else expect(text).toContain('dans la cible');
  });
});

describe('propositions', () => {
  const inTarget: PvpReport = {
    options: small,
    mirror: {
      battles: 100,
      firstPlayerRate: 0.51,
      draws: 0,
      avgActions: 45,
      minActions: 20,
      maxActions: 90,
      limitRate: 0.1,
    },
    cross: { battles: 100, avgActions: 45, limitRate: 0.1 },
    heroes: [
      { hero: 'a', battles: 10, winRate: 0.55, mirrorBattles: 10, firstPlayerRate: 0.5 },
      { hero: 'b', battles: 10, winRate: 0.45, mirrorBattles: 10, firstPlayerRate: 0.5 },
    ],
    avgActions: 45,
  };

  it('ne propose rien quand tout est dans la cible', () => {
    expect(proposals(inTarget)).toEqual([]);
  });

  it('propose pour chaque mesure hors cible, dans le bon sens', () => {
    const first = proposals({
      ...inTarget,
      mirror: { ...inTarget.mirror, firstPlayerRate: 0.58 },
    });
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('le premier est avantagé');

    const second = proposals({
      ...inTarget,
      mirror: { ...inTarget.mirror, firstPlayerRate: 0.42 },
    });
    expect(second[0]).toContain('le second est avantagé');

    const slow = proposals({ ...inTarget, avgActions: DURATION_TARGET.max + 1 });
    expect(slow[0]).toContain('plus de dégâts');
    const fast = proposals({ ...inTarget, avgActions: DURATION_TARGET.min - 1 });
    expect(fast[0]).toContain('moins de dégâts');

    const heroes = proposals({
      ...inTarget,
      heroes: [
        { hero: 'fort', battles: 10, winRate: 0.7, mirrorBattles: 10, firstPlayerRate: 0.5 },
        { hero: 'faible', battles: 10, winRate: 0.3, mirrorBattles: 10, firstPlayerRate: 0.5 },
      ],
    });
    expect(heroes).toHaveLength(2);
    expect(heroes[0]).toContain('fort');
    expect(heroes[1]).toContain('faible');
  });
});
