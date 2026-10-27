import {
  MAX_LEVEL_LIMIT,
  tierBudgetOptions,
  TURN_SECONDS_OPTIONS,
  type ClientMessage,
  type RoomRules,
  type RoomView,
} from '@outlaw/net';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelSprite } from '../art/Pixel';
import { content } from '../combat/session';
import { Button, Panel, Screen } from '../game/ui';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { errorText } from './PvpBattle';
import type { SessionState } from './session';
import { cappedLevel, teamRequestFor, tierOf } from './team';

const TEAM_SIZE = 3;

interface Props {
  readonly code: string;
  readonly state: SessionState;
  readonly room: RoomView;
  readonly send: (msg: ClientMessage) => boolean;
  readonly onDismiss: () => void;
  readonly onLeave: () => void;
  readonly pseudo: string;
}

function Rules({
  room,
  send,
}: {
  readonly room: RoomView;
  readonly send: (msg: ClientMessage) => boolean;
}) {
  const { rules, host } = room;
  const set = (patch: Partial<RoomRules>): void => {
    send({ type: 'set_rules', rules: { ...rules, ...patch } });
  };
  if (!host) {
    return (
      <>
        <dl className="pvp-rules-list">
          <div>
            <dt>{t('pvp.rules.maxLevel')}</dt>
            <dd>{rules.maxLevel}</dd>
          </div>
          <div>
            <dt>{t('pvp.rules.items')}</dt>
            <dd>{rules.items ? t('pvp.rules.items.on') : t('pvp.rules.items.off')}</dd>
          </div>
          <div>
            <dt>{t('pvp.rules.tier')}</dt>
            <dd>{rules.tierBudget ?? t('pvp.rules.tier.none')}</dd>
          </div>
          <div>
            <dt>{t('pvp.rules.turn')}</dt>
            <dd>{t('pvp.rules.seconds', { seconds: rules.turnSeconds })}</dd>
          </div>
        </dl>
        <p className="pvp-hint">{t('pvp.rules.hostOnly')}</p>
      </>
    );
  }
  return (
    <div className="pvp-rules">
      <label>
        {t('pvp.rules.maxLevel')}
        <input
          type="number"
          min={1}
          max={MAX_LEVEL_LIMIT}
          value={rules.maxLevel}
          onChange={(event) => {
            const level = Math.round(Number(event.target.value));
            if (Number.isFinite(level) && level >= 1 && level <= MAX_LEVEL_LIMIT) {
              set({ maxLevel: level });
            }
          }}
        />
      </label>
      <label>
        {t('pvp.rules.items')}
        <select
          value={rules.items ? 'on' : 'off'}
          onChange={(event) => {
            set({ items: event.target.value === 'on' });
          }}
        >
          <option value="on">{t('pvp.rules.items.on')}</option>
          <option value="off">{t('pvp.rules.items.off')}</option>
        </select>
      </label>
      <label>
        {t('pvp.rules.tier')}
        <select
          value={rules.tierBudget === null ? 'none' : String(rules.tierBudget)}
          onChange={(event) => {
            set({ tierBudget: event.target.value === 'none' ? null : Number(event.target.value) });
          }}
        >
          {tierBudgetOptions.map((option) => (
            <option key={option ?? 'none'} value={option === null ? 'none' : String(option)}>
              {option === null ? t('pvp.rules.tier.none') : option}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('pvp.rules.turn')}
        <select
          value={rules.turnSeconds}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            const found = TURN_SECONDS_OPTIONS.find((option) => option === seconds);
            if (found !== undefined) set({ turnSeconds: found });
          }}
        >
          {TURN_SECONDS_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {t('pvp.rules.seconds', { seconds })}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Le salon avant le combat : joueurs, règles de l'hôte, choix de l'équipe, « prêt ». */
export function Lobby({ code, state, room, send, onDismiss, onLeave, pseudo }: Props) {
  const { profile } = useProfile();
  const owned = profile.unlocked.filter((id) => content.heroById.has(id));
  const [picks, setPicks] = useState<string[]>(() =>
    profile.team.filter((id) => owned.includes(id)).slice(0, TEAM_SIZE),
  );
  const [copied, setCopied] = useState(false);
  const rulesKey = JSON.stringify(room.rules);

  // Dès que trois héros sont choisis (ou que les règles changent), le salon valide l'équipe.
  const lastSent = useRef('');
  const { link } = state;
  useEffect(() => {
    if (picks.length !== TEAM_SIZE || link !== 'open') return;
    const signature = `${picks.join(',')}|${rulesKey}`;
    if (signature === lastSent.current) return;
    lastSent.current = signature;
    send({ type: 'set_team', ...teamRequestFor(content, profile, picks, room.rules) });
  }, [picks, rulesKey, link, profile, room.rules, send]);

  const toggle = (id: string): void => {
    setPicks((current) =>
      current.includes(id)
        ? current.filter((pick) => pick !== id)
        : current.length < TEAM_SIZE
          ? [...current, id]
          : current,
    );
  };

  const tier = tierOf(content, picks);
  const budget = room.rules.tierBudget;
  const link_ = useMemo(
    () => `${window.location.origin}${window.location.pathname}#salon=${code}`,
    [code],
  );
  const copy = (): void => {
    void navigator.clipboard.writeText(link_).then(
      () => {
        setCopied(true);
      },
      () => {
        setCopied(false);
      },
    );
  };

  const me = room.me;
  const them = room.opponent;
  const canReady = me.team !== null && !me.ready && them.present;
  const readyLabel = me.ready
    ? t('pvp.ready.waiting')
    : me.team === null
      ? t('pvp.ready.needTeam')
      : !them.present
        ? t('pvp.ready.needOpponent')
        : t('pvp.ready');

  return (
    <Screen
      title={t('pvp.room.title', { code })}
      onBack={onLeave}
      backLabel={t('pvp.leave.room')}
      className="pvp-room"
      resources={false}
    >
      <div className="pvp-room__grid">
        <div className="pvp-room__left">
          <Panel label={t('pvp.room.code')}>
            <p className="pvp-hint">{t('pvp.room.share')}</p>
            <p className="pvp-code" data-testid="room-code">
              {code}
            </p>
            <Button variant="quiet" size="small" onClick={copy}>
              {copied ? t('pvp.room.copied') : t('pvp.room.copy')}
            </Button>
          </Panel>

          <Panel label={t('pvp.seats')}>
            <ul className="pvp-seats">
              <li className={['pvp-seat', me.ready ? 'pvp-seat--ready' : ''].join(' ')}>
                <span>
                  {state.names.you ?? pseudo} ({t('pvp.seat.you')}
                  {room.host ? `, ${t('pvp.seat.host')}` : ''})
                </span>
                <span>{me.ready ? t('pvp.seat.ready') : t('pvp.seat.picking')}</span>
              </li>
              <li
                className={[
                  'pvp-seat',
                  them.ready ? 'pvp-seat--ready' : '',
                  them.present && !them.connected ? 'pvp-seat--away' : '',
                ].join(' ')}
                data-testid="opponent-seat"
              >
                {them.present ? (
                  <>
                    <span>{state.names.opponent ?? t('pvp.opponent')}</span>
                    <span>
                      {!them.connected
                        ? t('pvp.seat.away')
                        : them.ready
                          ? t('pvp.seat.ready')
                          : t('pvp.seat.picking')}
                    </span>
                  </>
                ) : (
                  <span>{t('pvp.seat.empty')}</span>
                )}
              </li>
            </ul>
          </Panel>
        </div>

        <div className="pvp-room__rules">
          <Panel label={t('pvp.rules')}>
            <h2 className="pvp-title">{t('pvp.rules')}</h2>
            <Rules room={room} send={send} />
          </Panel>
        </div>

        <Panel className="pvp-room__team" label={t('pvp.team')}>
          <h2 className="pvp-title">{t('pvp.team')}</h2>
          <p className="pvp-hint">{t('pvp.team.hint')}</p>
          <ul className="pvp-picks">
            {owned.map((id) => {
              const def = content.heroById.get(id);
              const picked = picks.includes(id);
              const full = picks.length >= TEAM_SIZE;
              const level = profile.heroes[id]?.level ?? 1;
              const capped = cappedLevel(content, profile, id, room.rules);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`pvp-pick element-${def?.element ?? 'fire'}`}
                    aria-pressed={picked}
                    aria-label={
                      picked
                        ? t('pvp.team.unpick', { hero: names.hero(id) })
                        : t('pvp.team.pick', { hero: names.hero(id) })
                    }
                    disabled={!picked && full}
                    onClick={() => {
                      toggle(id);
                    }}
                  >
                    <span className="pvp-pick__sprite">
                      <PixelSprite name={id} />
                    </span>
                    <span>{names.hero(id)}</span>
                    <small>
                      {capped < level
                        ? t('pvp.team.capped', { level: capped })
                        : t('pvp.team.level', { level })}
                      {' · '}
                      {tk(`element.${def?.element ?? 'fire'}`)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="pvp-hint" data-testid="tier-line">
            {budget === null
              ? t('pvp.team.tier', { tier })
              : t('pvp.team.tierBudget', { tier, budget })}
          </p>
          {state.error !== null && state.error.code !== 'not_expired' && (
            <p className="pvp-error" role="alert">
              {errorText(state.error.code)}{' '}
              <Button variant="ghost" size="small" onClick={onDismiss}>
                {t('pvp.dismiss')}
              </Button>
            </p>
          )}
          {me.team !== null && <p className="pvp-hint">{t('pvp.team.checked')}</p>}
          <Button
            size="large"
            disabled={!canReady}
            onClick={() => {
              send({ type: 'ready' });
            }}
          >
            {readyLabel}
          </Button>
        </Panel>
      </div>
    </Screen>
  );
}
