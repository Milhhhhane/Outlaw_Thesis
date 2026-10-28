import type { CSSProperties } from 'react';
import { backgroundUrl, GROUND_Y, sprite, type SpriteInfo } from '../art';
import { HeroSprite } from '../art/HeroSprite';
import { PixelSprite, PixelText } from '../art/Pixel';
import type { BattleView, Flash, UnitView } from './view';

/** Monde natif : 320 × 180 pixels, agrandi sans lissage. */
export const STAGE_W = 320;
export const STAGE_H = 180;
/** Agrandissement du combat dans l'écran de 960 × 540 et lignes de ciel masquées en haut. */
export const STAGE_SCALE = 3;
export const STAGE_OFFSET = 20;

/**
 * Pieds de chaque emplacement côté héros (l'ennemi est le miroir) : deux rangs en quinconce,
 * les emplacements pairs devant, les impairs derrière et plus haut.
 */
const SLOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 130, y: GROUND_Y + 20 },
  { x: 98, y: GROUND_Y + 2 },
  { x: 64, y: GROUND_Y + 22 },
  { x: 30, y: GROUND_Y + 4 },
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
    <span className={`sparks sparks--${element}`} style={{ top }} aria-hidden="true">
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

/** Course d'une attaque de base : déplacement (pixels natifs) jusqu'au contact de la cible. */
export interface Dash {
  /** Rang du sort (parité → nom d'animation a/b). */
  readonly key: number;
  readonly dx: number;
  readonly dy: number;
  /** Profondeur de la cible : le coureur passe devant elle le temps du coup. */
  readonly z: number;
}

/** Écart gardé entre les pieds du coureur et ceux de sa cible. */
const DASH_GAP = 26;

export function dashOf(view: BattleView, unit: UnitView): Dash | undefined {
  const cast = view.cast;
  if (cast === null || !cast.dash || cast.unit !== unit.id) return undefined;
  const target = view.units.find((u) => u.id === cast.targets[0]);
  if (target === undefined) return undefined;
  const from = placeOf(unit);
  const to = placeOf(target);
  const dir = unit.side === 'player' ? 1 : -1;
  return { key: cast.seq, dx: to.x - dir * DASH_GAP - from.x, dy: to.y - from.y, z: to.y + 1 };
}

/** Où se pose chaque altération sur le sprite : brûlure aux pieds, étourdissement au-dessus de la
    tête, marque au centre du corps. */
const STATUS_PLACE: Readonly<
  Record<
    string,
    { readonly sprite: string; readonly top: (unit: SpriteInfo, fx: SpriteInfo) => number }
  >
> = {
  burn: { sprite: 'burn', top: (unit, fx) => unit.bottom - fx.h + 2 },
  // Sur le haut du crâne, sous le repère (nom, PV) qui flotte juste au-dessus.
  stun: { sprite: 'stun', top: (unit, fx) => unit.top - fx.h / 2 + 1 },
  mark: { sprite: 'mark', top: (unit, fx) => (unit.top + unit.bottom) / 2 - fx.h / 2 },
};

function Actor(props: {
  readonly unit: UnitView;
  readonly active: boolean;
  readonly acting: boolean;
  readonly targetable: boolean;
  readonly flash: Flash | undefined;
  readonly dash: Dash | undefined;
  /** Lanceur de l'ultime en cours : passe devant et reste éclairé quand le reste s'assombrit. */
  readonly caster: boolean;
}) {
  const { unit, flash, dash } = props;
  const info = sprite(unit.kind);
  if (info === undefined) return null;
  const { x, y } = placeOf(unit);
  // Réaction du corps au dernier événement : choc (dégâts) ou lueur (soin, bouclier).
  const pulse =
    flash !== undefined &&
    (flash.tone === 'damage' || flash.tone === 'heal' || flash.tone === 'shield')
      ? flash
      : undefined;
  // Élément du coup reçu (celui de l'attaquant, porté par l'effet), pour teinter le choc.
  const hitElement = flash?.fx?.split('_')[1] ?? unit.element;
  const pulseClass =
    pulse === undefined
      ? ''
      : pulse.tone === 'damage'
        ? `actor__hit actor__hit--${hitElement}${pulse.heavy ? ' actor__hit--heavy' : ''}`
        : `actor__glow actor__glow--${pulse.tone}`;
  const height = info.bottom - info.top;
  const bubble = height > 44 ? sprite('bubble_l') : sprite('bubble_s');
  const style = {
    left: x - info.w / 2,
    top: y - info.bottom,
    width: info.w,
    height: info.h,
    // Pendant sa course, l'attaquant passe devant sa cible ; il reprend sa profondeur au tour suivant.
    zIndex: props.caster ? 300 : dash !== undefined && props.acting ? Math.max(y, dash.z) : y,
    '--dir': unit.side === 'player' ? 1 : -1,
    '--delay': `${-(unit.slot * 0.37 + (unit.side === 'enemy' ? 0.2 : 0))}s`,
    '--dx': dash === undefined ? '0px' : `${dash.dx}px`,
    '--dy': dash === undefined ? '0px' : `${dash.dy}px`,
  } as CSSProperties;
  // Deux noms d'animation (a/b) : la course rejoue à chaque attaque sans remonter l'acteur.
  const className = [
    'actor',
    `actor--${unit.side}`,
    props.active ? 'actor--active' : '',
    props.acting ? 'actor--acting' : '',
    props.caster ? 'actor--caster' : '',
    dash === undefined ? '' : `actor--dash actor--dash-${dash.key % 2 === 0 ? 'a' : 'b'}`,
    props.targetable ? 'actor--targetable' : '',
    unit.alive ? '' : 'actor--down',
  ].join(' ');
  return (
    <div className={className} style={style} data-unit={unit.id}>
      <span className="actor__shadow" style={{ top: info.bottom - 2 }} />
      <span className="actor__body">
        <span key={pulse?.key ?? 0} className={pulseClass}>
          {unit.side === 'player' ? (
            <HeroSprite name={unit.kind} idle={unit.alive} />
          ) : (
            <PixelSprite name={unit.kind} idle={unit.alive} />
          )}
        </span>
        {/* Altérations en cours (brûlure aux pieds, étoiles au-dessus de la tête, viseur sur le
            corps) : tant que le journal les dit actives. */}
        {unit.alive &&
          unit.statuses.map((status) => {
            const place = STATUS_PLACE[status.kind];
            const fx = place === undefined ? undefined : sprite(place.sprite);
            if (place === undefined || fx === undefined) return null;
            return (
              <span
                key={status.kind}
                className={`actor__status actor__status--${status.kind}`}
                style={{ left: info.w / 2 - fx.w / 2, top: place.top(info, fx) }}
              >
                <PixelSprite name={place.sprite} idle />
              </span>
            );
          })}
        {/* Bulle de bouclier, dans le corps pour suivre la course : visible tant qu'il reste du
            bouclier (valeur portée par le journal). */}
        {unit.shield > 0 && unit.alive && bubble !== undefined && (
          <span
            className="actor__bubble"
            style={{
              left: info.w / 2 - bubble.w / 2,
              top: (info.top + info.bottom) / 2 - bubble.h / 2 + 2,
            }}
          >
            <PixelSprite name={height > 44 ? 'bubble_l' : 'bubble_s'} idle />
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Effets posés sur une unité (impact, étincelles, chiffre) : dans une couche au-dessus des
 * acteurs, pour qu'un attaquant au contact ne cache pas le coup qu'il porte.
 */
function Effects({ unit, flash }: { readonly unit: UnitView; readonly flash: Flash }) {
  const info = sprite(unit.kind);
  if (info === undefined) return null;
  const { x, y } = placeOf(unit);
  const hitElement = flash.fx?.split('_')[1] ?? unit.element;
  const fx = flash.fx === null ? undefined : sprite(flash.fx);
  return (
    <div
      className="effects"
      style={{ left: x - info.w / 2, top: y - info.bottom, width: info.w, height: info.h }}
    >
      {fx !== undefined && flash.fx !== null && (
        <span
          key={`fx${flash.key}`}
          className={`actor__fx actor__fx--${flash.fx}`}
          style={{
            left: info.w / 2 - fx.w / 2,
            // Aux pieds (poussière), posé au sol (soin), sinon centré sur le corps.
            top: flash.feet
              ? info.bottom - fx.h + 4
              : flash.fx === 'heal'
                ? info.bottom - fx.h + 6
                : (info.top + info.bottom) / 2 - fx.h / 2,
          }}
        >
          <PixelSprite name={flash.fx} className="fx-play" />
        </span>
      )}
      {flash.tone === 'damage' && (
        <Sparks key={`sp${flash.key}`} flash={flash} element={hitElement} top={info.top + 22} />
      )}
      {flash.text !== '' && (
        <span
          key={`n${flash.key}`}
          className={`actor__number actor__number--${flash.tone}`}
          style={{ top: info.top - 4 }}
        >
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
  // Course : l'arc de frappe part du point de contact, une fois le coureur arrivé.
  const dash = cast.dash ? dashOf(view, caster) : undefined;
  const slashX = from.x + (dash?.dx ?? 0) + dir * 18 - 24;
  const slashY = chest + (dash?.dy ?? 0) - 24;
  return (
    <>
      <span
        key={`slash${cast.key}`}
        className={dash === undefined ? 'stage__slash' : 'stage__slash stage__slash--dash'}
        style={{
          left: slashX,
          top: slashY,
          zIndex: from.y + (dash?.dy ?? 0) + 2,
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
        if (dash !== undefined || target === undefined || target.side === caster.side) return null;
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
  pace = 1,
}: {
  readonly view: BattleView;
  readonly scene: string;
  readonly active: string | null;
  readonly targets: ReadonlySet<string>;
  /** Multiplicateur de durée des animations (1 normal, 0,5 en ×2), comme pour le rejeu. */
  readonly pace?: number;
}) {
  const latest = new Map<string, Flash>();
  for (const f of view.flashes) latest.set(f.unit, f);
  const shake = view.shake;
  const cast = view.cast;
  const ult = cast?.ult === true ? cast.seq : null;
  const caster = ult === null ? undefined : view.units.find((u) => u.id === cast?.unit);
  // Le zoom de l'ultime vise le lanceur, en tirant vers le centre pour garder les cibles à l'écran.
  const focus = caster === undefined ? { x: STAGE_W / 2, y: GROUND_Y } : placeOf(caster);
  const stageStyle = {
    '--pace': pace,
    '--ox': `${((focus.x + STAGE_W / 2) / 2) * STAGE_SCALE}px`,
    '--oy': `${(focus.y - 24 - STAGE_OFFSET) * STAGE_SCALE}px`,
  } as CSSProperties;
  const ab = (n: number): string => (n % 2 === 0 ? 'a' : 'b');
  return (
    <div
      className={ult === null ? 'stage' : `stage stage--ult${ab(ult)}`}
      aria-hidden="true"
      style={stageStyle}
    >
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
        <div className={ult === null ? 'stage__zoom' : `stage__zoom stage__zoom--ult${ab(ult)}`}>
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
                dash={dashOf(view, unit)}
                caster={cast?.unit === unit.id && cast.ult}
              />
            ))}
            <Bolts view={view} />
            {view.units.map((unit) => {
              const flash = latest.get(unit.id);
              return flash === undefined ? null : (
                <Effects key={unit.id} unit={unit} flash={flash} />
              );
            })}
          </div>
        </div>
      </div>
      {view.hurt !== null && <span key={`hurt${view.hurt}`} className="stage__hurt" />}
      {ult !== null && <span key={`flash${ult}`} className="stage__ult" />}
      {view.ultHit !== null && <span key={`uh${view.ultHit}`} className="stage__ult-hit" />}
    </div>
  );
}
