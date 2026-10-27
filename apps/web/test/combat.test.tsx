import { createBattle, legalActions, step, type BattleEvent } from '@outlaw/engine';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/** Un combat complet joué au clic : lent sur les machines de CI (Windows surtout). */
const LONG_UI_TEST = 60_000;
import { CombatScreen } from '../src/combat/CombatScreen';
import { OptionsProvider } from '../src/game/options';
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
  it(
    'se joue entièrement à la souris jusqu’au résultat',
    async () => {
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
        const targets = document.querySelectorAll<HTMLButtonElement>('button.hitbox--target');
        if (targets.length > 0) await user.click(targets[0]!);
      }
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('heading')).toHaveTextContent(
        new RegExp(`${t('combat.result.victory')}|${t('combat.result.defeat')}`),
      );
    },
    LONG_UI_TEST,
  );

  it('cible, annulation au clavier et réserve affichée', async () => {
    const user = userEvent.setup();
    render(<CombatScreen setup={demoSetup()} onExit={() => undefined} />);
    expect(
      screen.getByRole('img', { name: t('combat.reserve', { points: 3, cap: 6 }) }),
    ).toBeInTheDocument();
    await user.keyboard('3');
    expect(screen.getByRole('status')).toHaveTextContent(names.spell('pyra_blaze'));
    expect(document.querySelectorAll('button.hitbox--target')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status')).toBeNull();
    // Intention ennemie annoncée.
    expect(screen.getAllByText(/→ Pyra/).length).toBeGreaterThan(0);
  });
});

describe('combat automatique', () => {
  const autoButton = (): HTMLElement => screen.getByRole('button', { name: t('combat.auto') });
  const options = (): unknown =>
    JSON.parse(window.localStorage.getItem('outlaw-thesis/options') ?? '{}');

  it(
    'le bouton Auto mène le combat jusqu’au résultat sans autre clic',
    async () => {
      const user = userEvent.setup();
      render(
        <OptionsProvider>
          <CombatScreen setup={demoSetup()} onExit={() => undefined} />
        </OptionsProvider>,
      );
      expect(autoButton()).toHaveAttribute('aria-pressed', 'false');
      await user.click(autoButton());
      expect(autoButton()).toHaveAttribute('aria-pressed', 'true');
      expect(options()).toMatchObject({ auto: true });
      const dialog = await screen.findByRole('dialog', {}, { timeout: 20_000 });
      expect(within(dialog).getByRole('heading')).toHaveTextContent(
        new RegExp(`${t('combat.result.victory')}|${t('combat.result.defeat')}`),
      );
    },
    LONG_UI_TEST,
  );

  it('la touche A bascule le mode, sorts verrouillés tant qu’il est actif', async () => {
    window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'normal' }));
    const user = userEvent.setup();
    render(
      <OptionsProvider>
        <CombatScreen setup={demoSetup()} onExit={() => undefined} />
      </OptionsProvider>,
    );
    // À vitesse normale, l'ouverture du combat s'anime avant le premier tour.
    await screen.findByRole('region', { name: /Au tour de/ }, { timeout: 8000 });
    const spells = (): HTMLButtonElement[] =>
      within(screen.getByRole('region', { name: /Au tour de/ }))
        .getAllByRole('button')
        .filter((b) => b.classList.contains('spell')) as HTMLButtonElement[];
    expect(spells().some((b) => !b.disabled)).toBe(true);
    await user.keyboard('a');
    expect(autoButton()).toHaveAttribute('aria-pressed', 'true');
    expect(spells().every((b) => b.disabled)).toBe(true);
    // Les touches de sort sont sans effet pendant le mode auto.
    await user.keyboard('1');
    expect(screen.queryByRole('status')).toBeNull();
    await user.keyboard('A');
    expect(autoButton()).toHaveAttribute('aria-pressed', 'false');
    expect(options()).toMatchObject({ auto: false });
    expect(spells().some((b) => !b.disabled)).toBe(true);
  });

  it('la pause suspend le mode auto, la reprise le relance', async () => {
    window.localStorage.setItem(
      'outlaw-thesis/options',
      JSON.stringify({ speed: 'normal', auto: true }),
    );
    const user = userEvent.setup();
    render(
      <OptionsProvider>
        <CombatScreen setup={demoSetup()} onExit={() => undefined} />
      </OptionsProvider>,
    );
    // En pause dès l'ouverture : l'animation d'entrée finit, mais Auto ne doit rien jouer.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: t('combat.pause') })).toBeInTheDocument();
    await screen.findByRole('region', { name: /Au tour de/ }, { timeout: 8000 });
    const reserve = (): string =>
      screen.getByRole('img', { name: /Réserve/ }).getAttribute('aria-label') ?? '';
    const before = reserve();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(reserve()).toBe(before);
    expect(screen.getByRole('region', { name: /Au tour de/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('combat.resume') }));
    await waitFor(
      () => {
        expect(reserve()).not.toBe(before);
      },
      { timeout: 8000 },
    );
  });
});
