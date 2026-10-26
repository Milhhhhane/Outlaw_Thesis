import { useState } from 'react';
import { t, type TextKey } from '../i18n';

const KEY = 'outlaw-thesis/intro-dismissed';
const STEPS: readonly TextKey[] = ['intro.1', 'intro.2', 'intro.3', 'intro.4'];

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Premiers pas : quatre étapes, dans l'ordre de la boucle, masquables une fois lues. */
export function Intro() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  return (
    <section className="intro" aria-labelledby="intro-heading">
      <h2 id="intro-heading">{t('intro.title')}</h2>
      <ol>
        {STEPS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, '1');
          } catch {
            // Stockage bloqué : le panneau reviendra au prochain chargement.
          }
          setHidden(true);
        }}
      >
        {t('intro.close')}
      </button>
    </section>
  );
}
