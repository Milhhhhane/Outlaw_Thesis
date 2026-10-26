import type { Trigger } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { createBattle, step } from '../src/battle';
import type { BattleState, ResolvedSpell, UnitDef } from '../src/types';
import { balance, hit, ofType, spell, unit } from './helpers';

const passive = (trigger: Trigger, source = 'passive') => ({ source, trigger });

function battle(hero: Partial<UnitDef>, foes: UnitDef[]) {
  const base = unit({ id: 'h', side: 'player' });
  return createBattle({ units: [{ ...base, ...hero }, ...foes] }, balance);
}

const weakFoe = (id = 'e', slot = 0, extra: Partial<UnitDef> = {}): UnitDef => ({
  ...unit({ id, side: 'enemy', slot, stats: { hp: 5000, atk: 1 } }),
  ...extra,
});

const act = (state: BattleState, spellId: string, target?: string) =>
  step(state, { type: 'cast', unit: 'h', spell: spellId, ...(target ? { target } : {}) });

const kit = (...extra: ResolvedSpell[]) => [spell('h_basic', 'basic', [hit()]), ...extra];

describe('déclencheurs', () => {
  it('seuil de PV franchi vers le bas : une seule fois par franchissement', () => {
    const momentum = passive({
      on: 'hp_crossed',
      subject: 'enemy',
      thresholdPct: 50,
      effects: [{ kind: 'tempo', target: 'self', amount: -30 }],
    });
    // e : 100 PV, DEF 0 → 50 dégâts par coup.
    let { state } = battle({ triggers: [momentum] }, [
      weakFoe('e', 0, { stats: { hp: 120, atk: 1, def: 0, vit: 100 } }),
    ]);
    let result = act(state, 'h_basic', 'e'); // 120 → 70
    expect(ofType(result.events, 'trigger_fired')).toEqual([]);
    state = result.state;
    result = act(state, 'h_basic', 'e'); // 70 → 20 : franchit 60
    expect(ofType(result.events, 'trigger_fired')).toEqual([
      { type: 'trigger_fired', unit: 'h', source: 'passive', on: 'hp_crossed' },
    ]);
    expect(ofType(result.events, 'tempo')[0]).toMatchObject({ target: 'h', delta: -3000 });
  });

  it('pas de chaîne : les dégâts d’un déclencheur ne déclenchent rien', () => {
    const echo = passive({
      on: 'damage_dealt',
      subject: 'self',
      effects: [{ kind: 'damage', target: 'other', power: 10 }],
    });
    const { state } = battle({ triggers: [echo] }, [weakFoe()]);
    const result = act(state, 'h_basic', 'e');
    expect(ofType(result.events, 'trigger_fired')).toHaveLength(1);
    expect(ofType(result.events, 'damage').filter((d) => d.source === 'h')).toMatchObject([
      { cause: 'spell', amount: 42 },
      { cause: 'trigger', amount: 4 },
    ]);
  });

  it('limite par combat : première compétence remboursée', () => {
    const flow = passive({
      on: 'spell_cast',
      subject: 'self',
      slots: ['a', 'b', 'ult'],
      limit: { per: 'combat', count: 1 },
      effects: [{ kind: 'teamPoints', amount: 1, side: 'own' }],
    });
    const skill = spell('skill', 'a', [hit(50)]);
    let { state } = battle({ triggers: [flow], spells: kit(skill) }, [weakFoe()]);
    let result = act(state, 'h_basic', 'e');
    expect(ofType(result.events, 'trigger_fired')).toEqual([]);
    state = result.state;
    result = act(state, 'skill', 'e');
    expect(ofType(result.events, 'points').map((p) => p.delta)).toEqual([-1, 1]);
    result = act(result.state, 'skill', 'e');
    expect(ofType(result.events, 'points').map((p) => p.delta)).toEqual([-1]);
  });

  it('limite par tour', () => {
    const thorns = passive({
      on: 'damage_dealt',
      subject: 'self',
      limit: { per: 'turn', count: 1 },
      effects: [{ kind: 'heal', target: 'self', power: 10 }],
    });
    const volley = spell('volley', 'b', [hit(), hit()], { targeting: 'all_enemies' });
    const { state } = battle(
      { triggers: [thorns], spells: kit(volley), stats: { hp: 400, atk: 50, def: 20, vit: 100 } },
      [weakFoe('e0', 0), weakFoe('e1', 1)],
    );
    const result = act(state, 'volley');
    expect(ofType(result.events, 'trigger_fired')).toHaveLength(1);
  });

  it('cible marquée exigée, sujet « ally » incluant le porteur', () => {
    const hunt = passive({
      on: 'damage_dealt',
      subject: 'ally',
      targetHasStatus: 'mark',
      effects: [{ kind: 'damage', target: 'other', power: 20 }],
    });
    const brand = spell('brand', 'a', [
      { kind: 'status', target: 'primary', status: 'mark', duration: 2 },
    ]);
    let { state } = battle({ triggers: [hunt], spells: kit(brand) }, [weakFoe()]);
    let result = act(state, 'h_basic', 'e');
    expect(ofType(result.events, 'trigger_fired')).toEqual([]);
    state = act(result.state, 'brand', 'e').state;
    result = act(state, 'h_basic', 'e');
    expect(ofType(result.events, 'trigger_fired')).toHaveLength(1);
  });

  it('« quand je tombe » : le porteur tombé déclenche encore', () => {
    const lastWish = passive({
      on: 'unit_down',
      subject: 'self',
      effects: [{ kind: 'heal', target: 'all_allies', power: 1000 }],
    });
    const nuke = spell('nuke', 'a', [hit(2000)]);
    const { state } = battle({ spells: kit(nuke) }, [
      weakFoe('e0', 0, { triggers: [lastWish], stats: { hp: 100, atk: 1, def: 0, vit: 100 } }),
      weakFoe('e1', 1),
    ]);
    const poke = act(state, 'h_basic', 'e1');
    const result = act(poke.state, 'nuke', 'e0');
    expect(ofType(result.events, 'trigger_fired')).toEqual([
      { type: 'trigger_fired', unit: 'e0', source: 'passive', on: 'unit_down' },
    ]);
    expect(ofType(result.events, 'heal')).toMatchObject([{ target: 'e1', cause: 'trigger' }]);
  });

  it('début de combat et altération reçue', () => {
    const warcry = passive({
      on: 'combat_start',
      subject: 'self',
      effects: [{ kind: 'statMod', target: 'self', stat: 'atk', percent: 10, duration: 99 }],
    });
    const anger = passive({
      on: 'status_applied',
      subject: 'self',
      status: 'mark',
      effects: [{ kind: 'teamPoints', amount: -1, side: 'opposing' }],
    });
    const brand = spell('brand', 'a', [
      { kind: 'status', target: 'primary', status: 'mark', duration: 2 },
    ]);
    const created = battle({ spells: kit(brand) }, [
      weakFoe('e', 0, { triggers: [warcry, anger] }),
    ]);
    expect(ofType(created.events, 'stat_mod')).toMatchObject([{ target: 'e', total: 10 }]);
    const result = act(created.state, 'brand', 'e');
    expect(ofType(result.events, 'points').map((p) => p.total)).toEqual([2, 1]);
  });

  it('brique « déclencheur » : posée sur un allié pour une durée, puis retirée', () => {
    const blessing = spell(
      'blessing',
      'a',
      [
        {
          kind: 'trigger',
          target: 'primary',
          duration: 1,
          trigger: {
            on: 'damage_taken',
            subject: 'self',
            effects: [{ kind: 'heal', target: 'self', power: 10 }],
          },
        },
      ],
      { targeting: 'ally' },
    );
    let { state } = battle({ spells: kit(blessing) }, [
      weakFoe('e', 0, { stats: { hp: 5000, atk: 60, def: 20, vit: 100 } }),
    ]);
    let result = act(state, 'blessing', 'h');
    expect(ofType(result.events, 'trigger_added')).toEqual([
      { type: 'trigger_added', source: 'h', target: 'h', key: 'h:blessing#0', turns: 1 },
    ]);
    expect(ofType(result.events, 'heal')).toMatchObject([{ target: 'h', amount: 5 }]);
    state = result.state;
    result = act(state, 'h_basic', 'e');
    expect(ofType(result.events, 'expired')).toEqual([
      { type: 'expired', unit: 'h', effect: 'trigger' },
    ]);
    expect(ofType(result.events, 'heal')).toEqual([]);
  });

  it('début et fin de tour', () => {
    const regen = passive({
      on: 'turn_start',
      subject: 'self',
      effects: [{ kind: 'heal', target: 'self', power: 10 }],
    });
    const tick = passive({
      on: 'turn_end',
      subject: 'enemy',
      effects: [{ kind: 'damage', target: 'subject', power: 10 }],
    });
    const { state } = battle({ triggers: [tick] }, [weakFoe('e', 0, { triggers: [regen] })]);
    const result = act(state, 'h_basic', 'e');
    const fired = ofType(result.events, 'trigger_fired').map((t) => `${t.unit}:${t.on}`);
    expect(fired).toEqual(['e:turn_start', 'h:turn_end']);
  });
});
