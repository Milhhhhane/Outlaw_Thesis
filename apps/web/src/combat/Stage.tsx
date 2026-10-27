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

/** Couleur des étincelles par élément (palette des effets). */
const SPARK: Readonly<Record<string, string>> = {
  fire: '#ffb840',
  water: '#8cd0f0',
  nature: '#8ad84a',
};

/** Étincelles qui s'écartent du point d'impact : six carrés, trajectoire en variables CSS. */
function Sparks({
  flash,
  element,
  top,
}: {
  readonly flash: Flash;
  readonly element: string;
  readonly top: number;
}) {
  const count = flash.heavy ? 10 : 6;
  return (
    <span className="sparks" style={{ top }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (flash.key % 7) * 0.3;
        const dist = (flash.heavy ? 22 : 14) + ((flash.key * 13 + i * 7) % 9);
        const style = {
          '--sx': `${Math.cos(angle) * dist}px`,
          '--sy': `${Math.sin(angle) * dist * 0.7 - 4}px`,
          '--sd': `${(i % 3) * 30}ms`,
          background: i % 3 === 0 ? '#fff6d8' : (SPARK[element] ?? '#fff'),
        } as CSSProperties;
        return <i key={i} className="spark" style={style} />;
      })}
    </span>
  );
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
  const heavy = flash?.tone === 'damage' && flash.heavy;
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
        <span
          key={hit}
          className={hit > 0 ? (heavy ? 'actor__hit actor__hit--heavy' : 'actor__hit') : ''}
        >
          <PixelSprite name={unit.kind} idle={unit.alive} />
        </span>
      </span>
      {flash?.fx != null && (
        <span
          key={`fx${flash.key}`}
          className={flash.feet ? 'actor__fx actor__fx--feet' : 'actor__fx'}
          style={flash.feet ? { top: info.bottom - 12 } : { top: info.top + 6 }}
        >
          <PixelSprite
            name={flash.fx}
            className={flash.fx.startsWith('impact_') ? 'fx-play fx-play--big' : 'fx-play'}
          />
        </span>
      )}
      {flash?.tone === 'damage' && (
        <Sparks
          key={`sp${flash.key}`}
          flash={flash}
          element={flash.fx?.split('_')[1] ?? unit.element}
          top={info.top + 22}
        />
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
  const dir = caster.side === 'player' ? 1 : -1;
  return (
    <>
      <span
        key={`slash${cast.key}`}
        className="stage__slash"
        style={{
          left: from.x + dir * 18 - 24,
          top: chest - 24,
          zIndex: from.y + 1,
          transform: dir < 0 ? 'scaleX(-1)' : undefined,
        }}
      >
        <PixelSprite name={`slash_${cast.element}`} className="fx-play" />
      </span>
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
  const shake = view.shake;
  const ult = view.cast?.ult === true ? view.cast.key : null;
  return (
    <div className="stage" aria-hidden="true">
      {/* Secousse et zoom : jamais de clé React ici, sinon tous les acteurs seraient recréés à
          chaque coup et l'animation de chute des unités à terre rejouerait. Le nom de
          l'animation alterne (a/b) pour relancer la secousse sans remonter le conteneur. */}
      <div
        className={
          shake === null
            ? 'stage__shake'
            : `stage__shake stage__shake--${shake.power}${shake.key % 2 === 0 ? 'a' : 'b'}`
        }
      >
        <div
          className={
            ult === null
              ? 'stage__zoom'
              : `stage__zoom stage__zoom--ult${ult % 2 === 0 ? 'a' : 'b'}`
          }
        >
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
      </div>
      {view.hurt !== null && <span key={`hurt${view.hurt}`} className="stage__hurt" />}
      {ult !== null && <span key={`flash${ult}`} className="stage__ult" />}
    </div>
  );
}
