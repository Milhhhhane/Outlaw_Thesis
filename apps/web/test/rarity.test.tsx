import type { Profile } from '@outlaw/data';
import { newProfile, summonCost } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { Rarity, rarityName, roman } from '../src/game/Rarity';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const legendary = content.heroes.find((h) => h.tier === 4)!;
const epic = content.heroes.find((h) => h.tier === 3)!;

/** Profil neuf avec un légendaire déjà invoqué, dans l'équipe. */
function withLegend(): Profile {
  const base = newProfile(content, 5);
  return {
    ...base,
    unlocked: [...base.unlocked, legendary.id],
    heroes: { ...base.heroes, [legendary.id]: { ...base.heroes.pyra!, level: 1 } },
    team: [legendary.id, ...base.team.slice(1)],
  };
}

describe('rareté des héros', () => {
  it('pastille : chiffre romain et nom, ou nom réservé aux lecteurs d’écran', () => {
    expect([1, 2, 3, 4].map(roman)).toEqual(['I', 'II', 'III', 'IV']);
    expect([1, 2, 3, 4].map(rarityName)).toEqual(['Commun', 'Rare', 'Épique', 'Légendaire']);
    const { container, rerender } = render(<Rarity tier={4} />);
    expect(container.querySelector('.rarity-4')).not.toBeNull();
    expect(screen.getByText('Légendaire')).toBeVisible();
    rerender(<Rarity tier={3} short />);
    expect(screen.getByText('Épique')).toHaveClass('visually-hidden');
    expect(screen.getByText('III')).toHaveAttribute('aria-hidden', 'true');
  });

  it('galerie : chaque carte porte sa rareté, verrouillée ou non, avec le coût d’invocation', () => {
    render(<App version="test" initial={withLegend()} start={{ name: 'heroes' }} />);
    const cards = document.querySelectorAll('.hero-card');
    expect(cards).toHaveLength(content.heroes.length);
    // Chaque rareté a autant de cartes que de héros, et chaque carte en porte le nom.
    for (const tier of [1, 2, 3, 4]) {
      const ofTier = document.querySelectorAll(`.hero-card.rarity-${String(tier)}`);
      expect(ofTier).toHaveLength(content.heroes.filter((h) => h.tier === tier).length);
      ofTier.forEach((card) => {
        expect(within(card as HTMLElement).getByText(rarityName(tier))).toBeInTheDocument();
      });
    }
    // Un épique verrouillé : rareté visible, nom caché, coût de sa rareté.
    const locked = Array.from(cards).find(
      (card) => card.classList.contains('rarity-3') && (card as HTMLButtonElement).disabled,
    ) as HTMLElement;
    expect(locked).toBeDisabled();
    expect(
      within(locked).getByText(t('heroes.locked.summon', { n: summonCost(content, epic.id) })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('heroes.count', { n: 5, total: content.heroes.length })),
    ).toBeVisible();
  });

  it('fiche, équipe et coffres affichent la rareté du héros', () => {
    const { unmount } = render(
      <App version="test" initial={withLegend()} start={{ name: 'hero', id: legendary.id }} />,
    );
    expect(document.querySelector('.sheet__id.rarity-4')).not.toBeNull();
    expect(screen.getByText('Légendaire')).toBeVisible();
    unmount();

    const team = render(<App version="test" initial={withLegend()} start={{ name: 'team' }} />);
    const slots = screen.getAllByRole('button', {
      name: t('team.remove', { hero: names.hero(legendary.id) }),
    });
    expect(
      slots.some((b) => b.classList.contains('team__slot') && b.classList.contains('rarity-4')),
    ).toBe(true);
    expect(document.querySelectorAll('.roster__card.rarity-4')).toHaveLength(1);
    team.unmount();

    render(<App version="test" initial={withLegend()} start={{ name: 'chests' }} />);
    const rows = document.querySelectorAll('.frag-row');
    expect(rows).toHaveLength(content.heroes.length);
    for (const tier of [1, 2, 3, 4]) {
      expect(document.querySelectorAll(`.frag-row.rarity-${String(tier)}`).length).toBe(
        content.heroes.filter((h) => h.tier === tier).length,
      );
    }
    // Un héros verrouillé de chaque rareté montre son propre coût d'invocation.
    const lockedEpic = document.querySelector(`.frag-row.rarity-3`) as HTMLElement;
    expect(
      within(lockedEpic).getByText(`0 / ${String(summonCost(content, epic.id))}`),
    ).toBeInTheDocument();
  });
});
