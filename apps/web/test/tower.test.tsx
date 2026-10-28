import { newProfile, towerFloor, towerReward } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { dustName, names, t, tk } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const floorName = (n: number, state: string): string =>
  t('tower.floorState', { name: t('tower.floor', { n }), state: tk(`tower.state.${state}`) });

describe('tour à étages', () => {
  it('colonne des étages, étage courant, ennemis annoncés, récompense et entrée au combat', async () => {
    const user = userEvent.setup();
    const profile = { ...newProfile(content, 3), tower: { cleared: 9 } };
    render(<App version="test" initial={profile} start={{ name: 'hub' }} />);
    await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.tower')) }));

    expect(
      screen.getByText(t('tower.best', { n: 9, max: content.balance.tower.floors })),
    ).toBeInTheDocument();
    // L'étage suivant (un boss) est choisi d'office ; les battus et les verrouillés sont annoncés.
    const ten = screen.getByRole('button', { name: floorName(10, 'next') });
    expect(ten).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: floorName(9, 'cleared') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: floorName(11, 'locked') })).toBeInTheDocument();
    const boss = towerFloor(content, 10)!;
    const panel = screen.getByRole('region', { name: t('tower.floor', { n: 10 }) });
    for (const id of boss.enemies)
      expect(within(panel).getAllByText(names.enemy(id)).length).toBeGreaterThan(0);
    const reward = towerReward(content, 10);
    expect(
      within(panel).getByText(new RegExp(dustName(reward.materials.tier))),
    ).toBeInTheDocument();
    expect(within(panel).getByText(tk(`chest.tier.${reward.chest!}`))).toBeInTheDocument();

    // Un étage battu se rejoue sans récompense ; un étage verrouillé ne se combat pas.
    await user.click(screen.getByRole('button', { name: floorName(9, 'cleared') }));
    expect(screen.getByText(t('tower.replay'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: floorName(11, 'locked') }));
    expect(screen.queryByRole('button', { name: new RegExp(t('tower.fight')) })).toBeNull();
    expect(screen.getByText(t('tower.locked', { n: 10 }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: floorName(10, 'next') }));
    await user.click(screen.getByRole('button', { name: new RegExp(t('tower.fight')) }));
    expect(await screen.findByText(t('tower.run', { n: 10 }))).toBeInTheDocument();
  });
});
