import type { CloudSave, Me, SaveAck, SaveEnvelope } from '@outlaw/accounts';

/**
 * Appels à l'API des comptes (même origine que le jeu). Le cookie de session est HttpOnly : le
 * jeu ne le voit jamais et rien n'est mis dans le stockage local. Une réponse qui n'est pas du
 * JSON (site servi sans Worker, par exemple `vite preview`) compte comme « hors ligne ».
 */

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: string;
      readonly body: Readonly<Record<string, unknown>> | null;
    };

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) {
      return { ok: false, status: 0, error: 'offline', body: null };
    }
    const text = await response.text();
    const data = (text === '' ? null : JSON.parse(text)) as Record<string, unknown> | null;
    if (response.ok) return { ok: true, value: data as T };
    const error = typeof data?.error === 'string' ? data.error : 'other';
    return { ok: false, status: response.status, error, body: data };
  } catch {
    return { ok: false, status: 0, error: 'offline', body: null };
  }
}

export const api = {
  me: () => call<Me>('GET', '/api/me'),
  register: (pseudo: string, password: string) =>
    call<Me>('POST', '/api/register', { pseudo, password, accept: true }),
  login: (pseudo: string, password: string) => call<Me>('POST', '/api/login', { pseudo, password }),
  logout: () => call<null>('POST', '/api/logout'),
  changePassword: (oldPassword: string, newPassword: string) =>
    call<null>('POST', '/api/password', { oldPassword, newPassword }),
  deleteAccount: (password: string) => call<null>('DELETE', '/api/account', { password }),
  getSave: () => call<CloudSave>('GET', '/api/save'),
  putSave: (baseRev: number, save: SaveEnvelope) =>
    call<SaveAck>('PUT', '/api/save', { baseRev, save }),
  exportData: () => call<Record<string, unknown>>('GET', '/api/account/export'),
};

/** Moyen de contact du créateur (`public/config.json`, champ `contact`, vide par défaut). */
export async function loadContact(): Promise<string> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    const data = (await response.json()) as { contact?: unknown };
    return typeof data.contact === 'string' ? data.contact.trim() : '';
  } catch {
    return '';
  }
}
