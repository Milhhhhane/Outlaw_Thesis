import type { Profile } from '@outlaw/data';
import { sandboxProfile } from '@outlaw/engine';
import { useEffect, useMemo, useState } from 'react';
import { CombatScreen } from './combat/CombatScreen';
import { content, demoSetup } from './combat/session';
import { EscapeProvider } from './game/keys';
import { GameContext, type GameApi, type Route } from './game/nav';
import { OptionsProvider } from './game/options';
import { GameShell } from './game/Shell';
import { t } from './i18n';
import { buildsFromLocation, SHARE_PREFIX } from './save/share';
import { Credits } from './screens/Credits';
import { DungeonRun } from './screens/DungeonRun';
import { Heroes } from './screens/Heroes';
import { HeroSheet } from './screens/HeroSheet';
import { Hub } from './screens/Hub';
import { MapScreen } from './screens/MapScreen';
import { OptionsWindow } from './screens/OptionsWindow';
import { Team } from './screens/Team';
import { Title } from './screens/Title';
import { Workshop } from './screens/Workshop';
import { ProfileProvider } from './state/profile';
import './App.css';

function Current({ route, go }: { readonly route: Route; readonly go: (r: Route) => void }) {
  const demo = useMemo(() => demoSetup(), []);
  const hub = (): void => {
    go({ name: 'hub' });
  };
  switch (route.name) {
    case 'title':
      return <Title />;
    case 'hub':
      return <Hub />;
    case 'map':
      return <MapScreen initial={route.dungeon} />;
    case 'team':
      return <Team dungeon={route.dungeon} />;
    case 'heroes':
      return <Heroes />;
    case 'hero':
      return (
        <HeroSheet
          heroId={route.id}
          onBack={() => {
            go({ name: 'heroes' });
          }}
        />
      );
    case 'workshop':
      return <Workshop />;
    case 'credits':
      return <Credits />;
    case 'dungeon':
      return <DungeonRun dungeonId={route.id} onExit={hub} />;
    case 'demo':
      return <CombatScreen setup={demo} onExit={hub} />;
  }
}

function Game({
  version,
  start,
  onTestMode,
}: {
  readonly version: string;
  readonly start: Route;
  readonly onTestMode: () => void;
}) {
  const [route, setRoute] = useState<Route>(start);
  const [options, setOptions] = useState(false);
  const api = useMemo<GameApi>(
    () => ({
      go: setRoute,
      openOptions: () => {
        setOptions(true);
      },
      toggleTestMode: onTestMode,
      version,
    }),
    [onTestMode, version],
  );
  // Chaque écran est remonté à l'arrivée : le fondu d'entrée rejoue.
  const key = JSON.stringify(route);
  return (
    <GameContext.Provider value={api}>
      <div key={key} className="route">
        <Current route={route} go={setRoute} />
      </div>
      {options && (
        <OptionsWindow
          onClose={() => {
            setOptions(false);
          }}
        />
      )}
    </GameContext.Provider>
  );
}

interface Sandbox {
  readonly profile: Profile;
  /** Le lien de build était abîmé : on l'a signalé et ouvert l'équipe par défaut. */
  readonly invalidLink: boolean;
}

/** Un lien `#build=…` ouvre directement le mode test avec l'équipe partagée. */
function sandboxFromLocation(): Sandbox | null {
  const { hash } = window.location;
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  const builds = buildsFromLocation(hash, content);
  return { profile: sandboxProfile(content, builds ?? []), invalidLink: builds === null };
}

function clearHash(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function App({
  version,
  initial,
  start,
}: {
  readonly version: string;
  readonly initial?: Profile;
  /** Écran de départ (l'écran-titre par défaut). */
  readonly start?: Route;
}) {
  const [sandbox, setSandbox] = useState<Sandbox | null>(sandboxFromLocation);
  // En quittant le mode test, on revient au camp de la partie normale.
  const [resume, setResume] = useState<Route | null>(null);

  // Un lien de build collé dans un onglet déjà ouvert ne recharge pas la page : on l'écoute.
  useEffect(() => {
    const onHash = (): void => {
      const next = sandboxFromLocation();
      if (next !== null) setSandbox(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const body =
    sandbox !== null ? (
      <ProfileProvider key="test" initial={sandbox.profile} persist={false}>
        {sandbox.invalidLink && <p className="toast">{t('test.shared.invalid')}</p>}
        <Game
          version={version}
          start={{ name: 'team' }}
          onTestMode={() => {
            clearHash();
            setResume({ name: 'hub' });
            setSandbox(null);
          }}
        />
      </ProfileProvider>
    ) : (
      <ProfileProvider key="game" initial={initial}>
        <Game
          version={version}
          start={resume ?? start ?? { name: 'title' }}
          onTestMode={() => {
            setSandbox({ profile: sandboxProfile(content), invalidLink: false });
          }}
        />
      </ProfileProvider>
    );

  return (
    <OptionsProvider>
      <EscapeProvider>
        <GameShell>{body}</GameShell>
      </EscapeProvider>
    </OptionsProvider>
  );
}
