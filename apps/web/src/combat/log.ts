import { TIME_SCALE, type BattleEvent, type UnitState } from '@outlaw/engine';
import { joinNames, names, t, tk } from '../i18n';

/** Une phrase du journal pour un événement, ou null pour les événements techniques. */
export function logLine(event: BattleEvent, units: readonly UnitState[]): string | null {
  const name = (id: string): string => {
    const kind = units.find((unit) => unit.def.id === id)?.def.kind;
    return kind === undefined ? id : names.unit(kind);
  };
  const signed = (n: number): string => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  switch (event.type) {
    case 'cast': {
      const spell = names.spell(event.spell);
      const targets = event.targets.filter((id) => id !== event.unit).map(name);
      if (targets.length === 0) return t('log.cast', { unit: name(event.unit), spell });
      return t('log.cast.on', { unit: name(event.unit), spell, targets: joinNames(targets) });
    }
    case 'damage': {
      const target = name(event.target);
      const amount = event.amount - event.absorbed;
      if (event.cause === 'burn') return t('log.damage.burn', { target, amount });
      if (event.absorbed > 0) {
        return t('log.damage.absorbed', { target, amount, absorbed: event.absorbed });
      }
      return t('log.damage', { target, amount });
    }
    case 'heal':
      return t('log.heal', { target: name(event.target), amount: event.amount });
    case 'shield':
      return t('log.shield', { target: name(event.target), amount: event.amount });
    case 'status':
      return event.resisted
        ? t('log.status.resisted', { target: name(event.target) })
        : t('log.status', { target: name(event.target), status: tk(`status.${event.status}`) });
    case 'tempo':
      if (event.delta === 0) return null;
      return t(event.delta < 0 ? 'log.tempo.advance' : 'log.tempo.delay', {
        target: name(event.target),
        amount: Math.abs(event.delta) / TIME_SCALE,
      });
    case 'stat_mod':
      return t('log.statMod', {
        target: name(event.target),
        stat: tk(`stat.${event.stat}`),
        signed: signed(event.percent),
      });
    case 'trigger_fired':
      return t('log.trigger', { unit: name(event.unit), source: names.passive(event.source) });
    case 'unit_down':
      return t('log.down', { unit: name(event.unit) });
    case 'turn_skipped':
      return t('log.skip', { unit: name(event.unit) });
    case 'battle_end':
      if (event.reason === 'action_limit') return t('log.limit');
      return event.winner === 'player' ? t('log.victory') : t('log.defeat');
    default:
      return null;
  }
}
