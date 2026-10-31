import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test } from '@playwright/test';

/** Un seul passage court, aux deux tailles de référence du brief (bureau et téléphone couché). */
const SIZES = new Set(['1280x720', '844x390']);

test('sanctuaires d’essence : accès depuis la carte, fiche lisible, page fixe', async ({
  page,
}, info) => {
  test.skip(!SIZES.has(info.project.name), 'mesuré à 1280 x 720 et 844 x 390');
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: /^Donjons/ }).click();
  const entry = page.getByRole('button', { name: /Sanctuaires/ });
  await expect(entry).toBeInViewport({ ratio: 0.99 });
  await entry.click();

  await expect(page.getByRole('button', { name: /Sanctuaire des marées/ })).toBeInViewport();
  // Partie neuve : les sanctuaires sont fermés, le message le dit sans sortir de l'écran.
  await expect(page.getByText(/pour ouvrir les sanctuaires/)).toBeInViewport({ ratio: 0.99 });
  await expect(page.getByText(/Ennemis/).first()).toBeInViewport();
  const size = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(size.sw).toBeLessThanOrEqual(size.w);
  expect(size.sh).toBeLessThanOrEqual(size.h);
});

/**
 * Onglet Éveil de la fiche : le cas signalé par un joueur (niveau atteint, essences manquantes)
 * et le pire cas (niveau, essences, or manquants, sanctuaires fermés) tiennent sans couper.
 */
test('onglet Éveil : conditions, manques et bouton dans le cadre', async ({ page }, info) => {
  test.skip(!SIZES.has(info.project.name), 'mesuré à 1280 x 720 et 844 x 390');
  const content = loadContent();
  const rules = content.balance.awakening;
  const base = newProfile(content, 3, 0);
  const ronce = base.heroes.ronce;
  if (ronce === undefined) throw new Error('Ronce absente de la partie neuve');
  const player = {
    ...base,
    gold: 31185,
    dungeons: { [rules.openAfter]: { clears: 1, dry: 0, tier: 2 } },
    essences: { ...base.essences, nature: [6, 0, 0] },
    essenceDungeons: { essence_nature: { clears: 2, tier: 2 } },
    heroes: { ...base.heroes, ronce: { ...ronce, level: rules.minLevel } },
  };
  const worst = {
    ...base,
    gold: 10,
    essences: { ...base.essences, nature: [1, 0, 0] },
    heroes: { ...base.heroes, ronce: { ...ronce, level: rules.minLevel - 5 } },
  };
  const [low, mid, high] = rules.cost.essences;
  for (const [profile, reason] of [
    [
      player,
      `Il vous manque ${String(low - 6)} essences faibles, ${String(mid)} moyennes et ${String(high)} supérieures de nature.`,
    ],
    [
      worst,
      `Niveau ${String(rules.minLevel)} requis : le héros est niveau ${String(rules.minLevel - 5)}.`,
    ],
  ] as const) {
    await page.addInitScript(
      (save) => {
        localStorage.setItem('outlaw-thesis/save', save);
        localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
        localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
      },
      JSON.stringify({ version: profile.version, profile }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: /^Héros/ }).click();
    await page.locator('.hero-card', { hasText: 'Ronce' }).first().click();
    await page.getByRole('tab', { name: /Éveil/ }).click();
    await expect(page.getByText(reason)).toBeInViewport({ ratio: 0.99 });
    const buy = page.getByRole('button', { name: 'Éveiller' });
    await expect(buy).toBeDisabled();
    await expect(buy).toBeInViewport({ ratio: 0.99 });
    const m = await page.evaluate(() => {
      const panel = document.querySelector('.sheet__panel');
      return {
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        w: window.innerWidth,
        h: window.innerHeight,
        cut: panel === null ? 1 : panel.scrollHeight - panel.clientHeight,
      };
    });
    expect(m.sw).toBeLessThanOrEqual(m.w);
    expect(m.sh).toBeLessThanOrEqual(m.h);
    expect(m.cut).toBeLessThanOrEqual(0);
  }
});
