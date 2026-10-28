import { newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t, tk } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const rules = content.balance.awakening;

describe('sanctuaires d’essence et éveil', () => {
  it('depuis la carte : verrouillés, puis ouverts, palier I et entrée au combat', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <App version="test" initial={newProfile(content, 3)} start={{ name: 'map' }} />,
    );
    await user.click(screen.getByRole('button', { name: new RegExp(t('essence.open')) }));
    expect(screen.getByText(new RegExp(names.dungeon(rules.openAfter)))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(t('essence.fight')) })).toBeNull();
    unmount();

    const opened = {
      ...newProfile(content, 3),
      dungeons: { [rules.openAfter]: { clears: 1, dry: 0, tier: 2 } },
    };
    render(<App version="test" initial={opened} start={{ name: 'essences' }} />);
    await user.click(screen.getByRole('button', { name: new RegExp(tk('essence.name.water')) }));
    const panel = screen.getByRole('region', { name: tk('essence.name.water') });
    expect(within(panel).getByText(names.enemy('tidal_hydra'))).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(tk('essence.quality.1')))).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: new RegExp(t('essence.fight')) }));
    expect(
      await screen.findByText(t('essence.run', { dungeon: tk('essence.name.water'), n: 1 })),
    ).toBeInTheDocument();
  });

  it('fiche du héros : onglet Éveil, paiement, badge « Éveillé »', async () => {
    const user = userEvent.setup();
    const base = newProfile(content, 3);
    const profile = {
      ...base,
      gold: rules.cost.gold,
      essences: { ...base.essences, fire: [...rules.cost.essences] as [number, number, number] },
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: rules.minLevel, stars: 1 } },
    };
    render(<App version="test" initial={profile} start={{ name: 'hero', id: 'pyra' }} />);
    expect(screen.queryByText(t('awakening.badge'))).toBeNull();
    await user.click(screen.getByRole('tab', { name: new RegExp(t('awakening.title')) }));
    await user.click(screen.getByRole('button', { name: t('awakening.buy') }));
    expect(screen.getAllByText(t('awakening.badge')).length).toBeGreaterThan(0);
    expect(screen.getByText(t('awakening.done'))).toBeInTheDocument();
  });
});
