import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { MAX_PER_ROLE, availableNodes, pickTeam, randomBuild } from '../src/builds';
import { createRng } from '../src/rng';
import { summarize, toCsv } from '../src/run';
import { R1_TEAMS, TEAM_SAMPLE, sampleTeams, teams } from '../src/rules';
import { randomBattles, sprint0Scenarios } from '../src/scenarios';
import { validateBuild } from '@outlaw/engine';

const content = loadContent();
const { balance } = content;

describe('simulation', () => {
  const rows = sprint0Scenarios(balance);
  const byName = new Map(rows.map((row) => [row.scenario, row]));

  it('l’avantage élémentaire décide un duel à stats égales', () => {
    expect(byName.get('duel_fire_vs_nature')?.wins).toBe(1);
    expect(byName.get('duel_fire_vs_water')?.wins).toBe(0);
    // Miroir : le héros joue en premier à égalité, il gagne.
    expect(byName.get('duel_water_vs_water')?.wins).toBe(1);
  });

  it('la limite d’actions tranche un combat sans issue', () => {
    expect(byName.get('action_limit_wall')).toMatchObject({
      wins: 0,
      avgActions: balance.combat.actionLimit,
    });
  });

  it('le CSV est stable', () => {
    expect(toCsv(sprint0Scenarios(balance))).toBe(toCsv(rows));
    expect(toCsv([summarize('x', [])])).toBe(
      'scenario,battles,wins,win_rate,avg_actions,avg_player,min_player,max_player\nx,0,0,0.0000,0.00,0.00,0,0\n',
    );
  });

  it('les combats aléatoires sont reproductibles à graine égale', () => {
    const a = toCsv(randomBattles(content, { battles: 30, seed: 3 }));
    expect(toCsv(randomBattles(content, { battles: 30, seed: 3 }))).toBe(a);
    expect(toCsv(randomBattles(content, { battles: 30, seed: 4 }))).not.toBe(a);
  });
});

describe('builds aléatoires', () => {
  it('dépensent tous les points dans des nœuds valides', () => {
    const rng = createRng(9);
    for (let i = 0; i < 100; i++) {
      const level = rng.int(1, 30);
      const hero = rng.pick(content.heroes).id;
      const build = randomBuild(content, hero, level, rng);
      expect(validateBuild(content, build)).toEqual([]);
    }
    const pyra = content.heroById.get('pyra')!;
    // Les trois pages sont ouvertes dès le niveau 1 : une racine par page.
    expect(availableNodes(pyra, 1, new Set(), content)).toEqual([
      'pyra_exe_core',
      'pyra_tempo_core',
      'pyra_embers_core',
    ]);
  });

  it('mélange sans perte', () => {
    const rng = createRng(1);
    expect(rng.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
    expect(() => rng.pick([])).toThrow();
  });
});

describe('règles d’équilibre', () => {
  it('toutes les équipes possibles : teamSize héros parmi ceux du jeu, sans doublon', () => {
    const size = content.balance.progression.teamSize;
    const n = content.heroes.length;
    // C(n, size)
    let expected = 1;
    for (let i = 0; i < size; i++) expected = (expected * (n - i)) / (i + 1);
    const all = teams(content);
    expect(all).toHaveLength(expected); // 12 650 pour 4 héros parmi 25
    expect(new Set(all.map((team) => team.join('+'))).size).toBe(expected);
    expect(all.every((team) => new Set(team).size === size)).toBe(true);
  });

  it('échantillon d’équipes : fixe, sans doublon, jouable, chaque héros présent', () => {
    const sample = sampleTeams(content, TEAM_SAMPLE, 1);
    expect(sample).toHaveLength(Math.min(TEAM_SAMPLE, teams(content).length));
    expect(sampleTeams(content, TEAM_SAMPLE, 1)).toEqual(sample);
    expect(new Set(sample.map((team) => team.join('+'))).size).toBe(sample.length);
    const size = content.balance.progression.teamSize;
    const seen = new Map<string, number>();
    for (const team of sample) {
      expect(team).toHaveLength(size);
      const roles = new Map<string, number>();
      for (const id of team) {
        const role = content.heroById.get(id)!.role;
        roles.set(role, (roles.get(role) ?? 0) + 1);
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      expect(Math.max(...roles.values())).toBeLessThanOrEqual(MAX_PER_ROLE);
    }
    // Chaque héros figure dans l'échantillon, à peu près autant que les autres.
    expect(seen.size).toBe(content.heroes.length);
    const counts = [...seen.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    // Les duels de R1 portent sur des équipes où chaque héros figure.
    const r1 = new Set(sample.slice(0, R1_TEAMS).flat());
    expect(r1.size).toBe(content.heroes.length);
  });

  it('équipe jouable : au plus deux héros du même rôle, dans l’ordre proposé', () => {
    const ids = content.heroes.filter((h) => h.role === 'support').map((h) => h.id);
    const other = content.heroes.find((h) => h.role === 'damage')!.id;
    const team = pickTeam(content, [...ids, other], 3);
    expect(team).toEqual([ids[0], ids[1], other]);
    expect(pickTeam(content, ids, 4)).toHaveLength(MAX_PER_ROLE);
  });
});
