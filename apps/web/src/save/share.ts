import { MAX_SIDE, SPELL_SLOTS, type Content, type SpellLevels } from '@outlaw/data';
import { validateBuild, type HeroBuild } from '@outlaw/engine';

/**
 * Planificateur de build partagé par URL : l'équipe (héros, niveau, talents, objets et
 * améliorations, niveaux de sort s'ils dépassent 1) est encodée dans le fragment `#build=…`. Rien ne part sur un serveur.
 */
export const SHARE_PREFIX = '#build=';
const FORMAT = 1;

interface Shared {
  readonly v: number;
  readonly b: readonly {
    h: string;
    l: number;
    t: readonly string[];
    i: readonly [string, number][];
    /** Niveaux de sort (base, A, B, ultime) ; absent : tous au niveau 1 (anciens liens). */
    s?: readonly number[];
  }[];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeBuilds(builds: readonly HeroBuild[]): string {
  const shared: Shared = {
    v: FORMAT,
    b: builds.map((b) => ({
      h: b.hero,
      l: b.level,
      t: b.talents,
      i: b.items.map((i) => [i.id, i.upgrade]),
      ...(b.spells !== undefined && SPELL_SLOTS.some((slot) => b.spells?.[slot] !== 1)
        ? { s: SPELL_SLOTS.map((slot) => b.spells?.[slot] ?? 1) }
        : {}),
    })),
  };
  return toBase64Url(JSON.stringify(shared));
}

const isString = (x: unknown): x is string => typeof x === 'string';
const isInt = (x: unknown): x is number => Number.isInteger(x);

/** Builds lus dans un lien, ou null si le lien est abîmé ou ne correspond pas au contenu actuel. */
export function decodeBuilds(code: string, content: Content): HeroBuild[] | null {
  try {
    const raw = JSON.parse(fromBase64Url(code)) as unknown;
    if (typeof raw !== 'object' || raw === null) return null;
    const { v, b } = raw as Record<string, unknown>;
    if (v !== FORMAT || !Array.isArray(b) || b.length < 1 || b.length > MAX_SIDE) return null;
    const builds: HeroBuild[] = [];
    for (const entry of b as unknown[]) {
      if (typeof entry !== 'object' || entry === null) return null;
      const { h, l, t, i, s } = entry as Record<string, unknown>;
      if (!isString(h) || !isInt(l) || !Array.isArray(t) || !Array.isArray(i)) return null;
      if (!t.every(isString)) return null;
      const items: HeroBuild['items'][number][] = [];
      for (const pair of i as unknown[]) {
        if (!Array.isArray(pair) || !isString(pair[0]) || !isInt(pair[1])) return null;
        items.push({ id: pair[0], upgrade: pair[1] });
      }
      let spells: SpellLevels | undefined;
      if (s !== undefined) {
        if (!Array.isArray(s) || s.length !== SPELL_SLOTS.length || !s.every(isInt)) return null;
        const [basic, a, b, ult] = s as number[];
        spells = { basic: basic ?? 1, a: a ?? 1, b: b ?? 1, ult: ult ?? 1 };
      }
      const build: HeroBuild = {
        hero: h,
        level: l,
        talents: t,
        items,
        ...(spells === undefined ? {} : { spells }),
      };
      if (validateBuild(content, build).length > 0) return null;
      builds.push(build);
    }
    if (new Set(builds.map((x) => x.hero)).size !== builds.length) return null;
    return builds;
  } catch {
    return null;
  }
}

/** Builds présents dans l'adresse de la page (null s'il n'y en a pas ou s'ils sont invalides). */
export function buildsFromLocation(hash: string, content: Content): HeroBuild[] | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  return decodeBuilds(hash.slice(SHARE_PREFIX.length), content);
}

export function shareUrl(builds: readonly HeroBuild[], base: string): string {
  return `${base}${SHARE_PREFIX}${encodeBuilds(builds)}`;
}
