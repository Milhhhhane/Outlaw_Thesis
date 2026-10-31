import { awakenStatus, newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { awakenMissingText } from '../src/screens/HeroSheet';
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

  it('cas signalé : niveau atteint, essences manquantes dites en clair, où les gagner', async () => {
    const user = userEvent.setup();
    const base = newProfile(content, 3);
    const profile = {
      ...base,
      gold: 31185,
      dungeons: { [rules.openAfter]: { clears: 1, dry: 0, tier: 2 } },
      essences: { ...base.essences, nature: [6, 0, 0] as [number, number, number] },
      essenceDungeons: { essence_nature: { clears: 2, tier: 2 } },
      heroes: { ...base.heroes, ronce: { ...base.heroes.ronce!, level: rules.minLevel } },
    };
    render(<App version="test" initial={profile} start={{ name: 'hero', id: 'ronce' }} />);
    await user.click(screen.getByRole('tab', { name: new RegExp(t('awakening.title')) }));
    const [low, mid, high] = rules.cost.essences;
    const reason = `Il vous manque ${String(low - 6)} essences faibles, ${String(mid)} moyennes et ${String(high)} supérieures de nature.`;
    expect(screen.getByText(reason)).toBeInTheDocument();
    const buy = screen.getByRole('button', { name: t('awakening.buy') });
    expect(buy).toBeDisabled();
    expect(buy).toHaveAccessibleDescription(reason);
    expect(buy).toHaveAttribute('title', reason);
    expect(screen.queryByText(/Possible au niveau/)).toBeNull();
    expect(screen.queryByText(/Vous avez 6 \/ 0 \/ 0/)).toBeNull();

    const table = screen.getByRole('table', { name: /essences de nature/ });
    const row = (name: RegExp) => within(table).getByRole('row', { name });
    expect(row(/^Niveau/)).toHaveTextContent(
      `${String(rules.minLevel)} / ${String(rules.minLevel)}`,
    );
    expect(row(/^Niveau/)).toHaveTextContent('atteint');
    expect(row(/^Essences faibles/)).toHaveTextContent(`6 / ${String(low)}`);
    expect(row(/^Essences faibles/)).toHaveTextContent(`manque ${String(low - 6)}`);
    expect(row(/^Essences faibles/)).toHaveTextContent(
      `palier I : ${String(rules.drops[0])} par victoire`,
    );
    expect(row(/^Essences moyennes/)).toHaveTextContent(`manque ${String(mid)}`);
    expect(row(/^Essences moyennes/)).not.toHaveTextContent('fermé');
    expect(row(/^Essences supérieures/)).toHaveTextContent('palier III');
    expect(row(/^Essences supérieures/)).toHaveTextContent('fermé, gagnez le palier II');
    expect(row(/^Or/)).toHaveTextContent('31185 / 1000');
    expect(row(/^Or/)).toHaveTextContent('suffisant');
    expect(screen.getByText(new RegExp(tk('essence.name.nature')))).toBeInTheDocument();
  });

  it('raison du refus : niveau, une seule essence (singulier) et or ; vide si rien ne manque', () => {
    const base = newProfile(content, 3);
    const [low, mid, high] = rules.cost.essences;
    const short = {
      ...base,
      gold: 10,
      essences: { ...base.essences, fire: [low, mid, high - 1] as [number, number, number] },
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 15 } },
    };
    expect(awakenMissingText(awakenStatus(content, short, 'pyra')!)).toBe(
      `Niveau ${String(rules.minLevel)} requis : le héros est niveau 15. ` +
        'Il vous manque 1 essence supérieure de feu. ' +
        `Il vous manque ${String(rules.cost.gold - 10)} or.`,
    );
    const ready = {
      ...short,
      gold: rules.cost.gold,
      essences: { ...short.essences, fire: [...rules.cost.essences] as [number, number, number] },
      heroes: { ...short.heroes, pyra: { ...short.heroes.pyra, level: rules.minLevel } },
    };
    expect(awakenMissingText(awakenStatus(content, ready, 'pyra')!)).toBe('');
  });

  it('sanctuaires fermés : dit une fois quel donjon les ouvre', async () => {
    const user = userEvent.setup();
    render(
      <App version="test" initial={newProfile(content, 3)} start={{ name: 'hero', id: 'pyra' }} />,
    );
    await user.click(screen.getByRole('tab', { name: new RegExp(t('awakening.title')) }));
    expect(
      screen.getByText(
        new RegExp(t('awakening.where.locked', { dungeon: names.dungeon(rules.openAfter) })),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Niveau \d+ requis : le héros est niveau 1\./)).toBeInTheDocument();
  });
});
