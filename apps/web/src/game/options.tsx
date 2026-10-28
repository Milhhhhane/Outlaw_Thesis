import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Réglages de confort, propres à l'appareil (hors sauvegarde de partie). */
export interface Options {
  /** Vitesse du rejeu des combats : ×1 ou ×2. */
  readonly speed: 'normal' | 'fast';
  /** Animations de l'interface (fondus, rebonds, sprites au repos). */
  readonly animations: boolean;
  /** Combat automatique : le jeu joue les tours des héros. Retenu d'un combat à l'autre (donjon). */
  readonly auto: boolean;
  /** Tour : en mode Auto, une victoire enchaîne sur l'étage suivant (sinon retour à la tour). */
  readonly towerClimb: boolean;
}

export const OPTIONS_KEY = 'outlaw-thesis/options';
const DEFAULTS: Options = { speed: 'normal', animations: true, auto: false, towerClimb: false };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function load(): Options {
  const base = prefersReducedMotion() ? { ...DEFAULTS, animations: false } : DEFAULTS;
  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (raw === null) return base;
    const parsed = JSON.parse(raw) as Partial<Record<keyof Options, unknown>>;
    return {
      // L'ancienne vitesse « instantanée » retombe sur ×2.
      speed:
        parsed.speed === 'normal' || parsed.speed === 'fast'
          ? parsed.speed
          : parsed.speed === 'instant'
            ? 'fast'
            : base.speed,
      animations: typeof parsed.animations === 'boolean' ? parsed.animations : base.animations,
      auto: typeof parsed.auto === 'boolean' ? parsed.auto : base.auto,
      towerClimb: typeof parsed.towerClimb === 'boolean' ? parsed.towerClimb : base.towerClimb,
    };
  } catch {
    return base;
  }
}

/** Multiplicateur appliqué à la durée des événements de combat. */
export function speedFactor(speed: Options['speed']): number {
  return speed === 'normal' ? 1 : 0.5;
}

interface OptionsApi {
  readonly options: Options;
  readonly set: (change: Partial<Options>) => void;
}

const OptionsContext = createContext<OptionsApi | null>(null);

export function OptionsProvider({ children }: { readonly children: ReactNode }) {
  const [options, setOptions] = useState<Options>(load);
  useEffect(() => {
    try {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      // Stockage bloqué : les réglages valent pour cette session.
    }
    document.documentElement.dataset.motion = options.animations ? 'on' : 'off';
  }, [options]);
  const api = useMemo<OptionsApi>(
    () => ({
      options,
      set: (change) => {
        setOptions((current) => ({ ...current, ...change }));
      },
    }),
    [options],
  );
  return <OptionsContext.Provider value={api}>{children}</OptionsContext.Provider>;
}

/** Réglages courants ; hors du jeu (écran isolé), ceux enregistrés sur l'appareil. */
export function useOptions(): OptionsApi {
  return (
    useContext(OptionsContext) ?? {
      options: load(),
      set: (change) => {
        try {
          window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...load(), ...change }));
        } catch {
          // Stockage bloqué : rien à retenir.
        }
      },
    }
  );
}
