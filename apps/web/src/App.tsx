import { useMemo, useState } from 'react';
import { CombatScreen } from './combat/CombatScreen';
import { content, demoSetup } from './combat/session';
import { names, t, type TextKey } from './i18n';
import './App.css';

const PILLARS: readonly TextKey[] = [
  'home.pillars.queue',
  'home.pillars.reserve',
  'home.pillars.builds',
];

type Screen = 'home' | 'combat';

export function App({ version }: { readonly version: string }) {
  const [screen, setScreen] = useState<Screen>('home');
  const setup = useMemo(() => demoSetup(), []);

  if (screen === 'combat') {
    return (
      <CombatScreen
        setup={setup}
        onExit={() => {
          setScreen('home');
        }}
      />
    );
  }

  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__title">{t('app.title')}</h1>
        <p className="home__tagline">{t('app.tagline')}</p>
      </header>

      <ul className="home__heroes">
        {content.heroes.map((hero) => (
          <li key={hero.id} className={`home__hero element-${hero.element}`}>
            <span className="home__hero-name">{names.hero(hero.id)}</span>
            <span className="home__hero-thesis">{names.heroThesis(hero.id)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="button button--large"
        onClick={() => {
          setScreen('combat');
        }}
      >
        {t('home.play')}
      </button>

      <section className="home__pillars" aria-labelledby="pillars-heading">
        <h2 id="pillars-heading">{t('home.pillars.heading')}</h2>
        <ul>
          {PILLARS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <footer className="home__footer">{t('home.version', { version })}</footer>
    </main>
  );
}
