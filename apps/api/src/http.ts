import type { ApiError } from '@outlaw/accounts';

/** Réponses et erreurs HTTP du Worker, partagées par les modules de routes. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError,
    readonly extra: Readonly<Record<string, unknown>> = {},
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(code);
  }
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function tooMany(waitMs: number): HttpError {
  const retryAfter = Math.ceil(waitMs / 1000);
  return new HttpError(429, 'too_many', { retryAfter }, { 'Retry-After': String(retryAfter) });
}
