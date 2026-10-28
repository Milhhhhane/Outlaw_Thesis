import { loadContent } from '@outlaw/data';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Duel en ligne, contre le vrai Worker et le vrai Durable Object (`wrangler dev`) : deux contextes
 * de navigateur, donc deux joueurs avec leur propre session, jouent un salon entier.
 */

const PASSWORD = 'une phrase de passe e2e';
let counter = 0;
const uniquePseudo = (tag: string): string =>
  `${tag}_${String(Date.now() % 1e6)}_${String((counter += 1))}`;

/**
 * Chaque joueur a sa propre adresse : le serveur limite à cinq inscriptions par heure et par adresse,
 * et toute la suite de tests part de la même machine.
 */
async function player(browser: Browser, pseudo: string): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'CF-Connecting-IP': `198.51.100.${String((counter += 1) % 250)}` },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'instant' }));
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
  return page;
}

async function openMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^PvP/ }).click();
  await expect(page.getByRole('heading', { name: 'Duel en ligne' })).toBeVisible();
}

async function createRoom(page: Page): Promise<string> {
  await openMenu(page);
  const create = page.getByRole('button', { name: 'Créer', exact: true });
  await expect(create).toBeEnabled({ timeout: 20_000 });
  await create.click();
  const code = page.getByTestId('room-code');
  await expect(code).toBeVisible();
  return (await code.textContent()) ?? '';
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await openMenu(page);
  await page.getByLabel('Code du salon').fill(code);
  const join = page.getByRole('button', { name: 'Rejoindre', exact: true });
  await expect(join).toBeEnabled({ timeout: 20_000 });
  await join.click();
}

/** Héros par équipe (`balance.progression.teamSize`). */
const TEAM_SIZE = loadContent().balance.progression.teamSize;

/** Une équipe complète, validée par le salon, puis « Prêt ». */
async function getReady(page: Page): Promise<void> {
  const picks = page.getByRole('button', { name: /^(Choisir|Retirer) / });
  await expect(picks.first()).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const pressed = await page.locator('.pvp-pick[aria-pressed=true]').count();
    if (pressed >= TEAM_SIZE) break;
    await page.locator('.pvp-pick[aria-pressed=false]:not([disabled])').first().click();
  }
  await expect(page.getByText('Équipe validée par le salon.')).toBeVisible();
  const ready = page.getByRole('button', { name: 'Prêt', exact: true });
  await expect(ready).toBeEnabled();
  await ready.click();
}

/** Joue à chaque tour de ce joueur (première attaque, première cible) jusqu'à la fin du combat. */
async function playUntilResult(page: Page): Promise<void> {
  const result = page.getByTestId('pvp-result');
  const myTurn = page.getByRole('region', { name: /^Au tour de/ });
  for (let guard = 0; guard < 400; guard++) {
    if (await result.isVisible()) return;
    if (await myTurn.isVisible()) {
      await page.keyboard.press('1');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(60);
  }
  throw new Error('le combat ne se termine pas');
}

/** Un vainqueur et un vaincu, ou un nul des deux côtés. */
function consistent(first: string | null, second: string | null): boolean {
  const [low, high] = [first, second].sort();
  return (low === 'Défaite' && high === 'Victoire') || (low === 'Égalité' && high === 'Égalité');
}

const title = (page: Page) => page.getByTestId('pvp-result').getByRole('heading');

test('un salon, un combat entier, des émotes, une revanche, puis un abandon', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const alice = await player(browser, uniquePseudo('Al'));
  const bob = await player(browser, uniquePseudo('Bo'));

  const code = await createRoom(alice);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await joinRoom(bob, code);

  // Chacun voit l'autre dans le salon.
  await expect(alice.getByTestId('opponent-seat')).toContainText(/Bo_/);
  await expect(bob.getByTestId('opponent-seat')).toContainText(/Al_/);
  // Seul l'hôte règle : Bob lit les règles, Alice les modifie et Bob les voit changer.
  await expect(bob.getByLabel('Niveau maximum')).toHaveCount(0);
  await alice.getByLabel('Niveau maximum').fill('12');
  await expect(bob.locator('.pvp-rules-list')).toContainText('12');
  // Le salon tient dans la fenêtre (1280 x 720).
  await noScroll(alice);

  await Promise.all([getReady(alice), getReady(bob)]);
  await expect(alice.locator('.battle')).toBeVisible({ timeout: 20_000 });
  await expect(bob.locator('.battle')).toBeVisible({ timeout: 20_000 });
  // Quatre héros de chaque côté, et pas de bouton Auto en ligne.
  await expect(alice.locator('.battle .hitbox')).toHaveCount(2 * TEAM_SIZE);
  await expect(alice.locator('.battle__top button[aria-keyshortcuts="A"]')).toHaveCount(0);
  await noScroll(alice);
  // Les pseudos sont affichés de chaque côté, chacun voit « vous » de son côté.
  await expect(alice.getByTestId(/plate-/).filter({ hasText: 'vous' })).toHaveCount(1);
  await expect(bob.getByTestId(/plate-/).filter({ hasText: 'vous' })).toHaveCount(1);

  // Une émote d'Alice apparaît chez Bob.
  await alice.getByRole('button', { name: 'Émotes' }).click();
  await alice.getByRole('button', { name: 'Bien joué !' }).click();
  await expect(bob.getByTestId('emote-bubble')).toHaveText('Bien joué !');

  await Promise.all([playUntilResult(alice), playUntilResult(bob)]);
  const [a, b] = await Promise.all([title(alice).textContent(), title(bob).textContent()]);
  expect(consistent(a, b)).toBe(true);

  // Revanche : les deux acceptent, un nouveau combat commence.
  await alice.getByRole('button', { name: 'Revanche', exact: true }).click();
  await expect(bob.getByRole('button', { name: 'Accepter la revanche' })).toBeVisible();
  await bob.getByRole('button', { name: 'Accepter la revanche' }).click();
  await expect(alice.getByTestId('pvp-result')).toBeHidden({ timeout: 20_000 });
  await expect(bob.getByTestId('pvp-result')).toBeHidden({ timeout: 20_000 });

  // Alice abandonne en plein combat : Bob gagne par forfait.
  await alice.getByRole('button', { name: 'Pause' }).click();
  await alice.getByRole('button', { name: 'Abandonner le combat' }).click();
  await alice.getByRole('button', { name: /Abandonner \? Cliquez de nouveau/ }).click();
  await expect(title(bob)).toHaveText('Victoire', { timeout: 20_000 });
  await expect(bob.getByTestId('pvp-result')).toContainText('Votre adversaire a abandonné');
});

test('un joueur qui recharge la page reprend le combat là où il en était', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await player(browser, uniquePseudo('Al'));
  const bob = await player(browser, uniquePseudo('Bo'));
  const code = await createRoom(alice);
  await joinRoom(bob, code);
  await Promise.all([getReady(alice), getReady(bob)]);
  await expect(alice.locator('.battle')).toBeVisible({ timeout: 20_000 });
  await expect(bob.locator('.battle')).toBeVisible({ timeout: 20_000 });

  // Quelques coups sont joués, puis Bob perd sa page.
  const aliceLoop = playUntilResult(alice);
  await alice.waitForTimeout(1500);
  await bob.reload();
  await expect(alice.getByRole('status').filter({ hasText: /déconnecté/ })).toBeVisible({
    timeout: 20_000,
  });

  // Il revient (sa session est toujours là) et rejoint le même code : son siège l'attend.
  await bob.getByRole('button', { name: /^Continuer \(/ }).click();
  await joinRoom(bob, code);
  await expect(bob.locator('.battle')).toBeVisible({ timeout: 20_000 });
  await Promise.all([aliceLoop, playUntilResult(bob)]);
  await expect(alice.getByTestId('pvp-result')).toBeVisible();
  await expect(bob.getByTestId('pvp-result')).toBeVisible();
  const [a, b] = await Promise.all([title(alice).textContent(), title(bob).textContent()]);
  expect(consistent(a, b)).toBe(true);
});

test('un code inconnu ou un salon complet ne se rejoint pas', async ({ browser }) => {
  test.setTimeout(120_000);
  const alice = await player(browser, uniquePseudo('Al'));
  const bob = await player(browser, uniquePseudo('Bo'));
  const carol = await player(browser, uniquePseudo('Ca'));
  const code = await createRoom(alice);
  await joinRoom(bob, code);
  await expect(alice.getByTestId('opponent-seat')).toContainText(/Bo_/);

  await joinRoom(carol, code);
  await expect(carol.getByRole('alert')).toContainText('Impossible de rejoindre ce salon');
  await carol.getByRole('button', { name: 'Retour au menu' }).click();
  await carol.getByLabel('Code du salon').fill('ZZZZ22');
  await carol.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await expect(carol.getByRole('alert')).toContainText('Impossible de rejoindre ce salon');
});

/** La page tient dans la fenêtre : aucun défilement. */
async function noScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  expect(m.sh).toBeLessThanOrEqual(m.h);
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
]) {
  test(`invité (${String(viewport.width)}x${String(viewport.height)}) : l'entrée PvP du camp dit qu'il faut un compte et mène à l'inscription`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: { 'CF-Connecting-IP': `203.0.113.${String((counter += 1) % 250)}` },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Jouer en invité' }).click();

    // L'entrée est au camp, visible en entier, sans défilement.
    const entry = page.getByRole('button', { name: /^PvP/ });
    await expect(entry).toBeInViewport({ ratio: 0.99 });
    await noScroll(page);

    await entry.click();
    await expect(page.getByRole('heading', { name: 'Duel en ligne' })).toBeVisible();
    await expect(page.getByTestId('pvp-account')).toContainText('demande un compte');
    await expect(page.getByText(/Un compte est gratuit/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeInViewport();
    await noScroll(page);

    // « Créer un compte » ouvre l'inscription sur place ; une fois inscrit, le menu des salons s'affiche.
    await page.getByRole('button', { name: 'Créer un compte' }).click();
    const dialog = page.getByRole('dialog', { name: 'Créer un compte' });
    await dialog.getByLabel('Pseudo').fill(uniquePseudo('In'));
    await dialog.locator('input[type=password]').fill(PASSWORD);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Créer', exact: true })).toBeVisible();
    await noScroll(page);
    await context.close();
  });
}
