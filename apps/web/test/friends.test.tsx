import type { FriendList, Me } from '@outlaw/accounts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { t } from '../src/i18n';
import { dayAgo, friendProgressLine } from '../src/screens/Friends';

/**
 * Amis côté jeu : l'entrée du camp, le badge des demandes reçues et l'écran, sur une API simulée.
 * L'écran n'invente rien : il affiche la liste renvoyée par le serveur après chaque action.
 */

const DAY = 86_400_000;
const today = Math.floor(Date.now() / DAY) * DAY;

const list: FriendList = {
  friends: [
    {
      pseudo: 'Bruno',
      since: today - 10 * DAY,
      lastActiveDay: today,
      progress: { team: { min: 8, max: 12 }, dungeons: { cleared: 3, total: 10 } },
    },
    {
      pseudo: 'Carla',
      since: today - 20 * DAY,
      lastActiveDay: today - 3 * DAY,
      progress: { team: { min: 5, max: 5 }, dungeons: { cleared: 1, total: 10 } },
    },
    { pseudo: 'Dede', since: today - DAY, lastActiveDay: today - DAY, progress: null },
  ],
  received: [
    { pseudo: 'Emma', at: Date.now() - 1000 },
    { pseudo: 'Fanny', at: Date.now() - 2 * DAY },
  ],
  sent: [{ pseudo: 'Gaston', at: Date.now() - DAY }],
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Un serveur simulé ; `me` null : invité ; `undefined` : serveur injoignable. */
function stubApi(me: Me | null | undefined) {
  let current: FriendList = list;
  const calls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url === '/config.json') return Promise.resolve(reply(200, { contact: '' }));
    if (me === undefined) return Promise.reject(new TypeError('hors ligne'));
    if (url === '/api/me') {
      return Promise.resolve(
        me === null ? reply(401, { error: 'unauthenticated' }) : reply(200, me),
      );
    }
    if (me === null) return Promise.resolve(reply(401, { error: 'unauthenticated' }));
    if (url === '/api/save') {
      return Promise.resolve(reply(200, { rev: 0, updatedAt: null, save: null }));
    }
    if (url === '/api/friends/pending') {
      return Promise.resolve(reply(200, { received: current.received.length }));
    }
    if (url === '/api/friends') return Promise.resolve(reply(200, current));
    if (method === 'POST' && url === '/api/friends/requests') {
      const { pseudo } = JSON.parse(init?.body as string) as { pseudo: string };
      if (pseudo.toLowerCase() === 'personne') {
        return Promise.resolve(reply(404, { error: 'friend_unknown' }));
      }
      if (pseudo.toLowerCase() === 'presse') {
        return Promise.resolve(reply(429, { error: 'too_many', retryAfter: 3600 }));
      }
      current = {
        ...current,
        sent: [{ pseudo: 'Hugo_42', at: Date.now() }, ...current.sent],
      };
      return Promise.resolve(reply(201, { outcome: 'sent', list: current }));
    }
    if (method === 'POST' && url === '/api/friends/Emma/accept') {
      current = {
        ...current,
        friends: [
          { pseudo: 'Emma', since: Date.now(), lastActiveDay: today, progress: null },
          ...current.friends,
        ],
        received: current.received.filter((r) => r.pseudo !== 'Emma'),
      };
      return Promise.resolve(reply(200, current));
    }
    if (method === 'POST' && url === '/api/friends/Fanny/decline') {
      current = { ...current, received: current.received.filter((r) => r.pseudo !== 'Fanny') };
      return Promise.resolve(reply(200, current));
    }
    const removed = method === 'DELETE' ? /^\/api\/friends\/([\w-]+)$/.exec(url) : null;
    if (removed !== null) {
      const pseudo = removed[1];
      current = {
        ...current,
        friends: current.friends.filter((f) => f.pseudo !== pseudo),
        sent: current.sent.filter((r) => r.pseudo !== pseudo),
      };
      return Promise.resolve(reply(200, current));
    }
    return Promise.resolve(reply(404, { error: 'not_found' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const ALICE: Me = { pseudo: 'Alice', mustChangePassword: false, admin: false };
const entry = () => screen.getByRole('button', { name: new RegExp(`^${t('hub.menu.friends')}`) });

describe('entrée « Amis » du camp', () => {
  it('en invité : l’entrée existe, l’écran explique qu’il faut un compte, rien n’est demandé au serveur', async () => {
    const calls = stubApi(null);
    const user = userEvent.setup();
    render(<App version="test" />);
    await user.click(await screen.findByRole('button', { name: t('account.guest') }));
    expect(screen.queryByLabelText(/demande\(s\) d'ami/)).toBeNull();
    await user.click(entry());
    expect(screen.getByRole('heading', { level: 1, name: t('friends.title') })).toBeVisible();
    expect(screen.getByTestId('friends-account')).toHaveTextContent(t('friends.signin'));
    expect(screen.queryByRole('textbox', { name: t('friends.add.label') })).toBeNull();
    await user.click(screen.getByRole('button', { name: t('friends.signin.register') }));
    expect(screen.getByRole('dialog', { name: t('account.register') })).toBeVisible();
    expect(calls.filter((c) => c.includes('/api/friends'))).toEqual([]);
  });

  it('sans serveur : l’écran dit que les comptes sont indisponibles', async () => {
    stubApi(undefined);
    render(<App version="test" start={{ name: 'friends' }} />);
    expect(await screen.findByTestId('friends-account')).toHaveTextContent(
      t('friends.unavailable'),
    );
  });

  it('connecté : badge des demandes reçues, puis la liste telle que l’API la donne', async () => {
    stubApi(ALICE);
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'hub' }} />);
    expect(await screen.findByLabelText(t('hub.friends.badge', { n: 2 }))).toHaveTextContent('2');
    await user.click(entry());

    const friends = within(
      await screen.findByRole('region', { name: t('friends.list', { n: 3 }) }),
    );
    const rows = friends.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByTitle(/Amis depuis/).textContent)).toEqual([
      'Bruno',
      'Carla',
      'Dede',
    ]);
    expect(rows[0]).toHaveTextContent(t('friends.active', { when: t('friends.day.today') }));
    expect(rows[0]).toHaveTextContent('équipe niv. 8–12 · donjons 3/10');
    expect(rows[1]).toHaveTextContent(t('friends.active', { when: 'il y a 3 j' }));
    expect(rows[1]).toHaveTextContent('équipe niv. 5 · donjons 1/10');
    expect(rows[2]).toHaveTextContent(t('friends.active', { when: t('friends.day.yesterday') }));
    expect(rows[2]).toHaveTextContent(t('friends.progress.none'));

    const received = within(screen.getByRole('region', { name: t('friends.received', { n: 2 }) }));
    expect(received.getAllByRole('listitem')).toHaveLength(2);
    expect(received.getByText('Emma')).toBeInTheDocument();
    expect(received.getByText('il y a 2 j')).toBeInTheDocument();
    const sent = within(screen.getByRole('region', { name: t('friends.sent', { n: 1 }) }));
    expect(sent.getByText('Gaston')).toBeInTheDocument();
    expect(sent.getByText(t('friends.day.yesterday'))).toBeInTheDocument();
  });
});

describe('écran « Amis »', () => {
  it('accepte, refuse, annule et ajoute par pseudo ; les erreurs sont expliquées', async () => {
    const calls = stubApi(ALICE);
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'friends' }} />);
    await user.click(
      await screen.findByRole('button', { name: t('friends.accept.label', { pseudo: 'Emma' }) }),
    );
    const friends = await screen.findByRole('region', { name: t('friends.list', { n: 4 }) });
    expect(within(friends).getByText('Emma')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: t('friends.decline.label', { pseudo: 'Fanny' }) }),
    );
    expect(await screen.findByText(t('friends.received.none'))).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: t('friends.cancel.label', { pseudo: 'Gaston' }) }),
    );
    expect(await screen.findByText(t('friends.sent.none'))).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: t('friends.add.label') });
    await user.type(input, 'Personne');
    await user.click(screen.getByRole('button', { name: t('friends.add.go') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('friends.error.friend_unknown'));
    await user.clear(input);
    await user.type(input, 'presse');
    await user.click(screen.getByRole('button', { name: t('friends.add.go') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('friends.error.too_many', { minutes: 60 }),
    );
    await user.clear(input);
    await user.type(input, 'hugo_42{Enter}');
    // Le pseudo affiché est celui du serveur, pas la casse saisie.
    expect(await screen.findByText(t('friends.add.sent', { pseudo: 'Hugo_42' }))).toBeVisible();
    expect(input).toHaveValue('');
    expect(
      within(screen.getByRole('region', { name: t('friends.sent', { n: 1 }) })).getByText(
        'Hugo_42',
      ),
    ).toBeInTheDocument();
    expect(calls).toContain('POST /api/friends/Emma/accept');
    expect(calls).toContain('POST /api/friends/Fanny/decline');
    expect(calls).toContain('DELETE /api/friends/Gaston');
  });

  it('retire un ami seulement après confirmation', async () => {
    const calls = stubApi(ALICE);
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'friends' }} />);
    const remove = await screen.findByRole('button', {
      name: t('friends.remove.label', { pseudo: 'Carla' }),
    });
    await user.click(remove);
    const dialog = screen.getByRole('dialog', {
      name: t('friends.remove.title', { pseudo: 'Carla' }),
    });
    await user.click(within(dialog).getByRole('button', { name: t('friends.remove.no') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((c) => c.startsWith('DELETE'))).toEqual([]);

    await user.click(remove);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('friends.remove.yes') }),
    );
    expect(
      await screen.findByRole('region', { name: t('friends.list', { n: 2 }) }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Carla')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toContain('DELETE /api/friends/Carla');
  });

  it('signale une erreur de chargement et permet de réessayer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === '/api/me') return Promise.resolve(reply(200, ALICE));
        if (url === '/api/save') {
          return Promise.resolve(reply(200, { rev: 0, updatedAt: null, save: null }));
        }
        if (url === '/api/friends') return Promise.resolve(reply(500, { error: 'internal' }));
        return Promise.resolve(reply(200, {}));
      }),
    );
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'friends' }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('friends.error'));
    await user.click(screen.getByRole('button', { name: t('friends.retry') }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('mise en forme', () => {
  it('écrit les jours et le résumé', () => {
    const now = today + 15 * 3_600_000;
    expect(dayAgo(today, now)).toBe(t('friends.day.today'));
    expect(dayAgo(today - DAY, now)).toBe(t('friends.day.yesterday'));
    expect(dayAgo(today - 3 * DAY, now)).toBe('il y a 3 j');
    expect(dayAgo(today + DAY, now)).toBe(t('friends.day.today'));
    expect(friendProgressLine(null)).toBe(t('friends.progress.none'));
    expect(friendProgressLine({ team: null, dungeons: { cleared: 0, total: 10 } })).toBe(
      'donjons 0/10',
    );
  });
});
