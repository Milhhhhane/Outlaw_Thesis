import { t, type TextKey } from './i18n';
import './App.css';

const PILLARS: readonly TextKey[] = [
  'home.pillars.queue',
  'home.pillars.reserve',
  'home.pillars.builds',
];

export function App({ version }: { readonly version: string }) {
  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__title">{t('app.title')}</h1>
        <p className="home__tagline">{t('app.tagline')}</p>
      </header>

      <section className="home__panel" aria-labelledby="pillars-heading">
        <h2 id="pillars-heading">{t('home.pillars.heading')}</h2>
        <ul className="home__pillars">
          {PILLARS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <section className="home__panel" aria-labelledby="status-heading">
        <h2 id="status-heading">{t('home.status.heading')}</h2>
        <p>{t('home.status.body')}</p>
      </section>

      <footer className="home__footer">{t('home.version', { version })}</footer>
    </main>
  );
}
