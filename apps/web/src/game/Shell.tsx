import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { TooltipLayer } from './Glossed';
import { toggleFullscreen } from './fullscreen';
import './game.css';

/** Résolution logique du jeu : tout est dessiné à cette taille puis mis à l'échelle. */
export const VIEW_W = 960;
export const VIEW_H = 540;

function fit(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
}

/**
 * La coque : un écran 16:9 de 960 × 540 mis à l'échelle de la fenêtre, bandes noires autour,
 * aucun défilement, ni zoom au pincement ; F11 bascule en plein écran ; en portrait sur un
 * appareil tactile, on demande de tourner l'écran.
 */
export function GameShell({ children }: { readonly children: ReactNode }) {
  const [scale, setScale] = useState(fit);

  useEffect(() => {
    const onResize = (): void => {
      setScale(fit());
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F11') {
        event.preventDefault();
        void toggleFullscreen();
      }
    };
    // Safari iOS ignore « user-scalable=no » : on bloque le pincement à la source.
    const noGesture = (event: Event): void => {
      event.preventDefault();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    document.addEventListener('gesturestart', noGesture);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('gesturestart', noGesture);
    };
  }, []);

  return (
    <div className="shell">
      <div
        className="shell__screen"
        style={{
          width: VIEW_W,
          height: VIEW_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
        <TooltipLayer />
      </div>
      <div className="shell__rotate">
        <span className="shell__rotate-icon" aria-hidden="true" />
        <p>{t('shell.rotate')}</p>
      </div>
    </div>
  );
}
