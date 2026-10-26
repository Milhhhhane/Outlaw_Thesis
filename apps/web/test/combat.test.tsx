import { createBattle, legalActions, step, type BattleEvent } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CombatScreen } from '../src/combat/CombatScreen';
import { content, demoSetup } from '../src/combat/session';
import { applyEvent, viewFromState, type BattleView } from '../src/combat/view';
import { names, t } from '../src/i18n';

describe('vue rejouée', () => {
  it('rejouer le journal mène exactement à l’état du moteur', () => {
    const setup = demoSetup();
    const created = createBattle(setup, content.balance);
    let state = created.state;
    const events: BattleEvent[] = [...created.events];
    while (state.result === null) {
      const next = step(state, legalActions(state)[0]!);
      state = next.state;
      events.push(...next.events);
    }
    const start = viewFromState(created.state);
    let view: BattleView = {
      ...start,
      units: start.units.map((u) => ({ ...u, hp: u.maxHp, shield: 0, alive: true, statuses: [] })),
      points: { player: 3, enemy: 3 },
    };
    events.forEach((event, i) => {
      view = applyEvent(view, event, i);
    });
    const truth = viewFromState(state);
    expect(view.units.map((u) => [u.id, u.hp, u.shield, u.alive])).toEqual(
      truth.units.map((u) => [u.id, u.hp, u.shield, u.alive]),
    );
    expect(view.points).toEqual(truth.points);
  });
});

describe('écran de combat', () => {
  it('se joue entièrement à la souris jusqu’au résultat', async () => {
    const user = userEvent.setup();
    render(<CombatScreen setup={demoSetup()} onExit={() => undefined} />);
    for (let turn = 0; turn < 200; turn++) {
      if (screen.queryByRole('dialog') !== null) break;
      const actions = screen.getByRole('region', { name: /Au tour de/ });
      const spells = within(actions)
        .getAllByRole('button')
        .filter((b) => !(b as HTMLButtonElement).disabled);
      // Le sort le plus cher possible, sinon l'attaque de base.
      await user.click(spells.at(-1)!);
      const targets = document.querySelectorAll<HTMLButtonElement>('button.unit--targetable');
      if (targets.length > 0) await user.click(targets[0]!);
    }
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading')).toHaveTextContent(
      new RegExp(`${t('combat.result.victory')}|${t('combat.result.defeat')}`),
    );
  });

  it('cible, annulation au clavier et réserve affichée', async () => {
    const user = userEvent.setup();
    render(<CombatScreen setup={demoSetup()} onExit={() => undefined} />);
    expect(
      screen.getByRole('img', { name: t('combat.reserve', { points: 3, cap: 6 }) }),
    ).toBeInTheDocument();
    await user.keyboard('3');
    expect(screen.getByRole('status')).toHaveTextContent(names.spell('pyra_blaze'));
    expect(document.querySelectorAll('button.unit--targetable')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status')).toBeNull();
    // Intention ennemie annoncée.
    expect(screen.getAllByText(/sur Pyra/).length).toBeGreaterThan(0);
  });
});
