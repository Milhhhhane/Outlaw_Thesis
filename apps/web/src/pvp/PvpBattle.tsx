import { createBattle, hashState, step, type Action, type BattleState } from '@outlaw/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CombatView } from '../combat/CombatScreen';
import { content } from '../combat/session';
import { useBattle } from '../combat/useBattle';
import { speedFactor, useOptions } from '../game/options';
import { t, tk } from '../i18n';
import type { ClientMessage } from '@outlaw/net';
import type { PvpInfo } from './info';
import { toAction, type BattleStart, type SessionState } from './session';

/** Après combien de resynchronisations on cesse d'insister (un écart durable n'est pas réparable ici). */
const MAX_RESYNC = 2;
/** Un refus ne reste affiché que quelques secondes. */
const NOTICE_MS = 4000;
/** Sans réponse du serveur à une action envoyée, on rend la main au bout de ce délai. */
const PENDING_MS = 5000;
/** Marge avant de demander au serveur de constater un dépassement d'échéance (son alarme est déjà prévue). */
const CLAIM_AFTER_MS = 2000;

/** Refus du serveur qu'il est inutile de montrer (course normale entre deux joueurs). */
const SILENT = new Set(['not_expired', 'not_your_turn']);

export function errorText(code: string): string {
  return tk(`pvp.error.${code}`) === `pvp.error.${code}`
    ? t('pvp.error.generic')
    : tk(`pvp.error.${code}`);
}

/** Réplique locale de l'état du combat, avancée en même temps que l'affichage pour vérifier les empreintes. */
function mirrorOf(start: BattleStart): BattleState {
  let state = createBattle(start.setup, content.balance).state;
  for (const logged of start.actions) {
    state = step(state, toAction(logged.unit, logged)).state;
  }
  return state;
}

interface Props {
  readonly state: SessionState;
  readonly send: (msg: ClientMessage) => boolean;
  readonly onEmote: (id: number) => void;
  readonly onDismiss: () => void;
  readonly onLeave: () => void;
  readonly pseudo: string;
}

/**
 * Un combat en ligne. Le serveur décide : ce composant n'applique une action qu'une fois annoncée
 * (`applied`), la rejoue dans le moteur local pour l'animation, et vérifie l'empreinte de l'état
 * à chaque coup. Un écart déclenche une resynchronisation complète.
 */
export function PvpBattle({ state, send, onEmote, onDismiss, onLeave, pseudo }: Props) {
  const start = state.start;
  if (start === null) throw new Error('PvpBattle sans combat');
  const { options } = useOptions();
  const history = useMemo<Action[]>(
    () => start.actions.map((logged) => toAction(logged.unit, logged)),
    [start],
  );
  const battle = useBattle(start.setup, speedFactor(options.speed), history);
  // Une action est partie : on attend la réponse (un coup annoncé, ou un refus) ou le délai de garde.
  const [sent, setSent] = useState<{
    readonly applied: number;
    readonly error: number | undefined;
    readonly expired: boolean;
  } | null>(null);
  const pending =
    sent !== null &&
    !sent.expired &&
    sent.applied === state.applied.length &&
    sent.error === state.error?.key;
  const [desync, setDesync] = useState(false);
  const processed = useRef(0);
  const resyncs = useRef(0);
  const mirror = useRef<BattleState | null>(null);
  const { apply } = battle;

  const requestResync = useCallback((): void => {
    if (resyncs.current >= MAX_RESYNC) return;
    resyncs.current += 1;
    setDesync(true);
    send({ type: 'resync' });
  }, [send]);

  // Les coups annoncés par le serveur, un par un, vérifiés par l'empreinte de l'état.
  useEffect(() => {
    mirror.current ??= mirrorOf(start);
    if (processed.current === 0 && hashState(mirror.current) !== start.stateHash) requestResync();
    while (processed.current < state.applied.length) {
      const msg = state.applied[processed.current];
      processed.current += 1;
      if (msg === undefined) break;
      const action = toAction(msg.actor, msg.action);
      apply(action);
      try {
        mirror.current = step(mirror.current, action).state;
        if (hashState(mirror.current) !== msg.stateHash) requestResync();
      } catch {
        requestResync();
      }
    }
  }, [state.applied, start, apply, requestResync]);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => {
      setSent((current) => (current === null ? null : { ...current, expired: true }));
    }, PENDING_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [pending]);

  // Un refus s'efface seul.
  const errorKey = state.error?.key;
  useEffect(() => {
    if (errorKey === undefined) return;
    const id = window.setTimeout(onDismiss, NOTICE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [errorKey, onDismiss]);

  const deadline = state.deadline === null ? null : state.deadline - state.offset;
  // Échéance dépassée sans nouvelle de personne : on demande au serveur de la constater.
  useEffect(() => {
    if (deadline === null || state.result !== null) return;
    const id = window.setTimeout(
      () => {
        send({ type: 'claim_timeout' });
      },
      Math.max(0, deadline - Date.now() + CLAIM_AFTER_MS),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [deadline, state.result, send]);

  const room = state.room;
  const offline = state.link !== 'open';
  const notice =
    state.error !== null && !SILENT.has(state.error.code)
      ? errorText(state.error.code)
      : desync
        ? t('pvp.desync')
        : null;

  const info: PvpInfo = {
    you: start.you,
    names: {
      you: state.names.you ?? pseudo,
      opponent: state.names.opponent ?? t('pvp.opponent'),
    },
    deadline,
    pending,
    send: (action) => {
      if (
        send({
          type: 'action',
          spell: action.spell,
          ...(action.target === undefined ? {} : { target: action.target }),
        })
      ) {
        setSent({ applied: state.applied.length, error: state.error?.key, expired: false });
      }
    },
    result: state.result,
    opponent: {
      connected: room?.opponent.connected ?? true,
      graceUntil:
        room?.opponent.graceUntil == null ? null : room.opponent.graceUntil - state.offset,
    },
    offline,
    rematch: room?.rematch ?? { me: false, opponent: false },
    onRematch: () => {
      send({ type: 'rematch' });
    },
    onLeave,
    onEmote,
    emote: state.emote,
    notice,
  };

  return (
    <CombatView
      setup={start.setup}
      onExit={onLeave}
      title={t('pvp.title')}
      battle={battle}
      pvp={info}
    />
  );
}
