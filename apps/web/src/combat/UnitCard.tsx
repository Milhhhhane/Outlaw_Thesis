import type { Intent, UnitDef } from '@outlaw/engine';
import { describeTrigger } from '../i18n/describe';
import { joinNames, names, t, tk } from '../i18n';
import type { Flash, UnitView } from './view';

interface Props {
  readonly unit: UnitView;
  readonly def: UnitDef;
  readonly intent: Intent | null;
  readonly active: boolean;
  readonly acting: boolean;
  readonly targetable: boolean;
  readonly flashes: readonly Flash[];
  readonly onTarget: (id: string) => void;
  readonly nameOf: (id: string) => string;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function UnitCard(props: Props) {
  const { unit, def, intent, active, acting, targetable, flashes } = props;
  const name = names.unit(unit.kind);
  const hpPct = Math.round((unit.hp / unit.maxHp) * 100);
  const shieldPct = Math.min(100, Math.round((unit.shield / unit.maxHp) * 100));
  const passive = def.triggers[0];
  const className = [
    'unit',
    `unit--${unit.side}`,
    `element-${unit.element}`,
    active ? 'unit--active' : '',
    acting ? 'unit--acting' : '',
    targetable ? 'unit--targetable' : '',
    unit.alive ? '' : 'unit--down',
  ].join(' ');

  const body = (
    <>
      <span className="unit__head">
        <span className="unit__name">{name}</span>
        <span className="unit__element">{tk(`element.${unit.element}`)}</span>
      </span>
      <span
        className="unit__bar"
        role="img"
        aria-label={
          unit.alive ? t('combat.hp', { hp: unit.hp, max: unit.maxHp }) : t('combat.down')
        }
      >
        <span className="unit__hp" style={{ width: `${hpPct}%` }} />
        {unit.shield > 0 && <span className="unit__shield" style={{ width: `${shieldPct}%` }} />}
      </span>
      <span className="unit__numbers" aria-hidden="true">
        {unit.alive ? `${unit.hp} / ${unit.maxHp}` : t('combat.down')}
        {unit.shield > 0 && (
          <span className="unit__shield-value">{t('combat.shield', { shield: unit.shield })}</span>
        )}
      </span>
      <span className="unit__tags">
        {unit.statuses.map((status) => (
          <span key={status.kind} className={`tag tag--${status.kind}`}>
            {tk(`status.${status.kind}`)} {status.kind === 'stun' ? '' : status.turns}
          </span>
        ))}
        {Object.entries(unit.mods)
          .filter(([, value]) => value !== 0)
          .map(([stat, value]) => (
            <span key={stat} className={`tag ${value > 0 ? 'tag--buff' : 'tag--debuff'}`}>
              {tk(`stat.${stat}`)} {signed(value)} %
            </span>
          ))}
      </span>
      {intent !== null && unit.alive && (
        <span className="unit__intent">
          {intent.stunned
            ? t('combat.intent.stunned', { spell: names.spell(intent.spell) })
            : intent.targets.length > 0 && intent.targets.every((id) => id !== unit.id)
              ? t('combat.intent.targets', {
                  spell: names.spell(intent.spell),
                  targets: joinNames(intent.targets.map(props.nameOf)),
                })
              : t('combat.intent', { spell: names.spell(intent.spell) })}
        </span>
      )}
      {passive !== undefined && unit.side === 'player' && (
        <span className="unit__passive" title={describeTrigger(passive.trigger)}>
          {t('combat.passive', { name: names.passive(passive.source) })}
        </span>
      )}
      <span className="unit__flashes" aria-hidden="true">
        {flashes
          .filter((f) => f.text !== '')
          .map((f) => (
            <span key={f.key} className={`flash flash--${f.tone}`}>
              {f.text}
            </span>
          ))}
      </span>
    </>
  );

  if (targetable) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          props.onTarget(unit.id);
        }}
      >
        {body}
      </button>
    );
  }
  return (
    <article className={className} aria-label={name}>
      {body}
    </article>
  );
}
