import { bossDifficulties, bossFight, bossUnlockDungeon, newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t, tk } from '../src/i18n';
import { formatDamage } from '../src/screens/Boss';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const difficultyName = (n: number, state: 'open' | 'locked'): string =>
  t('boss.difficultyState', {
    name: t('boss.difficulty', { n }),
    state: tk(`boss.state.${state}`),
  });

describe('boss de la semaine', () => {
  it('depuis la tour : boss et script, difficultés, paliers, tentatives, puis le combat', async () => {
    const user = userEvent.setup();
    const first = bossUnlockDungeon(content, 1)!;
    const profile = {
      ...newProfile(content, 3),
      dungeons: { [first]: { clears: 1, dry: 0, tier: 2 } },
    };
    render(<App version="test" initial={profile} start={{ name: 'hub' }} />);
    await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.tower')) }));
    await user.click(screen.getByRole('button', { name: new RegExp(t('boss.open')) }));

    const fight = bossFight(content, Date.now(), 1)!;
    expect(screen.getByRole('heading', { name: names.enemy(fight.enemy) })).toBeInTheDocument();
    // Difficulté 1 ouverte et choisie, les suivantes verrouillées avec le donjon qui les ouvre.
    const one = screen.getByRole('button', { name: difficultyName(1, 'open') });
    expect(one).toHaveAttribute('aria-pressed', 'true');
    const panel = screen.getByRole('region', { name: t('boss.difficulties') });
    for (const threshold of fight.thresholds)
      expect(
        // Le séparateur de milliers est une espace insécable fine : normalisée par la recherche.
        within(panel).getByText(
          t('boss.tier.damage', { n: formatDamage(threshold) }).replace(/\s/g, ' '),
        ),
      ).toBeInTheDocument();
    const max = content.balance.boss.attemptsPerDay;
    expect(
      within(panel).getByText(new RegExp(t('boss.attempts', { n: max, max }))),
    ).toBeInTheDocument();
    const last = bossDifficulties(content);
    await user.click(screen.getByRole('button', { name: difficultyName(last, 'locked') }));
    expect(
      screen.getByText(
        t('boss.unlock', { dungeon: names.dungeon(bossUnlockDungeon(content, last)!) }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(t('boss.fight')) })).toBeNull();

    await user.click(one);
    await user.click(screen.getByRole('button', { name: new RegExp(t('boss.fight')) }));
    expect(await screen.findByText(t('boss.run', { n: 1 }))).toBeInTheDocument();
  });
});
