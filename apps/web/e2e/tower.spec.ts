import { expect, test } from '@playwright/test';

/** Un seul passage court, aux deux tailles de référence du brief (bureau et téléphone couché). */
const SIZES = new Set(['1280x720', '844x390']);

test('tour : colonne qui défile dans son cadre, fiche et Combattre visibles, page fixe', async ({
  page,
}, info) => {
  test.skip(!SIZES.has(info.project.name), 'mesuré à 1280 x 720 et 844 x 390');
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: /^Tour/ }).click();

  const column = page.locator('.tower__floors');
  const fight = page.getByRole('button', { name: /Combattre/ });
  await expect(page.getByRole('button', { name: 'Étage 1, à tenter' })).toBeInViewport();
  await expect(fight).toBeInViewport({ ratio: 0.99 });
  // La colonne des 50 étages défile dans son cadre ; la page, elle, ne défile pas.
  const sizes = await column.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(sizes.sh).toBeGreaterThan(sizes.ch);
  const page_ = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(page_.sw).toBeLessThanOrEqual(page_.w);
  expect(page_.sh).toBeLessThanOrEqual(page_.h);

  await page.getByRole('button', { name: 'Étage 50, verrouillé' }).click();
  await expect(page.getByText("Battez l'étage 49 pour ouvrir celui-ci.")).toBeInViewport();
  await page.getByRole('button', { name: 'Étage 1, à tenter' }).click();
  await fight.click();
  await expect(page.getByText('Tour, étage 1')).toBeVisible();
});
