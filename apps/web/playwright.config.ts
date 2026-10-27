import { defineConfig, devices } from '@playwright/test';

/** Tests de bout en bout : le build de production servi par `vite preview`. */
const port = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  webServer: {
    command: `pnpm exec vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: '1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
    { name: '1366x768', use: { viewport: { width: 1366, height: 768 } } },
    { name: '1280x720', use: { viewport: { width: 1280, height: 720 } } },
    {
      name: '844x390',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: '390x844',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
