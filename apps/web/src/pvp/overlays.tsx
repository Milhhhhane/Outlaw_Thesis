import { EMOTE_COUNT, EMOTE_COOLDOWN_MS, type RoomResult } from '@outlaw/net';
import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '../game/ui';
import { t, tk } from '../i18n';
import type { PvpInfo } from './info';
import './pvp.css';

/** Heure locale qui avance toute seule (pour les comptes à rebours), figée si `active` est faux. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Un premier rafraîchissement tout de suite (hors du corps de l'effet), puis quatre par seconde.
    const first = window.setTimeout(() => {
      setNow(Date.now());
    }, 0);
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

/** Secondes restantes avant l'échéance du coup en cours. */
export function TurnTimer({ deadline }: { readonly deadline: number | null }) {
  const now = useClock(deadline !== null);
  if (deadline === null) return <span className="pvp-timer pvp-timer--idle" aria-hidden="true" />;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={['pvp-timer', left <= 5 ? 'pvp-timer--low' : ''].join(' ')}
      role="timer"
      aria-label={t('pvp.timer', { seconds: left })}
    >
      <Icon name="speed" size={12} />
      {left}
    </span>
  );
}

/** Les pseudos, de chaque côté du champ de bataille : le camp « héros » à gauche, l'autre à droite. */
export function PvpPlates({ pvp }: { readonly pvp: PvpInfo }) {
  const plate = (side: 'player' | 'enemy') => {
    const mine = pvp.you === side;
    const name = mine ? pvp.names.you : pvp.names.opponent;
    return (
      <span
        className={[
          'pvp-plate',
          `pvp-plate--${side === 'player' ? 'left' : 'right'}`,
          mine ? 'pvp-plate--me' : '',
        ].join(' ')}
        data-testid={`plate-${side}`}
      >
        {name}
        {mine && <small>{t('pvp.you')}</small>}
      </span>
    );
  };
  return (
    <div className="pvp-plates">
      {plate('player')}
      {plate('enemy')}
    </div>
  );
}

/** Connexion perdue, adversaire absent, refus du serveur : une seule ligne à la fois. */
export function PvpBanner({ pvp }: { readonly pvp: PvpInfo }) {
  const now = useClock(pvp.opponent.graceUntil !== null);
  let text: string | null = null;
  let tone: 'bad' | 'warn' = 'warn';
  if (pvp.offline) {
    text = t('pvp.offline');
    tone = 'bad';
  } else if (pvp.opponent.graceUntil !== null && !pvp.opponent.connected && pvp.result === null) {
    text = t('pvp.opponentGone', {
      name: pvp.names.opponent,
      seconds: Math.max(0, Math.ceil((pvp.opponent.graceUntil - now) / 1000)),
    });
  } else if (pvp.notice !== null) {
    text = pvp.notice;
    tone = 'bad';
  }
  if (text === null) return null;
  return (
    <p className={`pvp-banner pvp-banner--${tone}`} role="status">
      {text}
    </p>
  );
}

/** Six messages tout faits, sans texte libre. */
export function PvpEmotes({ pvp }: { readonly pvp: PvpInfo }) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const send = (id: number): void => {
    pvp.onEmote(id);
    setOpen(false);
    setCooling(true);
    timer.current = window.setTimeout(() => {
      setCooling(false);
    }, EMOTE_COOLDOWN_MS);
  };
  const shown = pvp.emote;
  // La bulle apparaît du côté de celui qui l'a envoyée.
  const side = shown === null ? null : shown.mine === (pvp.you === 'player') ? 'left' : 'right';
  return (
    <div className="pvp-emotes">
      {shown !== null && (
        <p
          key={shown.key}
          className={`pvp-bubble pvp-bubble--${side ?? 'left'}`}
          role="status"
          data-testid="emote-bubble"
        >
          {tk(`pvp.emote.${shown.id}`)}
        </p>
      )}
      <Button
        variant="quiet"
        size="small"
        icon="trigger"
        aria-expanded={open}
        aria-label={t('pvp.emotes')}
        title={t('pvp.emotes')}
        onClick={() => {
          setOpen(!open);
        }}
      />
      {open && (
        <ul className="pvp-emotes__list" aria-label={t('pvp.emotes')}>
          {Array.from({ length: EMOTE_COUNT }, (_, id) => (
            <li key={id}>
              <Button
                variant="ghost"
                size="small"
                disabled={cooling}
                onClick={() => {
                  send(id);
                }}
              >
                {tk(`pvp.emote.${id}`)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fin du combat en ligne : résultat vu depuis votre place, revanche ou départ. */
export function PvpOutcome({
  pvp,
  result,
}: {
  readonly pvp: PvpInfo;
  readonly result: RoomResult;
}) {
  const draw = result.winner === null;
  const won = result.winner === pvp.you;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  let reason = '';
  switch (result.reason) {
    case 'action_limit':
      reason = t('pvp.reason.limit');
      break;
    case 'forfeit':
      reason = won ? t('pvp.reason.forfeit.theirs') : t('pvp.reason.forfeit.mine');
      break;
    case 'disconnect':
      reason = won ? t('pvp.reason.disconnect.theirs') : t('pvp.reason.disconnect.mine');
      break;
    case 'annihilation':
      reason = draw ? t('pvp.reason.simultaneous') : '';
      break;
  }
  const waiting = pvp.rematch.me;
  return (
    <section
      className={`outcome outcome--${won ? 'win' : 'loss'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pvp-result"
      data-testid="pvp-result"
    >
      <h2 id="pvp-result" className="outcome__title">
        {draw ? t('pvp.result.draw') : won ? t('combat.result.victory') : t('combat.result.defeat')}
      </h2>
      {reason !== '' && <p className="outcome__sub">{reason}</p>}
      <p className="outcome__sub">
        {t('pvp.result.versus', { you: pvp.names.you, opponent: pvp.names.opponent })}
      </p>
      <div className="outcome__buttons">
        <Button
          ref={first}
          size="large"
          disabled={waiting}
          onClick={() => {
            pvp.onRematch();
          }}
        >
          {waiting
            ? t('pvp.rematch.waiting')
            : pvp.rematch.opponent
              ? t('pvp.rematch.accept')
              : t('pvp.rematch')}
        </Button>
        <Button variant="quiet" size="large" onClick={pvp.onLeave}>
          {t('pvp.leave.room')}
        </Button>
      </div>
    </section>
  );
}
