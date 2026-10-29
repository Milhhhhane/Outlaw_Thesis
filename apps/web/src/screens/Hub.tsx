import { campTodo, claimableCount, dungeonOpen, type CampTodo } from '@outlaw/engine';
import { useEffect, useState } from 'react';
import { Diorama } from '../art/Diorama';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { useAccount } from '../account/AccountProvider';
import { api } from '../account/api';
import { SyncBadge } from '../account/windows';
import { Button, Icon, RefusalToast, Resources } from '../game/ui';
import { useEscape } from '../game/keys';
import { t, type TextKey } from '../i18n';
import { useProfile } from '../state/profile';
import { Intro } from './Intro';
import './farm.css';
import './friends.css';

const ENTRIES: readonly {
  readonly route: 'map' | 'tower' | 'team' | 'heroes' | 'workshop' | 'chests' | 'pvp';
  readonly label: TextKey;
  readonly hint: TextKey;
  readonly icon: string;
}[] = [
  { route: 'map', label: 'hub.menu.dungeons', hint: 'hub.menu.dungeons.hint', icon: 'mark' },
  { route: 'tower', label: 'hub.menu.tower', hint: 'hub.menu.tower.hint', icon: 'star' },
  { route: 'team', label: 'hub.menu.team', hint: 'hub.menu.team.hint', icon: 'shield' },
  { route: 'heroes', label: 'hub.menu.heroes', hint: 'hub.menu.heroes.hint', icon: 'stat' },
  { route: 'workshop', label: 'hub.menu.workshop', hint: 'hub.menu.workshop.hint', icon: 'item' },
  { route: 'chests', label: 'hub.menu.chests', hint: 'hub.menu.chests.hint', icon: 'chest' },
  { route: 'pvp', label: 'hub.menu.pvp', hint: 'hub.menu.pvp.hint', icon: 'damage' },
];

type Route = (typeof ENTRIES)[number]['route'];

/** Badges « à faire » de chaque entrée : compteur du moteur, icône, phrase complète. */
const TODO: Readonly<
  Partial<
    Record<
      Route,
      readonly { readonly key: keyof CampTodo; readonly text: TextKey; readonly icon?: string }[]
    >
  >
> = {
  heroes: [
    { key: 'levelUp', text: 'todo.levelUp', icon: 'xp' },
    { key: 'talents', text: 'todo.talents', icon: 'trigger' },
    { key: 'stars', text: 'todo.stars', icon: 'star' },
  ],
  workshop: [{ key: 'items', text: 'todo.items' }],
  chests: [{ key: 'chests', text: 'todo.chests' }],
};

/** Le camp : un seul écran, l'équipe autour du feu, toutes les entrées du jeu. */
export function Hub() {
  const { go, openOptions, toggleTestMode } = useGame();
  const { profile, recovered } = useProfile();
  const test = profile.testMode;
  // Administration : seulement si le serveur a dit « administrateur » (sinon l'entrée n'existe pas).
  const account = useAccount();
  const admin = account?.status === 'signed' && account.admin && !account.mustChangePassword;
  // Amis : le badge compte les demandes reçues, d'après le serveur (compte connecté seulement).
  const signed = account?.status === 'signed' && !account.mustChangePassword;
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!signed || test) return;
    let alive = true;
    void api.friendsPending().then((result) => {
      if (alive && result.ok) setPending(result.value.received);
    });
    return () => {
      alive = false;
    };
  }, [signed, test]);
  const todo = campTodo(content, profile);
  // Récompenses de quêtes et succès à réclamer (le profil passe au nouveau jour tout seul).
  const [now] = useState(() => Date.now());
  const claims = claimableCount(content, profile, now);
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
        {/* Quêtes : dans la barre du haut, le menu de droite est plein. */}
        {!test && (
          <Button
            variant="quiet"
            size="small"
            icon="check"
            className="hub__quests"
            title={t('hub.menu.quests.hint')}
            onClick={() => {
              go({ name: 'quests' });
            }}
          >
            {t('hub.menu.quests')}
            {claims > 0 && (
              <span className="hub__badge" aria-label={t('hub.quests.badge', { n: claims })}>
                {claims}
              </span>
            )}
          </Button>
        )}
        {/* Amis : toujours là hors mode test ; en invité, l'écran explique qu'il faut un compte. */}
        {!test && (
          <Button
            variant="quiet"
            size="small"
            icon="heal"
            className="hub__friends"
            title={t('hub.menu.friends.hint')}
            onClick={() => {
              go({ name: 'friends' });
            }}
          >
            {t('hub.menu.friends')}
            {signed && pending > 0 && (
              <span className="hub__badge" aria-label={t('hub.friends.badge', { n: pending })}>
                {pending}
              </span>
            )}
          </Button>
        )}
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
              {(TODO[entry.route] ?? [])
                .filter((badge) => todo[badge.key] > 0)
                .map((badge) => (
                  <span
                    key={badge.key}
                    className={`hub__badge hub__badge--${badge.key}`}
                    title={t(badge.text, { n: todo[badge.key] })}
                  >
                    <span aria-hidden="true">
                      {badge.icon !== undefined && <Icon name={badge.icon} />}
                      {todo[badge.key]}
                    </span>
                    <span className="visually-hidden">{t(badge.text, { n: todo[badge.key] })}</span>
                  </span>
                ))}
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
        {admin && !test && (
          <Button
            variant="quiet"
            size="small"
            icon="stat"
            title={t('admin.entry.hint')}
            onClick={() => {
              go({ name: 'admin' });
            }}
          >
            {t('admin.entry')}
          </Button>
        )}
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
