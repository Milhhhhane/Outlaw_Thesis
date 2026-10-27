import { useEffect, useState, type RefObject } from 'react';

/** Facteur d'agrandissement pour qu'un monde de `width` pixels natifs remplisse son conteneur. */
export function useScale(ref: RefObject<HTMLElement | null>, width: number, initial = 3): number {
  const [scale, setScale] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setScale(Math.max(0.5, el.clientWidth / width));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, width]);
  return scale;
}
