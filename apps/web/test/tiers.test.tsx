import type { Profile } from '@outlaw/data';
import { newProfile, tierLevel, tierNumeral, type DungeonReport } from '@outlaw/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { GameContext } from '../src/game/nav';
import { dungeonTitle, names, t } from '../src/i18n';
import { ProfileProvider } from '../src/state/profile';
import { Rewards } from '../src/screens/Rewards';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const ember = content.dungeonById.get('ember_wastes')!;
const tierName = (k: number, state: string): string =>
  t('tier.state', { name: t('tier.name', { tier: tierNumeral(k) }), state });

/** Landes terminées une fois : palier I terminé, palier II ouvert, palier III verrouillé. */
function cleared(): Profile {
  return {
    ...newProfile(content, 3),
    dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 2 } },
  };
}

describe('carte : paliers de donjon', () => {
  it('propose les paliers ouverts, verrouille les autres et annonce le niveau du palier', async () => {
    const user = userEvent.setup();
    render(
      <App version="test" initial={cleared()} start={{ name: 'map', dungeon: 'ember_wastes' }} />,
    );
    const one = screen.getByRole('button', { name: tierName(1, t('tier.cleared')) });
    const two = screen.getByRole('button', { name: tierName(2, t('tier.open')) });
    const three = screen.getByRole('button', { name: tierName(3, t('map.locked')) });
    expect(three).toBeDisabled();
    // Le palier le plus haut ouvert est choisi d'office.
    expect(two).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(t('hub.dungeon.recommended', { level: tierLevel(content, ember, 2) })),
    ).toBeInTheDocument();
    expect(screen.getByText(/or \+25\s%/)).toBeInTheDocument();

    await user.click(one);
    expect(one).toHaveAttribute('aria-pressed', 'true');
    // Le texte du palier et les chances de coffre, qui suivent la difficulté du palier.
    expect(screen.getByText(new RegExp(t('tier.base').replace('.', '\\.')))).toHaveTextContent(
      /Coffre : .*bronze\s\d+\s%/,
    );
    expect(
      screen.getByText(t('hub.dungeon.recommended', { level: ember.recommendedLevel })),
    ).toBeInTheDocument();

    // Le palier choisi suit jusqu'à l'équipe, puis au donjon (titre de la salle).
    await user.click(two);
    await user.click(screen.getByRole('button', { name: new RegExp(t('map.prepare')) }));
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(t('team.go', { dungeon: dungeonTitle('ember_wastes', 2) })),
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      t('run.room', { dungeon: dungeonTitle('ember_wastes', 2), n: 1 }),
    );
  });

  it('un donjon jamais terminé n’a que le palier I ; un donjon verrouillé n’en montre aucun', () => {
    render(
      <App
        version="test"
        initial={newProfile(content, 3)}
        start={{ name: 'map', dungeon: 'ember_wastes' }}
      />,
    );
    expect(screen.getByRole('button', { name: tierName(1, t('tier.open')) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: tierName(2, t('map.locked')) })).toBeDisabled();
  });

  it('les récompenses annoncent le palier joué et le palier ouvert', () => {
    const report: DungeonReport = {
      dungeon: 'ember_wastes',
      tier: 2,
      tierUnlocked: 3,
      firstClear: true,
      xp: { pyra: { gained: 40, ready: false } },
      gold: 120,
      materials: { tier: 1, amount: 6 },
      item: {
        uid: 1,
        item: 'ember_charm',
        guaranteed: false,
        isNew: true,
        copies: 0,
        salvaged: null,
      },
      mastery: { rank: 0, rankUp: false, clears: 2, next: 5 },
      unlockedHero: null,
      chest: 'silver',
    };
    render(
      <GameContext.Provider
        value={{ go: vi.fn(), openOptions: vi.fn(), toggleTestMode: vi.fn(), version: 'test' }}
      >
        <ProfileProvider initial={cleared()} persist={false}>
          <Rewards report={report} onContinue={vi.fn()} onReplay={vi.fn()} />
        </ProfileProvider>
      </GameContext.Provider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      t('reward.title', { dungeon: `${names.dungeon('ember_wastes')} II` }),
    );
    expect(screen.getByText(t('reward.tierUnlocked', { tier: 'III' }))).toBeInTheDocument();
  });
});
