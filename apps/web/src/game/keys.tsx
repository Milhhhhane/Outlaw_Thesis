import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Touche Échap : chaque écran ou fenêtre ouverte déclare ce que « retour » veut dire ;
 * seule la dernière déclarée (la plus au premier plan) réagit.
 */
type Handler = () => void;

interface EscapeApi {
  readonly push: (handler: { current: Handler | null }) => () => void;
}

const EscapeContext = createContext<EscapeApi | null>(null);

export function EscapeProvider({ children }: { readonly children: ReactNode }) {
  const stack = useRef<{ current: Handler | null }[]>([]);
  const [api] = useState<EscapeApi>(() => ({
    push: (handler) => {
      stack.current.push(handler);
      return () => {
        stack.current = stack.current.filter((h) => h !== handler);
      };
    },
  }));
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const top = stack.current.at(-1)?.current;
      if (top) {
        event.preventDefault();
        top();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return <EscapeContext.Provider value={api}>{children}</EscapeContext.Provider>;
}

/** Déclare l'action d'Échap pour ce composant tant qu'il est affiché (null : aucune). */
export function useEscape(handler: Handler | null): void {
  const api = useContext(EscapeContext);
  const ref = useRef<Handler | null>(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (api !== null) return api.push(ref);
    // Hors du jeu (écran affiché seul) : on écoute la touche directement.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && ref.current) ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [api]);
}
