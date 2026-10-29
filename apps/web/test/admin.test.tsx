import type { AdminAccountDetail, AdminAccountList, Me } from '@outlaw/accounts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { ago } from '../src/screens/Admin';
import { names, t } from '../src/i18n';

/**
 * Administration côté jeu : l'entrée n'existe que si `/api/me` dit `admin: true`, et l'écran
 * affiche tel quel ce que renvoie l'API (simulée ici).
 */

const NOW = Date.now();
const HOUR = 3_600_000;

const bob: AdminAccountDetail = {
  id: 2,
  pseudo: 'Bob_42',
  createdAt: NOW - 50 * HOUR,
  lastLoginAt: NOW - 3 * HOUR,
  lastSaveAt: NOW - 3 * HOUR,
  lastActivityAt: NOW - 3 * HOUR,
  activeSessions: 1,
  progress: {
    heroes: { unlocked: 5, total: 26 },
    team: { min: 1, max: 12 },
    dungeons: { cleared: 1, total: 10, bestTier: 2 },
    gold: 345,
    items: 2,
    quests: { achievements: 1, total: 20 },
  },
  heroes: [{ id: 'pyra', level: 12, stars: 1 }],
  dungeons: [{ id: 'ember_wastes', clears: 2, tier: 2 }],
};

const list: AdminAccountList = {
  total: { accounts: 12, active24h: 1, active7d: 2 },
  limit: 10,
  offset: 0,
  accounts: [
    bob,
    {
      id: 3,
      pseudo: 'Carol',
      createdAt: NOW - 30 * HOUR,
      lastLoginAt: NOW - 30 * HOUR,
      lastSaveAt: null,
      lastActivityAt: NOW - 30 * HOUR,
      activeSessions: 0,
      progress: null,
    },
  ],
};

const lastPage: AdminAccountList = {
  ...list,
  offset: 10,
  accounts: [
    { ...bob, id: 9, pseudo: 'Zoe', progress: null, lastSaveAt: NOW },
    { ...bob, id: 10, pseudo: 'Yann' },
  ],
};

/** Un joueur de fin de partie : tous les héros, chaque donjon gagné 40 fois au palier III. */
const veteran: AdminAccountDetail = {
  ...bob,
  id: 7,
  pseudo: 'Veteran_Fictif',
  heroes: content.heroes.map((hero) => ({ id: hero.id, level: 30, stars: 3 })),
  dungeons: content.dungeons.map((dungeon) => ({ id: dungeon.id, clears: 40, tier: 3 })),
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Un serveur simulé : `me` est la réponse de `/api/me` (null : invité), `first` la première page. */
function stubApi(me: Me | null, first: AdminAccountList = list) {
  const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/config.json') return Promise.resolve(reply(200, { contact: '' }));
    if (url === '/api/me') {
      return Promise.resolve(
        me === null ? reply(401, { error: 'unauthenticated' }) : reply(200, me),
      );
    }
    if (url === '/api/save') {
      return Promise.resolve(reply(200, { rev: 0, updatedAt: null, save: null }));
    }
    if (me?.admin === true) {
      if (url === '/api/admin/users?limit=10&offset=0') return Promise.resolve(reply(200, first));
      if (url === '/api/admin/users?limit=10&offset=10') {
        return Promise.resolve(reply(200, lastPage));
      }
      if (url === '/api/admin/users/2') return Promise.resolve(reply(200, bob));
      if (url === '/api/admin/users/7') return Promise.resolve(reply(200, veteran));
    }
    return Promise.resolve(reply(404, { error: 'not_found' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

/** `Intl` sépare nombre et unité par une espace insécable ; le DOM testé la ramène à une espace. */
const plain = (text: string): string => text.replace(/\s/g, ' ');

const entry = () => screen.queryByRole('button', { name: new RegExp(t('admin.entry')) });

describe('entrée « Administration » du camp', () => {
  it('n’existe pas en invité', async () => {
    stubApi(null);
    const user = userEvent.setup();
    render(<App version="test" />);
    await user.click(await screen.findByRole('button', { name: t('account.guest') }));
    expect(screen.getByRole('heading', { level: 1, name: t('hub.title') })).toBeInTheDocument();
    expect(entry()).toBeNull();
  });

  it('n’existe pas pour un compte qui n’est pas administrateur', async () => {
    stubApi({ pseudo: 'Carol', mustChangePassword: false, admin: false });
    render(<App version="test" start={{ name: 'hub' }} />);
    // Le badge de synchronisation dit que le compte est connecté : la réponse est arrivée.
    expect(await screen.findByRole('status', { name: /Sauvegarde en ligne/ })).toBeVisible();
    expect(entry()).toBeNull();
  });

  it('mène un administrateur à la liste des comptes, puis au détail d’un compte', async () => {
    const fetchMock = stubApi({ pseudo: 'Patron_Fictif', mustChangePassword: false, admin: true });
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'hub' }} />);
    await user.click(await screen.findByRole('button', { name: new RegExp(t('admin.entry')) }));
    expect(screen.getByRole('heading', { level: 1, name: t('admin.title') })).toBeInTheDocument();

    // La liste : totaux, une ligne par compte, avancement en une ligne, tel que l'API le donne.
    expect(
      await screen.findByText(t('admin.totals', { accounts: 12, day: 1, week: 2 })),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const bobRow = within(rows[1]!);
    expect(bobRow.getByRole('button', { name: t('admin.open', { pseudo: 'Bob_42' }) }));
    expect(bobRow.getByText(plain(ago(NOW - 3 * HOUR, Date.now())))).toBeInTheDocument();
    expect(
      bobRow.getByText(
        'Héros 5/26 · équipe niv. 1–12 · donjons 1/10 (palier II) · 345 or · 2 objets · succès 1/20',
      ),
    ).toBeInTheDocument();
    expect(within(rows[2]!).getByText(t('admin.progress.none'))).toBeInTheDocument();
    expect(screen.getByText(t('admin.range', { from: 1, to: 2, total: 12 }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.prev') })).toBeDisabled();

    // Page suivante, puis retour.
    await user.click(screen.getByRole('button', { name: t('admin.next') }));
    expect(await screen.findByText('Zoe')).toBeInTheDocument();
    expect(screen.getByText(t('admin.progress.invalid'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.next') })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users?limit=10&offset=10',
      expect.anything(),
    );
    await user.click(screen.getByRole('button', { name: t('admin.prev') }));

    // Détail d'un compte : héros et donjons nommés, Échap revient à la liste.
    await user.click(
      await screen.findByRole('button', { name: t('admin.open', { pseudo: 'Bob_42' }) }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Bob_42' })).toBeInTheDocument();
    expect(screen.getByText(names.hero('pyra'))).toBeInTheDocument();
    expect(screen.getByText(t('admin.detail.hero', { level: 12, stars: 1 }))).toBeInTheDocument();
    expect(screen.getByText(names.dungeon('ember_wastes'))).toBeInTheDocument();
    expect(
      screen.getByText(t('admin.detail.dungeon', { clears: 2, tier: 'II' })),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { level: 1, name: t('hub.title') })).toBeInTheDocument();
  });

  it('signale une erreur de l’API et permet de réessayer', async () => {
    stubApi({ pseudo: 'Patron_Fictif', mustChangePassword: false, admin: false });
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'admin' }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.error'));
    await user.click(screen.getByRole('button', { name: t('admin.retry') }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('affiche en entier la fiche d’un joueur de fin de partie (25 héros, 20 donjons au palier III)', async () => {
    expect(veteran.heroes).toHaveLength(25);
    expect(veteran.dungeons).toHaveLength(20);
    stubApi(
      { pseudo: 'Patron_Fictif', mustChangePassword: false, admin: true },
      { ...list, accounts: [veteran] },
    );
    const user = userEvent.setup();
    render(<App version="test" start={{ name: 'admin' }} />);
    await user.click(
      await screen.findByRole('button', { name: t('admin.open', { pseudo: 'Veteran_Fictif' }) }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Veteran_Fictif' })).toBeVisible();

    // Chaque héros a sa ligne, avec son niveau et ses étoiles.
    const heroes = within(screen.getByRole('region', { name: t('admin.detail.heroes') }));
    const heroRows = heroes.getAllByRole('listitem');
    expect(heroRows).toHaveLength(25);
    veteran.heroes!.forEach((hero, i) => {
      const row = within(heroRows[i]!);
      expect(row.getByText(names.hero(hero.id))).toBeInTheDocument();
      expect(row.getByText(t('admin.detail.hero', { level: 30, stars: 3 }))).toBeInTheDocument();
    });

    // Chaque donjon : son nom, ses 40 victoires et le palier III, dans la même ligne.
    const dungeons = within(screen.getByRole('region', { name: t('admin.detail.dungeons') }));
    const dungeonRows = dungeons.getAllByRole('listitem');
    expect(dungeonRows).toHaveLength(20);
    veteran.dungeons!.forEach((dungeon, i) => {
      const row = within(dungeonRows[i]!);
      expect(row.getByText(names.dungeon(dungeon.id))).toBeInTheDocument();
      expect(
        row.getByText(t('admin.detail.dungeon', { clears: 40, tier: 'III' })),
      ).toBeInTheDocument();
      expect(dungeonRows[i]).toHaveTextContent(/\bIII$/);
    });
  });
});

describe('dates relatives', () => {
  it('écrit la dernière activité en clair', () => {
    expect(ago(NOW, NOW)).toBe(t('admin.now'));
    expect(plain(ago(NOW - 5 * 60_000, NOW))).toBe('il y a 5 min');
    expect(plain(ago(NOW - 3 * HOUR, NOW))).toBe('il y a 3 h');
    expect(plain(ago(NOW - 24 * HOUR, NOW))).toBe('hier');
    expect(plain(ago(NOW - 72 * HOUR, NOW))).toBe('il y a 3 jours');
    expect(plain(ago(NOW - 60 * 24 * HOUR, NOW))).toBe('il y a 2 mois');
    expect(plain(ago(NOW - 800 * 24 * HOUR, NOW))).toBe('il y a 2 ans');
  });
});
