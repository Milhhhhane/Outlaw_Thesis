/** Appels HTTP du duel en ligne (création d'un salon). La connexion en direct est dans socket.ts. */

/** Six caractères sans 0, O, 1, I (comme les codes créés par le serveur) ; sinon null. */
export function normalizeCode(text: string): string | null {
  const code = text.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}

export type Created =
  { readonly ok: true; readonly code: string } | { readonly ok: false; readonly limited: boolean };

export async function createRoom(): Promise<Created> {
  try {
    const response = await fetch('/api/pvp/rooms', { method: 'POST', credentials: 'same-origin' });
    if (response.status === 429) return { ok: false, limited: true };
    if (!response.ok) return { ok: false, limited: false };
    const data = (await response.json()) as { code?: unknown };
    const code = typeof data.code === 'string' ? normalizeCode(data.code) : null;
    return code === null ? { ok: false, limited: false } : { ok: true, code };
  } catch {
    return { ok: false, limited: false };
  }
}
