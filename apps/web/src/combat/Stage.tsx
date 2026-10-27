import type { CSSProperties } from 'react';
import { backgroundUrl, GROUND_Y, sprite } from '../art';
import { PixelSprite, PixelText } from '../art/Pixel';
import type { BattleView, Flash, UnitView } from './view';

/** Monde natif : 320 × 180 pixels, agrandi sans lissage. */
export const STAGE_W = 320;
export const STAGE_H = 180;
/** Agrandissement du combat dans l'écran de 960 × 540 et lignes de ciel masquées en haut. */
export const STAGE_SCALE = 3;
export const STAGE_OFFSET = 20;

/** Pieds de chaque emplacement côté héros (l'ennemi est le miroir). */
const SLOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 116, y: GROUND_Y + 14 },
  { x: 74, y: GROUND_Y + 6 },
  { x: 40, y: GROUND_Y + 22 },
];

export function placeOf(unit: Pick<UnitView, 'side' | 'slot'>): { x: number; y: number } {
  const base = SLOTS[unit.slot % SLOTS.length] ?? { x: 80, y: GROUND_Y + 16 };
  return unit.side === 'player' ? base : { x: STAGE_W - base.x, y: base.y };
}

/** Repères d'une unité dans l'écran logique : centre, pieds et haut de la tête. */
export function anchorOf(unit: Pick<UnitView, 'side' | 'slot' | 'kind'>): {
  x: number;
  feet: number;
  head: number;
} {
  const { x, y } = placeOf(unit);
  const info = sprite(unit.kind);
  const height = info === undefined ? 56 : info.bottom - info.top;
  return {
    x: x * STAGE_SCALE,
    feet: (y - STAGE_OFFSET) * STAGE_SCALE,
    head: (y - height - STAGE_OFFSET) * STAGE_SCALE,
  };
}

function Actor(props: {
  readonly unit: UnitView;
  readonly active: boolean;
  readonly acting: boolean;
  readonly targetable: boolean;
  readonly flash: Flash | undefined;
}) {
  const { unit, flash } = props;
  const info = sprite(unit.kind);
  if (info === undefined) return null;
  const { x, y } = placeOf(unit);
  const hit = flash?.tone === 'damage' ? flash.key : 0;
  const style = {
    left: x - info.w / 2,
    top: y - info.bottom,
    width: info.w,
    height: info.h,
    zIndex: y,
    '--dir': unit.side === 'player' ? 1 : -1,
    '--delay': `${-(unit.slot * 0.37 + (unit.side === 'enemy' ? 0.2 : 0))}s`,
  } as CSSProperties;
  const className = [
    'actor',
    `actor--${unit.side}`,
    props.active ? 'actor--active' : '',
    props.acting ? 'actor--acting' : '',
    props.targetable ? 'actor--targetable' : '',
    unit.alive ? '' : 'actor--down',
  ].join(' ');
  return (
    <div className={className} style={style} data-unit={unit.id}>
      <span className="actor__shadow" style={{ top: info.bottom - 2 }} />
      <span className="actor__body">
        <span key={hit} className={hit > 0 ? 'actor__hit' : ''}>
          <PixelSprite name={unit.kind} idle={unit.alive} />
        </span>
      </span>
      {flash?.fx != null && (
        <span key={`fx${flash.key}`} className="actor__fx" style={{ top: info.top + 6 }}>
          <PixelSprite name={flash.fx} className="fx-play" />
        </span>
      )}
      {flash !== undefined && flash.text !== '' && (
        <span key={`n${flash.key}`} className="actor__number" style={{ top: info.top - 4 }}>
          <PixelText text={flash.text} tone={flash.tone} />
        </span>
      )}
    </div>
  );
}

function Bolts({ view }: { readonly view: BattleView }) {
  const cast = view.cast;
  if (cast === null) return null;
  const caster = view.units.find((u) => u.id === cast.unit);
  if (caster === undefined) return null;
  const from = placeOf(caster);
  const casterInfo = sprite(caster.kind);
  const chest = from.y - ((casterInfo?.bottom ?? 60) - (casterInfo?.top ?? 0)) / 2;
  return (
    <>
      <span
        key={`aura${cast.key}`}
        className="stage__aura"
        style={{ left: from.x - 24, top: from.y - 7, zIndex: from.y - 1 }}
      >
        <PixelSprite name={`aura_${cast.element}`} idle />
      </span>
      {cast.targets.map((id) => {
        const target = view.units.find((u) => u.id === id);
        if (target === undefined || target.side === caster.side) return null;
        const to = placeOf(target);
        const info = sprite(target.kind);
        const toY = to.y - ((info?.bottom ?? 60) - (info?.top ?? 0)) / 2;
        const style = {
          left: from.x - 8,
          top: chest - 8,
          '--dx': `${to.x - from.x}px`,
          '--dy': `${toY - chest}px`,
          transform: caster.side === 'enemy' ? 'scaleX(-1)' : undefined,
        } as CSSProperties;
        return (
          <span key={`bolt${cast.key}${id}`} className="stage__bolt" style={style}>
            <PixelSprite name={`bolt_${cast.element}`} idle />
          </span>
        );
      })}
    </>
  );
}

/** Le champ de bataille en pixel art : décor du donjon, sprites animés, effets. */
export function Stage({
  view,
  scene,
  active,
  targets,
}: {
  readonly view: BattleView;
  readonly scene: string;
  readonly active: string | null;
  readonly targets: ReadonlySet<string>;
}) {
  const latest = new Map<string, Flash>();
  for (const f of view.flashes) latest.set(f.unit, f);
  return (
    <div className="stage" aria-hidden="true">
      <div
        className="stage__world"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${STAGE_SCALE}) translateY(${-STAGE_OFFSET}px)`,
          backgroundImage: `url(${backgroundUrl(scene)})`,
        }}
      >
        {view.units.map((unit) => (
          <Actor
            key={unit.id}
            unit={unit}
            active={unit.id === active}
            acting={view.acting === unit.id && active === null}
            targetable={targets.has(unit.id)}
            flash={latest.get(unit.id)}
          />
        ))}
        <Bolts view={view} />
      </div>
    </div>
  );
}
