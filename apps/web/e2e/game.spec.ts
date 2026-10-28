import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test, type Page } from '@playwright/test';

/** Combats à ×2 et premiers pas déjà lus, pour aller droit au but. */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
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
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await noScroll(page);
  // Toutes les entrées du camp sont visibles en entier, PvP compris.
  await expect(page.getByRole('button', { name: /^PvP/ })).toBeInViewport({ ratio: 0.99 });
  for (const entry of ['Donjons', 'Équipe', 'Héros', 'Atelier', 'Coffres', 'PvP']) {
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
  // Vitesse ×2 : bouton visible, touche X, réglage retenu.
  const speed = page.locator('.battle__top button[aria-keyshortcuts="X"]');
  await expect(speed).toBeVisible();
  await page.keyboard.press('x');
  await expect(speed).toHaveText('×1');
  await page.keyboard.press('x');
  await expect(speed).toHaveText('×2');
  await expect(speed).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
  await noScroll(page);
});

/** Joue le combat affiché jusqu'au résultat. */
async function fight(page: Page, keyboard: boolean): Promise<void> {
  const outcome = page.locator('.outcome');
  for (let turn = 0; turn < 300 && !(await outcome.isVisible()); turn++) {
    const spells = page.locator('.actions__spells button:not([disabled])');
    // L'animation de l'action précédente se joue (à ×2) avant le tour suivant, ou le combat finit.
    await expect(spells.or(outcome).first()).toBeVisible();
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

test('combat automatique : le bouton joue les trois salles seul, l’en-tête tient', async ({
  page,
}) => {
  test.skip(portrait(page), 'portrait');
  await start(page);
  await page.getByRole('button', { name: 'Mode test' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Donjons/ }).click();
  await page.getByRole('button', { name: /Préparer/ }).click();
  await page.getByRole('button', { name: /^Partir/ }).click();
  const auto = page.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await inView(page, '.battle__top button[aria-keyshortcuts="A"]');
  await inView(page, '.battle__top button[aria-keyshortcuts="X"]');
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  for (let room = 1; room <= 3; room++) {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`combat ${room} sur 3`);
    // Aucun clic sur un sort : seul Auto joue.
    await expect(page.locator('.outcome')).toBeVisible({ timeout: 60_000 });
    await noScroll(page);
    // Le clic interrompt le décompte d'Auto et passe à la suite.
    await page.locator('.outcome button').first().click();
    if (!(await page.locator('.battle').isVisible())) break;
    // Le mode reste actif d'une salle à l'autre.
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('.end')).toBeVisible();
  await noScroll(page);
});

test('coffres : invocation, ouverture, tout tient dans la fenêtre', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  const content = loadContent();
  const base = newProfile(content, 5, 0);
  const cost = content.balance.chests.summonCost;
  const profile = {
    ...base,
    chests: { bronze: 1, gold: 1 },
    fragments: { ressac: cost },
    focus: 'pyra',
  };
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
  await page.getByRole('button', { name: /^Coffres/ }).click();
  await noScroll(page);

  // Ressac a assez de fragments : une invocation, et le bouton disparaît.
  const ressac = page.locator('.frag-row', { hasText: 'Ressac' });
  await ressac.getByRole('button', { name: 'Invoquer' }).click();
  await expect(ressac.getByRole('button', { name: 'Invoquer' })).toHaveCount(0);

  // Le coffre d'or : la fenêtre d'ouverture tient en entier, même avec beaucoup de héros tirés.
  await page.locator('.chest-card', { hasText: "Coffre d'or" }).getByRole('button').click();
  await expect(page.getByText('8 fragments obtenus')).toBeVisible();
  await inView(page, '.window');
  await noScroll(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('.chest-card', { hasText: "Coffre d'or" }).getByRole('button'),
  ).toBeDisabled();
  await noScroll(page);
});

test('récompenses : le bouton de sortie et toutes les cartes restent à l’écran', async ({
  page,
}) => {
  test.skip(portrait(page), 'portrait');
  const content = loadContent();
  const base = newProfile(content, 5, 0);
  // Pire cas : première victoire du donjon 2 = objet, coffre, quatre XP, or, poussière.
  const profile = {
    ...base,
    dungeons: { ember_wastes: { clears: 1 } },
    heroes: Object.fromEntries(
      Object.entries(base.heroes).map(([id, hero]) => [id, { ...hero, level: 30, xp: 0 }]),
    ),
  };
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
  await page.getByRole('button', { name: /^Partir/ }).click();
  // Auto joue : la règle « dernier sort, première cible » de `fight` perd la salle 2 de ce donjon
  // (sorts de soutien enchaînés), même au niveau 30.
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  for (let room = 1; room <= 3; room++) {
    await expect(page.locator('.outcome')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.outcome')).toContainText('Victoire');
    await page.locator('.outcome button').first().click();
    if (!(await page.locator('.battle').isVisible())) break;
  }
  await expect(page.locator('.reward-card')).toHaveCount(8);
  // Auto relancerait le donjon après son décompte : une touche rend la main.
  await page.keyboard.press('Shift');
  await expect(page.locator('.countdown')).toHaveCount(0);
  await page.waitForTimeout(1500); // fin de l'animation d'entrée des cartes
  await inView(page, '.end__go');
  await inView(page, '.reward-cards');
  await noScroll(page);
  const clipped = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.reward-card')).filter(
        (card) =>
          card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
      ).length,
  );
  expect(clipped).toBe(0);
  const list = await page.evaluate(() => {
    const el = document.querySelector('.reward-cards');
    return el === null ? 0 : el.scrollHeight - el.clientHeight;
  });
  expect(list).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Retour au camp' }).click();
  await expect(page.getByRole('button', { name: /^Coffres/ })).toBeVisible();
});

test('mode Auto : les salles s’enchaînent seules, puis le donjon se relance', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  test.skip(
    (page.viewportSize()?.width ?? 0) !== 1280 && (page.viewportSize()?.width ?? 0) !== 844,
    'une résolution d’ordinateur, plus le téléphone',
  );
  test.setTimeout(300_000);
  const content = loadContent();
  const base = newProfile(content, 5, 0);
  const profile = {
    ...base,
    heroes: Object.fromEntries(
      Object.entries(base.heroes).map(([id, hero]) => [id, { ...hero, level: 30, xp: 0 }]),
    ),
  };
  await page.addInitScript(
    (save) => {
      localStorage.setItem('outlaw-thesis/save', save);
      localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast', auto: true }));
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
    },
    JSON.stringify({ version: 1, profile }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /^Donjons/ }).click();
  await page.getByRole('button', { name: /Préparer/ }).click();
  await page.getByRole('button', { name: /^Partir/ }).click();
  const auto = page.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  const heading = page.getByRole('heading', { level: 1 });
  for (let room = 1; room <= 3; room++) {
    await expect(heading).toContainText(`combat ${room} sur 3`, { timeout: 10_000 });
    await expect(page.locator('.outcome')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.outcome')).toContainText('Victoire');
    // Le décompte : chiffre, phrase, bouton, le tout dans la fenêtre ; puis la suite sans clic.
    const countdown = page.locator('.countdown');
    await expect(countdown).toContainText(
      room === 3 ? /Récompenses dans [1-5] s/ : /Salle suivante dans [1-5] s/,
    );
    await expect(countdown.getByRole('button', { name: 'Continuer maintenant' })).toBeVisible();
    await inView(page, '.countdown');
    await noScroll(page);
  }
  await expect(page.locator('.end--rewards')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.countdown')).toContainText(/Nouveau passage dans [1-5] s/);
  await inView(page, '.countdown');
  await inView(page, '.end__go');
  await noScroll(page);
  // Relance du même donjon avec la même équipe, Auto toujours coché.
  await expect(heading).toContainText('combat 1 sur 3', { timeout: 10_000 });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  // Le joueur reprend la main d'une touche : le décompte disparaît, le résultat reste.
  await expect(page.locator('.outcome')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.countdown')).toBeVisible();
  await page.keyboard.press('Shift');
  await expect(page.locator('.countdown')).toHaveCount(0);
  await page.waitForTimeout(5500);
  await expect(page.locator('.outcome')).toBeVisible();
  await expect(heading).toContainText('combat 1 sur 3');
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
});

test('carte : les paliers d’un donjon se choisissent et tiennent à l’écran', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  test.skip(
    (page.viewportSize()?.width ?? 0) !== 1280 && (page.viewportSize()?.width ?? 0) !== 844,
    'ordinateur et téléphone',
  );
  const content = loadContent();
  const base = newProfile(content, 5, 0);
  // Landes terminées : palier I terminé, palier II ouvert, palier III verrouillé.
  const profile = { ...base, dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 2 } } };
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
  await page.getByRole('button', { name: /^Étape 1 :/ }).click();
  const tiers = page.getByRole('group', { name: 'Palier' });
  await expect(tiers).toBeVisible();
  await inView(page, '.map__tiers');
  await expect(tiers.getByRole('button', { name: /^Palier III/ })).toBeDisabled();
  await expect(tiers.getByRole('button', { name: /^Palier II,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/Niveau conseillé 6/)).toBeVisible();
  await tiers.getByRole('button', { name: /^Palier I,/ }).click();
  await expect(page.getByText(/Niveau conseillé 1/)).toBeVisible();
  await tiers.getByRole('button', { name: /^Palier II,/ }).click();
  await inView(page, '.map__go');
  await noScroll(page);
  await page.getByRole('button', { name: /Préparer l'équipe/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Landes de braise II');
  await noScroll(page);
  await page.getByRole('button', { name: /^Partir : Landes de braise II/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Landes de braise II : combat 1 sur 3',
  );
  await inView(page, '.track');
  await inView(page, '.actions');
  await noScroll(page);
});
