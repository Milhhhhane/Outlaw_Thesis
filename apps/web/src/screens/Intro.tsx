import { useState } from 'react';
import { Button, Window } from '../game/ui';
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
  const close = (): void => {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      // Stockage bloqué : la fenêtre reviendra au prochain chargement.
    }
    setHidden(true);
  };
  return (
    <Window
      title={t('intro.title')}
      onClose={close}
      className="intro"
      actions={<Button onClick={close}>{t('intro.close')}</Button>}
    >
      <ol className="intro__steps">
        {STEPS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </Window>
  );
}
