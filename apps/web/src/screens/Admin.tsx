import type {
  AdminAccount,
  AdminAccountDetail,
  AdminAccountList,
  AdminProgress,
} from '@outlaw/accounts';
import { tierNumeral } from '@outlaw/engine';
import { useCallback, useEffect, useState } from 'react';
import { api, type Result } from '../account/api';
import { useGame } from '../game/nav';
import { Button, Panel, Screen } from '../game/ui';
import { names, t } from '../i18n';
import './admin.css';

/**
 * Administration (administrateurs seulement, l'entrée du camp n'existe pas pour les autres) :
 * la liste des comptes, puis le détail d'un compte. Tout vient du serveur (`/api/admin/*`),
 * y compris le résumé d'avancement ; l'écran ne fait que mettre en forme.
 */

/** Comptes par page : la liste tient dans le cadre 960 × 540 sans défiler. */
export const ADMIN_PAGE = 10;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Abrégé pour les minutes et les heures (« il y a 3 h ») ; en toutes lettres au-delà (« 2 mois »). */
const short = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });
const long = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' });

/** « il y a 3 h », « hier », « il y a 2 mois » (mise en forme d'une date donnée par le serveur). */
export function ago(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return t('admin.now');
  if (elapsed < HOUR) return short.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return short.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 30 * DAY) return long.format(-Math.floor(elapsed / DAY), 'day');
  if (elapsed < 365 * DAY) return long.format(-Math.floor(elapsed / (30 * DAY)), 'month');
  return long.format(-Math.floor(elapsed / (365 * DAY)), 'year');
}

function date(at: number | null): string {
  return at === null ? t('admin.never') : dateFormat.format(at);
}

/** L'avancement en une ligne ; sans résumé, on dit pourquoi (pas de sauvegarde, ou illisible). */
export function progressLine(account: AdminAccount): string {
  const p: AdminProgress | null = account.progress;
  if (p === null) {
    return account.lastSaveAt === null ? t('admin.progress.none') : t('admin.progress.invalid');
  }
  const parts = [t('admin.progress.heroes', p.heroes)];
  if (p.team !== null) {
    parts.push(
      p.team.min === p.team.max
        ? t('admin.progress.teamOne', { level: p.team.min })
        : t('admin.progress.team', p.team),
    );
  }
  parts.push(
    t('admin.progress.dungeons', {
      cleared: p.dungeons.cleared,
      total: p.dungeons.total,
      tier: tierNumeral(p.dungeons.bestTier),
    }),
    t('admin.progress.gold', { gold: p.gold }),
    p.items === 1 ? t('admin.progress.items.one') : t('admin.progress.items', { items: p.items }),
  );
  if (p.quests !== null) parts.push(t('admin.progress.quests', p.quests));
  return parts.join(' · ');
}

type Loaded<T> =
  { readonly key: string; readonly value: T } | { readonly key: string; readonly error: true };

/**
 * Charge une ressource de l'API à chaque nouveau `load` (à mémoriser par `useCallback`, sa clé
 * dit à quoi correspond le résultat) ; `retry` relance le même appel.
 */
function useRemote<T>(
  key: string,
  load: () => Promise<Result<T>>,
): { readonly value: T | null; readonly error: boolean; readonly retry: () => void } {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void load().then((result) => {
      if (!alive) return;
      setLoaded(result.ok ? { key, value: result.value } : { key, error: true });
    });
    return () => {
      alive = false;
    };
  }, [key, load, attempt]);
  const current = loaded?.key === key ? loaded : null;
  return {
    value: current !== null && 'value' in current ? current.value : null,
    error: current !== null && 'error' in current,
    retry: () => {
      setAttempt((n) => n + 1);
    },
  };
}

function Status({ error, onRetry }: { readonly error: boolean; readonly onRetry: () => void }) {
  return error ? (
    <div className="admin__status" role="alert">
      <p>{t('admin.error')}</p>
      <Button size="small" onClick={onRetry}>
        {t('admin.retry')}
      </Button>
    </div>
  ) : (
    <p className="admin__status hint">{t('admin.loading')}</p>
  );
}

function AccountList({
  offset,
  onPage,
  onOpen,
}: {
  readonly offset: number;
  readonly onPage: (offset: number) => void;
  readonly onOpen: (account: AdminAccount) => void;
}) {
  const load = useCallback(() => api.adminAccounts(ADMIN_PAGE, offset), [offset]);
  const { value, error, retry } = useRemote<AdminAccountList>(String(offset), load);
  const [now] = useState(() => Date.now());
  if (value === null) return <Status error={error} onRetry={retry} />;
  const { total, accounts } = value;
  return (
    <div className="admin__layout">
      <p className="admin__totals">
        {t('admin.totals', {
          accounts: total.accounts,
          day: total.active24h,
          week: total.active7d,
        })}
      </p>
      <Panel className="admin__panel">
        {accounts.length === 0 ? (
          <p className="hint">{t('admin.empty')}</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.col.pseudo')}</th>
                <th scope="col">{t('admin.col.activity')}</th>
                <th scope="col">{t('admin.col.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <button
                      type="button"
                      className="admin-table__open"
                      aria-label={t('admin.open', { pseudo: account.pseudo })}
                      onClick={() => {
                        onOpen(account);
                      }}
                    >
                      {account.pseudo}
                    </button>
                  </td>
                  <td title={date(account.lastActivityAt)}>{ago(account.lastActivityAt, now)}</td>
                  <td className="admin-table__progress">{progressLine(account)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <div className="admin__pager">
        <Button
          variant="quiet"
          size="small"
          disabled={offset === 0}
          onClick={() => {
            onPage(Math.max(0, offset - ADMIN_PAGE));
          }}
        >
          {t('admin.prev')}
        </Button>
        <span className="hint">
          {t('admin.range', {
            from: accounts.length === 0 ? 0 : offset + 1,
            to: offset + accounts.length,
            total: total.accounts,
          })}
        </span>
        <Button
          variant="quiet"
          size="small"
          disabled={offset + accounts.length >= total.accounts}
          onClick={() => {
            onPage(offset + ADMIN_PAGE);
          }}
        >
          {t('admin.next')}
        </Button>
      </div>
    </div>
  );
}

function AccountDetail({ id }: { readonly id: number }) {
  const load = useCallback(() => api.adminAccount(id), [id]);
  const { value, error, retry } = useRemote<AdminAccountDetail>(String(id), load);
  const [now] = useState(() => Date.now());
  if (value === null) return <Status error={error} onRetry={retry} />;
  const facts: readonly [string, string][] = [
    [t('admin.detail.created'), date(value.createdAt)],
    [t('admin.detail.login'), date(value.lastLoginAt)],
    [t('admin.detail.save'), date(value.lastSaveAt)],
    [
      t('admin.detail.activity'),
      `${ago(value.lastActivityAt, now)} (${date(value.lastActivityAt)})`,
    ],
    [t('admin.detail.sessions'), String(value.activeSessions)],
    [t('admin.detail.progress'), progressLine(value)],
  ];
  return (
    <div className="admin__detail">
      <Panel className="admin__facts" label={value.pseudo}>
        <h2 className="admin__pseudo">{value.pseudo}</h2>
        <dl>
          {facts.map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      {value.heroes !== null && value.dungeons !== null && (
        <div className="admin__lists">
          <Panel className="admin__list" label={t('admin.detail.heroes')}>
            <h3>{t('admin.detail.heroes')}</h3>
            <ul>
              {value.heroes.map((hero) => (
                <li key={hero.id}>
                  <span>{names.hero(hero.id)}</span>
                  <span className="hint">{t('admin.detail.hero', hero)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="admin__list" label={t('admin.detail.dungeons')}>
            <h3>{t('admin.detail.dungeons')}</h3>
            <ul>
              {value.dungeons.map((dungeon) => (
                <li key={dungeon.id}>
                  <span>{names.dungeon(dungeon.id)}</span>
                  <span className="hint">
                    {dungeon.clears === 1
                      ? t('admin.detail.dungeon.one', { tier: tierNumeral(dungeon.tier) })
                      : t('admin.detail.dungeon', {
                          clears: dungeon.clears,
                          tier: tierNumeral(dungeon.tier),
                        })}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

export function Admin() {
  const { go } = useGame();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <Screen
      title={t('admin.title')}
      className="admin"
      resources={false}
      backLabel={selected === null ? undefined : t('admin.back.list')}
      onBack={() => {
        if (selected === null) go({ name: 'hub' });
        else setSelected(null);
      }}
    >
      {selected === null ? (
        <AccountList
          offset={offset}
          onPage={setOffset}
          onOpen={(account) => {
            setSelected(account.id);
          }}
        />
      ) : (
        <AccountDetail id={selected} />
      )}
    </Screen>
  );
}
