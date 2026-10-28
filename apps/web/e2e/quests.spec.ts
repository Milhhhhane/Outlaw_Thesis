import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test } from '@playwright/test';

// Un seul test court, joué à 1280 × 720 et 844 × 390 (voir playwright.config.ts).
test('quêtes : badge du camp, onglets, réclamer, tout tient sans défilement', async ({ page }) => {
  const content = loadContent();
  const profile = {
    ...newProfile(content, 5, 0),
    dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 2 } },
  };
  await page.addInitScript(
    (save) => {
      localStorage.setItem('outlaw-thesis/save', save);
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
    },
    JSON.stringify({ version: 1, profile }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer' }).click();
  const entry = page.getByRole('button', { name: /^Quêtes/ });
  await expect(entry).toBeInViewport({ ratio: 0.99 });
  await expect(entry.locator('.hub__badge')).toHaveText('1');
  await entry.click();

  const noScroll = async (): Promise<void> => {
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.w);
    expect(m.sh).toBeLessThanOrEqual(m.h);
  };
  await expect(page.locator('.quest-row')).toHaveCount(content.balance.quests.daily.count + 1);
  await noScroll();
  await page.getByRole('tab', { name: /Succès/ }).click();
  const first = page.locator('.quest-row', { hasText: 'Premier sang' });
  await first.getByRole('button', { name: 'Réclamer' }).click();
  await expect(first.getByText('Réclamé')).toBeVisible();
  // Le pied (règles) reste visible : la liste défile dans son panneau, pas la page.
  await expect(page.locator('.quests__rules')).toBeInViewport({ ratio: 0.99 });
  await noScroll();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Quêtes/ }).locator('.hub__badge')).toHaveCount(0);
});
