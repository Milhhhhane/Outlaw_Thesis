import type { Profile } from '@outlaw/data';
import { sandboxProfile } from '@outlaw/engine';
import { useEffect, useMemo, useState } from 'react';
import { CombatScreen } from './combat/CombatScreen';
import { content, demoSetup } from './combat/session';
import { t } from './i18n';
import { buildsFromLocation, SHARE_PREFIX } from './save/share';
import { Camp } from './screens/Camp';
import { DungeonRun } from './screens/DungeonRun';
import { HeroScreen } from './screens/HeroScreen';
import { ProfileProvider } from './state/profile';
import './App.css';
import './screens/screens.css';

type Screen =
  | { readonly name: 'camp' }
  | { readonly name: 'hero'; readonly id: string }
  | { readonly name: 'dungeon'; readonly id: string }
  | { readonly name: 'demo' };

function Screens({
  version,
  onTestMode,
}: {
  readonly version: string;
  readonly onTestMode: () => void;
}) {
  const [screen, setScreen] = useState<Screen>({ name: 'camp' });
  const demo = useMemo(() => demoSetup(), []);
  const camp = (): void => {
    setScreen({ name: 'camp' });
  };

  switch (screen.name) {
    case 'hero':
      return <HeroScreen heroId={screen.id} onBack={camp} />;
    case 'dungeon':
      return <DungeonRun dungeonId={screen.id} onExit={camp} />;
    case 'demo':
      return <CombatScreen setup={demo} onExit={camp} />;
    case 'camp':
      return (
        <Camp
          version={version}
          onHero={(id) => {
            setScreen({ name: 'hero', id });
          }}
          onDungeon={(id) => {
            setScreen({ name: 'dungeon', id });
          }}
          onDemo={() => {
            setScreen({ name: 'demo' });
          }}
          onTestMode={onTestMode}
        />
      );
  }
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
}: {
  readonly version: string;
  readonly initial?: Profile;
}) {
  const [sandbox, setSandbox] = useState<Sandbox | null>(sandboxFromLocation);

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

  if (sandbox !== null) {
    return (
      <ProfileProvider key="test" initial={sandbox.profile} persist={false}>
        {sandbox.invalidLink && <p className="notice notice--page">{t('test.shared.invalid')}</p>}
        <Screens
          version={version}
          onTestMode={() => {
            clearHash();
            setSandbox(null);
          }}
        />
      </ProfileProvider>
    );
  }
  return (
    <ProfileProvider key="game" initial={initial}>
      <Screens
        version={version}
        onTestMode={() => {
          setSandbox({ profile: sandboxProfile(content), invalidLink: false });
        }}
      />
    </ProfileProvider>
  );
}
