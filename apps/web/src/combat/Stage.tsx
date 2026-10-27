import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { backgroundUrl, GROUND_Y, sprite } from '../art';
import { PixelSprite, PixelText } from '../art/Pixel';
import type { BattleView, Flash, UnitView } from './view';

/** Monde natif : 320 × 180 pixels, agrandi sans lissage. */
export const STAGE_W = 320;
export const STAGE_H = 180;

/** Pieds de chaque emplacement côté héros (l'ennemi est le miroir). */
const SLOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 116, y: GROUND_Y + 20 },
  { x: 76, y: GROUND_Y + 8 },
  { x: 42, y: GROUND_Y + 32 },
];

export function placeOf(unit: Pick<UnitView, 'side' | 'slot'>): { x: number; y: number } {
  const base = SLOTS[unit.slot % SLOTS.length] ?? { x: 80, y: GROUND_Y + 16 };
  return unit.side === 'player' ? base : { x: STAGE_W - base.x, y: base.y };
}

interface Props {
  readonly view: BattleView;
  readonly scene: string;
  readonly active: string | null;
  readonly targets: ReadonlySet<string>;
  readonly onTarget: (id: string) => void;
}

/** Facteur d'agrandissement : le monde natif remplit toute la largeur disponible. */
function useScale(ref: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const raw = el.clientWidth / STAGE_W;
      setScale(Math.max(0.5, raw));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return scale;
}

function Actor(props: {
  readonly unit: UnitView;
  readonly active: boolean;
  readonly acting: boolean;
  readonly targetable: boolean;
  readonly flash: Flash | undefined;
  readonly onTarget: (id: string) => void;
}) {
  const { unit, flash } = props;
  const info = sprite(unit.kind);
  if (info === undefined) return null;
  const { x, y } = placeOf(unit);
  const hit = flash?.tone === 'damage' ? flash.key : 0;
  const hpPct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const shieldPct = Math.min(100, Math.round((unit.shield / unit.maxHp) * 100));
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
      {props.targetable && (
        <button
          type="button"
          className="actor__target"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            props.onTarget(unit.id);
          }}
        />
      )}
      {unit.alive && (
        <span className="actor__hud" style={{ top: Math.max(0, info.top - 8) }}>
          {props.active && <span className="actor__marker" />}
          <span className="actor__bar">
            <span className="actor__hp" style={{ width: `${hpPct}%` }} />
            {unit.shield > 0 && (
              <span className="actor__shield" style={{ width: `${shieldPct}%` }} />
            )}
          </span>
        </span>
      )}
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
export function Stage({ view, scene, active, targets, onTarget }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useScale(ref);
  const latest = new Map<string, Flash>();
  for (const f of view.flashes) latest.set(f.unit, f);
  return (
    <div ref={ref} className="stage" style={{ height: STAGE_H * scale }} aria-hidden="true">
      <div
        className="stage__world"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
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
            onTarget={onTarget}
          />
        ))}
        <Bolts view={view} />
      </div>
    </div>
  );
}
