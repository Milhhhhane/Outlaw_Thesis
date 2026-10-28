import { loadContent } from '@outlaw/data';
import { newProfile, summonCost } from '@outlaw/engine';
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

/** Le vivier de l'équipe ne défile pas : toutes ses cartes, bouton « Fiche » compris, sont visibles. */
async function rosterFits(page: Page): Promise<void> {
  await expect(page.locator('.roster__card')).toHaveCount(4);
  const m = await page.evaluate(() => {
    const el = document.querySelector('.team__roster');
    return el === null ? null : { sh: el.scrollHeight, ch: el.clientHeight };
  });
  expect(m).not.toBeNull();
  expect(m?.sh ?? 0).toBeLessThanOrEqual((m?.ch ?? 0) + 1);
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
  // Équipe avant un donjon (équipes enregistrées, tri, passages) : le vivier des quatre héros de
  // départ tient en entier dans son cadre, bouton « Fiche » compris.
  await page.getByRole('button', { name: /^Donjons/ }).click();
  await page.getByRole('button', { name: /Préparer/ }).click();
  await noScroll(page);
  await rosterFits(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Équipe/ }).click();
  await rosterFits(page);
  await page.keyboard.press('Escape');
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
  const cost = summonCost(content, 'ressac');
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
  // Une série de trois passages : les récompenses relancent le donjon.
  await page.getByRole('button', { name: "3 passage(s) d'affilée" }).click();
  await page.getByRole('button', { name: /^Partir/ }).click();
  const auto = page.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  const heading = page.getByRole('heading', { level: 1 });
  for (let room = 1; room <= 3; room++) {
    // Le décompte dure 5 s : l'attente par défaut (5 s) de Playwright est trop juste sous charge.
    await expect(heading).toContainText(`combat ${room} sur 3`, { timeout: 15_000 });
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
  await expect(page.locator('.countdown')).toContainText(/Passage 2 dans [1-5] s/);
  await inView(page, '.countdown');
  await inView(page, '.end__go');
  await noScroll(page);
  // Relance du même donjon avec la même équipe, Auto toujours coché.
  await expect(heading).toContainText('combat 1 sur 3', { timeout: 10_000 });
  await expect(heading).toContainText('passage 2 sur 3');
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

test('25 héros : galerie, équipe et coffres tiennent, la rareté se voit', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  await start(page);
  // Le mode test débloque tous les héros : le pire cas pour la galerie, le vivier et les coffres.
  await page.getByRole('button', { name: 'Mode test' }).click();
  await noScroll(page);
  await expect(page.locator('.roster__card')).toHaveCount(25);
  await expect(page.locator('.roster__card.rarity-4')).toHaveCount(2);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Héros/ }).click();
  await noScroll(page);
  const cards = page.locator('.hero-card');
  await expect(cards).toHaveCount(25);
  // Tri par rareté par défaut : les légendaires en tête, les communs au bout de la grille, qui
  // défile dans son cadre.
  await expect(cards.first()).toHaveClass(/rarity-4/);
  const last = cards.last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveClass(/rarity-1/);
  await noScroll(page);
  // Filtre de rareté : seulement les légendaires, qui s'ouvrent.
  await page.getByRole('button', { name: 'Filtres' }).click();
  await inView(page, '.window');
  await noScroll(page);
  await page
    .getByRole('group', { name: 'Rareté' })
    .getByRole('button', { name: 'Légendaire' })
    .click();
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(2);
  const legendary = cards.first();
  await expect(legendary.getByText('Légendaire')).toHaveCount(1);
  await noScroll(page);
  await legendary.click();
  await expect(page.locator('.sheet__id.rarity-4 .rarity__name')).toHaveText('Légendaire');
  await inView(page, '.sheet__id .rarity');
  await noScroll(page);
});

test('25 héros : la liste des fragments tient et montre chaque rareté', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  const content = loadContent();
  const legendary = content.heroes.find((h) => h.tier === 4)?.id ?? 'pyra';
  const profile = {
    ...newProfile(content, 5, 0),
    fragments: { [legendary]: summonCost(content, legendary) },
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
  await expect(page.locator('.frag-row')).toHaveCount(25);
  // Le légendaire, en bas de liste, s'atteint en faisant défiler la liste et s'invoque à son prix.
  const row = page.locator('.frag-row.rarity-4').first();
  await row.scrollIntoViewIfNeeded();
  await inView(page, '.frag-row.rarity-4 .rarity__mark');
  await row.getByRole('button', { name: 'Invoquer' }).click();
  await expect(row.getByRole('button', { name: 'Invoquer' })).toHaveCount(0);
  await noScroll(page);
});

test('série de trois passages en Auto : rejeu, puis bilan qui tient à l’écran', async ({
  page,
}) => {
  test.skip(portrait(page), 'portrait');
  test.skip(
    (page.viewportSize()?.width ?? 0) !== 1280 && (page.viewportSize()?.width ?? 0) !== 844,
    'ordinateur et téléphone',
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
      localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
      localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
    },
    JSON.stringify({ version: 1, profile }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /^Donjons/ }).click();
  await page.getByRole('button', { name: /Préparer/ }).click();
  await page.getByRole('button', { name: "3 passage(s) d'affilée" }).click();
  await inView(page, '.team__runs');
  await inView(page, '.presets');
  await noScroll(page);
  await page.getByRole('button', { name: /^Partir/ }).click();
  // La série coche Auto d'elle-même.
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const heading = page.getByRole('heading', { level: 1 });
  const now = page.getByRole('button', { name: 'Continuer maintenant' });
  for (let pass = 1; pass <= 3; pass++) {
    for (let room = 1; room <= 3; room++) {
      await expect(heading).toContainText(`combat ${room} sur 3`, { timeout: 15_000 });
      await expect(heading).toContainText(`passage ${pass} sur 3`);
      await inView(page, '.battle__title');
      await expect(page.locator('.outcome')).toContainText('Victoire', { timeout: 60_000 });
      await now.click();
    }
    await expect(page.locator('.end--rewards')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.end__text')).toContainText(`passage ${pass} sur 3`);
    await expect(page.locator('.countdown')).toContainText(
      pass < 3 ? `Passage ${pass + 1} dans` : 'Bilan dans',
    );
    await inView(page, '.end__go');
    await noScroll(page);
    await now.click();
  }
  await expect(heading).toContainText('Bilan : Landes de braise');
  await expect(page.getByText('Série terminée.')).toBeVisible();
  await expect(page.locator('.recap-card')).toHaveCount(7);
  await expect(page.getByText('Gagnés : 3')).toBeVisible();
  await page.waitForTimeout(1500); // fin de l'animation d'entrée des cartes
  await inView(page, '.recap-cards');
  await inView(page, '.end__go');
  await noScroll(page);
  const clipped = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.recap-card')).filter(
        (card) =>
          card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
      ).length,
  );
  expect(clipped).toBe(0);
  await page.getByRole('button', { name: 'Retour au camp' }).click();
  await expect(page.getByRole('heading', { name: 'Le camp' })).toBeVisible();
  // Le coffre gagné est signalé sur l'entrée des coffres.
  await expect(page.getByRole('button', { name: /^Coffres/ })).toContainText('Coffres à ouvrir');
  await noScroll(page);
});

test('badges du camp : chaque icône se détache de son badge', async ({ page }) => {
  test.skip(portrait(page), 'portrait');
  const content = loadContent();
  const base = newProfile(content, 5, 0);
  // Niveau 4 : des points de talent à placer ; un coffre fermé.
  const profile = {
    ...base,
    heroes: Object.fromEntries(
      Object.entries(base.heroes).map(([id, hero]) => [id, { ...hero, level: 4 }]),
    ),
    chests: { bronze: 1 },
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
  const heroes = page.getByRole('button', { name: /^Héros/ });
  await expect(heroes).toContainText('Points de talent à placer : 8');
  await expect(page.getByRole('button', { name: /^Coffres/ })).toContainText(
    'Coffres à ouvrir : 1',
  );
  const colors = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hub__badge')).map((badge) => ({
      badge: getComputedStyle(badge).backgroundColor,
      icon: (() => {
        const icon = badge.querySelector('.icon');
        return icon === null ? null : getComputedStyle(icon).backgroundColor;
      })(),
    })),
  );
  const withIcon = colors.filter((c) => c.icon !== null);
  expect(withIcon.length).toBeGreaterThan(0);
  for (const c of withIcon) expect(c.icon).not.toBe(c.badge);
  await noScroll(page);
});
