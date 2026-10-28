import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { renderCredits } from '../src/screens/Credits';
import { t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

describe('écran-titre et camp', () => {
  it('titre, nouvelle partie, camp, combat d’essai et retour', async () => {
    const user = userEvent.setup();
    render(<App version="0.0.0" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Outlaw Thesis' })).toBeInTheDocument();
    expect(screen.getByText('Version 0.0.0')).toBeInTheDocument();
    // Aucune sauvegarde : pas de « Continuer », on joue en invité.
    expect(screen.queryByRole('button', { name: t('title.continue') })).toBeNull();
    await user.click(screen.getByRole('button', { name: t('account.guest') }));
    expect(screen.getByRole('heading', { level: 1, name: t('hub.title') })).toBeInTheDocument();
    expect(screen.getByText(t('hub.gold', { gold: 0 }))).toBeInTheDocument();
    for (const entry of ['hub.menu.dungeons', 'hub.menu.team', 'hub.menu.heroes'] as const) {
      expect(screen.getByRole('button', { name: new RegExp(t(entry)) })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: t('hub.demo') }));
    // En combat, Échap ouvre la pause, d'où l'on quitte.
    await user.keyboard('{Escape}');
    const pause = screen.getByRole('dialog', { name: t('combat.pause') });
    await user.click(within(pause).getByRole('button', { name: t('combat.quit') }));
    expect(screen.getByRole('heading', { level: 1, name: t('hub.title') })).toBeInTheDocument();
    // Échap : retour au menu principal, où la partie peut maintenant continuer.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: t('title.continue') })).toBeInTheDocument();
  });

  it('nouvelle partie sur une sauvegarde : confirmation demandée', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('outlaw-thesis/save', '{"version":1}');
    render(<App version="test" />);
    await user.click(screen.getByRole('button', { name: t('title.new') }));
    const dialog = screen.getByRole('dialog', { name: t('title.new') });
    await user.click(within(dialog).getByRole('button', { name: t('ui.cancel') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('options : vitesse et animations retenues sur l’appareil', async () => {
    const user = userEvent.setup();
    render(<App version="test" />);
    await user.click(screen.getByRole('button', { name: t('title.options') }));
    const dialog = screen.getByRole('dialog', { name: t('options.title') });
    await user.click(within(dialog).getByRole('radio', { name: t('options.speed.fast') }));
    await user.click(within(dialog).getByRole('radio', { name: t('options.animations.off') }));
    expect(JSON.parse(window.localStorage.getItem('outlaw-thesis/options') ?? '{}')).toEqual({
      speed: 'fast',
      animations: false,
      auto: false,
      towerClimb: false,
    });
    expect(document.documentElement.dataset.motion).toBe('off');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('crédits : le fichier des crédits est rendu', () => {
    const { container } = render(<>{renderCredits('# T\n\n## Polices\n\n- `a` : b [c](d)\n')}</>);
    expect(container.querySelector('h2')).toHaveTextContent('Polices');
    expect(container.querySelector('li')).toHaveTextContent('a : b c');
  });
});

describe('t', () => {
  it('remplace les paramètres et laisse les inconnus intacts', () => {
    expect(t('home.version', { version: '1.2.3' })).toBe('Version 1.2.3');
    expect(t('home.version')).toBe('Version {version}');
  });
});
