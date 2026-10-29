import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import rootPackage from '../../package.json' with { type: 'json' };

/** Polices : jamais intégrées en `data:`, que la CSP de production (`font-src 'self'`) bloque. */
const FONT_FILE = /\.(?:woff2?|ttf|otf|eot)(?:\?|$)/i;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  build: {
    target: 'es2022',
    sourcemap: false,
    // `false` : servie en fichier `/assets/…` ; `undefined` : seuil par défaut de Vite (4 Kio).
    // Gardé en CI après le build par `pnpm fonts` (scripts/check-fonts.mjs).
    assetsInlineLimit: (filePath) => (FONT_FILE.test(filePath) ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
