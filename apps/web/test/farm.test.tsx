import type { Profile } from '@outlaw/data';
import {
  completeDungeon,
  levelUpCost,
  newProfile,
  starCost,
  starGold,
  summarizeSeries,
  upgradeCost,
  type DungeonReport,
} from '@outlaw/engine';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { dustName, names, t, tk } from '../src/i18n';
import { parseSave } from '../src/save/storage';
import { Recap } from '../src/screens/Recap';

/** Plusieurs donjons joués par Auto : lent sur les machines de CI. */
const LONG_UI_TEST = 120_000;

const setOptions = (extra: Record<string, unknown> = {}): void => {
  window.localStorage.setItem(
    'outlaw-thesis/options',
    JSON.stringify({ speed: 'fast', auto: true, ...extra }),
  );
};

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

function leveled(level: number, base: Profile = newProfile(content, 9)): Profile {
  return {
    ...base,
    heroes: Object.fromEntries(Object.entries(base.heroes).map(([id, h]) => [id, { ...h, level }])),
  };
}

/** Auto joue les trois salles ; chaque victoire est passée par « Continuer maintenant ». */
async function autoDungeon(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let room = 1; room <= 3; room++) {
    const dialog = await screen.findByRole('dialog', {}, { timeout: 30_000 });
    expect(within(dialog).getByRole('heading')).toHaveTextContent(t('combat.result.victory'));
    await user.click(within(dialog).getByRole('button', { name: t('combat.auto.now') }));
  }
}

describe('série de passages', () => {
  it(
    'trois passages d’affilée puis le bilan, aux totaux du moteur',
    async () => {
      setOptions();
      const user = userEvent.setup();
      const start = leveled(30);
      render(
        <App
          version="test"
          initial={start}
          start={{ name: 'dungeon', id: 'ember_wastes', runs: 3 }}
        />,
      );
      for (let k = 1; k <= 3; k++) {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          t('farm.pass', { k, n: 3 }),
        );
        await autoDungeon(user);
        expect(screen.getByText(new RegExp(t('farm.pass', { k, n: 3 })))).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
          k < 3
            ? t('farm.next.countdown', { s: 5, k: k + 1 })
            : t('farm.recap.countdown', { s: 5 }),
        );
        await user.click(screen.getByRole('button', { name: t('combat.auto.now') }));
      }

      // Bilan attendu : les mêmes trois passages joués directement par le moteur.
      const reports: DungeonReport[] = [];
      let profile = start;
      for (let run = 0; run < 3; run++) {
        const done = completeDungeon(content, profile, 'ember_wastes', 1);
        if (!done.ok) throw new Error(done.reason);
        profile = done.value.profile;
        reports.push(done.value.report);
      }
      const summary = summarizeSeries(reports);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.recap.title', { dungeon: names.dungeon('ember_wastes') }),
      );
      expect(screen.getByText(t('farm.stop.complete'))).toBeInTheDocument();
      const cards = screen.getByRole('list', { name: t('farm.recap.cards') });
      expect(within(cards).getByText(t('farm.recap.wins', { n: 3 }))).toBeInTheDocument();
      expect(within(cards).getByText(t('farm.recap.losses', { n: 0 }))).toBeInTheDocument();
      expect(within(cards).getByText(t('reward.gold', { gold: summary.gold }))).toBeInTheDocument();
      expect(
        within(cards).getByText(
          t('reward.materials', { amount: summary.materials[0], dust: dustName(1) }),
        ),
      ).toBeInTheDocument();
      expect(
        within(cards).getByText(t('farm.recap.items.new', { n: summary.newItems }), {
          exact: false,
        }),
      ).toBeInTheDocument();
      for (const item of summary.items) {
        expect(
          within(cards).getByText(
            t('farm.recap.item', { item: names.item(item.item), n: item.count }),
          ),
        ).toBeInTheDocument();
      }
      for (const [tier, n] of Object.entries(summary.chests)) {
        expect(
          within(cards).getByText(t('farm.recap.chest', { tier: tk(`chest.tier.${tier}`), n })),
        ).toBeInTheDocument();
      }
      // Le profil sauvegardé est celui du moteur après trois passages.
      const saved = JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as {
        profile: Profile;
      };
      expect(saved.profile.gold).toBe(profile.gold);
      expect(saved.profile.dungeons.ember_wastes?.clears).toBe(3);

      // Relancer la série repart de zéro.
      await user.click(screen.getByRole('button', { name: t('farm.recap.again') }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.pass', { k: 1, n: 3 }),
      );
    },
    LONG_UI_TEST,
  );

  it(
    'une défaite arrête la série : bilan avec le passage perdu',
    async () => {
      setOptions();
      const last = content.dungeons.at(-1)!.id;
      render(
        <App
          version="test"
          initial={newProfile(content, 9)}
          start={{ name: 'dungeon', id: last, runs: 3 }}
        />,
      );
      const dialog = await screen.findByRole('dialog', {}, { timeout: 60_000 });
      expect(within(dialog).queryByRole('status')).toBeNull();
      await userEvent.setup().click(within(dialog).getByRole('button'));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.recap.title', { dungeon: names.dungeon(last) }),
      );
      expect(screen.getByText(t('farm.stop.defeat'))).toBeInTheDocument();
      expect(screen.getByText(t('farm.recap.wins', { n: 0 }))).toBeInTheDocument();
      expect(screen.getByText(t('farm.recap.losses', { n: 1 }))).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: t('reward.continue') }));
      expect(screen.getByRole('heading', { name: t('hub.title') })).toBeInTheDocument();
    },
    LONG_UI_TEST,
  );

  it(
    'le joueur interrompt : le décompte s’arrête, le bilan dit « interrompue »',
    async () => {
      setOptions();
      const user = userEvent.setup();
      render(
        <App
          version="test"
          initial={leveled(30)}
          start={{ name: 'dungeon', id: 'ember_wastes', runs: 'energy' }}
        />,
      );
      // Entrée gratuite : passages sans borne.
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        t('farm.pass.open', { k: 1 }),
      );
      await autoDungeon(user);
      fireEvent.keyDown(window, { key: 'Shift' });
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('button', { name: t('farm.next') })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: t('farm.recap.button') }));
      expect(screen.getByText(t('farm.stop.player'))).toBeInTheDocument();
      expect(screen.getByText(t('farm.recap.wins', { n: 1 }))).toBeInTheDocument();
    },
    LONG_UI_TEST,
  );

  it('l’écran d’équipe règle le nombre de passages et coche Auto pour une série', async () => {
    setOptions({ auto: false });
    const user = userEvent.setup();
    render(
      <App
        version="test"
        initial={leveled(30)}
        start={{ name: 'team', dungeon: 'ember_wastes', tier: 1 }}
      />,
    );
    const runs = screen.getByRole('group', { name: t('farm.runs.label') });
    expect(within(runs).getByRole('button', { name: t('farm.runs.n', { n: 1 }) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(runs).getByRole('button', { name: t('farm.runs.energy.long') }));
    await user.click(within(runs).getByRole('button', { name: t('farm.runs.n', { n: 5 }) }));
    const options = JSON.parse(window.localStorage.getItem('outlaw-thesis/options') ?? '{}') as {
      runs: unknown;
    };
    expect(options.runs).toBe(5);
    await user.click(
      screen.getByRole('button', { name: new RegExp(`^${t('team.go', { dungeon: '' })}`) }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      t('farm.pass', { k: 1, n: 5 }),
    );
    expect(screen.getByRole('button', { name: t('combat.auto') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('bilan', () => {
  it('affiche copies, objets dissous, coffres, niveaux prêts et maîtrise ; « aucun » sinon', () => {
    const item = content.dungeons[0]!.loot[0]!;
    render(
      <Recap
        dungeonId="ember_wastes"
        tier={2}
        stop={t('farm.stop.complete')}
        summary={{
          ...summarizeSeries([]),
          wins: 4,
          gold: 300,
          materials: [5, 0, 7],
          items: [{ item, count: 4, isNew: true, copies: 2, salvaged: 1 }],
          newItems: 1,
          copies: 2,
          salvaged: 1,
          chests: { bronze: 2 },
          levelReady: ['pyra'],
          mastery: [{ dungeon: 'ember_wastes', rank: 1 }],
          tiersUnlocked: [{ dungeon: 'ember_wastes', tier: 3 }],
          heroes: ['maree'],
        }}
        onBack={() => undefined}
        onAgain={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `${names.dungeon('ember_wastes')} II`,
    );
    expect(screen.getByText(t('reward.materials', { amount: 7, dust: dustName(3) }))).toBeVisible();
    expect(screen.getByText(new RegExp(t('farm.recap.items.salvaged', { n: 1 })))).toBeVisible();
    expect(screen.getByText(t('farm.recap.item', { item: names.item(item), n: 4 }))).toBeVisible();
    expect(screen.getByText(t('farm.recap.ready.hero', { hero: names.hero('pyra') }))).toBeTruthy();
    expect(screen.getByText(t('farm.recap.mastery.rank', { rank: 1 }))).toBeVisible();
    expect(screen.getByText(t('reward.tierUnlocked', { tier: 'III' }))).toBeVisible();
    expect(screen.getByText(t('reward.unlocked', { hero: names.hero('maree') }))).toBeVisible();
    expect(screen.queryByText(t('farm.recap.none'))).toBeNull();
  });

  it('une série sans gain dit « aucun »', () => {
    render(
      <Recap
        dungeonId="ember_wastes"
        tier={1}
        stop={t('farm.stop.defeat')}
        summary={summarizeSeries([], 1)}
        onBack={() => undefined}
        onAgain={() => undefined}
      />,
    );
    expect(screen.getAllByText(t('farm.recap.none'))).toHaveLength(5);
  });
});

describe('équipes enregistrées', () => {
  it('enregistrer, changer d’équipe, recharger en un clic', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'team' }} />);
    await user.click(screen.getByRole('button', { name: t('preset.save.aria', { n: 1 }) }));
    const dialog = screen.getByRole('dialog', { name: t('preset.save.title', { n: 1 }) });
    const input = within(dialog).getByLabelText(t('preset.name'));
    expect(input).toHaveValue(t('preset.default', { n: 1 }));
    await user.clear(input);
    await user.type(input, 'Feu{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    const load = screen.getByRole('button', { name: t('preset.load', { name: 'Feu' }) });

    await user.click(
      screen.getAllByRole('button', { name: t('team.remove', { hero: names.hero('pyra') }) })[0]!,
    );
    expect(
      screen.queryAllByRole('button', { name: t('team.remove', { hero: names.hero('pyra') }) }),
    ).toHaveLength(0);
    await user.click(load);
    expect(
      screen.getAllByRole('button', { name: t('team.remove', { hero: names.hero('pyra') }) }),
    ).toHaveLength(2);
    const saved = JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as {
      profile: Profile;
    };
    expect(saved.profile.presets[0]).toEqual({ name: 'Feu', team: saved.profile.team });
    expect(saved.profile.team).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
  });

  it('un nom vide est refusé, la fenêtre reste ouverte', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'team' }} />);
    await user.click(screen.getByRole('button', { name: t('preset.save.aria', { n: 2 }) }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText(t('preset.name')));
    await user.click(within(dialog).getByRole('button', { name: t('preset.save') }));
    expect(screen.getByRole('alert')).toHaveTextContent(t('refusal.bad_name'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refus clair si un héros n’est plus disponible', async () => {
    const user = userEvent.setup();
    const profile: Profile = {
      ...newProfile(content, 9),
      presets: [null, { name: 'Vieille', team: ['pyra', 'sablier'] }],
    };
    render(<App version="test" initial={profile} start={{ name: 'team' }} />);
    expect(
      screen.getByText(t('preset.missing', { heroes: names.hero('sablier') })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('preset.load.empty', { n: 1 }) })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: t('preset.load', { name: 'Vieille' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent(t('refusal.preset_unavailable'));
  });

  it('une ancienne sauvegarde sans équipes enregistrées se charge', () => {
    const old = JSON.parse(JSON.stringify(newProfile(content, 3))) as Record<string, unknown>;
    delete old.presets;
    const profile = parseSave(JSON.stringify({ version: 1, profile: old }), content);
    expect(profile.presets).toEqual([]);
  });
});

const cardNames = (): string[] =>
  Array.from(document.querySelectorAll('.hero-card .hero-card__name')).map(
    (el) => el.firstChild?.textContent?.trim() ?? '',
  );

describe('tri et filtres des héros', () => {
  it('galerie : tri par nom, filtres élément et possédés, réglage retenu sur l’appareil', async () => {
    setOptions();
    const user = userEvent.setup();
    const view = render(
      <App version="test" initial={newProfile(content, 9)} start={{ name: 'heroes' }} />,
    );
    // Par défaut, rareté : les héros possédés d'abord, puis les légendaires.
    expect(
      cardNames()
        .slice(0, 4)
        .every((n) => !n.startsWith('???')),
    ).toBe(true);
    expect(document.querySelectorAll('.hero-card')[4]).toHaveClass('rarity-4');

    await user.click(screen.getByRole('button', { name: t('filter.sort.name') }));
    expect(
      cardNames()
        .slice(0, 4)
        .map((n) => n.replace(/[IV]+$/, '').trim()),
    ).toEqual(['Cendre', 'Marée', 'Pyra', 'Ronce']);

    await user.click(screen.getByRole('button', { name: t('filter.button') }));
    const dialog = screen.getByRole('dialog', { name: t('filter.title') });
    await user.click(
      within(within(dialog).getByRole('group', { name: t('filter.element') })).getByRole('button', {
        name: tk('element.fire'),
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: t('filter.owned') }));
    await user.keyboard('{Escape}');
    expect(document.querySelectorAll('.hero-card')).toHaveLength(2);
    expect(screen.getByRole('button', { name: t('filter.active', { n: 2 }) })).toBeInTheDocument();
    expect(screen.getByText(t('filter.shown', { n: 2 }))).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem('outlaw-thesis/options') ?? '{}') as {
      heroView: unknown;
    };
    expect(stored.heroView).toEqual({
      sort: 'name',
      element: 'fire',
      role: null,
      rarity: null,
      owned: true,
    });
    view.unmount();
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'heroes' }} />);
    expect(document.querySelectorAll('.hero-card')).toHaveLength(2);

    // « Tout afficher » garde le tri ; un filtre sans résultat le dit.
    await user.click(screen.getByRole('button', { name: t('filter.active', { n: 2 }) }));
    await user.click(screen.getByRole('button', { name: t('filter.reset') }));
    await user.keyboard('{Escape}');
    expect(document.querySelectorAll('.hero-card')).toHaveLength(content.heroes.length);
    expect(screen.getByRole('button', { name: t('filter.sort.name') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('vivier de l’équipe : mêmes filtres, sans « possédés »', () => {
    setOptions({ heroView: { sort: 'level', role: 'support', element: 'nature', owned: 'oui' } });
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'team' }} />);
    expect(document.querySelectorAll('.roster__card')).toHaveLength(0);
    expect(screen.getByText(t('filter.none'))).toBeInTheDocument();
  });

  it('vivier : un rôle ne garde que ses héros, triés par niveau', () => {
    setOptions({ heroView: { sort: 'level', role: 'control' } });
    const base = newProfile(content, 9);
    const profile = {
      ...base,
      heroes: { ...base.heroes, cendre: { ...base.heroes.cendre!, level: 5 } },
    };
    render(<App version="test" initial={profile} start={{ name: 'team' }} />);
    const roster = Array.from(document.querySelectorAll('.roster__name')).map(
      (el) => el.firstChild?.textContent?.trim() ?? '',
    );
    expect(roster).toEqual(['Cendre', 'Ronce']);
  });
});

describe('badges du camp', () => {
  it('niveaux, talents, étoiles, objets et coffres à faire', () => {
    const base = newProfile(content, 9);
    const ronce = { ...base.heroes.ronce!, level: 10 };
    const pyra = base.heroes.pyra!;
    const cost = levelUpCost(content, pyra)!;
    const item = content.dungeons[0]!.loot[0]!;
    const upgrade = upgradeCost(content, item, 0)!;
    // Chaque badge lit son propre coût : l'or couvre le plus cher des trois (niveau, étoile, objet).
    const gold = Math.max(upgrade.gold, cost.gold, starGold(content, ronce)!);
    const profile: Profile = {
      ...base,
      gold,
      materials: [cost.dust.amount + upgrade.materials.amount, 0, 0],
      heroes: { ...base.heroes, ronce, pyra: { ...pyra, xp: cost.xp } },
      fragments: { ronce: starCost(content, ronce)! },
      items: [{ uid: 1, item, upgrade: 0, copies: upgrade.copies }],
      nextUid: 2,
      chests: { bronze: 2 },
    };
    render(<App version="test" initial={profile} start={{ name: 'hub' }} />);
    const heroes = screen.getByRole('button', { name: new RegExp(`^${t('hub.menu.heroes')}`) });
    expect(heroes).toHaveTextContent(t('todo.levelUp', { n: 1 }));
    expect(heroes).toHaveTextContent(t('todo.talents', { n: 5 }));
    expect(heroes).toHaveTextContent(t('todo.stars', { n: 1 }));
    expect(
      screen.getByRole('button', { name: new RegExp(`^${t('hub.menu.workshop')}`) }),
    ).toHaveTextContent(t('todo.items', { n: 1 }));
    expect(
      screen.getByRole('button', { name: new RegExp(`^${t('hub.menu.chests')}`) }),
    ).toHaveTextContent(t('todo.chests', { n: 2 }));
  });

  it('rien à faire : aucun badge', () => {
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'hub' }} />);
    expect(document.querySelectorAll('.hub__badge')).toHaveLength(0);
  });
});
