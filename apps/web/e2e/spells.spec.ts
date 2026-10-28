import { expect, test } from '@playwright/test';

/**
 * Onglet Grimoire (montée des sorts) de la fiche d'un héros, en mode test : les quatre sorts se
 * règlent au maximum, la page ne défile pas (seule la liste défile) et rien ne sort de l'écran.
 */
test('grimoire : sorts au maximum en mode test, sans défilement de page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mode test' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Héros/ }).click();
  await page.locator('.hero-card').first().click();
  await page.getByRole('tab', { name: 'Grimoire' }).click();
  await expect(page.locator('.spell-level')).toHaveCount(4);
  await page.getByRole('button', { name: 'Tous les sorts au maximum' }).click();
  await expect(page.getByText('Niveau 5 / 5')).toHaveCount(4);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    right: Math.max(
      ...[...document.querySelectorAll('.spell-level')].map((e) => e.getBoundingClientRect().right),
    ),
  }));
  expect(m.sw).toBeLessThanOrEqual(viewport.width);
  expect(m.sh).toBeLessThanOrEqual(viewport.height);
  expect(m.right).toBeLessThanOrEqual(viewport.width);
});
