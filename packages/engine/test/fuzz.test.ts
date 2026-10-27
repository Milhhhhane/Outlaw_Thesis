/**
 * Combats tirés au hasard (graine fixe) avec le vrai contenu : invariants vérifiés après chaque pas,
 * puis rejeu complet. Le hasard est ici dans le test, jamais dans le moteur.
 */
import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { createBattle, legalActions, replay, step } from '../src/battle';
import { compileEncounter, compileTeam, talentPoints, type HeroBuild } from '../src/compile';
import type { Action, BattleEvent, BattleState } from '../src/types';

const content = loadContent();
const { balance } = content;

function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

function checkInvariants(state: BattleState): void {
  const { cap } = balance.combat.teamPoints;
  for (const side of ['player', 'enemy'] as const) {
    expect(state.points[side]).toBeGreaterThanOrEqual(0);
    expect(state.points[side]).toBeLessThanOrEqual(cap);
  }
  for (const unit of state.units) {
    expect(unit.hp).toBeGreaterThanOrEqual(0);
    expect(unit.hp).toBeLessThanOrEqual(unit.def.stats.hp);
    expect(unit.alive).toBe(unit.hp > 0);
    expect(unit.shield).toBeLessThanOrEqual(
      Math.round((unit.def.stats.hp * balance.combat.shieldCapPctMaxHp) / 100),
    );
    if (unit.alive) expect(unit.nextTime).toBeGreaterThanOrEqual(state.clock);
    expect(new Set(unit.statuses.map((s) => s.kind)).size).toBe(unit.statuses.length);
  }
  expect(state.actionCount).toBeLessThanOrEqual(balance.combat.actionLimit);
}

/** Build tiré dans l'ordre des pages : prend le premier nœud valide jusqu'à épuisement des points. */
function someBuild(hero: string, level: number, pick: (n: number) => number): HeroBuild {
  const def = content.heroById.get(hero)!;
  const taken: string[] = [];
  const nodes = def.pages.slice(0, level >= 20 ? 3 : level >= 10 ? 2 : 1).flatMap((p) => p.nodes);
  for (let guard = 0; guard < 50 && taken.length < talentPoints(level, balance); guard++) {
    const groups = new Set(nodes.filter((n) => taken.includes(n.id)).map((n) => n.group));
    const options = nodes.filter(
      (n) =>
        !taken.includes(n.id) &&
        (n.requires === undefined || taken.includes(n.requires)) &&
        (n.group === undefined || !groups.has(n.group)),
    );
    if (options.length === 0) break;
    taken.push(options[pick(options.length)]!.id);
  }
  return { hero, level, talents: taken, items: [] };
}

describe('combats aléatoires', () => {
  it('200 combats : invariants tenus et journal rejouable', () => {
    const pick = lcg(42);
    const enemies = content.enemies.map((e) => e.id);
    for (let i = 0; i < 200; i++) {
      const level = 1 + pick(30);
      const builds = ['pyra', 'maree', 'ronce'].map((h) => someBuild(h, level, pick));
      const foes = Array.from({ length: 1 + pick(3) }, () => enemies[pick(enemies.length)]!);
      const setup = {
        units: [
          ...compileTeam(content, builds),
          ...compileEncounter(content, foes, level + pick(10)),
        ],
      };
      const created = createBattle(setup, balance);
      let state = created.state;
      const events: BattleEvent[] = [...created.events];
      const actions: Action[] = [];
      while (state.result === null) {
        const options = legalActions(state);
        const action = options[pick(options.length)]!;
        actions.push(action);
        const next = step(state, action);
        state = next.state;
        events.push(...next.events);
        checkInvariants(state);
      }
      expect(events.at(-1)?.type).toBe('battle_end');
      expect(replay(setup, balance, actions).events).toEqual(events);
    }
  }, 30_000); // 200 combats : plus de 5 s sur une machine chargée.
});
