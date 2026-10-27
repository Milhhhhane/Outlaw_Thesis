import { useRef, type CSSProperties } from 'react';
import { backgroundUrl, sprite } from '.';
import { STAGE_H, STAGE_W } from '../combat/Stage';
import { PixelSprite } from './Pixel';
import { useScale } from './useScale';

interface Props {
  readonly scene: string;
  readonly heroes: readonly string[];
  /** Lignes du haut du décor masquées, pour une bande moins haute. */
  readonly cropTop?: number;
  /** Un feu de camp entre les héros et le décor. */
  readonly campfire?: boolean;
}

/** Pieds des héros autour du feu. */
const SPOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 150, y: 160 },
  { x: 100, y: 150 },
  { x: 56, y: 166 },
];

/** Petite scène décorative : un décor de donjon et quelques héros au repos. */
export function Diorama({ scene, heroes, cropTop = 60, campfire = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useScale(ref, STAGE_W);
  const height = STAGE_H - cropTop;
  return (
    <div ref={ref} className="diorama" style={{ height: height * scale }} aria-hidden="true">
      <div
        className="diorama__world"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale}) translateY(${-cropTop}px)`,
          backgroundImage: `url(${backgroundUrl(scene)})`,
        }}
      >
        {heroes.map((kind, slot) => {
          const info = sprite(kind);
          if (info === undefined) return null;
          const { x, y } = SPOTS[slot % SPOTS.length] ?? { x: 100, y: 156 };
          const style = {
            left: x - info.w / 2,
            top: y - info.bottom,
            zIndex: y,
            '--delay': `${-slot * 0.4}s`,
          } as CSSProperties;
          return (
            <span key={kind} className="diorama__unit" style={style}>
              <PixelSprite name={kind} idle />
            </span>
          );
        })}
        {campfire && (
          <span className="diorama__fire">
            <PixelSprite name="aura_fire" idle className="diorama__glow" />
            <PixelSprite name="campfire" idle />
          </span>
        )}
      </div>
    </div>
  );
}
