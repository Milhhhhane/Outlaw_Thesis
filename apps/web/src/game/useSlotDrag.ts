import { useRef, useState, type PointerEvent } from 'react';

/** Distance (pixels d'écran) au-delà de laquelle un appui devient un glissement. */
const THRESHOLD = 8;

export interface SlotDrag {
  /** Emplacement saisi. */
  readonly from: number;
  /** Emplacement survolé, autre que celui de départ. */
  readonly over: number | null;
}

/**
 * Glisser-déposer entre emplacements, à la souris comme au doigt (événements de pointeur : le
 * glisser-déposer HTML ne marche pas au toucher). Ne décide de rien : au lâcher sur un autre
 * emplacement, `onDrop(from, to)` ; un appui sur un bouton de l'emplacement n'est pas un glissement.
 */
export function useSlotDrag(onDrop: (from: number, to: number) => void): {
  readonly drag: SlotDrag | null;
  readonly bind: (slot: number) => {
    ref: (el: HTMLElement | null) => void;
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
  };
} {
  const slots = useRef<(HTMLElement | null)[]>([]);
  const start = useRef<{ slot: number; x: number; y: number; pointer: number } | null>(null);
  const [drag, setDrag] = useState<SlotDrag | null>(null);

  const slotAt = (x: number, y: number): number | null => {
    const index = slots.current.findIndex((el) => {
      const r = el?.getBoundingClientRect();
      return r !== undefined && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    return index < 0 ? null : index;
  };

  const bind = (slot: number) => ({
    ref: (el: HTMLElement | null): void => {
      slots.current[slot] = el;
    },
    onPointerDown: (e: PointerEvent<HTMLElement>): void => {
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('button') !== null) return;
      start.current = { slot, x: e.clientX, y: e.clientY, pointer: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>): void => {
      const from = start.current;
      if (from?.pointer !== e.pointerId) return;
      if (drag === null && Math.hypot(e.clientX - from.x, e.clientY - from.y) < THRESHOLD) return;
      const hit = slotAt(e.clientX, e.clientY);
      const over = hit === from.slot ? null : hit;
      if (drag?.from !== from.slot || drag.over !== over) setDrag({ from: from.slot, over });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>): void => {
      const from = start.current;
      start.current = null;
      if (from?.pointer !== e.pointerId) return;
      const over = drag === null ? null : slotAt(e.clientX, e.clientY);
      setDrag(null);
      if (over !== null && over !== from.slot) onDrop(from.slot, over);
    },
    onPointerCancel: (): void => {
      start.current = null;
      setDrag(null);
    },
  });

  return { drag, bind };
}
