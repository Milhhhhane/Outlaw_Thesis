import type { ResolvedSpell, UnitState } from '@outlaw/engine';
import { useState } from 'react';
import { describeSpell } from '../i18n/describe';
import { names, t, tk } from '../i18n';

interface Props {
  readonly caster: UnitState | null;
  readonly points: number;
  readonly cap: number;
  readonly selected: string | null;
  readonly busy: boolean;
  readonly onSpell: (spell: ResolvedSpell) => void;
}

function Pips({ count, filled, label }: { count: number; filled: number; label: string }) {
  return (
    <span className="pips" role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i < filled ? 'pip pip--full' : 'pip'} />
      ))}
    </span>
  );
}

export function ActionBar({ caster, points, cap, selected, busy, onSpell }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const spells = caster?.def.spells ?? [];
  const shown = spells.find((s) => s.id === (focused ?? selected)) ?? spells[0];

  return (
    <section
      className="actions"
      aria-label={
        caster ? t('combat.turnOf', { unit: names.unit(caster.def.kind) }) : t('combat.waiting')
      }
    >
      <div className="actions__reserve">
        <Pips count={cap} filled={points} label={t('combat.reserve', { points, cap })} />
        <span className="actions__turn">
          {caster && !busy
            ? t('combat.turnOf', { unit: names.unit(caster.def.kind) })
            : t('combat.waiting')}
        </span>
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
                setFocused(spell.id);
              }}
              onMouseLeave={() => {
                setFocused(null);
              }}
              onFocus={() => {
                setFocused(spell.id);
              }}
              onBlur={() => {
                setFocused(null);
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
                  <span>{t('combat.spell.gain', { gain: spell.gain })}</span>
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
      {shown !== undefined && (
        <div className="actions__detail" aria-hidden="true">
          <p className="actions__detail-title">
            {names.spell(shown.id)} <span>{tk(`combat.target.${shown.targeting}`)}</span>
          </p>
          <ul>
            {describeSpell(shown).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
