import type { Profile } from '@outlaw/data';
import { newProfile, type DungeonReport } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { GameContext } from '../src/game/nav';
import { dustName, names, t } from '../src/i18n';
import { ProfileProvider } from '../src/state/profile';
import { Rewards } from '../src/screens/Rewards';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

type Owned = { uid: number; item: string; upgrade?: number; copies?: number };

/** Profil neuf qui possède ces exemplaires, avec de quoi payer. */
function owning(entries: readonly Owned[], patch: Partial<Profile> = {}): Profile {
  const items = entries.map((e) => ({
    uid: e.uid,
    item: e.item,
    upgrade: e.upgrade ?? 0,
    copies: e.copies ?? 0,
  }));
  return {
    ...newProfile(content, 3),
    items,
    nextUid: Math.max(0, ...items.map((i) => i.uid)) + 1,
    gold: 500,
    materials: [20, 20, 20],
    ...patch,
  };
}

function saved(): Profile {
  const raw = window.localStorage.getItem('outlaw-thesis/save') ?? '{}';
  return (JSON.parse(raw) as { profile: Profile }).profile;
}

describe('atelier : collection, copies, amélioration', () => {
  it('liste tous les objets, trouvés ou non, avec le nombre de copies', () => {
    const profile = owning([{ uid: 1, item: 'ember_charm', copies: 2 }]);
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    expect(
      screen.getByText(t('workshop.collection', { found: 1, total: content.items.length })),
    ).toBeInTheDocument();
    // Un objet trouvé avec ses copies, tous les autres cachés.
    const found = screen.getByRole('button', { name: new RegExp(names.item('ember_charm')) });
    expect(found).toHaveTextContent(t('item.copies.badge', { n: 2 }));
    expect(screen.getAllByText(t('item.undiscovered'))).toHaveLength(content.items.length - 1);
  });

  it('un objet inconnu dit où le farmer', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={owning([])} start={{ name: 'workshop' }} />);
    await user.click(screen.getByRole('button', { name: new RegExp(names.item('eternal_ember')) }));
    expect(
      screen.getByText(t('item.origin', { dungeon: names.dungeon('ember_wastes') })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('hero.upgrade') })).toBeNull();
  });

  it('améliorer coûte une copie, de l’or et de la poussière du palier du donjon', async () => {
    const user = userEvent.setup();
    const profile = owning([{ uid: 1, item: 'ember_charm', copies: 2 }]);
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    const cost = content.balance.progression.items.upgradeCosts[0]!;
    expect(
      screen.getByText(
        t('workshop.cost', {
          copies: cost.copies,
          gold: cost.gold,
          dust: t('dust.amount', { amount: cost.materials, dust: dustName(1) }),
        }),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('hero.upgrade') }));
    const after = saved();
    expect(after.items[0]).toMatchObject({ upgrade: 1, copies: 1 });
    expect(after.gold).toBe(500 - cost.gold);
    expect(after.materials[0]).toBe(20 - cost.materials);
  });

  it('sans assez de copies, l’amélioration est refusée et rien n’est dépensé', async () => {
    const user = userEvent.setup();
    const profile = owning([{ uid: 1, item: 'thorn_ring', upgrade: 1, copies: 1 }]);
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    // Le niveau 2 d'un objet de poussière fine demande plus d’une copie.
    await user.click(screen.getByRole('button', { name: t('hero.upgrade') }));
    expect(screen.getByRole('alert')).toHaveTextContent(t('refusal.not_enough_copies'));
    expect(saved().gold).toBe(500);
  });

  it('une copie en trop se dissout en poussière du palier de l’objet', async () => {
    const user = userEvent.setup();
    const profile = owning([{ uid: 1, item: 'ember_charm', copies: 1 }], {
      materials: [0, 0, 0],
    });
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    await user.click(screen.getByRole('button', { name: /Dissoudre une copie/ }));
    const after = saved();
    expect(after.items[0]?.copies).toBe(0);
    expect(after.materials[0]).toBe(content.balance.economy.loot.salvage.common);
    // Plus de copie : plus de bouton.
    expect(screen.queryByText(t('workshop.dissolve.hint'))).toBeNull();
  });

  it('au niveau maximum, plus de coût ni d’amélioration', () => {
    const max = content.balance.progression.items.maxUpgradeLevel;
    const profile = owning([{ uid: 1, item: 'ember_charm', upgrade: max }]);
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    expect(screen.getByText(t('hero.upgrade.max'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('hero.upgrade') })).toBeNull();
  });

  it('deux exemplaires d’une ancienne sauvegarde sont fusionnés au chargement', () => {
    const profile = owning([
      { uid: 1, item: 'ember_charm', upgrade: 1 },
      { uid: 2, item: 'ember_charm', upgrade: 0 },
    ]);
    render(<App version="test" initial={profile} start={{ name: 'workshop' }} />);
    const cards = screen.getAllByRole('button', { name: new RegExp(names.item('ember_charm')) });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent(t('item.copies.badge', { n: 1 }));
  });
});

describe('carte des donjons', () => {
  it('annonce l’objet exclusif du donjon, sa maîtrise et la garantie', () => {
    const profile: Profile = {
      ...owning([]),
      dungeons: { ember_wastes: { clears: 6, dry: 0, tier: 1 } },
    };
    render(
      <App version="test" initial={profile} start={{ name: 'map', dungeon: 'ember_wastes' }} />,
    );
    expect(screen.getByText(new RegExp(names.item('ember_charm')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(names.item('eternal_ember')))).toBeInTheDocument();
    // 6 victoires : rang 1 sur 4, prochain rang à 15.
    expect(
      screen.getByText(t('map.mastery', { rank: 1, max: 4 }), { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('map.mastery.next', { next: 15 }), { exact: false }),
    ).toBeInTheDocument();
  });
});

function report(patch: Partial<DungeonReport> = {}): DungeonReport {
  return {
    dungeon: 'ember_wastes',
    tier: 1,
    tierUnlocked: null,
    firstClear: false,
    xp: { pyra: { gained: 40, ready: false } },
    gold: 60,
    materials: { tier: 1, amount: 6 },
    item: {
      uid: 1,
      item: 'ember_charm',
      guaranteed: false,
      isNew: false,
      copies: 2,
      salvaged: null,
    },
    mastery: { rank: 0, rankUp: false, clears: 3, next: 5 },
    unlockedHero: null,
    chest: null,
    grimoires: 0,
    ...patch,
  };
}

function showRewards(r: DungeonReport) {
  const onContinue = vi.fn();
  const onReplay = vi.fn();
  render(
    <GameContext.Provider
      value={{ go: vi.fn(), openOptions: vi.fn(), toggleTestMode: vi.fn(), version: 'test' }}
    >
      <ProfileProvider
        initial={owning([{ uid: 1, item: 'ember_charm', copies: 2 }])}
        persist={false}
      >
        <Rewards report={r} onContinue={onContinue} onReplay={onReplay} />
      </ProfileProvider>
    </GameContext.Provider>,
  );
  return { onContinue, onReplay };
}

describe('récompenses : copies, maîtrise, Rejouer', () => {
  it('un donjon rejoué montre la copie obtenue, la maîtrise et rejoue d’un clic', async () => {
    const user = userEvent.setup();
    const { onContinue, onReplay } = showRewards(report());
    expect(screen.getByText(t('reward.item.copy', { n: 2 }))).toBeInTheDocument();
    expect(screen.queryByText(t('reward.item.new'))).toBeNull();
    expect(
      screen.getByText(t('reward.mastery.next', { next: 5, clears: 3 }), { exact: false }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('reward.replay.button') }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: t('reward.continue') }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('un objet neuf est signalé, un rang gagné aussi', () => {
    showRewards(
      report({
        firstClear: true,
        item: {
          uid: 1,
          item: 'eternal_ember',
          guaranteed: true,
          isNew: true,
          copies: 0,
          salvaged: null,
        },
        mastery: { rank: 1, rankUp: true, clears: 5, next: 15 },
      }),
    );
    expect(screen.getByText(t('reward.item.new'))).toBeInTheDocument();
    expect(screen.getByText(t('reward.guaranteed'))).toBeInTheDocument();
    expect(
      screen.getByText(t('reward.mastery.up', { rank: 1 }), { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Copie en réserve/)).toBeNull();
  });

  it('un objet déjà au maximum est dissous en poussière, sans copie annoncée', () => {
    showRewards(
      report({
        item: {
          uid: 1,
          item: 'ember_charm',
          guaranteed: false,
          isNew: false,
          copies: 0,
          salvaged: { tier: 1, amount: 3 },
        },
        mastery: { rank: 4, rankUp: false, clears: 120, next: null },
      }),
    );
    expect(
      screen.getByText(t('reward.salvaged', { amount: 3, dust: dustName(1) })),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Copie en réserve/)).toBeNull();
    expect(
      screen.getByText(t('reward.mastery.max', { clears: 120 }), { exact: false }),
    ).toBeInTheDocument();
    const cards = screen.getByRole('list', { name: t('reward.cards') });
    expect(within(cards).getAllByRole('listitem').length).toBeGreaterThan(3);
  });
});
