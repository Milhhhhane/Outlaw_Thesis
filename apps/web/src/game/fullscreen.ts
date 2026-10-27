/**
 * Plein écran. L'API Fullscreen exige un geste de l'utilisateur (clic, touche) ; elle n'existe
 * pas sur iPhone (seulement sur iPad), où l'on propose l'installation sur l'écran d'accueil.
 */
/** Champs du plein écran, éventuellement absents ou préfixés selon le navigateur. */
interface FullscreenDocument {
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  readonly fullscreenElement?: Element | null;
  readonly webkitFullscreenElement?: Element | null;
  readonly exitFullscreen?: () => Promise<void>;
  readonly webkitExitFullscreen?: () => Promise<void> | undefined;
}
interface FullscreenElement {
  readonly requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  readonly webkitRequestFullscreen?: () => Promise<void> | undefined;
}

function doc(): FullscreenDocument {
  return document;
}

export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const d = doc();
  return d.fullscreenEnabled === true || d.webkitFullscreenEnabled === true;
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = doc();
  return (d.fullscreenElement ?? d.webkitFullscreenElement ?? null) !== null;
}

/** À appeler depuis un gestionnaire de clic ou de touche. */
export async function toggleFullscreen(): Promise<void> {
  const d = doc();
  try {
    if (isFullscreen()) {
      await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      return;
    }
    const root = document.documentElement as unknown as FullscreenElement;
    await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
  } catch {
    // Refusé par le navigateur (pas de geste, politique) : la partie continue en fenêtre.
  }
}
/** Lancé depuis l'écran d'accueil (application installée, sans barre d'adresse). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const nav = window.navigator as Navigator & { readonly standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}
