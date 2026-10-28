/**
 * Mode PvP côté moteur : camp prioritaire, limite d'actions au ratio de PV, action par défaut,
 * empreinte d'état. Tout est optionnel : sans règles, le combat se comporte comme avant.
 */
import { loadContent, type Balance } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { createBattle, legalActions, replay, step, validateSetup } from '../src/battle';
import { compileTeam, talentPoints, unlockedPages, type HeroBuild } from '../src/compile';
import { defaultAction } from '../src/fallback';
import { canonicalState, cyrb53, hashState } from '../src/hash';
import { compareTurnOrder, nextActor, projectQueue } from '../src/queue';
import { DEFAULT_RULES, rulesOf } from '../src/rules';
import { IllegalActionError, InvalidSetupError } from '../src/errors';
import type {
  Action,
  BattleEvent,
  BattleRules,
  BattleSetup,
  BattleState,
  Side,
  UnitDef,
  UnitState,
} from '../src/types';
import { balance, hit, spell, unit } from './helpers';

const content = loadContent();

const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

/** Unité de test pilotée des deux côtés (le PvP n'a pas d'ennemi scripté). */
function piloted(
  id: string,
  side: Side,
  slot: number,
  stats: Partial<UnitDef['stats']> = {},
): UnitDef {
  return { ...unit({ id, side, slot, stats }), controller: 'policy', script: [] };
}

function withLimit(actionLimit: number): Balance {
  return { ...balance, combat: { ...balance.combat, actionLimit } };
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

/** Build de PvP : premiers nœuds valides jusqu'à épuisement des points, plus deux objets. */
function buildFor(hero: string, level: number): HeroBuild {
  const def = content.heroById.get(hero)!;
  const taken: string[] = [];
  const pages = unlockedPages(level, balance);
  const nodes = def.pages.slice(0, pages).flatMap((page) => page.nodes);
  for (let guard = 0; guard < 50 && taken.length < talentPoints(level, balance); guard++) {
    const groups = new Set(nodes.filter((n) => taken.includes(n.id)).map((n) => n.group));
    const next = nodes.find(
      (n) =>
        !taken.includes(n.id) &&
        (n.requires === undefined || taken.includes(n.requires)) &&
        (n.group === undefined || !groups.has(n.group)),
    );
    if (next === undefined) break;
    taken.push(next.id);
  }
  const items = content.items.slice(0, 2).map((item) => ({ id: item.id, upgrade: 3 }));
  return { hero, level, talents: taken, items };
}

/** Équipe de héros pilotés, aux identifiants indépendants du camp (« a_pyra »). */
function team(prefix: string, heroes: readonly string[], side: Side, level = 30): UnitDef[] {
  return compileTeam(
    content,
    heroes.map((hero) => buildFor(hero, level)),
    side,
  ).map((def) => ({ ...def, id: `${prefix}_${def.kind}` }));
}

/** Assied une équipe de l'autre côté : mêmes unités, mêmes identifiants, autre camp. */
const seat = (defs: readonly UnitDef[], side: Side): UnitDef[] =>
  defs.map((def) => ({ ...def, side }));

/** Les mêmes événements vus depuis l'autre camp : « side » et « winner » échangés. */
function swapSides(events: readonly BattleEvent[]): unknown {
  return JSON.parse(JSON.stringify(events), (key, value: unknown) =>
    (key === 'side' || key === 'winner') && (value === 'player' || value === 'enemy')
      ? other(value)
      : value,
  );
}

function unitOf(state: BattleState, id: string): UnitState {
  const found = state.units.find((u) => u.def.id === id);
  if (found === undefined) throw new Error(`unité absente : ${id}`);
  return found;
}

describe('règles par défaut', () => {
  it('sans règles, l’état garde sa forme d’avant et rulesOf donne les valeurs par défaut', () => {
    const setup: BattleSetup = {
      units: [piloted('a', 'player', 0), unit({ id: 'e', side: 'enemy' })],
    };
    const { state } = createBattle(setup, balance);
    expect('rules' in state).toBe(false);
    expect(rulesOf(state)).toEqual({ firstSide: 'player', limit: 'enemy_wins' });
    expect(rulesOf(setup)).toBe(DEFAULT_RULES);
    const withRules = createBattle(
      { ...setup, rules: { firstSide: 'enemy', limit: 'hp_ratio' } },
      balance,
    );
    expect(withRules.state.rules).toEqual({ firstSide: 'enemy', limit: 'hp_ratio' });
    // Le pas suivant garde les règles.
    const action = legalActions(withRules.state)[0]!;
    expect(step(withRules.state, action).state.rules).toEqual({
      firstSide: 'enemy',
      limit: 'hp_ratio',
    });
  });

  it('refuse des règles inconnues', () => {
    const units = [piloted('a', 'player', 0), piloted('b', 'enemy', 0)];
    const bad = [
      { firstSide: 'nobody', limit: 'hp_ratio' },
      { firstSide: 'player', limit: 'never' },
    ] as unknown as BattleRules[];
    for (const rules of bad) {
      expect(() => {
        validateSetup({ units, rules });
      }).toThrow(InvalidSetupError);
    }
  });

  it('en PvE (sans règles), la limite d’actions reste une défaite des héros', () => {
    const setup: BattleSetup = {
      units: [
        { ...piloted('a', 'player', 0, { hp: 100_000 }), id: 'a' },
        unit({ id: 'e', side: 'enemy', stats: { hp: 100_000 } }),
      ],
    };
    let { state } = createBattle(setup, withLimit(6));
    while (state.result === null) state = step(state, defaultAction(state)).state;
    expect(state.result).toEqual({ winner: 'enemy', reason: 'action_limit' });
  });
});

describe('camp prioritaire', () => {
  const a = piloted('a', 'player', 0);
  const b = piloted('b', 'enemy', 0);

  it('départage à égalité d’instant : le camp prioritaire d’abord, puis l’emplacement', () => {
    const timed = (def: UnitDef, nextTime = 100) => ({ def, nextTime });
    expect(compareTurnOrder(timed(a), timed(b))).toBeLessThan(0);
    expect(compareTurnOrder(timed(a), timed(b), 'player')).toBeLessThan(0);
    expect(compareTurnOrder(timed(a), timed(b), 'enemy')).toBeGreaterThan(0);
    // Même camp : l'emplacement ; instants différents : l'instant, quel que soit le camp.
    expect(compareTurnOrder(timed(a), timed({ ...a, slot: 1 }), 'enemy')).toBeLessThan(0);
    expect(compareTurnOrder(timed(a, 200), timed(b, 100), 'player')).toBeGreaterThan(0);
  });

  it('nextActor, projectQueue et le premier tour suivent le camp prioritaire', () => {
    for (const firstSide of ['player', 'enemy'] as const) {
      const { state } = createBattle(
        { units: [a, b], rules: { firstSide, limit: 'hp_ratio' } },
        balance,
      );
      expect(state.units.map((u) => u.def.side)[0]).toBe(firstSide);
      expect(state.active).toBe(firstSide === 'player' ? 'a' : 'b');
      expect(nextActor(state.units, firstSide)?.def.side).toBe(firstSide);
      const queue = projectQueue(state);
      expect(queue[0]?.unit).toBe(firstSide === 'player' ? 'a' : 'b');
      // Les temps sont les mêmes ; seul l'ordre à égalité change.
      expect(queue.slice(0, 2).map((e) => e.time)).toEqual([queue[0]?.time, queue[0]?.time]);
      expect(queue.map((e) => e.unit).slice(0, 4)).toEqual(
        firstSide === 'player' ? ['a', 'b', 'a', 'b'] : ['b', 'a', 'b', 'a'],
      );
    }
  });

  it('la file projetée annonce les tours réellement joués avec firstSide « enemy »', () => {
    const setup: BattleSetup = {
      units: [
        piloted('a0', 'player', 0, { vit: 100, hp: 9000, atk: 1 }),
        piloted('a1', 'player', 1, { vit: 120, hp: 9000, atk: 1 }),
        piloted('b0', 'enemy', 0, { vit: 100, hp: 9000, atk: 1 }),
        piloted('b1', 'enemy', 1, { vit: 80, hp: 9000, atk: 1 }),
      ],
      rules: { firstSide: 'enemy', limit: 'hp_ratio' },
    };
    let { state, events } = createBattle(setup, balance);
    const projected = projectQueue(state);
    const turns = events.filter((e) => e.type === 'turn_start');
    while (turns.length < projected.length) {
      const basic = legalActions(state).find((act) => act.spell.endsWith('_basic'))!;
      const next = step(state, basic);
      state = next.state;
      events = next.events;
      turns.push(...events.filter((e) => e.type === 'turn_start'));
    }
    expect(turns.slice(0, projected.length).map((t) => ({ unit: t.unit, time: t.time }))).toEqual(
      projected,
    );
  });
});

describe('symétrie des camps', () => {
  /**
   * Deux équipes, deux sièges : A en « player » (priorité aux joueurs) puis A en « enemy » (priorité
   * aux ennemis). Mêmes identifiants, mêmes actions : le journal de la seconde partie doit être celui
   * de la première vu depuis l'autre camp, à chaque pas.
   */
  function mirrorGame(
    first: UnitDef[],
    second: UnitDef[],
    limit: BattleRules['limit'],
    bal: Balance,
    seed: number,
  ): { actions: number; ended: BattleState } {
    const direct: BattleSetup = {
      units: [...seat(first, 'player'), ...seat(second, 'enemy')],
      rules: { firstSide: 'player', limit },
    };
    const mirror: BattleSetup = {
      units: [...seat(first, 'enemy'), ...seat(second, 'player')],
      rules: { firstSide: 'enemy', limit },
    };
    const pick = lcg(seed);
    const a = createBattle(direct, bal);
    const b = createBattle(mirror, bal);
    expect(b.events).toEqual(swapSides(a.events));
    let [sa, sb] = [a.state, b.state];
    let actions = 0;
    while (sa.result === null) {
      expect(sb.active).toBe(sa.active);
      const options = legalActions(sa);
      expect(legalActions(sb)).toEqual(options);
      // Une fois sur quatre, l'action par défaut ; sinon une action au hasard (graine fixe).
      const action: Action = pick(4) === 0 ? defaultAction(sa) : options[pick(options.length)]!;
      const [na, nb] = [step(sa, action), step(sb, action)];
      expect(nb.events).toEqual(swapSides(na.events));
      [sa, sb] = [na.state, nb.state];
      actions++;
    }
    expect(sb.result).toEqual({
      winner: sa.result.winner === null ? null : other(sa.result.winner),
      reason: sa.result.reason,
    });
    expect(sb.points).toEqual({ player: sa.points.enemy, enemy: sa.points.player });
    for (const u of sa.units) {
      const m = unitOf(sb, u.def.id);
      expect([m.hp, m.alive, m.nextTime, m.shield, m.statuses, m.mods, m.triggers]).toEqual([
        u.hp,
        u.alive,
        u.nextTime,
        u.shield,
        u.statuses,
        u.mods,
        u.triggers,
      ]);
    }
    return { actions, ended: sa };
  }

  // Équipes de `teamSize` (4) héros, comme en salon.
  const squads = [
    ['pyra', 'maree', 'ronce', 'cendre'],
    ['cendre', 'ressac', 'seve', 'pyra'],
    ['pyra', 'ressac', 'seve', 'maree'],
    ['maree', 'ronce', 'cendre', 'seve'],
  ];
  it('les équipes ont la taille du jeu', () => {
    for (const heroes of squads) expect(heroes).toHaveLength(balance.progression.teamSize);
  });

  it('même équipe contre elle-même, côtés échangés : résultats miroir', () => {
    for (const heroes of squads) {
      for (const seed of [1, 2, 3]) {
        mirrorGame(
          team('a', heroes, 'player'),
          team('b', heroes, 'enemy'),
          'hp_ratio',
          balance,
          seed,
        );
      }
    }
  }, 30_000);

  it('équipes différentes : résultats miroir aussi, y compris à la limite d’actions', () => {
    const short = withLimit(30);
    let limits = 0;
    for (let i = 0; i < squads.length; i++) {
      const [x, y] = [squads[i]!, squads[(i + 1) % squads.length]!];
      for (const seed of [11, 12, 13]) {
        const { ended } = mirrorGame(
          team('a', x, 'player'),
          team('b', y, 'enemy'),
          'hp_ratio',
          short,
          seed,
        );
        if (ended.result?.reason === 'action_limit') limits++;
      }
    }
    // La limite courte force des fins à la limite : le cas à départager par le ratio est bien joué.
    expect(limits).toBeGreaterThan(0);
  }, 30_000);

  it('le camp prioritaire change bien le déroulement', () => {
    const units = [...team('a', squads[0]!, 'player'), ...team('b', squads[0]!, 'enemy')];
    const first = createBattle(
      { units, rules: { firstSide: 'player', limit: 'hp_ratio' } },
      balance,
    );
    const second = createBattle(
      { units, rules: { firstSide: 'enemy', limit: 'hp_ratio' } },
      balance,
    );
    expect(first.state.active?.startsWith('a_')).toBe(true);
    expect(second.state.active?.startsWith('b_')).toBe(true);
  });
});

describe('limite d’actions au ratio de PV', () => {
  const duel = (firstSide: Side, hpA = 1000, hpB = 1000): BattleSetup => ({
    units: [
      piloted('a', 'player', 0, { hp: hpA, atk: 1, def: 0 }),
      piloted('b', 'enemy', 0, { hp: hpB, atk: 1, def: 0 }),
    ],
    rules: { firstSide, limit: 'hp_ratio' },
  });

  function playToEnd(setup: BattleSetup, bal: Balance): BattleState {
    let { state } = createBattle(setup, bal);
    while (state.result === null) state = step(state, defaultAction(state)).state;
    return state;
  }

  it('nombre pair d’actions : chacun a reçu autant de coups, égalité sans vainqueur', () => {
    const state = playToEnd(duel('player'), withLimit(10));
    expect(state.result).toEqual({ winner: null, reason: 'action_limit' });
    expect(state.units.map((u) => u.hp)).toEqual([995, 995]);
  });

  it('nombre impair : le camp qui a joué en premier a frappé une fois de plus et gagne', () => {
    expect(playToEnd(duel('player'), withLimit(11)).result).toEqual({
      winner: 'player',
      reason: 'action_limit',
    });
    expect(playToEnd(duel('enemy'), withLimit(11)).result).toEqual({
      winner: 'enemy',
      reason: 'action_limit',
    });
  });

  it('les PV max différents comptent : le ratio, pas les PV bruts', () => {
    // 5 coups chacun : 995/1000 (0,995) contre 1995/2000 (0,9975) alors que la différence brute est 1000.
    const state = playToEnd(duel('player', 1000, 2000), withLimit(10));
    expect(state.result).toEqual({ winner: 'enemy', reason: 'action_limit' });
  });

  it('compare des fractions exactes (produits en croix), unités tombées comprises', () => {
    // Un état à la main : atteindre la limite au prochain pas, après un coup de 1 PV.
    const setup: BattleSetup = {
      units: [
        piloted('a0', 'player', 0, { hp: 200, atk: 1, def: 0 }),
        piloted('a1', 'player', 1, { hp: 200, atk: 1, def: 0 }),
        piloted('b0', 'enemy', 0, { hp: 400, atk: 1, def: 0 }),
        piloted('b1', 'enemy', 1, { hp: 400, atk: 1, def: 0 }),
        piloted('b2', 'enemy', 2, { hp: 400, atk: 1, def: 0 }),
      ],
      rules: { firstSide: 'player', limit: 'hp_ratio' },
    };
    const { state } = createBattle(setup, balance);
    const finalHit = (hp: Record<string, number>): BattleState => {
      const crafted: BattleState = {
        ...state,
        balance: withLimit(state.actionCount),
        units: state.units.map((u) => ({
          ...u,
          hp: hp[u.def.id] ?? u.hp,
          alive: (hp[u.def.id] ?? u.hp) > 0,
        })),
      };
      // a0 frappe b0 de 1 PV puis la limite est atteinte.
      return step(crafted, { type: 'cast', unit: 'a0', spell: 'a0_basic', target: 'b0' }).state;
    };
    // 400 + 0 = 400/400 (1) contre 400 + 400 + 400 - 1 = 1199/1200 : le camp a gagne.
    expect(finalHit({ a0: 200, a1: 200 }).result).toEqual({
      winner: 'player',
      reason: 'action_limit',
    });
    // 200/400 = 0,5 contre 600/1200 = 0,5 : égalité exacte (b0 : 601 puis 600).
    expect(finalHit({ a0: 100, a1: 100, b0: 201, b1: 200, b2: 200 }).result).toEqual({
      winner: null,
      reason: 'action_limit',
    });
    // Un camp avec une unité tombée : 199/400 contre 1200/1200 - 1.
    expect(finalHit({ a0: 0, a1: 199 }).result).toEqual({
      winner: 'enemy',
      reason: 'action_limit',
    });
    // 1 PV d'écart sur le ratio, dans l'autre sens.
    expect(finalHit({ a0: 100, a1: 100, b0: 200, b1: 200, b2: 200 }).result).toEqual({
      winner: 'player',
      reason: 'action_limit',
    });
  });

  it('l’anéantissement reste prioritaire sur la limite', () => {
    const setup: BattleSetup = {
      units: [piloted('a', 'player', 0, { atk: 5000 }), piloted('b', 'enemy', 0, { hp: 50 })],
      rules: { firstSide: 'player', limit: 'hp_ratio' },
    };
    const { state } = createBattle(setup, withLimit(1));
    const last = step(state, defaultAction(state)).state;
    expect(last.result).toEqual({ winner: 'player', reason: 'annihilation' });
  });
});

describe('action par défaut', () => {
  type SpellOptions = NonNullable<Parameters<typeof spell>[3]>;
  const kit = (options: SpellOptions) => [spell('x_basic', 'basic', [hit()], options)];

  it('attaque l’ennemi vivant aux PV les plus bas, à égalité l’emplacement le plus bas', () => {
    const setup: BattleSetup = {
      units: [
        piloted('a', 'player', 0),
        piloted('b0', 'enemy', 0),
        piloted('b1', 'enemy', 1),
        piloted('b2', 'enemy', 2),
      ],
    };
    const { state } = createBattle(setup, balance);
    const withHp = (hp: readonly number[]): BattleState => ({
      ...state,
      units: state.units.map((u) =>
        u.def.side === 'enemy' ? { ...u, hp: hp[u.def.slot]!, alive: hp[u.def.slot]! > 0 } : u,
      ),
    });
    expect(defaultAction(withHp([300, 100, 100]))).toEqual({
      type: 'cast',
      unit: 'a',
      spell: 'a_basic',
      target: 'b1',
    });
    expect(defaultAction(withHp([200, 200, 200])).target).toBe('b0');
    // Un ennemi tombé n'est jamais visé, même aux PV les plus bas.
    expect(defaultAction(withHp([0, 50, 400])).target).toBe('b1');
    expect(defaultAction(withHp([0, 0, 400])).target).toBe('b2');
  });

  it('joue une action légale pour le moteur, sans modifier l’état', () => {
    const { state } = createBattle(
      {
        units: [
          ...team('a', ['pyra', 'maree', 'ronce', 'cendre'], 'player'),
          ...team('b', ['cendre', 'ressac', 'seve', 'pyra'], 'enemy'),
        ],
      },
      balance,
    );
    const before = canonicalState(state);
    const action = defaultAction(state);
    expect(legalActions(state)).toContainEqual(action);
    expect(canonicalState(state)).toBe(before);
    expect(() => step(state, action)).not.toThrow();
  });

  it('gère une attaque de base qui cible soi, un allié ou un groupe', () => {
    const cases: [string, SpellOptions, string | undefined][] = [
      ['self', { targeting: 'self' }, undefined],
      ['all_enemies', { targeting: 'all_enemies' }, undefined],
      ['all_allies', { targeting: 'all_allies' }, undefined],
      // Allié : le plus blessé de l'équipe (soi compris) ; ici l'allié « m » (slot 1).
      ['ally', { targeting: 'ally' }, 'm'],
    ];
    for (const [name, targeting, expected] of cases) {
      const spells = kit(targeting);
      const caster = { ...piloted('c', 'player', 0), spells };
      const mate = {
        ...piloted('m', 'player', 1),
        spells: [spell('m_basic', 'basic', [hit()], targeting)],
      };
      const foe = piloted('f', 'enemy', 0);
      const { state } = createBattle({ units: [caster, mate, foe] }, balance);
      const hurt: BattleState = {
        ...state,
        units: state.units.map((u) => (u.def.id === 'm' ? { ...u, hp: 10 } : u)),
      };
      const action = defaultAction(hurt);
      expect(action.unit).toBe('c');
      expect(action.spell).toBe('x_basic');
      expect(action.target, name).toBe(expected);
      expect('target' in action).toBe(expected !== undefined);
      expect(() => step(hurt, action), name).not.toThrow();
    }
  });

  it('refuse proprement quand personne n’est actif', () => {
    let { state } = createBattle(
      { units: [piloted('a', 'player', 0), piloted('b', 'enemy', 0)] },
      balance,
    );
    expect(() => defaultAction({ ...state, active: null })).toThrow(IllegalActionError);
    while (state.result === null) state = step(state, defaultAction(state)).state;
    expect(() => defaultAction(state)).toThrow(IllegalActionError);
    // Une unité sans attaque de base ne peut pas jouer d'action par défaut.
    const fresh = createBattle(
      { units: [piloted('a', 'player', 0), piloted('b', 'enemy', 0)] },
      balance,
    ).state;
    const noBasic: BattleState = {
      ...fresh,
      units: fresh.units.map((u) =>
        u.def.id === 'a' ? { ...u, def: { ...u.def, spells: [] } } : u,
      ),
    };
    expect(() => defaultAction(noBasic)).toThrow(IllegalActionError);
  });
});

describe('empreinte d’état', () => {
  const setup: BattleSetup = {
    units: [
      ...team('a', ['pyra', 'maree', 'ronce', 'cendre'], 'player'),
      ...team('b', ['cendre', 'ressac', 'seve', 'pyra'], 'enemy'),
    ],
    rules: { firstSide: 'enemy', limit: 'hp_ratio' },
  };

  /** Un état avec une altération, une modification de stat et un déclencheur, posés à la main. */
  function rich(): BattleState {
    const { state } = createBattle(setup, balance);
    return {
      ...state,
      units: state.units.map((u, i) =>
        i === 0
          ? {
              ...u,
              shield: 12,
              shieldTurns: 2,
              shieldSince: 3,
              scriptIndex: 1,
              statuses: [{ kind: 'mark', turns: 2, since: 3, power: 25, source: 'x' }],
              mods: [{ key: 'k', stat: 'atk', percent: 10, turns: 2, since: 3, source: 'y' }],
              triggers: [
                ...u.triggers,
                {
                  key: 't',
                  source: 'z',
                  trigger: u.triggers[0]!.trigger,
                  turns: 2,
                  since: 3,
                  uses: 1,
                  turnUses: 1,
                  turnStamp: 3,
                },
              ],
            }
          : u,
      ),
    };
  }

  const patch = (state: BattleState, index: number, change: Partial<UnitState>): BattleState => ({
    ...state,
    units: state.units.map((u, i) => (i === index ? { ...u, ...change } : u)),
  });

  it('14 chiffres hexadécimaux, stable pour un même état et ses copies', () => {
    const state = rich();
    const hash = hashState(state);
    expect(hash).toMatch(/^[0-9a-f]{14}$/);
    expect(hashState(state)).toBe(hash);
    expect(hashState(structuredClone(state))).toBe(hash);
    expect(hashState(rich())).toBe(hash);
    expect(hashState(createBattle(setup, balance).state)).toBe(
      hashState(createBattle(setup, balance).state),
    );
  });

  it('cyrb53 donne les valeurs de la version publiée de l’algorithme', () => {
    expect(cyrb53('a')).toBe(7929297801672961);
    expect(cyrb53('b')).toBe(8684336938537663);
    expect(cyrb53('')).toBeLessThan(2 ** 53);
  });

  it('valeur de référence : le format ne change pas sans que ce test le dise', () => {
    // Si ce test échoue après un changement voulu de hash.ts, mettre la valeur à jour ET
    // incrémenter PROTOCOL_VERSION (@outlaw/net) : un client à l'ancien format serait désynchronisé.
    const { state } = createBattle(
      { units: [piloted('a', 'player', 0), piloted('b', 'enemy', 0)] },
      balance,
    );
    const fixed: BattleState = {
      ...state,
      clock: 1,
      actionCount: 2,
      active: 'a',
      points: { player: 3, enemy: 4 },
      result: null,
      units: state.units.map((u) => ({
        ...u,
        hp: 10,
        alive: true,
        nextTime: 500,
        scriptIndex: 0,
        shield: 0,
        shieldTurns: 0,
        shieldSince: 0,
        statuses: [],
        mods: [],
        triggers: [],
      })),
    };
    expect(canonicalState(fixed)).toBe(
      '[1,2,"a",[3,4],null,[["a",10,true,500,0,0,0,0,[],[],[]],["b",10,true,500,0,0,0,0,[],[],[]]]]',
    );
    expect(hashState(fixed)).toBe('1e60c4b04cfa7c');
  });

  it('change dès qu’un champ dynamique change', () => {
    const base = rich();
    const u0 = base.units[0]!;
    const status = u0.statuses[0]!;
    const mod = u0.mods[0]!;
    const trigger = u0.triggers.at(-1)!;
    const variants: Record<string, BattleState> = {
      clock: { ...base, clock: base.clock + 1 },
      actionCount: { ...base, actionCount: base.actionCount + 1 },
      active: { ...base, active: base.active === 'a_pyra' ? 'a_maree' : 'a_pyra' },
      activeNull: { ...base, active: null },
      pointsPlayer: { ...base, points: { ...base.points, player: base.points.player + 1 } },
      pointsEnemy: { ...base, points: { ...base.points, enemy: base.points.enemy + 1 } },
      resultWinner: { ...base, result: { winner: 'player', reason: 'annihilation' } },
      resultNull: { ...base, result: { winner: null, reason: 'action_limit' } },
      resultReason: { ...base, result: { winner: 'player', reason: 'action_limit' } },
      hp: patch(base, 0, { hp: u0.hp - 1 }),
      alive: patch(base, 0, { alive: false }),
      nextTime: patch(base, 0, { nextTime: u0.nextTime + 1 }),
      scriptIndex: patch(base, 0, { scriptIndex: 2 }),
      shield: patch(base, 0, { shield: 13 }),
      shieldTurns: patch(base, 0, { shieldTurns: 3 }),
      shieldSince: patch(base, 0, { shieldSince: 4 }),
      otherUnit: patch(base, 3, { hp: base.units[3]!.hp - 1 }),
      statusKind: patch(base, 0, { statuses: [{ ...status, kind: 'burn' }] }),
      statusTurns: patch(base, 0, { statuses: [{ ...status, turns: 3 }] }),
      statusSince: patch(base, 0, { statuses: [{ ...status, since: 4 }] }),
      statusPower: patch(base, 0, { statuses: [{ ...status, power: 26 }] }),
      statusSource: patch(base, 0, { statuses: [{ ...status, source: 'w' }] }),
      statusNone: patch(base, 0, { statuses: [] }),
      modKey: patch(base, 0, { mods: [{ ...mod, key: 'k2' }] }),
      modStat: patch(base, 0, { mods: [{ ...mod, stat: 'def' }] }),
      modPercent: patch(base, 0, { mods: [{ ...mod, percent: 11 }] }),
      modTurns: patch(base, 0, { mods: [{ ...mod, turns: 3 }] }),
      modSince: patch(base, 0, { mods: [{ ...mod, since: 4 }] }),
      modSource: patch(base, 0, { mods: [{ ...mod, source: 'v' }] }),
      modNone: patch(base, 0, { mods: [] }),
      triggerKey: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, key: 't2' }],
      }),
      triggerSource: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, source: 'z2' }],
      }),
      triggerTurns: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, turns: 1 }],
      }),
      triggerTurnsNull: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, turns: null }],
      }),
      triggerSince: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, since: 4 }],
      }),
      triggerUses: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, uses: 2 }],
      }),
      triggerTurnUses: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, turnUses: 2 }],
      }),
      triggerTurnStamp: patch(base, 0, {
        triggers: [...u0.triggers.slice(0, -1), { ...trigger, turnStamp: 4 }],
      }),
      triggerNone: patch(base, 0, { triggers: u0.triggers.slice(0, -1) }),
    };
    const hashes = new Map<string, string>([['base', hashState(base)]]);
    for (const [name, variant] of Object.entries(variants)) hashes.set(name, hashState(variant));
    // Tous différents de la base et entre eux (53 bits : une collision ici serait un défaut du format).
    expect(new Set(hashes.values()).size).toBe(hashes.size);
  });

  it('ignore la définition des unités, les règles et l’équilibrage (statiques)', () => {
    const base = rich();
    const hash = hashState(base);
    const u0 = base.units[0]!;
    expect(
      hashState(patch(base, 0, { def: { ...u0.def, stats: { ...u0.def.stats, atk: 1 } } })),
    ).toBe(hash);
    expect(hashState({ ...base, rules: DEFAULT_RULES })).toBe(hash);
    expect(hashState({ ...base, balance: withLimit(5) })).toBe(hash);
  });

  it('les séparateurs ne créent pas d’ambiguïté entre statuts, modifications et déclencheurs', () => {
    const base = rich();
    const u0 = base.units[0]!;
    const status = u0.statuses[0]!;
    const two = patch(base, 0, { statuses: [status, { ...status, source: 'y' }] });
    const merged = patch(base, 0, { statuses: [{ ...status, source: 'x;mark,2,3,25,y' }] });
    expect(hashState(two)).not.toBe(hashState(merged));
  });

  it('un rejeu des mêmes actions donne la même empreinte que la partie directe, pas à pas', () => {
    const pick = lcg(7);
    const created = createBattle(setup, balance);
    let state = created.state;
    const actions: Action[] = [];
    const hashes = [hashState(state)];
    const events = [...created.events];
    while (state.result === null) {
      const options = legalActions(state);
      const action = pick(3) === 0 ? defaultAction(state) : options[pick(options.length)]!;
      actions.push(action);
      const next = step(state, action);
      state = next.state;
      events.push(...next.events);
      hashes.push(hashState(state));
    }
    expect(new Set(hashes).size).toBeGreaterThan(actions.length / 2);
    for (let k = 0; k <= actions.length; k += 5) {
      expect(hashState(replay(setup, balance, actions.slice(0, k)).state)).toBe(hashes[k]);
    }
    const full = replay(setup, balance, actions);
    expect(hashState(full.state)).toBe(hashes.at(-1));
    expect(full.events).toEqual(events);
    expect(full.state).toEqual(state);
  });
});
