import type { Profile } from '@outlaw/data';
import { compileEncounter, compileTeam, newProfile, type BattleSetup } from '@outlaw/engine';
import type * as Engine from '@outlaw/engine';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Un donjon entier joué par Auto : lent sur les machines de CI (Windows surtout). */
const LONG_UI_TEST = 90_000;

// L'énergie se refuse à la demande : `enterDungeon` est la règle du moteur, l'interface l'écoute.
const energy = vi.hoisted(() => ({ ok: true }));
vi.mock('@outlaw/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof Engine>();
  return {
    ...engine,
    enterDungeon: (...args: Parameters<typeof engine.enterDungeon>) =>
      energy.ok
        ? engine.enterDungeon(...args)
        : { ok: false as const, reason: 'no_energy' as const },
    // La série demande aussi l'entrée au moteur (`seriesNext` appelle `enterDungeon` en interne).
    seriesNext: (...args: Parameters<typeof engine.seriesNext>) =>
      energy.ok ? engine.seriesNext(...args) : ('no_energy' as const),
  };
});

import { App } from '../src/App';
import { CombatScreen } from '../src/combat/CombatScreen';
import { content, DEMO_ENEMIES, demoSetup } from '../src/combat/session';
import { Countdown } from '../src/game/Countdown';
import { OptionsProvider } from '../src/game/options';
import { names, t } from '../src/i18n';

const autoOptions = (): void => {
  window.localStorage.setItem(
    'outlaw-thesis/options',
    JSON.stringify({ speed: 'fast', auto: true }),
  );
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
};

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  energy.ok = true;
});

describe('décompte', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const label = (s: number): string => `Suite dans ${s} s`;

  it('descend de 5 à 1 chaque seconde, puis appelle la suite une seule fois', () => {
    const done = vi.fn();
    render(<Countdown enabled text={label} onDone={done} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Suite dans 5 s');
    for (const s of [4, 3, 2, 1]) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(status).toHaveTextContent(`Suite dans ${s} s`);
      expect(done).not.toHaveBeenCalled();
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('« Continuer maintenant » n’attend pas, sans compter comme une interruption', () => {
    const done = vi.fn();
    render(<Countdown enabled text={label} onDone={done} />);
    const now = screen.getByRole('button', { name: t('combat.auto.now') });
    fireEvent.pointerDown(now);
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(now);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('toute touche ou tout clic ailleurs l’interrompt pour de bon', () => {
    const done = vi.fn();
    render(<Countdown enabled text={label} onDone={done} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyDown(window, { key: 'Shift' });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(done).not.toHaveBeenCalled();

    const other = vi.fn();
    render(<Countdown enabled text={label} onDone={other} />);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(other).not.toHaveBeenCalled();
  });

  it('ne court pas quand il est désactivé', () => {
    const done = vi.fn();
    render(<Countdown enabled={false} text={label} onDone={done} />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(done).not.toHaveBeenCalled();
  });
});

/** Héros niveau 1 contre des ennemis de niveau 30 à l'ATK quintuplée : défaite assurée. */
function lostSetup(): BattleSetup {
  const demo = demoSetup();
  return {
    units: [
      ...demo.units.filter((u) => u.side === 'player'),
      ...compileEncounter(content, [...DEMO_ENEMIES], 30, undefined, 100, 500),
    ],
  };
}

describe('fin de combat en mode Auto', () => {
  it(
    'une victoire enchaîne seule après le décompte, une touche l’interrompt',
    async () => {
      autoOptions();
      const onClick = vi.fn();
      render(
        <OptionsProvider>
          <CombatScreen
            setup={{
              units: [
                ...compileTeam(
                  content,
                  ['pyra', 'maree', 'ronce'].map((hero) => ({
                    hero,
                    level: 30,
                    talents: [],
                    items: [],
                  })),
                ),
                ...compileEncounter(content, [DEMO_ENEMIES[0]], 1),
              ],
            }}
            onExit={() => undefined}
            finish={{ label: () => 'Suite', onClick, last: false }}
          />
        </OptionsProvider>,
      );
      const dialog = await screen.findByRole('dialog', {}, { timeout: 20_000 });
      expect(within(dialog).getByRole('heading')).toHaveTextContent(t('combat.result.victory'));
      const status = within(dialog).getByRole('status');
      expect(status).toHaveTextContent(t('combat.auto.next', { s: 5 }));
      // Le décompte avance, puis une touche rend la main : il disparaît, rien ne se passe.
      await screen.findByText(t('combat.auto.next', { s: 4 }), {}, { timeout: 3000 });
      fireEvent.keyDown(window, { key: 'Shift' });
      expect(within(dialog).queryByRole('status')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(onClick).not.toHaveBeenCalled();
      // Auto reste coché : le bouton de fin fait la suite au clic.
      expect(screen.getByRole('button', { name: t('combat.auto') })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Suite' }));
      expect(onClick).toHaveBeenCalledWith(true);
    },
    LONG_UI_TEST,
  );

  it(
    'une défaite arrête l’enchaînement : aucun décompte',
    async () => {
      autoOptions();
      const onClick = vi.fn();
      render(
        <OptionsProvider>
          <CombatScreen
            setup={lostSetup()}
            onExit={() => undefined}
            finish={{ label: () => 'Retour', onClick, last: false }}
          />
        </OptionsProvider>,
      );
      const dialog = await screen.findByRole('dialog', {}, { timeout: 20_000 });
      expect(within(dialog).getByRole('heading')).toHaveTextContent(t('combat.result.defeat'));
      expect(within(dialog).queryByRole('status')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(onClick).not.toHaveBeenCalled();
    },
    LONG_UI_TEST,
  );
});

function strongProfile(): Profile {
  const profile = newProfile(content, 9);
  return {
    ...profile,
    heroes: Object.fromEntries(
      Object.entries(profile.heroes).map(([id, h]) => [id, { ...h, level: 30 }]),
    ),
  };
}

/** Auto joue le donjon ; chaque salle gagnée est passée tout de suite par « Continuer maintenant ». */
async function autoDungeon(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let room = 1; room <= 3; room++) {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`combat ${room} sur 3`);
    const dialog = await screen.findByRole('dialog', {}, { timeout: 30_000 });
    expect(within(dialog).getByRole('heading')).toHaveTextContent(t('combat.result.victory'));
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      t(room === 3 ? 'combat.auto.claim' : 'combat.auto.next', { s: 5 }),
    );
    await user.click(within(dialog).getByRole('button', { name: t('combat.auto.now') }));
  }
}

describe('fin de donjon en mode Auto', () => {
  it(
    'dans une série, les récompenses relancent le même donjon (décompte, « Continuer maintenant »)',
    async () => {
      autoOptions();
      const user = userEvent.setup();
      render(
        <App
          version="test"
          initial={strongProfile()}
          start={{ name: 'dungeon', id: 'ember_wastes', runs: 3 }}
        />,
      );
      await autoDungeon(user);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('reward.title', { dungeon: names.dungeon('ember_wastes') }),
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        t('farm.next.countdown', { s: 5, k: 2 }),
      );
      await user.click(screen.getByRole('button', { name: t('combat.auto.now') }));
      // Même donjon, même équipe : le passage suivant commence.
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('combat 1 sur 3');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.pass', { k: 2, n: 3 }),
      );
      expect(screen.getByRole('button', { name: t('combat.auto') })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    },
    LONG_UI_TEST,
  );

  it(
    'un seul passage : pas de relance, même en Auto',
    async () => {
      autoOptions();
      const user = userEvent.setup();
      render(
        <App
          version="test"
          initial={strongProfile()}
          start={{ name: 'dungeon', id: 'ember_wastes' }}
        />,
      );
      await autoDungeon(user);
      expect(screen.getByRole('button', { name: t('reward.replay.button') })).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(screen.getByRole('button', { name: t('reward.continue') })).toBeInTheDocument();
    },
    LONG_UI_TEST,
  );

  it(
    'sans énergie, la série s’arrête : le décompte mène au bilan',
    async () => {
      autoOptions();
      energy.ok = false;
      const user = userEvent.setup();
      render(
        <App
          version="test"
          initial={strongProfile()}
          start={{ name: 'dungeon', id: 'ember_wastes', runs: 5 }}
        />,
      );
      await autoDungeon(user);
      expect(screen.getByText(new RegExp(t('farm.stop.no_energy')))).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: t('farm.next') })).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(t('farm.recap.countdown', { s: 5 }));
      await user.click(screen.getByRole('button', { name: t('combat.auto.now') }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.recap.title', { dungeon: names.dungeon('ember_wastes') }),
      );
      expect(screen.getByText(t('farm.stop.no_energy'))).toBeInTheDocument();
      expect(screen.getByText(t('farm.recap.wins', { n: 1 }))).toBeInTheDocument();
    },
    LONG_UI_TEST,
  );
});
