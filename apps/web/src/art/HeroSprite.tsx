import type { CSSProperties } from 'react';
import { sprite } from '.';
import { PixelSprite } from './Pixel';

/**
 * Prise en main de l'arme : position du bas de l'arme par rapport au milieu et au bas du sprite
 * (pixels natifs). Le milieu, et non le bord gauche : les héros à coiffe large ont un sprite élargi
 * des deux côtés (tools/art/looks.py), la main reste au même endroit.
 */
const GRIP: Readonly<
  Record<string, { readonly x: number; readonly y: number; readonly tilt: number }>
> = {
  pyra: { x: 13, y: 0, tilt: 8 },
  cendre: { x: 13, y: 0, tilt: 8 },
  maree: { x: 14, y: 2, tilt: 28 },
  ressac: { x: 14, y: 2, tilt: 30 },
  ronce: { x: 13, y: 0, tilt: 6 },
  seve: { x: 13, y: 0, tilt: 8 },
  // Les héros suivants reprennent la prise de leur base (tools/art/looks.py, pack.py).
  tison: { x: 14, y: 2, tilt: 30 },
  ecume: { x: 13, y: 0, tilt: 8 },
  yucca: { x: 14, y: 2, tilt: 28 },
  houx: { x: 13, y: 0, tilt: 8 },
  forge: { x: 14, y: 2, tilt: 28 },
  lanterne: { x: 13, y: 0, tilt: 8 },
  mousson: { x: 14, y: 2, tilt: 30 },
  brume: { x: 13, y: 0, tilt: 8 },
  sillage: { x: 13, y: 0, tilt: 6 },
  chardon: { x: 14, y: 2, tilt: 30 },
  mousse: { x: 13, y: 0, tilt: 8 },
  genet: { x: 14, y: 2, tilt: 30 },
  etendard: { x: 14, y: 2, tilt: 28 },
  soufre: { x: 13, y: 0, tilt: 8 },
  torrent: { x: 14, y: 2, tilt: 28 },
  sequoia: { x: 14, y: 2, tilt: 28 },
  eden: { x: 13, y: 0, tilt: 8 },
  phenix: { x: 13, y: 0, tilt: 6 },
  sablier: { x: 13, y: 0, tilt: 8 },
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
              left: info.w / 2 + grip.x - weapon.w / 2,
              bottom: grip.y,
              '--tilt': `${String(grip.tilt)}deg`,
            } as CSSProperties
          }
        />
      )}
    </span>
  );
}
