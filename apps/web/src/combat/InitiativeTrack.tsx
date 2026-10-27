import { projectQueue, TIME_SCALE, type BattleState } from '@outlaw/engine';
import { sprite } from '../art';
import { PixelSprite } from '../art/Pixel';
import { names, t } from '../i18n';

/** Portrait recadré sur la tête d'un sprite. */
export function Portrait({ kind, size = 32 }: { readonly kind: string; readonly size?: number }) {
  const info = sprite(kind);
  if (info === undefined) return null;
  const k = size / 32;
  return (
    <span className="portrait" style={{ width: size, height: size }} aria-hidden="true">
      <PixelSprite
        name={kind}
        style={{
          transform: `scale(${k})`,
          transformOrigin: '0 0',
          marginLeft: (-(info.w - 32) / 2) * k,
          marginTop: -(info.top - 1) * k,
        }}
      />
    </span>
  );
}

/**
 * La file d'initiative : les huit prochains tours, dans l'ordre, avec l'écart de temps réel
 * (« +12 ») qui montre le tempo. Ordre et instants viennent du moteur (projectQueue).
 */
export function InitiativeTrack({ state }: { readonly state: BattleState }) {
  const entries = projectQueue(state);
  const first = entries[0]?.time ?? 0;
  const defs = new Map(state.units.map((u) => [u.def.id, u.def] as const));

  return (
    <section className="track" aria-labelledby="track-heading">
      <h2 id="track-heading" className="visually-hidden">
        {t('combat.queue')}
      </h2>
      <ol className="track__list">
        {entries.map((entry, index) => {
          const def = defs.get(entry.unit);
          const offset = Math.round((entry.time - first) / TIME_SCALE);
          return (
            <li
              key={`${entry.unit}-${entry.time}`}
              className={[
                'track__entry',
                `track__entry--${def?.side ?? 'enemy'}`,
                `element-${def?.element ?? 'fire'}`,
                index === 0 ? 'track__entry--now' : '',
              ].join(' ')}
              title={def ? names.unit(def.kind) : entry.unit}
            >
              {def !== undefined && <Portrait kind={def.kind} size={index === 0 ? 30 : 24} />}
              <span className="track__text">
                <span className="track__name">{def ? names.unit(def.kind) : entry.unit}</span>
                <span className="track__time">
                  {index === 0 ? t('combat.queue.now') : `+${offset}`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
