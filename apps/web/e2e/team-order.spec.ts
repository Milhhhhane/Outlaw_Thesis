import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function noScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
    y: window.scrollY,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  expect(m.sh).toBeLessThanOrEqual(m.h);
  expect(m.y).toBe(0);
}

async function centerX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return (box?.x ?? 0) + (box?.width ?? 0) / 2;
}

/** Le héros d'un emplacement est plus à droite (plus près des ennemis) que tous les autres. */
async function frontmost(target: Locator, others: Locator): Promise<void> {
  const x = await centerX(target);
  for (const other of await others.all()) expect(x).toBeGreaterThanOrEqual(await centerX(other));
}

test('réordonner l’équipe : le héros mis en place 1 est devant sur la scène', async ({ page }) => {
  const profile = newProfile(loadContent(), 5, 0);
  expect(profile.team).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
  await page.addInitScript(
    (save) => {
      localStorage.setItem('outlaw-thesis/save', save);
      localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
    },
    JSON.stringify({ version: 1, profile }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /^Donjons/ }).click();
  await page.getByRole('button', { name: /Préparer/ }).click();

  // Comme sur la scène : la place 1 est à droite.
  const slot = (n: number): Locator => page.locator(`.team__slot[data-slot="${String(n)}"]`);
  await expect(slot(0)).toHaveAttribute('data-hero', 'pyra');
  await frontmost(slot(0), page.locator('.team__slot'));
  await expect(page.locator('.team__help')).toBeVisible();

  // Glisser Ronce (place 3) sur la place 1 : les deux héros échangent leur place.
  const from = await slot(2).boundingBox();
  const to = await slot(0).boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  if (from === null || to === null) return;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(slot(0)).toHaveAttribute('data-hero', 'ronce');
  await expect(slot(2)).toHaveAttribute('data-hero', 'pyra');

  // Puis au clavier : Marée recule d'une place.
  await page.getByRole('button', { name: "Reculer Marée d'une place (vers l'arrière)" }).click();
  await expect(slot(1)).toHaveAttribute('data-hero', 'pyra');
  await expect(slot(2)).toHaveAttribute('data-hero', 'maree');
  await noScroll(page);

  await page.getByRole('button', { name: /^Partir/ }).click();
  const front = page.locator('.actor--player[data-unit="h0"]');
  await expect(front).toHaveAttribute('data-kind', 'ronce', { timeout: 15_000 });
  await frontmost(front, page.locator('.actor--player'));
  await noScroll(page);
});
