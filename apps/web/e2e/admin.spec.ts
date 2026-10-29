import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Administration, contre le vrai Worker (`wrangler dev`) : le secret `ADMIN_PSEUDOS` y vaut
 * « E2E_Chef » (`playwright.config.ts`, `--var`), le compte est créé en minuscules.
 */

const PASSWORD = 'une phrase de passe e2e';
const ADMIN = 'e2e_chef';
let counter = 0;

/** Un appareil avec sa propre adresse (cinq inscriptions par heure et par adresse). */
async function player(browser: Browser, pseudo: string): Promise<Page> {
  counter += 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'CF-Connecting-IP': `192.0.2.${String(counter)}` },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer un compte' });
  await dialog.getByLabel('Pseudo').fill(pseudo);
  await dialog.locator('input[type=password]').fill(PASSWORD);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Le camp' })).toBeVisible();
  return page;
}

/**
 * Le bouton d'un compte dans la liste, page après page : les autres e2e, lancés en parallèle,
 * créent aussi des comptes, plus récents, qui peuvent le repousser en page suivante.
 */
async function findAccount(page: Page, pseudo: string) {
  for (let index = 0; index < 10; index++) {
    await expect(
      page.getByText(new RegExp(`^Comptes ${String(index * 10 + 1)} à \\d+ sur \\d+$`)),
    ).toBeVisible();
    const open = page.getByRole('table').getByRole('button', { name: `Voir le compte ${pseudo}` });
    if ((await open.count()) > 0) return open;
    await page.getByRole('button', { name: 'Suivants ▶' }).click();
  }
  throw new Error(`compte introuvable : ${pseudo}`);
}

test('l’administrateur voit les comptes ; un joueur n’a pas l’entrée', async ({ browser }) => {
  const other = `joueur_${String(Date.now() % 1e6)}`;
  const visitor = await player(browser, other);
  // Le compte est connecté (badge de synchronisation) et le camp n'a pas d'entrée d'administration.
  await expect(visitor.getByRole('status', { name: /Sauvegarde en ligne/ })).toBeVisible();
  await expect(visitor.getByRole('button', { name: /Administration/ })).toHaveCount(0);

  const admin = await player(browser, ADMIN);
  await admin.getByRole('button', { name: /Administration/ }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
  await expect(admin.getByText(/\d+ comptes · \d+ actifs sur 24 h/)).toBeVisible();
  // L'autre compte, puis son détail, puis retour à la liste.
  await (await findAccount(admin, other)).click();
  await expect(admin.getByRole('heading', { level: 2, name: other })).toBeVisible();
  await expect(admin.getByText('Compte créé')).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('table')).toBeVisible();
});
