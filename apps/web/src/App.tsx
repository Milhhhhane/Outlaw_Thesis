import type { Profile } from '@outlaw/data';
import { useMemo, useState } from 'react';
import { CombatScreen } from './combat/CombatScreen';
import { demoSetup } from './combat/session';
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

function Screens({ version }: { readonly version: string }) {
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
        />
      );
  }
}

export function App({
  version,
  initial,
}: {
  readonly version: string;
  readonly initial?: Profile;
}) {
  return (
    <ProfileProvider initial={initial}>
      <Screens version={version} />
    </ProfileProvider>
  );
}
