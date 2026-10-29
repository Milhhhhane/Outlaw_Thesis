import type { Profile } from '@outlaw/data';
import { dungeonPrerequisite, newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ animations: false }));
});
afterEach(() => {
  window.localStorage.clear();
});

const second = content.dungeons.filter((d) => d.map.chapter === 2);

/** Landes de braise terminées : le chapitre 2 est encore fermé. */
function afterFirst(): Profile {
  return {
    ...newProfile(content, 3),
    dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 2 } },
  };
}

/** Citadelle de cendre terminée (et les trois d'avant) : les cinq premiers du chapitre 2 ouverts. */
function afterCitadel(): Profile {
  const cleared = { clears: 1, dry: 0, tier: 2 };
  return {
    ...newProfile(content, 3),
    dungeons: {
      ember_wastes: cleared,
      drowned_halls: cleared,
      thorn_maze: cleared,
      cinder_citadel: cleared,
    },
  };
}

describe('carte : chapitres parallèles', () => {
  it('onglet du chapitre 2 : ses dix donjons, numérotés dans le chapitre, un chemin', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <App version="test" initial={afterCitadel()} start={{ name: 'map' }} />,
    );
    const tabs = screen.getByRole('tablist', { name: t('map.chapters') });
    await user.click(within(tabs).getByRole('tab', { name: t('map.chapter', { n: 2 }) }));
    expect(within(tabs).getByRole('tab', { name: t('map.chapter', { n: 2 }) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(second).toHaveLength(10);
    const nodes = container.querySelectorAll('.map__node');
    expect(nodes).toHaveLength(10);
    // Numéros de 1 à 10 dans le chapitre ; un tronçon de chemin entre deux donjons voisins.
    expect(
      screen.getByRole('button', { name: new RegExp(`^${t('map.step', { n: 1 })} : `) }),
    ).toHaveAccessibleName(
      `${t('map.step', { n: 1 })} : ${names.dungeon(second[0]!.id)}, ${t('map.next')}`,
    );
    expect(container.querySelectorAll('.map__path path')).toHaveLength(9);
    // Les cinq premiers donjons du chapitre 2 s'ouvrent après la Citadelle, les cinq autres
    // restent fermés.
    expect(container.querySelectorAll('.map__node--locked')).toHaveLength(5);
  });

  it('un donjon verrouillé dit lequel termine pour l’ouvrir (opensAfter)', async () => {
    const user = userEvent.setup();
    const bog = second[1]!;
    render(<App version="test" initial={afterFirst()} start={{ name: 'map', dungeon: bog.id }} />);
    const opener = dungeonPrerequisite(content, bog.id)!;
    expect(opener).toBe('cinder_citadel');
    expect(
      screen.getByText(t('hub.dungeon.locked', { dungeon: names.dungeon(opener) })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(t('map.prepare')) })).toBeNull();
    // Le chapitre du donjon choisi est affiché d'office.
    expect(screen.getByRole('tab', { name: t('map.chapter', { n: 2 }) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: t('map.chapter', { n: 1 }) }));
    expect(
      screen.getByRole('button', { name: new RegExp(`${names.dungeon('cinder_citadel')}, `) }),
    ).toBeInTheDocument();
  });
});
