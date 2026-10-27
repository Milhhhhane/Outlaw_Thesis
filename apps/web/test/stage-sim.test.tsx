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
