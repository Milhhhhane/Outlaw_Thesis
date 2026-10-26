import type { Balance } from '@outlaw/data';
import {
  aliveOf,
  changePoints,
  checkEnd,
  closeDraft,
  finish,
  openDraft,
  type Draft,
  type DraftUnit,
} from './draft';
import { applyEffect, SUPPORTED_EFFECTS } from './effects';
import { IllegalActionError, InvalidSetupError } from './errors';
import { nextActor } from './queue';
import { cappedSpeed, interval } from './stats';
import { scriptTarget, targetSide } from './targets';
import type {
  Action,
  BattleSetup,
  BattleState,
  ResolvedSpell,
  StepResult,
  UnitDef,
  UnitState,
} from './types';

const MAX_UNITS_PER_SIDE = 3;

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
  for (const spell of def.spells) {
    for (const effect of spell.effects) {
      if (!SUPPORTED_EFFECTS.has(effect.kind)) fail(`brique « ${effect.kind} » non gérée`);
    }
  }
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

export function validateSetup(setup: BattleSetup): void {
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

function bySideThenSlot(a: UnitDef, b: UnitDef): number {
  if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
  return a.slot - b.slot;
}

function speed(unit: UnitState, balance: Balance): number {
  return cappedSpeed(unit.def.stats.vit, balance);
}

/** Choisit et valide les cibles d'un sort. */
function chooseTargets(
  draft: Draft,
  caster: DraftUnit,
  spell: ResolvedSpell,
  targetId: string | undefined,
): DraftUnit[] {
  const side = targetSide(caster, spell);
  if (!needsTarget(spell)) {
    if (targetId !== undefined) {
      throw new IllegalActionError(`« ${spell.id} » ne choisit pas de cible`);
    }
    return spell.targeting === 'self' ? [caster] : aliveOf(draft.units, side);
  }
  const target = draft.units.find((unit) => unit.def.id === targetId);
  if (target?.alive !== true || target.def.side !== side) {
    throw new IllegalActionError(`cible invalide pour « ${spell.id} » : ${String(targetId)}`);
  }
  return [target];
}

/** Résout un sort : coût, gain, effets dans l'ordre, puis délai avant le prochain tour. */
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
  for (const effect of spell.effects) {
    applyEffect(draft, { caster, spell, primary: targets }, effect);
  }
  caster.nextTime += interval(spell.delay, speed(caster, draft.balance));
  checkEnd(draft);
}

function scriptTurn(draft: Draft, unit: DraftUnit): void {
  const { script } = unit.def;
  const step = script[unit.scriptIndex % script.length];
  const spell = unit.def.spells.find((candidate) => candidate.id === step?.spell);
  if (step === undefined || spell === undefined) {
    throw new InvalidSetupError(`${unit.def.id} : script invalide`);
  }
  unit.scriptIndex += 1;
  const target = scriptTarget(draft.units, unit, spell, step.target);
  cast(draft, unit, spell, chooseTargets(draft, unit, spell, target?.def.id));
}

/**
 * Fait avancer le temps : joue les tours scriptés jusqu'au tour d'une unité pilotée
 * (qui devient « active ») ou jusqu'à la fin du combat.
 */
function settle(draft: Draft): void {
  while (draft.result === null) {
    const actor = nextActor(draft.units);
    if (actor === null) throw new InvalidSetupError('aucune unité vivante');
    if (draft.actionCount >= draft.balance.combat.actionLimit) {
      finish(draft, { winner: 'enemy', reason: 'action_limit' });
      return;
    }
    draft.actionCount += 1;
    draft.clock = actor.nextTime;
    draft.events.push({ type: 'turn_start', unit: actor.def.id, time: actor.nextTime });
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
  const units: UnitState[] = [...setup.units].sort(bySideThenSlot).map((def) => ({
    def,
    hp: def.stats.hp,
    alive: true,
    nextTime: interval(balance.combat.initialDelay, cappedSpeed(def.stats.vit, balance)),
    scriptIndex: 0,
  }));
  const start = balance.combat.teamPoints.start;
  const draft = openDraft({
    balance,
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
      side: unit.def.side,
      slot: unit.def.slot,
      element: unit.def.element,
      hp: unit.hp,
      maxHp: unit.def.stats.hp,
    })),
  });
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
  const caster = draft.units.find((unit) => unit.def.id === action.unit);
  const spell = caster?.def.spells.find((candidate) => candidate.id === action.spell);
  if (caster === undefined || spell === undefined) {
    throw new IllegalActionError(`${action.unit} ne connaît pas « ${action.spell} »`);
  }
  if (spell.cost > draft.points[caster.def.side]) {
    throw new IllegalActionError(`points d'équipe insuffisants pour « ${spell.id} »`);
  }
  const targets = chooseTargets(draft, caster, spell, action.target);
  draft.active = null;
  cast(draft, caster, spell, targets);
  settle(draft);
  return closeDraft(draft);
}

/** Actions possibles de l'unité active (vide si le combat est terminé). */
export function legalActions(state: BattleState): Action[] {
  const caster = state.units.find((unit) => unit.def.id === state.active);
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
