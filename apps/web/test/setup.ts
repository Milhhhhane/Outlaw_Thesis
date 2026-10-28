import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type * as View from '../src/combat/view';

// jsdom n'a pas matchMedia : on simule « mouvement réduit ».
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
Element.prototype.scrollIntoView = vi.fn();

// Les combats ne s'animent pas dans les tests : chaque événement du journal s'affiche sans
// attendre (la vitesse « instantanée » n'existe plus pour le joueur). Le reste des délais
// (décisions d'Auto, décomptes) suit la vitesse ×2.
vi.mock('../src/combat/view', async (importOriginal) => ({
  ...(await importOriginal<typeof View>()),
  eventDuration: () => 0,
}));
beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
});

afterEach(() => {
  cleanup();
});
