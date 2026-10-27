import type { CSSProperties } from 'react';
import './pixel.css';
import { atlasUrl, framePosition, GLYPHS, sprite } from '.';

interface SpriteProps {
  readonly name: string;
  readonly className?: string;
  /** Anime en boucle les images de repos (quatre pas ; une image en double pour deux images). */
  readonly idle?: boolean;
  /** Image fixe à montrer (par exemple l'image de dégâts), si le sprite la possède. */
  readonly frame?: number;
  readonly style?: CSSProperties;
}

/** Une image de l'atlas, à l'échelle native : le parent choisit l'agrandissement. */
export function PixelSprite({ name, className, idle = false, frame, style }: SpriteProps) {
  const info = sprite(name);
  if (info === undefined) return null;
  const fixed = frame !== undefined && frame < info.frames.length;
  const vars = {
    width: info.w,
    height: info.h,
    backgroundImage: `url(${atlasUrl})`,
    backgroundPosition: framePosition(info, fixed ? frame : 0),
    '--f0': framePosition(info, 0),
    '--f1': framePosition(info, 1),
    '--f2': framePosition(info, 2),
    '--f3': framePosition(info, 3),
    '--f4': framePosition(info, 4),
    ...style,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={['pixel', idle && !fixed ? 'pixel--idle' : '', className ?? ''].join(' ')}
      style={vars}
    />
  );
}

/** Nombre en police pixel 3×5 (chiffres, +, −, « et »). */
export function PixelText({ text, tone }: { readonly text: string; readonly tone: string }) {
  const info = sprite(`font_${tone}`);
  if (info === undefined) return null;
  const chars = Array.from(text.replace('−', '-').replace('«', '<').replace('»', '>'));
  return (
    <span className="pixel-text" aria-hidden="true">
      {chars.map((ch, i) => {
        const index = GLYPHS.indexOf(ch);
        if (index < 0) return null;
        return (
          <span
            key={i}
            className="pixel"
            style={{
              width: info.w,
              height: info.h,
              backgroundImage: `url(${atlasUrl})`,
              backgroundPosition: framePosition(info, index),
            }}
          />
        );
      })}
    </span>
  );
}
