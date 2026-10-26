import { enemyIntent, legalActions, type BattleSetup, type ResolvedSpell } from '@outlaw/engine';
import { useEffect, useRef, useState } from 'react';
import { names, t } from '../i18n';
import { ActionBar } from './ActionBar';
import { InitiativeTrack } from './InitiativeTrack';
import { content } from './session';
import { UnitCard } from './UnitCard';
import { useBattle } from './useBattle';
import './combat.css';

interface Props {
  readonly setup: BattleSetup;
  readonly onExit: () => void;
}

export function CombatScreen({ setup, onExit }: Props) {
  const { model, busy, act, skip, reset } = useBattle(setup);
  const { state, view } = model;
  // La sélection est liée au héros actif : elle disparaît d'elle-même quand le tour passe.
  const [selection, setSelection] = useState<{ unit: string; spell: string } | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);

  const active = busy ? null : state.active;
  const selected = selection !== null && selection.unit === active ? selection.spell : null;
  const setSelected = (spell: string | null): void => {
    setSelection(spell === null || active === null ? null : { unit: active, spell });
  };
  const caster = state.units.find((u) => u.def.id === active) ?? null;
  const legal = active === null ? [] : legalActions(state);
  const targets = new Set(
    legal.filter((a) => a.spell === selected && a.target !== undefined).map((a) => a.target),
  );
  const result = busy ? null : state.result;
  const finished = result !== null;
  const nameOf = (id: string): string => {
    const def = state.units.find((u) => u.def.id === id)?.def;
    return def ? names.unit(def.kind) : id;
  };

  useEffect(() => {
    // Fin de combat : le focus va au premier bouton du résultat.
    if (finished) againRef.current?.focus();
  }, [finished]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [model.log]);

  const castSpell = (spell: ResolvedSpell): void => {
    if (caster === null) return;
    if (spell.targeting === 'enemy' || spell.targeting === 'ally') {
      setSelected(selected === spell.id ? null : spell.id);
      return;
    }
    act({ type: 'cast', unit: caster.def.id, spell: spell.id });
  };

  const onTarget = (id: string): void => {
    if (caster === null || selected === null) return;
    act({ type: 'cast', unit: caster.def.id, spell: selected, target: id });
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === ' ' && busy) {
        event.preventDefault();
        skip();
      }
      const index = Number(event.key) - 1;
      const spell = caster?.def.spells[index];
      if (
        spell !== undefined &&
        caster !== null &&
        !busy &&
        spell.cost <= state.points[caster.def.side]
      ) {
        castSpell(spell);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const selectedSpell = caster?.def.spells.find((s) => s.id === selected);
  const row = (side: 'player' | 'enemy') =>
    view.units
      .filter((u) => u.side === side)
      .map((unit) => {
        const def = state.units.find((u) => u.def.id === unit.id)?.def;
        if (def === undefined) return null;
        return (
          <li key={unit.id}>
            <UnitCard
              unit={unit}
              def={def}
              intent={side === 'enemy' && !busy ? enemyIntent(state, unit.id) : null}
              active={unit.id === active}
              acting={busy && view.acting === unit.id}
              targetable={targets.has(unit.id)}
              flashes={view.flashes.filter((f) => f.unit === unit.id).slice(-1)}
              onTarget={onTarget}
              nameOf={nameOf}
            />
          </li>
        );
      });

  return (
    <main className="combat">
      <header className="combat__bar">
        <h1 className="combat__title">{t('combat.title')}</h1>
        {busy && (
          <button type="button" className="link-button" onClick={skip}>
            {t('combat.skip')}
          </button>
        )}
        <button type="button" className="link-button" onClick={onExit}>
          {t('combat.quit')}
        </button>
      </header>

      <InitiativeTrack state={state} />

      <section className="side side--enemy" aria-label={t('combat.enemies')}>
        <ul className="side__row">{row('enemy')}</ul>
      </section>

      <section className="log" aria-labelledby="log-heading">
        <h2 id="log-heading" className="visually-hidden">
          {t('combat.log')}
        </h2>
        <ol ref={logRef} className="log__lines" aria-live="polite">
          {model.log.slice(-6).map((entry) => (
            <li key={entry.key}>{entry.text}</li>
          ))}
        </ol>
      </section>

      <section className="side side--player" aria-label={t('combat.heroes')}>
        {selectedSpell !== undefined && (
          <p className="side__prompt" role="status">
            {t('combat.chooseTarget', { spell: names.spell(selectedSpell.id) })}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setSelected(null);
              }}
            >
              {t('combat.cancel')}
            </button>
          </p>
        )}
        <ul className="side__row">{row('player')}</ul>
      </section>

      <ActionBar
        caster={finished ? null : caster}
        points={view.points.player}
        cap={content.balance.combat.teamPoints.cap}
        selected={selected}
        busy={busy || finished}
        onSpell={castSpell}
      />

      {result !== null && (
        <section
          className="result"
          role="dialog"
          aria-modal="false"
          aria-labelledby="result-heading"
        >
          <h2 id="result-heading">
            {result.winner === 'player'
              ? t('combat.result.victory')
              : result.reason === 'action_limit'
                ? t('combat.result.limit')
                : t('combat.result.defeat')}
          </h2>
          <p>{t('combat.result.actions', { count: state.actionCount })}</p>
          <div className="result__buttons">
            <button ref={againRef} type="button" className="button" onClick={reset}>
              {t('combat.again')}
            </button>
            <button type="button" className="button button--quiet" onClick={onExit}>
              {t('combat.home')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
