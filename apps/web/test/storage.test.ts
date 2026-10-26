import { PROFILE_VERSION } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../src/combat/session';
import {
  clearSave,
  loadProfile,
  migrate,
  parseSave,
  SAVE_KEY,
  saveProfile,
} from '../src/save/storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('sauvegarde', () => {
  it('aller-retour sans perte', () => {
    const profile = { ...newProfile(content, 5), gold: 42 };
    saveProfile(profile);
    expect(loadProfile(content, 0)).toEqual({ profile, recovered: false });
    clearSave();
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('nouvelle partie si rien n’est sauvegardé', () => {
    const { profile, recovered } = loadProfile(content, 1234);
    expect(recovered).toBe(false);
    expect(profile.team).toEqual(['pyra', 'maree', 'ronce']);
  });

  it('sauvegarde illisible : mise de côté, nouvelle partie', () => {
    window.localStorage.setItem(SAVE_KEY, '{ pas du json');
    const loaded = loadProfile(content, 0);
    expect(loaded.recovered).toBe(true);
    expect(window.localStorage.getItem(`${SAVE_KEY}.bak`)).toBe('{ pas du json');
  });

  it('refuse un héros ou un objet inconnu du contenu', () => {
    const profile = newProfile(content);
    const ghost = { ...profile, heroes: { ...profile.heroes, ghost: profile.heroes.pyra! } };
    expect(() => parseSave(JSON.stringify({ version: 1, profile: ghost }), content)).toThrow(
      /ghost/,
    );
    const item = { ...profile, items: [{ uid: 1, item: 'nope', upgrade: 0 }] };
    expect(() => parseSave(JSON.stringify({ version: 1, profile: item }), content)).toThrow(/nope/);
  });

  it('migration : chaque version ancienne doit avoir son étape', () => {
    expect(migrate({ version: PROFILE_VERSION, profile: { a: 1 } })).toEqual({ a: 1 });
    expect(() => migrate({ version: 0, profile: {} })).toThrow(/version 0/);
  });
});
