import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test } from '@playwright/test';

// Un seul test court, joué à 1280 × 720 et 844 × 390 (voir playwright.config.ts).
test('boss de la semaine : depuis la tour, fiche sans défilement, combat et bilan des dégâts', async ({
  page,
}) => {
  const content = loadContent();
  const profile = {
    ...newProfile(content, 5, 0),
    dungeons: Object.fromEntries(
      content.dungeons.map((d) => [d.id, { clears: 1, dry: 0, tier: 2 }]),
    ),
  };
  await page.addInitScript(
    (save) => {
      localStorage.setItem('outlaw-thesis/save', save);
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
      localStorage.setItem(
        'outlaw-thesis/options',
        JSON.stringify({ speed: 'fast', animations: false, auto: true }),
      );
    },
    JSON.stringify({ version: 1, profile }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /^Tour/ }).click();
  await page.getByRole('button', { name: /Boss de la semaine/ }).click();

  const last = content.balance.boss.difficulties.length;
  await expect(
    page.getByRole('button', { name: `Difficulté ${String(last)}, ouverte` }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.boss__tiers li')).toHaveCount(content.balance.boss.rewards.length);
  const fight = page.getByRole('button', { name: /Combattre/ });
  await expect(fight).toBeInViewport({ ratio: 0.99 });
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  expect(m.sh).toBeLessThanOrEqual(m.h);

  // Équipe de niveau 1 contre le boss de niveau 30 : le combat (en Auto) finit vite.
  await fight.click();
  await page.getByRole('button', { name: 'Voir le score' }).click({ timeout: 90_000 });
  await expect(page.getByRole('heading', { level: 1, name: /dégâts infligés/ })).toBeVisible();
  await expect(page.getByText(/Paliers atteints : \d sur 4/)).toBeVisible();
  await page.getByRole('button', { name: 'Retour au boss' }).click();
  await expect(page.getByText(/Tentatives du jour : 2 sur 3/)).toBeVisible();
});
