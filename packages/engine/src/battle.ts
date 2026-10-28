import { MAX_SIDE, type Balance } from '@outlaw/data';
import {
  aliveOf,
  changePoints,
  checkEnd,
  closeDraft,
  finish,
  openDraft,
  signal,
  unitById,
  type Draft,
  type DraftUnit,
} from './draft';
import { applyEffect, hit, statusOf } from './effects';
import { IllegalActionError, InvalidSetupError } from './errors';
import { nextActor } from './queue';
import { rulesOf } from './rules';
import { cappedSpeed, effectiveSpeed, interval } from './stats';
import { scriptTarget, targetSide } from './targets';
import { flushSignals } from './triggers';
import type {
  Action,
  BattleResult,
  BattleRules,
  BattleSetup,
  BattleState,
  Intent,
  ResolvedSpell,
  Side,
  StatusState,
  StepResult,
  UnitDef,
  UnitState,
} from './types';

const MAX_UNITS_PER_SIDE = MAX_SIDE;

function needsTarget(spell: ResolvedSpell): boolean {
  return spell.targeting === 'enemy' || spell.targeting === 'ally';
}

function validateUnit(def: UnitDef): void {
  const fail = (message: string): never => {
    throw new InvalidSetupError(`${def.id} : ${message}`);
  };
  if (!Number.isInteger(def.slot) || def.slot < 0 || def.slot >= MAX_UNITS_PER_SIDE) {
    fail(`emplacement ${def.slot} hors de 0..${MAX_UNITS_PER_SIDE - 1}`);
  }
  if (def.stats.hp <= 0 || def.stats.vit <= 0) fail('PV et VIT doivent être positifs');
  const ids = new Set(def.spells.map((spell) => spell.id));
  if (ids.size !== def.spells.length) fail('sorts en double');
  if (def.controller === 'policy') {
    const basic = def.spells.find((spell) => spell.slot === 'basic');
    if (basic?.cost !== 0) fail('une unité pilotée doit avoir une attaque de base gratuite');
  } else {
    if (def.script.length === 0) fail('script vide');
    for (const step of def.script) {
      const spell = def.spells.find((candidate) => candidate.id === step.spell);
      if (spell === undefined) fail(`le script cite « ${step.spell} », absent des sorts`);
      else if (needsTarget(spell) === (step.target === 'auto')) {
        fail(`règle de cible « ${step.target} » incompatible avec « ${spell.id} »`);
      }
    }
  }
}

function validateRules(rules: BattleRules): void {
  const sides: readonly string[] = ['player', 'enemy'];
  const limits: readonly string[] = ['enemy_wins', 'hp_ratio'];
  if (!sides.includes(rules.firstSide)) {
    throw new InvalidSetupError(`règles : camp prioritaire inconnu « ${rules.firstSide} »`);
  }
  if (!limits.includes(rules.limit)) {
    throw new InvalidSetupError(`règles : limite inconnue « ${rules.limit} »`);
  }
  const limit = rules.actionLimit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new InvalidSetupError(`règles : limite d'actions invalide (${String(limit)})`);
  }
}

export function validateSetup(setup: BattleSetup): void {
  if (setup.rules !== undefined) validateRules(setup.rules);
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const def of setup.units) {
    if (ids.has(def.id)) throw new InvalidSetupError(`unité en double : ${def.id}`);
    ids.add(def.id);
    const slot = `${def.side}:${def.slot}`;
    if (slots.has(slot)) throw new InvalidSetupError(`emplacement occupé deux fois : ${slot}`);
    slots.add(slot);
    validateUnit(def);
  }
  // Les emplacements uniques dans 0..2 bornent déjà chaque camp à 3 unités.
  for (const side of ['player', 'enemy'] as const) {
    if (!setup.units.some((def) => def.side === side)) {
      throw new InvalidSetupError(`le camp ${side} n'a aucune unité`);
    }
  }
}

/** Camp prioritaire en tête (les héros par défaut), puis emplacement croissant. */
function bySideThenSlot(firstSide: Side): (a: UnitDef, b: UnitDef) => number {
  return (a, b) => {
    if (a.side !== b.side) return a.side === firstSide ? -1 : 1;
    return a.slot - b.slot;
  };
}

function initialUnit(def: UnitDef, balance: Balance): UnitState {
  return {
    def,
    hp: def.stats.hp,
    alive: true,
    nextTime: interval(balance.combat.initialDelay, cappedSpeed(def.stats.vit, balance)),
    scriptIndex: 0,
    shield: 0,
    shieldTurns: 0,
    shieldSince: 0,
    statuses: [],
    mods: [],
    triggers: def.triggers.map((resolved, index) => ({
      key: `${def.id}:${resolved.source}#${index}`,
      source: resolved.source,
      trigger: resolved.trigger,
      turns: null,
      since: 0,
      uses: 0,
      turnUses: 0,
      turnStamp: -1,
    })),
  };
}

function basicDelay(unit: UnitState, balance: Balance): number {
  return (
    unit.def.spells.find((spell) => spell.slot === 'basic')?.delay ?? balance.combat.delays.basic
  );
}

/** Choisit et valide les cibles d'un sort. */
function chooseTargets<T extends UnitState>(
  units: readonly T[],
  caster: T,
  spell: ResolvedSpell,
  targetId: string | undefined,
): T[] {
  const side = targetSide(caster, spell);
  if (!needsTarget(spell)) {
    if (targetId !== undefined) {
      throw new IllegalActionError(`« ${spell.id} » ne choisit pas de cible`);
    }
    return spell.targeting === 'self' ? [caster] : aliveOf(units, side);
  }
  const target = targetId === undefined ? undefined : unitById(units, targetId);
  if (target?.alive !== true || target.def.side !== side) {
    throw new IllegalActionError(`cible invalide pour « ${spell.id} » : ${String(targetId)}`);
  }
  return [target];
}

/** Durées : chaque effet s'use à la fin d'un tour de son porteur, sauf le tour où il a été posé. */
function tickDurations(draft: Draft, unit: DraftUnit): void {
  const now = draft.actionCount;
  const left = (turns: number, since: number): number => (since < now ? turns - 1 : turns);
  const expired = (effect: StatusState['kind'] | 'shield' | 'stat_mod' | 'trigger'): void => {
    draft.events.push({ type: 'expired', unit: unit.def.id, effect });
  };

  const statuses: StatusState[] = [];
  for (const status of unit.statuses) {
    // L'étourdissement se consomme en sautant un tour, pas en fin de tour.
    const turns = status.kind === 'stun' ? status.turns : left(status.turns, status.since);
    if (turns > 0) statuses.push(turns === status.turns ? status : { ...status, turns });
    else expired(status.kind);
  }
  unit.statuses = statuses;

  const mods = unit.mods
    .map((mod) => ({ ...mod, turns: left(mod.turns, mod.since) }))
    .filter((mod) => mod.turns > 0);
  if (mods.length < unit.mods.length) expired('stat_mod');
  unit.mods = mods;

  if (unit.shield > 0) {
    unit.shieldTurns = left(unit.shieldTurns, unit.shieldSince);
    if (unit.shieldTurns <= 0) {
      unit.shield = 0;
      unit.shieldTurns = 0;
      expired('shield');
    }
  }

  const triggers = unit.triggers
    .map((t) => (t.turns === null ? t : { ...t, turns: left(t.turns, t.since) }))
    .filter((t) => t.turns === null || t.turns > 0);
  if (triggers.length < unit.triggers.length) expired('trigger');
  unit.triggers = triggers;
}

function endTurn(draft: Draft, unit: DraftUnit): void {
  if (unit.alive) tickDurations(draft, unit);
  draft.events.push({ type: 'turn_end', unit: unit.def.id });
  signal(draft, { kind: 'turn_end', unit: unit.def.id });
  flushSignals(draft);
  checkEnd(draft);
}

/** Début de tour : brûlure, déclencheurs, étourdissement. Renvoie vrai si l'unité doit agir. */
function beginTurn(draft: Draft, unit: DraftUnit): boolean {
  draft.actionCount += 1;
  draft.clock = unit.nextTime;
  draft.events.push({ type: 'turn_start', unit: unit.def.id, time: unit.nextTime });
  const burn = statusOf(unit, 'burn');
  if (burn !== undefined) hit(draft, burn.source, unit, burn.power, 'burn', 1);
  signal(draft, { kind: 'turn_start', unit: unit.def.id });
  flushSignals(draft);
  checkEnd(draft);
  if (draft.result !== null || !unit.alive) return false;

  const stun = statusOf(unit, 'stun');
  if (stun === undefined) return true;
  draft.events.push({ type: 'turn_skipped', unit: unit.def.id, reason: 'stun' });
  const others = unit.statuses.filter((status) => status.kind !== 'stun');
  if (stun.turns > 1) {
    unit.statuses = [...others, { ...stun, turns: stun.turns - 1 }];
  } else {
    const immunity = draft.balance.combat.stunImmunityTurns;
    unit.statuses =
      immunity > 0
        ? [
            ...others,
            {
              kind: 'stun_immunity',
              turns: immunity,
              since: draft.actionCount,
              power: 0,
              source: unit.def.id,
            },
          ]
        : others;
    draft.events.push({ type: 'expired', unit: unit.def.id, effect: 'stun' });
  }
  unit.nextTime += interval(basicDelay(unit, draft.balance), effectiveSpeed(unit, draft.balance));
  endTurn(draft, unit);
  return false;
}

/** Résout un sort : coût, gain, délai, effets dans l'ordre, puis déclencheurs. */
function cast(draft: Draft, caster: DraftUnit, spell: ResolvedSpell, targets: DraftUnit[]): void {
  draft.events.push({
    type: 'cast',
    unit: caster.def.id,
    spell: spell.id,
    slot: spell.slot,
    targets: targets.map((unit) => unit.def.id),
  });
  // Seules les unités pilotées utilisent la réserve : un script ennemi est fixe et affiché.
  if (caster.def.controller === 'policy') {
    if (spell.cost > 0) changePoints(draft, caster.def.side, -spell.cost, 'cost');
    if (spell.gain > 0) changePoints(draft, caster.def.side, spell.gain, 'gain');
  }
  // Le délai s'applique avant les effets : un effet de tempo sur soi décale ce prochain tour.
  caster.nextTime += interval(spell.delay, effectiveSpeed(caster, draft.balance));
  signal(draft, {
    kind: 'spell_cast',
    unit: caster.def.id,
    slot: spell.slot,
    target: targets[0]?.def.id ?? null,
  });
  const ctx = {
    caster,
    element: spell.element,
    source: spell.id,
    cause: 'spell' as const,
    primary: targets,
  };
  spell.effects.forEach((effect, index) => {
    applyEffect(draft, ctx, effect, index);
  });
  flushSignals(draft);
  checkEnd(draft);
  if (draft.result === null) endTurn(draft, caster);
}

function scriptStep(unit: UnitState): {
  spell: ResolvedSpell;
  rule: UnitDef['script'][number]['target'];
} {
  const { script } = unit.def;
  const step = script[unit.scriptIndex % script.length];
  const spell = unit.def.spells.find((candidate) => candidate.id === step?.spell);
  if (step === undefined || spell === undefined) {
    throw new InvalidSetupError(`${unit.def.id} : script invalide`);
  }
  return { spell, rule: step.target };
}

function scriptTurn(draft: Draft, unit: DraftUnit): void {
  const { spell, rule } = scriptStep(unit);
  unit.scriptIndex += 1;
  const target = scriptTarget(draft.units, unit, spell, rule);
  cast(draft, unit, spell, chooseTargets(draft.units, unit, spell, target?.def.id));
}

/** Ratio de PV d'un camp comme fraction entière : PV restants sur PV max (unités tombées comprises). */
function hpFraction(draft: Draft, side: Side): { hp: number; max: number } {
  let hp = 0;
  let max = 0;
  for (const unit of draft.units) {
    if (unit.def.side !== side) continue;
    hp += unit.hp;
    max += unit.def.stats.hp;
  }
  return { hp, max };
}

/**
 * Résultat à la limite d'actions. « enemy_wins » (PvE) : défaite des héros. « hp_ratio » : le camp au
 * plus grand ratio de PV restants gagne, égalité = pas de vainqueur. Comparaison par produits en croix
 * (des entiers) pour ne dépendre d'aucun arrondi.
 */
function limitResult(draft: Draft): BattleResult {
  if (rulesOf(draft).limit === 'enemy_wins') return { winner: 'enemy', reason: 'action_limit' };
  const player = hpFraction(draft, 'player');
  const enemy = hpFraction(draft, 'enemy');
  const diff = player.hp * enemy.max - enemy.hp * player.max;
  const winner: Side | null = diff > 0 ? 'player' : diff < 0 ? 'enemy' : null;
  return { winner, reason: 'action_limit' };
}

/**
 * Fait avancer le temps : joue les tours scriptés jusqu'au tour d'une unité pilotée
 * (qui devient « active ») ou jusqu'à la fin du combat.
 */
function settle(draft: Draft): void {
  while (draft.result === null) {
    const actor = nextActor(draft.units, rulesOf(draft).firstSide);
    if (actor === null) throw new InvalidSetupError('aucune unité vivante');
    if (draft.actionCount >= (rulesOf(draft).actionLimit ?? draft.balance.combat.actionLimit)) {
      finish(draft, limitResult(draft));
      return;
    }
    if (!beginTurn(draft, actor)) continue;
    if (actor.def.controller === 'policy') {
      draft.active = actor.def.id;
      return;
    }
    scriptTurn(draft, actor);
  }
}

/** Crée un combat et joue jusqu'au premier tour d'une unité pilotée. */
export function createBattle(setup: BattleSetup, balance: Balance): StepResult {
  validateSetup(setup);
  const units = [...setup.units]
    .sort(bySideThenSlot(rulesOf(setup).firstSide))
    .map((def) => initialUnit(def, balance));
  const start = balance.combat.teamPoints.start;
  const draft = openDraft({
    balance,
    ...(setup.rules === undefined ? {} : { rules: setup.rules }),
    units,
    clock: 0,
    points: { player: start, enemy: start },
    actionCount: 0,
    active: null,
    result: null,
  });
  draft.events.push({
    type: 'battle_start',
    units: units.map((unit) => ({
      id: unit.def.id,
      kind: unit.def.kind,
      side: unit.def.side,
      slot: unit.def.slot,
      element: unit.def.element,
      hp: unit.hp,
      maxHp: unit.def.stats.hp,
    })),
  });
  signal(draft, { kind: 'combat_start' });
  flushSignals(draft);
  checkEnd(draft);
  settle(draft);
  return closeDraft(draft);
}

/** Applique l'action de l'unité active : (état, action) → (nouvel état, journal). */
export function step(state: BattleState, action: Action): StepResult {
  if (state.result !== null) throw new IllegalActionError('le combat est terminé');
  if (action.unit !== state.active) {
    throw new IllegalActionError(`ce n'est pas le tour de ${action.unit}`);
  }
  const draft = openDraft(state);
  const caster = unitById(draft.units, action.unit);
  const spell = caster?.def.spells.find((candidate) => candidate.id === action.spell);
  if (caster === undefined || spell === undefined) {
    throw new IllegalActionError(`${action.unit} ne connaît pas « ${action.spell} »`);
  }
  if (spell.cost > draft.points[caster.def.side]) {
    throw new IllegalActionError(`points d'équipe insuffisants pour « ${spell.id} »`);
  }
  const targets = chooseTargets(draft.units, caster, spell, action.target);
  draft.active = null;
  cast(draft, caster, spell, targets);
  settle(draft);
  return closeDraft(draft);
}

/** Actions possibles de l'unité active (vide si le combat est terminé). */
export function legalActions(state: BattleState): Action[] {
  const caster = state.active === null ? undefined : unitById(state.units, state.active);
  if (caster === undefined) return [];
  const actions: Action[] = [];
  for (const spell of caster.def.spells) {
    if (spell.cost > state.points[caster.def.side]) continue;
    if (!needsTarget(spell)) {
      actions.push({ type: 'cast', unit: caster.def.id, spell: spell.id });
      continue;
    }
    for (const target of aliveOf(state.units, targetSide(caster, spell))) {
      actions.push({ type: 'cast', unit: caster.def.id, spell: spell.id, target: target.def.id });
    }
  }
  return actions;
}

/** Prochaine action annoncée d'un ennemi scripté (null pour une unité pilotée ou tombée). */
export function enemyIntent(state: BattleState, unitId: string): Intent | null {
  const unit = unitById(state.units, unitId);
  if (
    unit === undefined ||
    !unit.alive ||
    unit.def.controller !== 'script' ||
    state.result !== null
  ) {
    return null;
  }
  const { spell, rule } = scriptStep(unit);
  const target = scriptTarget(state.units, unit, spell, rule);
  const targets = chooseTargets(state.units, unit, spell, target?.def.id);
  return {
    unit: unit.def.id,
    spell: spell.id,
    slot: spell.slot,
    targets: targets.map((t) => t.def.id),
    stunned: unit.statuses.some((status) => status.kind === 'stun'),
  };
}

/** Rejoue un combat à partir de sa configuration et de ses actions : même entrée, même journal. */
export function replay(
  setup: BattleSetup,
  balance: Balance,
  actions: readonly Action[],
): StepResult {
  const first = createBattle(setup, balance);
  let state = first.state;
  const events = [...first.events];
  for (const action of actions) {
    const next = step(state, action);
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}
