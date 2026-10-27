import type { ResolvedSpell, UnitState } from '@outlaw/engine';
import type { ReactNode } from 'react';
import { describeSpell } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { Portrait } from './InitiativeTrack';

interface Props {
  readonly caster: UnitState | null;
  readonly points: number;
  readonly cap: number;
  readonly selected: string | null;
  readonly busy: boolean;
  readonly onSpell: (spell: ResolvedSpell) => void;
  /** Sort survolé ou ciblé, pour le panneau de détail. */
  readonly onFocusSpell: (spell: string | null) => void;
  /** Contenu du panneau de détail (sort ou unité survolés). */
  readonly detail: ReactNode;
  /** Texte d'attente à la place de « Les ennemis jouent… » (PvP). */
  readonly waiting?: string;
}

export function Pips({ count, filled, label }: { count: number; filled: number; label: string }) {
  return (
    <span className="pips" role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i < filled ? 'pip pip--full' : 'pip'} />
      ))}
    </span>
  );
}

/** Barre du bas : héros actif et réserve, les quatre sorts, le détail de ce qui est survolé. */
export function ActionBar({
  caster,
  points,
  cap,
  selected,
  busy,
  onSpell,
  onFocusSpell,
  detail,
  waiting,
}: Props) {
  const spells = caster?.def.spells ?? [];
  const who = caster ? names.unit(caster.def.kind) : null;
  return (
    <section
      className="actions"
      aria-label={
        who !== null && !busy ? t('combat.turnOf', { unit: who }) : (waiting ?? t('combat.waiting'))
      }
    >
      <div className="actions__who">
        {caster !== null && <Portrait kind={caster.def.kind} size={44} />}
        <div className="actions__who-text">
          <span className="actions__turn">
            {who !== null && !busy
              ? t('combat.turnOf', { unit: who })
              : (waiting ?? t('combat.waiting'))}
          </span>
          <span className="actions__reserve">
            <span className="hint">{t('combat.reserveShort')}</span>
            <Pips count={cap} filled={points} label={t('combat.reserve', { points, cap })} />
          </span>
        </div>
      </div>
      <div className="actions__spells">
        {spells.map((spell, index) => {
          const affordable = spell.cost <= points;
          const detailId = `spell-detail-${spell.id}`;
          return (
            <button
              key={spell.id}
              type="button"
              className={[
                'spell',
                `spell--${spell.slot}`,
                selected === spell.id ? 'spell--selected' : '',
              ].join(' ')}
              disabled={busy || !affordable}
              aria-pressed={selected === spell.id}
              aria-describedby={detailId}
              aria-keyshortcuts={String(index + 1)}
              onClick={() => {
                onSpell(spell);
              }}
              onMouseEnter={() => {
                onFocusSpell(spell.id);
              }}
              onMouseLeave={() => {
                onFocusSpell(null);
              }}
              onFocus={() => {
                onFocusSpell(spell.id);
              }}
              onBlur={() => {
                onFocusSpell(null);
              }}
            >
              <span className="spell__key" aria-hidden="true">
                {index + 1}
              </span>
              <span className="spell__name">{names.spell(spell.id)}</span>
              <span className="spell__meta">
                {spell.cost > 0 ? (
                  <Pips
                    count={spell.cost}
                    filled={spell.cost}
                    label={t('combat.spell.cost', { cost: spell.cost })}
                  />
                ) : (
                  <span className="spell__gain">
                    {t('combat.spell.gain', { gain: spell.gain })}
                  </span>
                )}
                <span>{t('combat.spell.delay', { delay: spell.delay })}</span>
              </span>
              <span id={detailId} className="visually-hidden">
                {[tk(`combat.target.${spell.targeting}`), ...describeSpell(spell)].join('. ')}
                {!affordable ? `. ${t('combat.spell.unaffordable')}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className="actions__detail" aria-hidden="true">
        {detail}
      </div>
    </section>
  );
}
