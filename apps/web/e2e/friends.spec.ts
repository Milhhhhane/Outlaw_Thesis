import { expect, test, type Browser, type Page } from '@playwright/test';

/** Amis, contre le vrai Worker (`wrangler dev`) : deux comptes, une demande, une acceptation. */

const PASSWORD = 'une phrase de passe e2e';
let counter = 0;

/** Un appareil avec sa propre adresse (cinq inscriptions par heure et par adresse). */
async function player(browser: Browser, pseudo: string): Promise<Page> {
  counter += 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'CF-Connecting-IP': `198.51.100.${String(counter)}` },
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

const friendsEntry = (page: Page) => page.getByRole('button', { name: /^Amis/ });

test('A demande B, B accepte : chacun voit l’autre dans sa liste', async ({ browser }) => {
  const stamp = String(Date.now() % 1e6);
  const a = `amie_a_${stamp}`;
  const b = `ami_b_${stamp}`;
  const pageA = await player(browser, a);
  const pageB = await player(browser, b);

  // A envoie la demande (casse différente : le pseudo est comparé comme à l'inscription).
  await friendsEntry(pageA).click();
  await expect(pageA.getByRole('heading', { level: 1, name: 'Amis' })).toBeVisible();
  await pageA.getByRole('textbox', { name: "Pseudo de l'ami" }).fill(b.toUpperCase());
  await pageA.getByRole('button', { name: 'Envoyer' }).click();
  await expect(pageA.getByText(`Demande envoyée à ${b}.`)).toBeVisible();
  await expect(
    pageA.getByRole('region', { name: 'Demandes envoyées (1)' }).getByText(b),
  ).toBeVisible();

  // B revient au camp : le badge compte la demande reçue.
  await pageB.reload();
  await pageB.getByRole('button', { name: `Continuer (${b})` }).click();
  await expect(pageB.getByLabel("1 demande(s) d'ami en attente")).toBeVisible();
  await friendsEntry(pageB).click();
  await pageB.getByRole('button', { name: `Accepter la demande de ${a}` }).click();
  const listB = pageB.getByRole('region', { name: 'Mes amis (1)' });
  await expect(listB.getByText(a, { exact: true })).toBeVisible();
  await expect(listB.getByText("Actif aujourd'hui")).toBeVisible();

  // A rouvre l'écran : B est dans sa liste, la demande envoyée a disparu.
  await pageA.keyboard.press('Escape');
  await friendsEntry(pageA).click();
  const listA = pageA.getByRole('region', { name: 'Mes amis (1)' });
  await expect(listA.getByText(b, { exact: true })).toBeVisible();
  await expect(pageA.getByText('Aucune demande en attente.')).toBeVisible();
});
