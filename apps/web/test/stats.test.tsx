import type { Profile } from '@outlaw/data';
import {
  autoAction,
  battleStats,
  compileEncounter,
  compileTeam,
  createBattle,
  heroBuild,
  newProfile,
  step,
  tierEncounterPct,
  tierLevel,
  type BattleEvent,
  type DungeonReport,
  type Side,
} from '@outlaw/engine';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { OptionsProvider } from '../src/game/options';
import { GameContext } from '../src/game/nav';
import { names, t } from '../src/i18n';
import type { RunStats } from '../src/screens/BattleStats';
import { Rewards, type SeriesStep } from '../src/screens/Rewards';

/** Un donjon entier joué par Auto : lent sur les machines de CI. */
const LONG_UI_TEST = 90_000;

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

const report: DungeonReport = {
  dungeon: 'ember_wastes',
  tier: 1,
  firstClear: false,
  xp: { pyra: { gained: 40, ready: false } },
  gold: 60,
  materials: { tier: 1, amount: 6 },
  item: { uid: 1, item: 'ember_charm', guaranteed: false, isNew: false, copies: 2, salvaged: null },
  mastery: { rank: 0, rankUp: false, clears: 3, next: 5 },
  unlockedHero: null,
  chest: null,
  grimoires: 0,
  tierUnlocked: null,
};

/** Deux salles écrites à la main : Marée ne fait rien, Pyra brûle, Ronce soigne et protège. */
function journals(): BattleEvent[][] {
  const start: BattleEvent = {
    type: 'battle_start',
    units: (
      [
        ['h0', 'maree', 'player', 0, 300],
        ['h1', 'pyra', 'player', 1, 300],
        ['h2', 'ronce', 'player', 2, 300],
        ['e0', 'rat', 'enemy', 0, 200],
      ] as const
    ).map(([id, kind, side, slot, hp]: readonly [string, string, Side, number, number]) => ({
      id,
      kind,
      side,
      slot,
      element: 'fire' as const,
      hp,
      maxHp: hp,
    })),
  };
  const hit = (
    source: string,
    target: string,
    amount: number,
    hpAfter: number,
    cause: 'spell' | 'burn' = 'spell',
    absorbed = 0,
  ): BattleEvent => ({
    type: 'damage',
    source,
    target,
    cause,
    amount,
    absorbed,
    multiplier: 1,
    hpAfter,
    shieldAfter: 0,
    killed: hpAfter === 0,
  });
  return [
    [
      start,
      hit('h1', 'e0', 50, 150),
      hit('h1', 'e0', 30, 120, 'burn'),
      { type: 'shield', source: 'h2', target: 'h0', amount: 40, total: 40, turns: 2 },
      hit('e0', 'h0', 60, 280, 'spell', 40),
      { type: 'heal', source: 'h2', target: 'h0', cause: 'spell', amount: 20, hpAfter: 300 },
      hit('h2', 'e0', 120, 0),
    ],
    [start, hit('h1', 'e0', 200, 0)],
  ];
}

function stats(): RunStats {
  const rooms = journals();
  return { total: battleStats(rooms), rooms: rooms.map((room) => battleStats([room])) };
}

function show(series?: SeriesStep) {
  render(
    <GameContext.Provider
      value={{ go: vi.fn(), openOptions: vi.fn(), toggleTestMode: vi.fn(), version: 'test' }}
    >
      <OptionsProvider>
        <Rewards
          report={report}
          onContinue={vi.fn()}
          onReplay={vi.fn()}
          series={series}
          stats={stats()}
        />
      </OptionsProvider>
    </GameContext.Provider>,
  );
}

const percent = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 }).format(n);

/** Lignes du tableau : nom du héros puis chaque cellule, telles qu'affichées. */
function tableRows(): string[][] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent));
}

describe('statistiques de fin de donjon', () => {
  it('remplacent les cartes : une ligne par héros, triées par dégâts, le héros inactif à 0', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByRole('list', { name: t('reward.cards') })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    await user.click(screen.getByRole('button', { name: t('stats.show') }));
    expect(screen.queryByRole('list', { name: t('reward.cards') })).toBeNull();
    // Pyra : 50 + 30 de brûlure + 200 = 280 ; Ronce : 120 ; Marée : rien, mais bien affichée.
    expect(tableRows()).toEqual([
      [
        names.hero('pyra'),
        `280${percent(280 / 400)}${t('stats.burn', { n: 30 })}`,
        '0',
        '0',
        '0',
        '0',
        '1',
      ],
      [names.hero('ronce'), `120${percent(120 / 400)}`, '20', '40', '0', '0', '1'],
      [names.hero('maree'), `0${percent(0)}${t('stats.none')}`, '0', '0', '20', '40', '0'],
    ]);

    // Salle 2 seule : Pyra seule a frappé, les deux autres restent listés à 0.
    await user.click(screen.getByRole('button', { name: t('stats.scope.room', { n: 2 }) }));
    expect(tableRows().map((row) => [row[0], row[1]])).toEqual([
      [names.hero('pyra'), `200${percent(1)}`],
      [names.hero('maree'), `0${percent(0)}${t('stats.none')}`],
      [names.hero('ronce'), `0${percent(0)}${t('stats.none')}`],
    ]);
    expect(screen.getByRole('button', { name: t('stats.scope.room', { n: 2 }) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: t('stats.hide') }));
    expect(screen.getByRole('list', { name: t('reward.cards') })).toBeInTheDocument();
  });

  it('ne bloquent pas l’enchaînement d’Auto : sans toucher à rien, le décompte lance la suite', () => {
    vi.useFakeTimers();
    const next = vi.fn();
    show({ progress: 'Série', next, nextPass: 2, stop: null, auto: true });
    expect(screen.getByRole('button', { name: t('stats.show') })).toBeInTheDocument();
    for (let s = 0; s < 5; s++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(next).toHaveBeenCalledTimes(1);
  });

  it(
    'après un donjon joué, les chiffres affichés sont ceux du moteur sur les journaux des salles',
    async () => {
      window.localStorage.setItem(
        'outlaw-thesis/options',
        JSON.stringify({ speed: 'fast', auto: true }),
      );
      window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
      const base = newProfile(content, 9);
      const profile: Profile = {
        ...base,
        heroes: Object.fromEntries(
          Object.entries(base.heroes).map(([id, h]) => [id, { ...h, level: 30 }]),
        ),
      };
      const user = userEvent.setup();
      render(
        <App version="test" initial={profile} start={{ name: 'dungeon', id: 'ember_wastes' }} />,
      );
      for (let room = 1; room <= 3; room++) {
        const dialog = await screen.findByRole('dialog', {}, { timeout: 30_000 });
        expect(within(dialog).getByRole('heading')).toHaveTextContent(t('combat.result.victory'));
        await user.click(within(dialog).getByRole('button', { name: t('combat.auto.now') }));
      }
      await user.click(screen.getByRole('button', { name: t('stats.show') }));

      // Le même donjon rejoué ici par la politique Auto du moteur (déterministe).
      const dungeon = content.dungeonById.get('ember_wastes')!;
      const heroes = compileTeam(
        content,
        profile.team.map((id) => heroBuild(profile, id)),
        'player',
        dungeon.modifier,
      );
      const rooms = dungeon.encounters.map((encounter) => {
        const pct = tierEncounterPct(content, 1, encounter.hpPct, encounter.atkPct);
        const enemies = compileEncounter(
          content,
          encounter.enemies,
          tierLevel(content, dungeon, 1),
          dungeon.modifier,
          pct.hpPct,
          pct.atkPct,
        );
        const created = createBattle({ units: [...heroes, ...enemies] }, content.balance);
        let state = created.state;
        const events = [...created.events];
        while (state.result === null) {
          const next = step(state, autoAction(state));
          state = next.state;
          events.push(...next.events);
        }
        return events;
      });
      const expected = battleStats(rooms);
      expect(expected).toHaveLength(profile.team.length);
      expect(expected.reduce((sum, hero) => sum + hero.dealt, 0)).toBeGreaterThan(0);
      const number = new Intl.NumberFormat('fr-FR');
      expect(tableRows()).toEqual(
        expected.map((hero) => [
          names.hero(hero.kind),
          number.format(hero.dealt) +
            percent(hero.share) +
            (hero.dealt === 0 ? t('stats.none') : '') +
            (hero.overTime > 0 ? t('stats.burn', { n: number.format(hero.overTime) }) : ''),
          number.format(hero.healing),
          number.format(hero.shielding),
          number.format(hero.taken),
          number.format(hero.blocked),
          number.format(hero.kills),
        ]),
      );
    },
    LONG_UI_TEST,
  );
});
