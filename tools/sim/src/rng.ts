/**
 * Générateur pseudo-aléatoire à graine (mulberry32). La simulation tire ses builds au hasard,
 * mais toujours avec la même graine : deux exécutions donnent le même CSV.
 */
export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Copie mélangée (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
    int,
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('tirage dans une liste vide');
      return item;
    },
  };
}
