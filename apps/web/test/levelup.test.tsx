import type { Profile } from '@outlaw/data';
import { goldToNext, levelUpCost, newProfile, xpToNext } from '@outlaw/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { dustName, names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

function saved(): Profile {
  return (
    JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as { profile: Profile }
  ).profile;
}

/** Pyra avec l'XP de deux niveaux en banque (et 100 or, de quoi payer les deux par défaut). */
function banked(materials: Profile['materials'], gold = 100): Profile {
  const profile = newProfile(content, 3);
  const pyra = profile.heroes.pyra!;
  return {
    ...profile,
    gold,
    materials,
    heroes: {
      ...profile.heroes,
      pyra: { ...pyra, xp: xpToNext(1, content) + xpToNext(2, content) },
    },
  };
}

describe('monter de niveau', () => {
  it('la fiche affiche le coût, monte d’un niveau puis au maximum', async () => {
    const user = userEvent.setup();
    render(
      <App version="test" initial={banked([10, 0, 0])} start={{ name: 'hero', id: 'pyra' }} />,
    );
    expect(
      screen.getByText(
        t('hero.levelUp.cost', {
          level: 2,
          xp: 40,
          dust: t('dust.amount', { amount: 2, dust: dustName(1) }),
          gold: goldToNext(1, content),
        }),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('hero.levelUp') }));
    expect(screen.getByText(t('hero.level', { level: 2 }), { exact: false })).toBeInTheDocument();
    expect(saved().materials).toEqual([8, 0, 0]);
    expect(saved().gold).toBe(100 - goldToNext(1, content));
    await user.click(screen.getByRole('button', { name: t('hero.levelUp.max') }));
    expect(screen.getByText(t('hero.level', { level: 3 }), { exact: false })).toBeInTheDocument();
    expect(saved().heroes.pyra).toMatchObject({ level: 3, xp: 0 });
    // Plus d'XP : le bouton reste, grisé, sans « au maximum ».
    expect(screen.getByRole('button', { name: t('hero.levelUp') })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t('hero.levelUp.max') })).toBeNull();
  });

  it('sans poussière, le bouton est grisé et la galerie ne signale rien', () => {
    render(<App version="test" initial={banked([0, 0, 0])} start={{ name: 'heroes' }} />);
    expect(screen.queryByText(t('hero.levelUp.ready'))).toBeNull();
  });

  it('XP en banque au-delà du niveau : la barre reste pleine et la poussière manquante est dite', () => {
    const { container } = render(
      <App version="test" initial={banked([1, 0, 0])} start={{ name: 'hero', id: 'pyra' }} />,
    );
    const fill = container.querySelector<HTMLElement>('.sheet__xp span');
    expect(fill?.style.width).toBe('100%');
    expect(
      screen.getByText(t('hero.levelUp.missingDust', { dust: dustName(1), have: 1, need: 2 })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('hero.levelUp') })).toBeDisabled();
  });

  it('XP et poussière sans l’or : le coût en or est affiché, l’or manquant dit, le bouton grisé', () => {
    const need = levelUpCost(content, banked([10, 0, 0]).heroes.pyra!)!.gold;
    expect(need).toBeGreaterThan(0);
    render(
      <App
        version="test"
        initial={banked([10, 0, 0], need - 1)}
        start={{ name: 'hero', id: 'pyra' }}
      />,
    );
    expect(
      screen.getByText(
        t('hero.levelUp.cost', {
          level: 2,
          xp: 40,
          dust: t('dust.amount', { amount: 2, dust: dustName(1) }),
          gold: need,
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('hero.levelUp.missingGold', { have: need - 1, need })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('hero.levelUp') })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t('hero.levelUp.max') })).toBeNull();
  });

  it('fiche au plafond : l’étoile affiche son or et reste grisée sans lui', async () => {
    const user = userEvent.setup();
    const base = newProfile(content, 3);
    const level = content.balance.progression.levelsPerStar;
    const gold = content.balance.chests.starGold[0] ?? 0;
    const fragments = content.balance.chests.starCosts[0] ?? 0;
    const atGate = (coins: number): Profile => ({
      ...base,
      gold: coins,
      fragments: { pyra: fragments },
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level } },
    });
    const { unmount } = render(
      <App version="test" initial={atGate(gold - 1)} start={{ name: 'hero', id: 'pyra' }} />,
    );
    expect(
      screen.getByText(t('hero.gate.missingGold', { have: gold - 1, need: gold })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('hero.gate.buy') })).toBeDisabled();
    unmount();
    render(<App version="test" initial={atGate(gold)} start={{ name: 'hero', id: 'pyra' }} />);
    expect(screen.getByText(t('hero.gate.gold', { gold }))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('hero.gate.buy') }));
    expect(saved().gold).toBe(0);
    expect(saved().heroes.pyra).toMatchObject({ stars: 1 });
  });

  it('sans or, la galerie ne signale pas le niveau prêt', () => {
    render(<App version="test" initial={banked([10, 0, 0], 0)} start={{ name: 'heroes' }} />);
    expect(screen.queryByText(t('hero.levelUp.ready'))).toBeNull();
  });

  it('avec de quoi payer, la galerie signale le niveau prêt', () => {
    render(<App version="test" initial={banked([10, 0, 0])} start={{ name: 'heroes' }} />);
    const card = screen.getByRole('button', { name: new RegExp(`^${names.hero('pyra')}`) });
    expect(card).toHaveTextContent(t('hero.levelUp.ready'));
  });
});
