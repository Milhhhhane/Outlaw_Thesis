import type { Profile } from '@outlaw/data';
import { newProfile, xpToNext } from '@outlaw/engine';
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

/** Pyra avec l'XP de deux niveaux en banque. */
function banked(materials: Profile['materials']): Profile {
  const profile = newProfile(content, 3);
  const pyra = profile.heroes.pyra!;
  return {
    ...profile,
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
        }),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('hero.levelUp') }));
    expect(screen.getByText(t('hero.level', { level: 2 }), { exact: false })).toBeInTheDocument();
    expect(saved().materials).toEqual([8, 0, 0]);
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

  it('avec de quoi payer, la galerie signale le niveau prêt', () => {
    render(<App version="test" initial={banked([10, 0, 0])} start={{ name: 'heroes' }} />);
    const card = screen.getByRole('button', { name: new RegExp(`^${names.hero('pyra')}`) });
    expect(card).toHaveTextContent(t('hero.levelUp.ready'));
  });
});
