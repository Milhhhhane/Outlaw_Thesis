import { chestCount, dungeonOpen } from '@outlaw/engine';
import { Diorama } from '../art/Diorama';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { SyncBadge } from '../account/windows';
import { Button, Icon, RefusalToast, Resources } from '../game/ui';
import { useEscape } from '../game/keys';
import { t, type TextKey } from '../i18n';
import { useProfile } from '../state/profile';
import { Intro } from './Intro';

const ENTRIES: readonly {
  readonly route: 'map' | 'team' | 'heroes' | 'workshop' | 'chests';
  readonly label: TextKey;
  readonly hint: TextKey;
  readonly icon: string;
}[] = [
  { route: 'map', label: 'hub.menu.dungeons', hint: 'hub.menu.dungeons.hint', icon: 'mark' },
  { route: 'team', label: 'hub.menu.team', hint: 'hub.menu.team.hint', icon: 'shield' },
  { route: 'heroes', label: 'hub.menu.heroes', hint: 'hub.menu.heroes.hint', icon: 'stat' },
  { route: 'workshop', label: 'hub.menu.workshop', hint: 'hub.menu.workshop.hint', icon: 'item' },
  { route: 'chests', label: 'hub.menu.chests', hint: 'hub.menu.chests.hint', icon: 'chest' },
];

/** Le camp : un seul écran, l'équipe autour du feu, toutes les entrées du jeu. */
export function Hub() {
  const { go, openOptions, toggleTestMode } = useGame();
  const { profile, recovered } = useProfile();
  const test = profile.testMode;
  useEscape(() => {
    go({ name: 'title' });
  });
  const scene =
    [...content.dungeons].reverse().find((d) => dungeonOpen(content, profile, d.id))?.id ??
    'ember_wastes';

  return (
    <main className="hub">
      <div className="hub__scene">
        <Diorama scene={scene} heroes={profile.team} cropTop={0} campfire />
      </div>
      <header className="hub__bar">
        <h1 className="hub__title">{t('hub.title')}</h1>
        <SyncBadge />
        <Resources />
      </header>
      {test && <p className="hub__notice">{t('test.banner')}</p>}
      {recovered && <p className="hub__notice">{t('hub.saveRecovered')}</p>}
      <nav className="hub__menu" aria-label={t('hub.title')}>
        {ENTRIES.filter((entry) => !test || entry.route !== 'chests').map((entry) => (
          <button
            key={entry.route}
            type="button"
            className="hub__entry"
            onClick={() => {
              go({ name: entry.route });
            }}
          >
            <Icon name={entry.icon} size={24} />
            <span className="hub__entry-label">
              {t(entry.label)}
              {entry.route === 'chests' && chestCount(profile) > 0 && (
                <span className="hub__badge">{chestCount(profile)}</span>
              )}
            </span>
            <span className="hub__entry-hint">{t(entry.hint)}</span>
          </button>
        ))}
      </nav>
      <footer className="hub__foot">
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            go({ name: 'title' });
          }}
        >
          ◀ {t('hub.menu.title')}
        </Button>
        <Button variant="quiet" size="small" icon="gear" onClick={openOptions}>
          {t('hub.menu.options')}
        </Button>
        <Button
          variant="quiet"
          size="small"
          icon="damage"
          onClick={() => {
            go({ name: 'demo' });
          }}
        >
          {t('hub.demo')}
        </Button>
        {test && (
          <Button variant="primary" size="small" onClick={toggleTestMode}>
            {t('hub.menu.testExit')}
          </Button>
        )}
      </footer>
      {!test && <Intro />}
      <RefusalToast />
    </main>
  );
}
