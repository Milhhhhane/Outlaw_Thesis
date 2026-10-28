import type { Profile } from '@outlaw/data';
import { chestCount, newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t, tk } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  // Sans animation : le coffre s'ouvre tout de suite, les tests n'attendent aucune minuterie.
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

/** Profil neuf, complété. `ressac` n'est pas dans le camp au départ (il ouvre l'invocation). */
function withStock(patch: Partial<Profile>): Profile {
  return { ...newProfile(content, 11), ...patch };
}

function row(hero: string): HTMLElement {
  const item = screen.getByText(names.hero(hero), { selector: '.frag-row__name' }).closest('li');
  if (item === null) throw new Error(`ligne de ${hero} introuvable`);
  return item;
}

describe('écran des coffres', () => {
  it('le camp affiche le nombre de coffres à ouvrir et mène à l’écran', async () => {
    const user = userEvent.setup();
    render(
      <App
        version="test"
        initial={withStock({ chests: { bronze: 2, gold: 1 } })}
        start={{ name: 'hub' }}
      />,
    );
    const entry = screen.getByRole('button', { name: new RegExp(t('hub.menu.chests')) });
    expect(entry).toHaveTextContent('3');
    await user.click(entry);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('chests.title'));
  });

  it('ouvre un coffre : fragments répartis, coffre consommé, ouverture rejouable', async () => {
    const user = userEvent.setup();
    const initial = withStock({ chests: { bronze: 2 } });
    render(<App version="test" initial={initial} start={{ name: 'chests' }} />);

    await user.click(screen.getAllByRole('button', { name: t('chests.open') })[0]!);
    const dialog = screen.getByRole('dialog', { name: tk('chest.tier.bronze') });
    const size = content.balance.chests.tiers.find((tier) => tier.id === 'bronze')!.fragments;
    expect(within(dialog).getByText(t('chests.reveal.total', { n: size }))).toBeInTheDocument();
    // Le total des « +n » affichés est exactement la taille du coffre.
    const gains = within(dialog)
      .getAllByText(/^\+\d+$/)
      .map((el) => Number(el.textContent.slice(1)));
    expect(gains.reduce((a, b) => a + b, 0)).toBe(size);

    // Il en reste un : on peut l'ouvrir d'un clic depuis la fenêtre.
    await user.click(
      within(dialog).getByRole('button', { name: t('chests.reveal.again', { n: 1 }) }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // La croix et le bouton portent le même nom : le bouton d'action est le dernier.
    await user.click(screen.getAllByRole('button', { name: t('chests.reveal.close') }).at(-1)!);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Plus aucun coffre : le bouton est inactif et l'écran explique comment en gagner.
    for (const button of screen.getAllByRole('button', { name: t('chests.open') })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(t('chests.empty'))).toBeInTheDocument();
  });

  it('invoque un héros avec ses fragments, pas avant', async () => {
    const user = userEvent.setup();
    const cost = content.balance.chests.summonCost;
    const initial = withStock({ fragments: { ressac: cost, seve: cost - 1 } });
    expect(initial.unlocked).not.toContain('ressac');
    render(<App version="test" initial={initial} start={{ name: 'chests' }} />);

    const summon = (hero: string) =>
      within(row(hero)).getByRole('button', { name: t('chests.summon') });
    expect(summon('seve')).toBeDisabled();
    // Un héros déjà dans le camp n'a pas de bouton d'invocation.
    expect(within(row('ronce')).queryByRole('button', { name: t('chests.summon') })).toBeNull();

    await user.click(summon('ressac'));
    expect(within(row('ressac')).queryByRole('button', { name: t('chests.summon') })).toBeNull();
    expect(within(row('ressac')).getByText(/Niveau 1/)).toBeInTheDocument();
    const star = content.balance.chests.starCosts[0] ?? 0;
    expect(within(row('ressac')).getByText(`0 / ${String(star)}`)).toBeInTheDocument();
  });

  it('cible un héros et le retire d’un second clic', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={withStock({})} start={{ name: 'chests' }} />);
    expect(screen.getByText(t('chests.target.none'))).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: t('chests.target.set', { hero: names.hero('pyra') }) }),
    );
    expect(within(row('pyra')).getByText(t('chests.target.badge'))).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: t('chests.target.on', { hero: names.hero('pyra') }) }),
    );
    expect(screen.getByText(t('chests.target.none'))).toBeInTheDocument();
  });

  it('au plafond de niveau : l’étoile coûte des fragments, puis le plafond monte', async () => {
    const user = userEvent.setup();
    const base = newProfile(content, 11);
    const cost = content.balance.chests.starCosts[0] ?? 0;
    const cap = content.balance.progression.levelsPerStar;
    const initial: Profile = {
      ...base,
      fragments: { pyra: cost },
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: cap, xp: 0 } },
    };
    render(<App version="test" initial={initial} start={{ name: 'chests' }} />);

    expect(
      within(row('pyra')).getByText(t('chests.hero.gate', { level: cap })),
    ).toBeInTheDocument();
    await user.click(within(row('pyra')).getByRole('button', { name: t('chests.star') }));
    expect(within(row('pyra')).getByText(/étoiles 1 \//)).toBeInTheDocument();
    expect(within(row('pyra')).queryByRole('button', { name: t('chests.star') })).toBeNull();
  });
});

describe('chestCount', () => {
  it('additionne tous les paliers', () => {
    expect(chestCount(withStock({ chests: { bronze: 1, silver: 2, gold: 3 } }))).toBe(6);
  });
});
