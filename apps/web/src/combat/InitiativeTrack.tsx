import { projectQueue, TIME_SCALE, type BattleState } from '@outlaw/engine';
import { names, t } from '../i18n';

/**
 * La file d'initiative dessinée comme une ligne de temps : chaque marqueur est placé à son instant
 * réel, les écarts montrent le tempo. Les noms suivent dans l'ordre, sous la ligne, avec le même
 * numéro. Positions et ordre viennent du moteur (projectQueue).
 */
export function InitiativeTrack({ state }: { readonly state: BattleState }) {
  const entries = projectQueue(state);
  const first = entries[0]?.time ?? 0;
  const last = entries.at(-1)?.time ?? first;
  const span = Math.max(1, last - first);
  const defs = new Map(state.units.map((u) => [u.def.id, u.def] as const));

  const items = entries.map((entry, index) => {
    const def = defs.get(entry.unit);
    const previous = entries[index - 1];
    return {
      key: `${entry.unit}-${entry.time}`,
      order: index + 1,
      name: def ? names.unit(def.kind) : entry.unit,
      side: def?.side ?? 'enemy',
      element: def?.element ?? 'fire',
      left: ((entry.time - first) / span) * 100,
      offset: Math.round((entry.time - first) / TIME_SCALE),
      // Deux marqueurs proches se décalent en hauteur pour rester lisibles.
      raised: previous !== undefined && entry.time - previous.time < span * 0.04 && index % 2 === 1,
    };
  });

  return (
    <section className="track" aria-labelledby="track-heading">
      <h2 id="track-heading" className="visually-hidden">
        {t('combat.queue')}
      </h2>
      <div className="track__line" aria-hidden="true">
        {items.map((item) => (
          <span
            key={item.key}
            className={[
              'track__marker',
              `track__marker--${item.side}`,
              `element-${item.element}`,
              item.order === 1 ? 'track__marker--now' : '',
              item.raised ? 'track__marker--raised' : '',
            ].join(' ')}
            style={{ left: `${item.left}%` }}
          >
            {item.order}
          </span>
        ))}
      </div>
      <ol className="track__list">
        {items.map((item) => (
          <li
            key={item.key}
            className={[
              'track__entry',
              `track__entry--${item.side}`,
              `element-${item.element}`,
              item.order === 1 ? 'track__entry--now' : '',
            ].join(' ')}
          >
            <span className="track__order" aria-hidden="true">
              {item.order}
            </span>
            <span className="track__name">{item.name}</span>
            <span className="track__time">
              {item.order === 1 ? t('combat.queue.now') : `+${item.offset}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
