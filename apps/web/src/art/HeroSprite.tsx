import type { CSSProperties } from 'react';
import { sprite } from '.';
import { PixelSprite } from './Pixel';

/** Prise en main de l'arme : position du bas de l'arme par rapport au sprite (pixels natifs). */
const GRIP: Readonly<
  Record<string, { readonly x: number; readonly y: number; readonly tilt: number }>
> = {
  pyra: { x: 29, y: 0, tilt: 8 },
  cendre: { x: 29, y: 0, tilt: 8 },
  maree: { x: 30, y: 2, tilt: 28 },
  ressac: { x: 30, y: 2, tilt: 30 },
  ronce: { x: 29, y: 0, tilt: 6 },
  seve: { x: 29, y: 0, tilt: 8 },
  // Les héros suivants reprennent la prise de leur base (tools/art/pack.py).
  tison: { x: 30, y: 2, tilt: 30 },
  ecume: { x: 29, y: 0, tilt: 8 },
  yucca: { x: 30, y: 2, tilt: 28 },
  houx: { x: 29, y: 0, tilt: 8 },
  forge: { x: 30, y: 2, tilt: 28 },
  lanterne: { x: 29, y: 0, tilt: 8 },
  mousson: { x: 30, y: 2, tilt: 30 },
  brume: { x: 29, y: 0, tilt: 8 },
  sillage: { x: 29, y: 0, tilt: 6 },
  chardon: { x: 30, y: 2, tilt: 30 },
  mousse: { x: 29, y: 0, tilt: 8 },
  genet: { x: 30, y: 2, tilt: 30 },
  etendard: { x: 30, y: 2, tilt: 28 },
  soufre: { x: 29, y: 0, tilt: 8 },
  torrent: { x: 30, y: 2, tilt: 28 },
  sequoia: { x: 30, y: 2, tilt: 28 },
  eden: { x: 29, y: 0, tilt: 8 },
  phenix: { x: 29, y: 0, tilt: 6 },
  sablier: { x: 29, y: 0, tilt: 8 },
};

/**
 * Un héros avec son arme en main. Même taille que le sprite seul : les écrans qui agrandissent
 * `.pixel` d'un héros agrandissent l'ensemble via `.hero-sprite`.
 */
export function HeroSprite({
  name,
  idle = false,
  className,
}: {
  readonly name: string;
  readonly idle?: boolean;
  readonly className?: string;
}) {
  const info = sprite(name);
  if (info === undefined) return null;
  const weapon = sprite(`weapon_${name}`);
  const grip = GRIP[name];
  const style = { width: info.w, height: info.h } as CSSProperties;
  return (
    <span className={['hero-sprite', className ?? ''].join(' ')} style={style}>
      <PixelSprite name={name} idle={idle} />
      {weapon !== undefined && grip !== undefined && (
        <PixelSprite
          name={`weapon_${name}`}
          className="hero-sprite__weapon"
          style={
            {
              position: 'absolute',
              left: grip.x - weapon.w / 2,
              bottom: grip.y,
              '--tilt': `${String(grip.tilt)}deg`,
            } as CSSProperties
          }
        />
      )}
    </span>
  );
}
