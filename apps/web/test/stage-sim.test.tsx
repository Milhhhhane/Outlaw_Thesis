import { createBattle, legalActions, step, type BattleEvent } from '@outlaw/engine';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, demoSetup } from '../src/combat/session';
import { Stage } from '../src/combat/Stage';
import { applyEvent, viewFromState, type BattleView } from '../src/combat/view';

/**
 * Simulation d'un combat complet rejoué événement par événement dans le champ de bataille,
 * comme le fait l'écran. Garde-fous contre les régressions d'animation : un acteur à terre ne
 * doit jamais être recréé (sinon sa chute rejoue à chaque coup), et une unité ne meurt qu'une fois.
 */
function playBattle(): { events: BattleEvent[]; states: number } {
  let { state, events } = createBattle(demoSetup(), content.balance);
  const all: BattleEvent[] = [...events];
  let states = 1;
  for (let i = 0; i < 400 && state.result === null; i += 1) {
    const action = legalActions(state).at(-1);
    if (action === undefined) break;
    ({ state, events } = step(state, action));
    all.push(...events);
    states += 1;
  }
  return { events: all, states };
}

describe('simulation du champ de bataille', () => {
  it('un combattant tombé reste le même nœud et ne tombe qu’une fois', () => {
    const { events } = playBattle();
    const ids = events.flatMap((e) => (e.type === 'unit_down' ? [e.unit] : []));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    let view: BattleView = viewFromState(createBattle(demoSetup(), content.balance).state);
    const { container, rerender } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    const nodeOf = (id: string): Element | null => container.querySelector(`[data-unit="${id}"]`);
    const fallen = new Map<string, Element>();
    events.forEach((event, key) => {
      view = applyEvent(view, event, key);
      rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
      for (const unit of view.units) {
        const node = nodeOf(unit.id);
        expect(node, unit.id).not.toBeNull();
        if (node === null) continue;
        if (!unit.alive) {
          const seen = fallen.get(unit.id);
          if (seen === undefined) fallen.set(unit.id, node);
          // Même élément DOM d'un événement à l'autre : la chute n'est jouée qu'une fois.
          else expect(seen, `${unit.id} recréé à l'événement ${String(key)}`).toBe(node);
          expect(node.className).toContain('actor--down');
        }
      }
    });
    expect(fallen.size).toBe(ids.length);
  });

  it('les secousses et le zoom ne recréent pas les acteurs', () => {
    const { events } = playBattle();
    let view: BattleView = viewFromState(createBattle(demoSetup(), content.balance).state);
    const { container, rerender } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    const first = container.querySelector('.actor');
    expect(first).not.toBeNull();
    let shakes = 0;
    events.forEach((event, key) => {
      view = applyEvent(view, event, key);
      rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
      if (event.type === 'damage') shakes += 1;
      expect(container.querySelector('.actor')).toBe(first);
    });
    expect(shakes).toBeGreaterThan(5);
  });
});

describe('course de l’attaque de base', () => {
  it('l’attaquant court vers un ennemi seul, pas pour un sort sur soi', () => {
    const { state } = createBattle(demoSetup(), content.balance);
    const active = state.units.find((u) => u.def.id === state.active);
    expect(active).toBeDefined();
    if (active === undefined) return;
    const enemy = state.units.find((u) => u.def.side !== active.def.side);
    expect(enemy).toBeDefined();
    if (enemy === undefined) return;
    let view: BattleView = viewFromState(state);
    view = applyEvent(
      view,
      { type: 'cast', unit: active.def.id, spell: 'x', slot: 'basic', targets: [enemy.def.id] },
      1,
    );
    expect(view.cast?.dash).toBe(true);
    const { container, rerender } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    const actor = container.querySelector<HTMLElement>(`[data-unit="${active.def.id}"]`);
    expect(actor?.className).toContain('actor--dash-b');
    expect(actor?.style.getPropertyValue('--dx')).not.toBe('0px');
    // Pas de projectile pendant une course : le coup se donne au contact.
    expect(container.querySelector('.stage__bolt')).toBeNull();
    expect(container.querySelector('.stage__slash--dash')).not.toBeNull();

    view = applyEvent(
      view,
      { type: 'cast', unit: active.def.id, spell: 'y', slot: 'a', targets: [active.def.id] },
      2,
    );
    expect(view.cast?.dash).toBe(false);
    rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    expect(container.querySelector(`[data-unit="${active.def.id}"]`)?.className).not.toContain(
      'actor--dash',
    );
  });
});

describe('ultime', () => {
  it('le flash d’impact part au premier effet de l’ultime, pas pour un autre sort', () => {
    const { state } = createBattle(demoSetup(), content.balance);
    const [a, b] = state.units;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a === undefined || b === undefined) return;
    let view: BattleView = viewFromState(state);
    const tempo = {
      type: 'tempo',
      source: a.def.id,
      target: b.def.id,
      delta: -10,
      nextTime: 0,
    } as const;
    view = applyEvent(
      view,
      { type: 'cast', unit: a.def.id, spell: 'x', slot: 'a', targets: [] },
      1,
    );
    view = applyEvent(view, tempo, 2);
    expect(view.ultHit).toBeNull();
    view = applyEvent(
      view,
      { type: 'cast', unit: a.def.id, spell: 'u', slot: 'ult', targets: [] },
      3,
    );
    view = applyEvent(view, tempo, 4);
    view = applyEvent(view, tempo, 5);
    // Seul le premier effet compte : un flash par ultime.
    expect(view.ultHit).toBe(4);
    const { container } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    expect(container.querySelector('.stage__ult-hit')).not.toBeNull();
    expect(container.querySelector('.stage--ulta')).not.toBeNull();
    expect(container.querySelector(`[data-unit="${a.def.id}"]`)?.className).toContain(
      'actor--caster',
    );
  });
});

describe('soins et boucliers', () => {
  it('la bulle suit le bouclier, le soin fait luire, le bouclier brisé éclate', () => {
    const { state } = createBattle(demoSetup(), content.balance);
    const [a, b] = state.units;
    if (a === undefined || b === undefined) throw new Error('deux unités attendues');
    let view: BattleView = viewFromState(state);
    const render1 = () =>
      render(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    const { container, rerender } = render1();
    const actor = () => container.querySelector(`[data-unit="${b.def.id}"]`);
    expect(actor()?.querySelector('.actor__bubble')).toBeNull();

    view = applyEvent(
      view,
      { type: 'shield', source: a.def.id, target: b.def.id, amount: 20, total: 20, turns: 2 },
      1,
    );
    rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    expect(actor()?.querySelector('.actor__bubble')).not.toBeNull();
    expect(actor()?.querySelector('.actor__glow--shield')).not.toBeNull();

    view = applyEvent(
      view,
      {
        type: 'damage',
        source: a.def.id,
        target: b.def.id,
        cause: 'spell',
        amount: 20,
        absorbed: 20,
        multiplier: 1,
        hpAfter: b.hp,
        shieldAfter: 0,
        killed: false,
      },
      2,
    );
    expect(view.flashes.at(-1)?.fx).toBe('shatter');
    rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    expect(actor()?.querySelector('.actor__bubble')).toBeNull();
    expect(container.querySelector('.actor__fx--shatter')).not.toBeNull();

    view = applyEvent(
      view,
      {
        type: 'heal',
        source: a.def.id,
        target: b.def.id,
        cause: 'spell',
        amount: 5,
        hpAfter: b.hp,
      },
      3,
    );
    rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    expect(actor()?.querySelector('.actor__glow--heal')).not.toBeNull();
    expect(container.querySelector('.actor__fx--heal')).not.toBeNull();
  });
});

describe('altérations', () => {
  it('brûlure, marque et étourdissement restent visibles tant qu’ils durent', () => {
    const { state } = createBattle(demoSetup(), content.balance);
    const [a, b] = state.units;
    if (a === undefined || b === undefined) throw new Error('deux unités attendues');
    let view: BattleView = viewFromState(state);
    for (const [i, status] of (['burn', 'mark', 'stun'] as const).entries()) {
      view = applyEvent(
        view,
        { type: 'status', source: a.def.id, target: b.def.id, status, turns: 2, resisted: false },
        i + 1,
      );
    }
    const { container, rerender } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    const actor = () => container.querySelector(`[data-unit="${b.def.id}"]`);
    for (const status of ['burn', 'mark', 'stun']) {
      expect(actor()?.querySelector(`.actor__status--${status}`), status).not.toBeNull();
    }
    view = applyEvent(view, { type: 'expired', unit: b.def.id, effect: 'burn' }, 4);
    rerender(<Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />);
    expect(actor()?.querySelector('.actor__status--burn')).toBeNull();
    expect(actor()?.querySelector('.actor__status--mark')).not.toBeNull();
  });
});

describe('mort', () => {
  it('une unité tombée part en cendres de son élément', () => {
    const { state } = createBattle(demoSetup(), content.balance);
    const unit = state.units[0];
    if (unit === undefined) throw new Error('une unité attendue');
    const view = applyEvent(viewFromState(state), { type: 'unit_down', unit: unit.def.id }, 1);
    expect(view.flashes.at(-1)?.fx).toBe(`motes_${unit.def.element}`);
    const { container } = render(
      <Stage view={view} scene="ember_wastes" active={null} targets={new Set()} />,
    );
    expect(container.querySelector(`[data-unit="${unit.def.id}"]`)?.className).toContain(
      'actor--down',
    );
    expect(container.querySelector('.actor__fx--motes')).not.toBeNull();
  });
});
