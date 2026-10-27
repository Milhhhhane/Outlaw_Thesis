import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

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

// Combats instantanés dans les tests (réglage « Instantanée » des options).
beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'instant' }));
});

afterEach(() => {
  cleanup();
});
