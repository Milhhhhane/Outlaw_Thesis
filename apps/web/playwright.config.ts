import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout : le build de production servi par `vite preview` (jeu seul, cinq
 * résolutions), puis par `wrangler dev` (jeu + Worker des comptes + base D1 locale neuve).
 */
const port = 4174;
const apiPort = 8788;
const d1 = '.wrangler/e2e';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  webServer: [
    {
      command: `pnpm exec vite preview --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
    },
    {
      command: `node -e "require('fs').rmSync('${d1}',{recursive:true,force:true})" && pnpm exec wrangler dev --port ${String(apiPort)} --persist-to ${d1} --show-interactive-dev-session=false`,
      cwd: '../..',
      url: `http://localhost:${String(apiPort)}/config.json`,
      env: { WRANGLER_SEND_METRICS: 'false', CI: 'true' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'comptes',
      testMatch: /(accounts|pvp)\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${String(apiPort)}`,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: '1920x1080',
      testIgnore: /(accounts|pvp)\.spec\.ts/,
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: '1366x768',
      testIgnore: /(accounts|pvp)\.spec\.ts/,
      use: { viewport: { width: 1366, height: 768 } },
    },
    {
      name: '1280x720',
      testIgnore: /(accounts|pvp)\.spec\.ts/,
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: '844x390',
      testIgnore: /(accounts|pvp)\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: '390x844',
      testIgnore: /(accounts|pvp)\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
