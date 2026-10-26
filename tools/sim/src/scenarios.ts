import { ELEMENTS, type Balance, type Content, type Element } from '@outlaw/data';
import {
  compileEncounter,
  compileTeam,
  type BattleSetup,
  type ResolvedSpell,
  type Side,
  type UnitDef,
} from '@outlaw/engine';
import { randomBuild } from './builds';
import { greedy, lookahead } from './policy';
import { createRng } from './rng';
import { runBattle, summarize, type BattleOutcome, type ScenarioRow } from './run';

/**
 * Sprint 0 : scénarios synthétiques (le contenu des héros arrive au sprint 1).
 * Ils vérifient la mécanique de base : triangle des éléments, file, réserve, limite d'actions.
 */
function basic(id: string, element: Element, balance: Balance): ResolvedSpell {
  return {
    id,
    slot: 'basic',
    targeting: 'enemy',
    element,
    cost: 0,
    gain: balance.combat.teamPoints.basicGain,
    delay: balance.combat.delays.basic,
    effects: [{ kind: 'damage', target: 'primary', power: 100 }],
  };
}

function fighter(
  id: string,
  side: Side,
  slot: number,
  element: Element,
  balance: Balance,
  stats: UnitDef['stats'] = { hp: 400, atk: 50, def: 20, vit: 100 },
): UnitDef {
  const spell = basic(`${id}_basic`, element, balance);
  return {
    id,
    kind: id,
    side,
    slot,
    element,
    role: null,
    boss: false,
    stats,
    spells: [spell],
    triggers: [],
    controller: side === 'player' ? 'policy' : 'script',
    script: side === 'enemy' ? [{ spell: spell.id, target: 'lowest_hp' }] : [],
  };
}

export function sprint0Scenarios(balance: Balance): ScenarioRow[] {
  const rows: ScenarioRow[] = [];

  // Duel à stats égales pour chaque paire d'éléments : l'avantage doit décider.
  for (const mine of ELEMENTS) {
    for (const theirs of ELEMENTS) {
      const setup: BattleSetup = {
        units: [
          fighter('hero', 'player', 0, mine, balance),
          fighter('foe', 'enemy', 0, theirs, balance),
        ],
      };
      rows.push(summarize(`duel_${mine}_vs_${theirs}`, [runBattle(setup, balance, greedy)]));
    }
  }

  // Trois contre trois, éléments mélangés, VIT variées.
  const trio: BattleSetup = {
    units: [
      fighter('h0', 'player', 0, 'fire', balance, { hp: 380, atk: 55, def: 18, vit: 105 }),
      fighter('h1', 'player', 1, 'water', balance, { hp: 450, atk: 42, def: 25, vit: 95 }),
      fighter('h2', 'player', 2, 'nature', balance, { hp: 400, atk: 48, def: 20, vit: 100 }),
      fighter('e0', 'enemy', 0, 'nature', balance, { hp: 420, atk: 46, def: 20, vit: 98 }),
      fighter('e1', 'enemy', 1, 'fire', balance, { hp: 400, atk: 50, def: 18, vit: 102 }),
      fighter('e2', 'enemy', 2, 'water', balance, { hp: 440, atk: 44, def: 24, vit: 96 }),
    ],
  };
  rows.push(summarize('trio_mixed', [runBattle(trio, balance, greedy)]));

  // Mur : personne ne peut tomber, la limite d'actions doit trancher (défaite).
  const wall: BattleSetup = {
    units: [
      fighter('h', 'player', 0, 'fire', balance, { hp: 9999, atk: 1, def: 999, vit: 100 }),
      fighter('w', 'enemy', 0, 'fire', balance, { hp: 9999, atk: 1, def: 999, vit: 100 }),
    ],
  };
  rows.push(summarize('action_limit_wall', [runBattle(wall, balance, greedy)]));

  return rows;
}

export interface RandomRunOptions {
  readonly battles: number;
  readonly seed: number;
}

/**
 * Sprint 1 : combats aléatoires mais reproductibles — niveau, ordre de l'équipe, talents
 * et rencontre tirés avec une graine fixe. Chaque combat est rejoué pour vérifier le journal.
 */
export function randomBattles(content: Content, options: RandomRunOptions): ScenarioRow[] {
  const rng = createRng(options.seed);
  const heroes = content.heroes.map((hero) => hero.id);
  const enemies = content.enemies.filter((enemy) => !enemy.boss).map((enemy) => enemy.id);
  const byBand = new Map<string, BattleOutcome[]>();
  const bySize = new Map<string, BattleOutcome[]>();
  const push = (map: Map<string, BattleOutcome[]>, key: string, outcome: BattleOutcome): void => {
    map.set(key, [...(map.get(key) ?? []), outcome]);
  };

  for (let i = 0; i < options.battles; i++) {
    const level = rng.int(1, content.balance.progression.maxLevel);
    const order = rng.shuffle(heroes).slice(0, 3);
    const builds = order.map((hero) => randomBuild(content, hero, level, rng));
    const size = rng.int(1, 3);
    const foes = Array.from({ length: size }, () => rng.pick(enemies));
    const setup: BattleSetup = {
      units: [...compileTeam(content, builds), ...compileEncounter(content, foes, level)],
    };
    const outcome = runBattle(setup, content.balance, lookahead, true);
    const band = Math.min(2, Math.floor((level - 1) / 10));
    push(
      byBand,
      `random_level_${String(band * 10 + 1).padStart(2, '0')}_${band * 10 + 10}`,
      outcome,
    );
    push(bySize, `random_${size}_enemies`, outcome);
  }
  const rows = (map: Map<string, BattleOutcome[]>): ScenarioRow[] =>
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => summarize(key, list));
  return [...rows(byBand), ...rows(bySize)];
}
