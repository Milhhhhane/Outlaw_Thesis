import type { UnitBattleStats } from '@outlaw/engine';
import { useId, useState, type CSSProperties } from 'react';
import { Portrait } from '../combat/InitiativeTrack';
import { Choice } from '../game/ui';
import { names, t } from '../i18n';
import './stats.css';

/** Statistiques d'un passage de donjon, telles que les donne le moteur (`battleStats`). */
export interface RunStats {
  /** Donjon entier. */
  readonly total: readonly UnitBattleStats[];
  /** Une entrée par salle jouée, dans l'ordre. */
  readonly rooms: readonly (readonly UnitBattleStats[])[];
}

const number = new Intl.NumberFormat('fr-FR');
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/** Période affichée : -1 pour le donjon entier, sinon l'indice de la salle. */
const ALL = -1;

/**
 * Contribution de chaque héros, une ligne par héros dans l'ordre du moteur (dégâts infligés
 * décroissants). Rien n'est calculé ici : la barre suit la part donnée par le moteur et les
 * chiffres sont écrits en clair à côté (la couleur ne porte aucun sens seule).
 */
export function BattleStatsPanel({ stats }: { readonly stats: RunStats }) {
  const [scope, setScope] = useState(ALL);
  const id = useId();
  const rows = stats.rooms[scope] ?? stats.total;
  const scopeName = (s: number): string =>
    s === ALL ? t('stats.scope.all') : t('stats.scope.room', { n: s + 1 });
  return (
    <section className="battle-stats" aria-labelledby={id}>
      <div className="battle-stats__head">
        <h2 id={id} className="battle-stats__title">
          {t('stats.title')}
        </h2>
        {stats.rooms.length > 1 && (
          <Choice
            className="battle-stats__scope"
            label={t('stats.scope')}
            options={[ALL, ...stats.rooms.keys()]}
            value={scope}
            onChange={setScope}
            text={scopeName}
          />
        )}
      </div>
      <table className="battle-stats__table">
        <caption className="visually-hidden">
          {t('stats.caption', { scope: scopeName(scope) })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('stats.col.hero')}</th>
            <th scope="col">{t('stats.col.dealt')}</th>
            <th scope="col">{t('stats.col.healing')}</th>
            <th scope="col">{t('stats.col.shielding')}</th>
            <th scope="col">{t('stats.col.taken')}</th>
            <th scope="col">{t('stats.col.blocked')}</th>
            <th scope="col">{t('stats.col.kills')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((hero) => (
            <tr
              key={hero.id}
              className={[
                'battle-stats__row',
                hero.dealt === 0 ? 'battle-stats__row--idle' : '',
              ].join(' ')}
            >
              <th scope="row" className="battle-stats__hero">
                <Portrait kind={hero.kind} size={32} />
                <span>{names.hero(hero.kind)}</span>
              </th>
              <td>
                <span className="battle-stats__dealt">
                  <span
                    className="battle-stats__bar"
                    aria-hidden="true"
                    style={{ '--share': hero.share } as CSSProperties}
                  />
                  <span className="battle-stats__value">{number.format(hero.dealt)}</span>
                  <span className="battle-stats__share">{percent.format(hero.share)}</span>
                </span>
                {hero.dealt === 0 && <span className="battle-stats__sub">{t('stats.none')}</span>}
                {hero.overTime > 0 && (
                  <span className="battle-stats__sub">
                    {t('stats.burn', { n: number.format(hero.overTime) })}
                  </span>
                )}
              </td>
              <td>{number.format(hero.healing)}</td>
              <td>{number.format(hero.shielding)}</td>
              <td>{number.format(hero.taken)}</td>
              <td>{number.format(hero.blocked)}</td>
              <td>{number.format(hero.kills)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="battle-stats__note hint">{t('stats.note')}</p>
    </section>
  );
}
