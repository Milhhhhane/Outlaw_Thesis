import { expect, test } from '@playwright/test';

/** Un seul passage court, aux deux tailles de référence du brief (bureau et téléphone couché). */
const SIZES = new Set(['1280x720', '844x390']);

test('sanctuaires d’essence : accès depuis la carte, fiche lisible, page fixe', async ({
  page,
}, info) => {
  test.skip(!SIZES.has(info.project.name), 'mesuré à 1280 x 720 et 844 x 390');
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: /^Donjons/ }).click();
  const entry = page.getByRole('button', { name: /Sanctuaires/ });
  await expect(entry).toBeInViewport({ ratio: 0.99 });
  await entry.click();

  await expect(page.getByRole('button', { name: /Sanctuaire des marées/ })).toBeInViewport();
  // Partie neuve : les sanctuaires sont fermés, le message le dit sans sortir de l'écran.
  await expect(page.getByText(/pour ouvrir les sanctuaires/)).toBeInViewport({ ratio: 0.99 });
  await expect(page.getByText(/Ennemis/).first()).toBeInViewport();
  const size = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(size.sw).toBeLessThanOrEqual(size.w);
  expect(size.sh).toBeLessThanOrEqual(size.h);
});
