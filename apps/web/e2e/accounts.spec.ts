import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Comptes et sauvegarde en ligne, contre le vrai Worker (`wrangler dev`, base D1 locale neuve à
 * chaque lancement). Chaque contexte de navigateur est un « appareil » : stockage et cookies à part.
 */

const PASSWORD = 'une phrase de passe e2e';
const SAVE_KEY = 'outlaw-thesis/save';
let counter = 0;
const uniquePseudo = (): string => `e2e_${String(Date.now() % 1e6)}_${String((counter += 1))}`;

async function device(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  return page;
}

async function register(page: Page, pseudo: string): Promise<void> {
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer un compte' });
  await dialog.getByLabel('Pseudo').fill(pseudo);
  await dialog.locator('input[type=password]').fill(PASSWORD);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(dialog).toBeHidden();
}

async function login(page: Page, pseudo: string): Promise<void> {
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Se connecter' });
  await dialog.getByLabel('Pseudo').fill(pseudo);
  await dialog.locator('input[type=password]').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Connexion' }).click();
  await expect(dialog).toBeHidden();
}

/** Sauvegarde actuelle de l'appareil, or modifié, importée par les Options (un vrai changement). */
async function importGold(page: Page, gold: number): Promise<void> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(raw).not.toBeNull();
  const envelope = JSON.parse(raw ?? '{}') as { profile: { gold: number } };
  envelope.profile.gold = gold;
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByLabel('Importer une sauvegarde').setInputFiles({
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await expect(page.getByText('Sauvegarde importée.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(`${String(gold)} or`)).toBeVisible();
}

async function synced(page: Page): Promise<void> {
  await expect(page.getByRole('status', { name: /Sauvegarde en ligne : Synchronisé/ })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
}

test('créer un compte, quitter, revenir sur un autre appareil : la progression est là', async ({
  browser,
}) => {
  const pseudo = uniquePseudo();
  const phone = await device(browser);
  await register(phone, pseudo);
  await phone.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await importGold(phone, 1234);
  await synced(phone);

  // Même appareil, page rechargée : la session tient (cookie HttpOnly, rien en localStorage).
  await phone.reload();
  await expect(phone.getByRole('button', { name: `Continuer (${pseudo})` })).toBeVisible();
  const stored = await phone.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toMatch(/[0-9a-f]{64}/);

  const laptop = await device(browser);
  await login(laptop, pseudo);
  await laptop.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await expect(laptop.getByText('1234 or')).toBeVisible();
});

test('partie en invité puis création de compte : la progression migre', async ({ browser }) => {
  const pseudo = uniquePseudo();
  const page = await device(browser);
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await importGold(page, 555);
  await page.goto('/');
  await register(page, pseudo);
  const migrate = page.getByRole('dialog', { name: 'Ta progression sur cet appareil' });
  await migrate.getByRole('button', { name: "L'envoyer vers mon compte" }).click();
  await synced(page);

  const other = await device(browser);
  await login(other, pseudo);
  await other.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await expect(other.getByText('555 or')).toBeVisible();
});

test('conflit entre deux appareils : le joueur choisit, rien n’est écrasé en silence', async ({
  browser,
}) => {
  const pseudo = uniquePseudo();
  const a = await device(browser);
  await register(a, pseudo);
  await a.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await importGold(a, 100);
  await synced(a);

  const b = await device(browser);
  await login(b, pseudo);
  await b.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await expect(b.getByText('100 or')).toBeVisible();

  await importGold(a, 200);
  await synced(a);
  // B, resté à l'ancienne révision, modifie à son tour : le serveur refuse, B doit choisir.
  await importGold(b, 300);
  const conflict = b.getByRole('dialog', { name: 'Deux versions de ta progression' });
  await expect(conflict).toBeVisible({ timeout: 15_000 });
  const cloud = conflict.getByRole('region', { name: 'Version du cloud' });
  const here = conflict.getByRole('region', { name: 'Version de cet appareil' });
  await expect(cloud.getByText(/Or 200/)).toBeVisible();
  await expect(here.getByText(/Or 300/)).toBeVisible();
  await cloud.getByRole('button', { name: 'Garder celle-ci' }).click();
  await expect(conflict).toBeHidden();
  await b.getByRole('button', { name: `Continuer (${pseudo})` }).click();
  await expect(b.getByText('200 or')).toBeVisible();
  await synced(b);
});
