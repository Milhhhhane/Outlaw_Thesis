import { describe, expect, it } from 'vitest';
import { content } from '../src/combat/session';
import {
  buildsFromLocation,
  decodeBuilds,
  encodeBuilds,
  SHARE_PREFIX,
  shareUrl,
} from '../src/save/share';

const builds = [
  {
    hero: 'ronce',
    level: 12,
    talents: ['ronce_snare_core', 'ronce_snare_quick'],
    items: [{ id: 'storm_sigil', upgrade: 2 }],
  },
  { hero: 'maree', level: 1, talents: [], items: [] },
];

describe('lien de build', () => {
  it('aller-retour exact, accents compris', () => {
    const code = encodeBuilds(builds);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBuilds(code, content)).toEqual(builds);
    const url = shareUrl(builds, 'https://exemple.fr/');
    expect(url.startsWith(`https://exemple.fr/${SHARE_PREFIX}`)).toBe(true);
    expect(buildsFromLocation(url.slice('https://exemple.fr/'.length), content)).toEqual(builds);
    expect(buildsFromLocation('#autre', content)).toBeNull();
  });

  it('refuse un lien abîmé ou incompatible avec le contenu', () => {
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const one = { h: 'pyra', l: 5, t: [], i: [] };
    for (const bad of [
      'n’importe quoi',
      encode(null),
      encode({ v: 2, b: [one] }),
      encode({ v: 1, b: [] }),
      encode({ v: 1, b: [one, one] }),
      encode({ v: 1, b: [{ ...one, l: 'cinq' }] }),
      encode({ v: 1, b: [{ ...one, t: [3] }] }),
      encode({ v: 1, b: [{ ...one, i: [['ember_charm']] }] }),
      encode({ v: 1, b: [{ ...one, t: ['pyra_tempo_surge'] }] }),
      encode({ v: 1, b: [{ ...one, h: 'ghost' }] }),
      encode({ v: 1, b: [42] }),
    ]) {
      expect(decodeBuilds(bad, content)).toBeNull();
    }
  });
});
