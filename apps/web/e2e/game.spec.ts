import { expect, test, type Page } from '@playwright/test';

/** Combats instantanés et premiers pas déjà lus, pour aller droit au but. */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'instant' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
}

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

/** Visible en entier dans la fenêtre. */
async function inView(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  if (box === null || vp === null) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
}

const portrait = (page: Page): boolean =>
  (page.viewportSize()?.height ?? 0) > (page.viewportSize()?.width ?? 0);

test('portrait sur téléphone : il faut tourner l’appareil, rien ne défile', async ({ page }) => {
  test.skip(!portrait(page), 'paysage');
  await start(page);
  await expect(page.getByText(/Tournez votre appareil/)).toBeVisible();
  await noScroll(page);
});

test('chaque écran tient dans la fenêtre, sans défilement', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  await start(page);
  await noScroll(page);
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await noScroll(page);
  for (const entry of ['Donjons', 'Équipe', 'Héros', 'Atelier']) {
    await page.getByRole('button', { name: new RegExp(`^${entry}`) }).click();
    await noScroll(page);
    if (entry === 'Héros') {
      await page.getByRole('button', { name: /^Pyra/ }).click();
      for (const tab of ['Talents', 'Objets', 'Statistiques et sorts']) {
        await page.getByRole('tab', { name: new RegExp(tab) }).click();
        await noScroll(page);
      }
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Options' }).click();
  await noScroll(page);
  await page.keyboard.press('Escape');

  // Combat : file d'initiative et barre de sorts visibles en même temps.
  await page.getByRole('button', { name: "Combat d'essai" }).click();
  await inView(page, '.track');
  await inView(page, '.actions');
  await noScroll(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
  await noScroll(page);
});

/** Joue le combat affiché jusqu'au résultat. */
async function fight(page: Page, keyboard: boolean): Promise<void> {
  const outcome = page.locator('.outcome');
  for (let turn = 0; turn < 300 && !(await outcome.isVisible()); turn++) {
    const spells = page.locator('.actions__spells button:not([disabled])');
    if ((await spells.count()) === 0) continue;
    if (keyboard) {
      const key = String(await spells.count());
      await page.keyboard.press(key === '0' ? '1' : key);
      if ((await page.locator('.hitbox--target').count()) > 0) await page.keyboard.press('Enter');
    } else {
      await spells.last().click();
      const target = page.locator('.hitbox--target').first();
      if ((await target.count()) > 0) await target.click();
    }
  }
  await expect(outcome).toBeVisible();
}

for (const keyboard of [false, true]) {
  test(`boucle complète en mode test, ${keyboard ? 'au clavier' : 'à la souris'}`, async ({
    page,
  }) => {
    test.skip(portrait(page), 'portrait');
    test.skip(
      (page.viewportSize()?.width ?? 0) !== (keyboard ? 1920 : 1280) &&
        (page.viewportSize()?.width ?? 0) !== 844,
      'une résolution par variante, plus le téléphone',
    );
    await start(page);
    await page.getByRole('button', { name: 'Mode test' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Donjons/ }).click();
    await page.getByRole('button', { name: /Préparer/ }).click();
    await page.getByRole('button', { name: /^Partir/ }).click();
    for (let room = 1; room <= 3; room++) {
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`combat ${room} sur 3`);
      await inView(page, '.track');
      await inView(page, '.actions');
      await fight(page, keyboard);
      await noScroll(page);
      const next = page.locator('.outcome button').first();
      if (keyboard) {
        await next.focus();
        await page.keyboard.press('Enter');
      } else {
        await next.click();
      }
      if (!(await page.locator('.battle').isVisible())) break;
    }
    // Fin du donjon (rien à gagner en mode test) puis retour au camp.
    await expect(page.locator('.end')).toBeVisible();
    await noScroll(page);
    await page.getByRole('button', { name: 'Retour au camp' }).click();
    await expect(page.getByRole('heading', { name: 'Le camp' })).toBeVisible();
  });
}
