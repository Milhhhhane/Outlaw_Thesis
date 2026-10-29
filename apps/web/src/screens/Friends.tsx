import {
  FRIEND_REQUESTS_PENDING_MAX,
  FRIENDS_MAX,
  PSEUDO_MAX,
  type Friend,
  type FriendList,
  type FriendProgress,
  type FriendRequest,
} from '@outlaw/accounts';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAccount } from '../account/AccountProvider';
import { api, type Result } from '../account/api';
import { AuthWindow, PrivacyWindow } from '../account/windows';
import { useGame } from '../game/nav';
import { Button, Panel, Screen, Window } from '../game/ui';
import { t, tk } from '../i18n';
import './friends.css';

/**
 * Amis (compte connecté) : ajouter par pseudo, demandes reçues et envoyées, liste des amis. Tout
 * vient de l'API (`/api/friends*`), y compris le jour de dernière activité et le résumé
 * d'avancement ; chaque action renvoie la liste à jour, que l'écran affiche telle quelle.
 */

const DAY = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat('fr', { dateStyle: 'long' });

/** « aujourd'hui », « hier », « il y a 3 j » : jours (UTC, comme le serveur) entre `at` et `now`. */
export function dayAgo(at: number, now: number): string {
  const days = Math.max(0, Math.floor(now / DAY) - Math.floor(at / DAY));
  if (days === 0) return t('friends.day.today');
  if (days === 1) return t('friends.day.yesterday');
  return t('friends.day.ago', { n: days });
}

/** Le résumé d'un ami en une ligne, tel que le serveur l'a calculé. */
export function friendProgressLine(progress: FriendProgress | null): string {
  if (progress === null) return t('friends.progress.none');
  const parts: string[] = [];
  if (progress.team !== null) {
    parts.push(
      progress.team.min === progress.team.max
        ? t('friends.progress.teamOne', { level: progress.team.min })
        : t('friends.progress.team', progress.team),
    );
  }
  parts.push(t('friends.progress.dungeons', progress.dungeons));
  return parts.join(' · ');
}

/** Message d'une erreur de l'API (code connu, ou générique). */
export function errorText(result: Extract<Result<unknown>, { ok: false }>): string {
  const key = `friends.error.${result.error}`;
  const retry = result.body?.retryAfter;
  const text = tk(key, {
    max: result.error === 'requests_full' ? FRIEND_REQUESTS_PENDING_MAX : FRIENDS_MAX,
    minutes: typeof retry === 'number' ? Math.max(1, Math.ceil(retry / 60)) : 60,
  });
  // `tk` rend la clé brute quand le code n'a pas de texte : message générique.
  return text === key ? t('friends.error.other') : text;
}

type Notice = { readonly kind: 'ok' | 'error'; readonly text: string } | null;

function Requests({
  title,
  empty,
  requests,
  now,
  busy,
  actions,
}: {
  readonly title: string;
  readonly empty: string;
  readonly requests: readonly FriendRequest[];
  readonly now: number;
  readonly busy: boolean;
  readonly actions: (request: FriendRequest) => ReactNode;
}) {
  return (
    <Panel className="friends__panel friends__requests" label={title}>
      <h2 className="friends__heading">{title}</h2>
      {requests.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="friends__rows" aria-busy={busy}>
          {requests.map((request) => (
            <li key={request.id} className="friends__row">
              <span className="friends__who">
                <span className="friends__pseudo" title={request.pseudo}>
                  {request.pseudo}
                </span>
                <span className="hint">{dayAgo(request.at, now)}</span>
              </span>
              <span className="friends__actions">{actions(request)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FriendRow({
  friend,
  now,
  busy,
  onRemove,
}: {
  readonly friend: Friend;
  readonly now: number;
  readonly busy: boolean;
  readonly onRemove: () => void;
}) {
  return (
    <li className="friends__row friends__row--friend">
      <span className="friends__who">
        <span className="friends__line">
          <span
            className="friends__pseudo"
            title={t('friends.since', { date: dateFormat.format(friend.since) })}
          >
            {friend.pseudo}
          </span>
          <span className="hint">
            {t('friends.active', { when: dayAgo(friend.lastActiveDay, now) })}
          </span>
        </span>
        <span className="friends__progress">{friendProgressLine(friend.progress)}</span>
      </span>
      <Button
        variant="quiet"
        size="small"
        disabled={busy}
        aria-label={t('friends.remove.label', { pseudo: friend.pseudo })}
        onClick={onRemove}
      >
        {t('friends.remove')}
      </Button>
    </li>
  );
}

function FriendsPanel() {
  const [list, setList] = useState<FriendList | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void api.friends().then((result) => {
      if (!alive) return;
      if (result.ok) setList(result.value);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  /** Une action : la réponse est la nouvelle liste, ou une erreur expliquée. */
  const act = useCallback(
    async (call: () => Promise<Result<FriendList>>, done?: string): Promise<boolean> => {
      setBusy(true);
      const result = await call();
      setBusy(false);
      if (!result.ok) {
        setNotice({ kind: 'error', text: errorText(result) });
        return false;
      }
      setList(result.value);
      setNotice(done === undefined ? null : { kind: 'ok', text: done });
      return true;
    },
    [],
  );

  if (list === null) {
    return failed ? (
      <div className="friends__status" role="alert">
        <p>{t('friends.error')}</p>
        <Button
          size="small"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          {t('friends.retry')}
        </Button>
      </div>
    ) : (
      <p className="friends__status hint" role="status">
        {t('friends.loading')}
      </p>
    );
  }

  const send = async (): Promise<void> => {
    const typed = pseudo.trim();
    if (typed === '') return;
    setBusy(true);
    const result = await api.requestFriend(typed);
    setBusy(false);
    if (!result.ok) {
      setNotice({ kind: 'error', text: errorText(result) });
      return;
    }
    const { outcome, list: next } = result.value;
    // Le pseudo tel que le serveur l'écrit (la casse saisie peut différer).
    const key = typed.toLowerCase();
    const entries = outcome === 'accepted' ? next.friends : next.sent;
    const shown = entries.find((entry) => entry.pseudo.toLowerCase() === key)?.pseudo ?? typed;
    setList(next);
    setPseudo('');
    setNotice({
      kind: 'ok',
      text:
        outcome === 'accepted'
          ? t('friends.add.accepted', { pseudo: shown })
          : t('friends.add.sent', { pseudo: shown }),
    });
  };

  return (
    <div className="friends__layout">
      <div className="friends__side">
        <Panel className="friends__panel friends__add" label={t('friends.add')}>
          <h2 className="friends__heading">{t('friends.add')}</h2>
          <form
            className="friends__form"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              className="friends__input"
              aria-label={t('friends.add.label')}
              placeholder={t('friends.add.label')}
              value={pseudo}
              maxLength={PSEUDO_MAX}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setPseudo(event.target.value);
              }}
            />
            <Button type="submit" size="small" disabled={busy || pseudo.trim() === ''}>
              {t('friends.add.go')}
            </Button>
          </form>
          {notice !== null && (
            <p
              className={`friends__notice friends__notice--${notice.kind}`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </p>
          )}
        </Panel>
        <Requests
          title={t('friends.received', { n: list.received.length })}
          empty={t('friends.received.none')}
          requests={list.received}
          now={now}
          busy={busy}
          actions={(request) => (
            <>
              <Button
                size="small"
                disabled={busy}
                aria-label={t('friends.accept.label', { pseudo: request.pseudo })}
                onClick={() => {
                  void act(() => api.acceptFriend(request.id));
                }}
              >
                {t('friends.accept')}
              </Button>
              <Button
                variant="quiet"
                size="small"
                disabled={busy}
                aria-label={t('friends.decline.label', { pseudo: request.pseudo })}
                onClick={() => {
                  void act(() => api.declineFriend(request.id));
                }}
              >
                {t('friends.decline')}
              </Button>
            </>
          )}
        />
        <Requests
          title={t('friends.sent', { n: list.sent.length })}
          empty={t('friends.sent.none')}
          requests={list.sent}
          now={now}
          busy={busy}
          actions={(request) => (
            <Button
              variant="quiet"
              size="small"
              disabled={busy}
              aria-label={t('friends.cancel.label', { pseudo: request.pseudo })}
              onClick={() => {
                void act(() => api.removeFriend(request.id));
              }}
            >
              {t('friends.cancel')}
            </Button>
          )}
        />
      </div>
      <Panel
        className="friends__panel friends__list"
        label={t('friends.list', { n: list.friends.length })}
      >
        <h2 className="friends__heading">{t('friends.list', { n: list.friends.length })}</h2>
        {list.friends.length === 0 ? (
          <p className="hint">{t('friends.list.none')}</p>
        ) : (
          <ul className="friends__rows">
            {list.friends.map((friend) => (
              <FriendRow
                key={friend.id}
                friend={friend}
                now={now}
                busy={busy}
                onRemove={() => {
                  setRemoving(friend);
                }}
              />
            ))}
          </ul>
        )}
      </Panel>
      {removing !== null && (
        <Window
          title={t('friends.remove.title', { pseudo: removing.pseudo })}
          className="friends__confirm"
          onClose={() => {
            setRemoving(null);
          }}
          actions={
            <>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  const id = removing.id;
                  void act(() => api.removeFriend(id)).then(() => {
                    setRemoving(null);
                  });
                }}
              >
                {t('friends.remove.yes')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setRemoving(null);
                }}
              >
                {t('friends.remove.no')}
              </Button>
            </>
          }
        >
          <p>{t('friends.remove.text')}</p>
        </Window>
      )}
    </div>
  );
}

/** En invité : les amis demandent un compte ; on le dit et on ouvre la connexion sur place. */
function SignIn() {
  const [auth, setAuth] = useState<'login' | 'register' | null>(null);
  const [privacy, setPrivacy] = useState(false);
  return (
    <Panel>
      <p>{t('friends.intro')}</p>
      <p data-testid="friends-account">
        <strong>{t('friends.signin')}</strong>
      </p>
      <p className="hint">{t('friends.signin.free')}</p>
      <div className="friends__auth">
        <Button
          size="large"
          onClick={() => {
            setAuth('login');
          }}
        >
          {t('friends.signin.button')}
        </Button>
        <Button
          variant="quiet"
          size="large"
          onClick={() => {
            setAuth('register');
          }}
        >
          {t('friends.signin.register')}
        </Button>
      </div>
      {auth !== null && (
        <AuthWindow
          initial={auth}
          onClose={() => {
            setAuth(null);
          }}
          onPrivacy={() => {
            setPrivacy(true);
          }}
        />
      )}
      {privacy && (
        <PrivacyWindow
          onClose={() => {
            setPrivacy(false);
          }}
        />
      )}
    </Panel>
  );
}

export function Friends() {
  const { go } = useGame();
  const account = useAccount();
  const back = (): void => {
    go({ name: 'hub' });
  };
  let content;
  if (account === null || account.status === 'unavailable') {
    content = (
      <Panel>
        <p>{t('friends.intro')}</p>
        <p data-testid="friends-account">{t('friends.unavailable')}</p>
      </Panel>
    );
  } else if (account.status === 'guest') {
    content = <SignIn />;
  } else if (account.status === 'loading' || account.mustChangePassword) {
    // Mot de passe à changer : la fenêtre du compte le demande d'abord, l'API refuserait.
    content = (
      <p className="friends__status hint" role="status">
        {t('friends.loading')}
      </p>
    );
  } else {
    content = <FriendsPanel key={account.pseudo ?? ''} />;
  }
  return (
    <Screen title={t('friends.title')} onBack={back} className="friends" resources={false}>
      {content}
    </Screen>
  );
}
