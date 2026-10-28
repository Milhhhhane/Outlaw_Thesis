import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n';
import { Button } from './ui';

/** Secondes laissées au joueur avant que le mode Auto passe à la suite. */
export const COUNTDOWN_SECONDS = 5;

export interface CountdownState {
  /** Secondes restantes ; `null` si le décompte ne court pas (inactif, interrompu ou fini). */
  readonly left: number | null;
  /** Élément dont les clics et touches n'interrompent pas le décompte (« Continuer maintenant »). */
  readonly keep: RefObject<HTMLButtonElement | null>;
}

/**
 * Décompte de `seconds` secondes qui appelle `onDone` à zéro. Tout clic ou toute touche
 * ailleurs que sur `keep` l'interrompt pour de bon : le joueur reprend la main. Il ne repart pas
 * de lui-même ; un nouvel écran (nouveau composant) en ouvre un nouveau.
 */
export function useCountdown(
  enabled: boolean,
  onDone: () => void,
  seconds = COUNTDOWN_SECONDS,
): CountdownState {
  const [left, setLeft] = useState(seconds);
  const [stopped, setStopped] = useState(false);
  const keep = useRef<HTMLButtonElement | null>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  const running = enabled && !stopped;

  useEffect(() => {
    if (!running) return;
    const tick = window.setTimeout(() => {
      if (left > 1) {
        setLeft(left - 1);
        return;
      }
      setStopped(true);
      done.current();
    }, 1000);
    const stop = (event: Event): void => {
      if (event.target instanceof Node && keep.current?.contains(event.target) === true) return;
      setStopped(true);
    };
    // En capture : l'interruption précède l'action du clic ou de la touche, quelle qu'elle soit.
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    return () => {
      window.clearTimeout(tick);
      window.removeEventListener('pointerdown', stop, true);
      window.removeEventListener('keydown', stop, true);
    };
  }, [running, left]);

  return { left: running ? left : null, keep };
}

/**
 * Décompte affiché avant une suite automatique : phrase annoncée (zone de statut), chiffre qui
 * descend, bouton pour ne pas attendre. Rien n'est affiché quand le décompte ne court pas.
 */
export function Countdown({
  enabled,
  text,
  onDone,
}: {
  readonly enabled: boolean;
  /** Phrase complète pour `s` secondes restantes (« Salle suivante dans 3 s »). */
  readonly text: (s: number) => string;
  readonly onDone: () => void;
}) {
  const { left, keep } = useCountdown(enabled, onDone);
  if (left === null) return null;
  return (
    <div className="countdown">
      <p className="countdown__text" role="status">
        <span key={left} className="countdown__digit" aria-hidden="true">
          {left}
        </span>
        {text(left)}
      </p>
      <Button ref={keep} size="small" variant="quiet" onClick={onDone}>
        {t('combat.auto.now')}
      </Button>
    </div>
  );
}
