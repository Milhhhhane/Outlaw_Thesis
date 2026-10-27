import atlasUrl from './atlas.png';
import { GLYPHS, SPRITES } from './sprites';
import type { SpriteInfo } from './types';

export { atlasUrl, GLYPHS, SPRITES };
export { GROUND_Y } from './sprites';
export type { SpriteInfo } from './types';

const backgrounds = import.meta.glob<string>('./bg/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Décor d'un donjon (le premier par défaut, pour les combats hors donjon). */
export function backgroundUrl(scene: string): string {
  return backgrounds[`./bg/${scene}.png`] ?? backgrounds['./bg/ember_wastes.png'] ?? '';
}

export function sprite(name: string): SpriteInfo | undefined {
  return SPRITES[name];
}

/** Position CSS d'une image de l'atlas. */
export function framePosition(info: SpriteInfo, frame: number): string {
  const [x = 0, y = 0] = info.frames[frame % info.frames.length] ?? [];
  return `-${x}px -${y}px`;
}
