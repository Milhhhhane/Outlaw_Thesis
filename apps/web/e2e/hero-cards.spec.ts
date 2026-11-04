import { loadContent } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { expect, test, type Page } from '@playwright/test';

/**
 * Cartes de héros (galerie, emplacements et vivier de l'équipe, fiche) : la rareté se lit à la
 * couleur du cadre, et aucun sprite (arme comprise) ne sort de son cadre ni ne passe sur un texte
 * ou un bouton. Pire cas : les héros les plus larges et les plus hauts dans l'équipe, tous les
 * héros obtenus sauf un légendaire (silhouette), assez de niveaux pour le badge de talents.
 */
const content = loadContent();
const WIDE = ['forge', 'mousson', 'etendard', 'ressac'];
const LOCKED = 'sablier';

async function load(page: Page): Promise<void> {
  const base = newProfile(content, 5, 0);
  const pyra = base.heroes.pyra;
  if (pyra === undefined) throw new Error('pyra absent du profil neuf');
  const hero = { ...pyra, level: 20 };
  const ids = content.heroes.map((h) => h.id).filter((id) => id !== LOCKED);
  const profile = {
    ...base,
    unlocked: ids,
    heroes: Object.fromEntries(ids.map((id) => [id, { ...hero }])),
    team: WIDE,
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
}

/**
 * Défauts des cartes `selector` : boîte visible de chaque morceau de sprite (rognée par ses
 * parents qui coupent) hors du cadre (bord intérieur de la bordure) ou sur un texte, un bouton.
 */
async function spriteIssues(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    type Box = { left: number; right: number; top: number; bottom: number };
    const issues: string[] = [];
    const cut = (a: Box, b: Box): Box => ({
      left: Math.max(a.left, b.left),
      right: Math.min(a.right, b.right),
      top: Math.max(a.top, b.top),
      bottom: Math.min(a.bottom, b.bottom),
    });
    const area = (b: Box): number => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
    for (const card of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const label = `${sel} « ${card.textContent.trim().slice(0, 16)} »`;
      const style = getComputedStyle(card);
      const outer = card.getBoundingClientRect();
      // Bord intérieur du cadre, à l'échelle de l'écran (la coque est mise à l'échelle).
      const k = outer.width / card.offsetWidth;
      const frame: Box = {
        left: outer.left + parseFloat(style.borderLeftWidth) * k,
        right: outer.right - parseFloat(style.borderRightWidth) * k,
        top: outer.top + parseFloat(style.borderTopWidth) * k,
        bottom: outer.bottom - parseFloat(style.borderBottomWidth) * k,
      };
      const words: { name: string; box: Box }[] = [];
      for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
        if (el.closest('.hero-sprite') !== null) continue;
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        if (!own && el.tagName !== 'BUTTON') continue;
        if (
          el instanceof HTMLButtonElement &&
          el.disabled &&
          getComputedStyle(el).visibility === 'hidden'
        )
          continue;
        words.push({ name: el.className || el.tagName, box: el.getBoundingClientRect() });
      }
      for (const part of Array.from(card.querySelectorAll<HTMLElement>('.hero-sprite > .pixel'))) {
        let box: Box = part.getBoundingClientRect();
        for (let p = part.parentElement; p !== null && p !== card; p = p.parentElement) {
          if (getComputedStyle(p).overflow !== 'visible') box = cut(box, p.getBoundingClientRect());
        }
        if (area(box) === 0) continue;
        if (
          box.left < frame.left - 0.5 ||
          box.right > frame.right + 0.5 ||
          box.top < frame.top - 0.5 ||
          box.bottom > frame.bottom + 0.5
        ) {
          issues.push(`${label} : sprite hors du cadre`);
        }
        for (const word of words) {
          if (area(cut(box, word.box)) > 1) issues.push(`${label} : sprite sur ${word.name}`);
        }
      }
    }
    return issues;
  }, selector);
}

/**
 * Couleur peinte juste à l'intérieur du cadre, au milieu du bord gauche de chaque carte (relevée
 * sur une capture), comparée à la couleur de sa rareté.
 */
async function frameColors(
  page: Page,
  selector: string,
): Promise<{ tier: string; want: number[]; got: number[] }[]> {
  // L'entrée de l'écran est animée : la capture et les positions doivent dater du même état.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ sel, png }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return [];
      ctx.drawImage(img, 0, 0);
      const dpr = img.width / window.innerWidth;
      const rgb = (css: string): number[] => {
        const probe = document.createElement('span');
        probe.style.color = css;
        document.body.append(probe);
        const out = getComputedStyle(probe).color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
        probe.remove();
        return out;
      };
      return Array.from(document.querySelectorAll<HTMLElement>(sel)).flatMap((card) => {
        const r = card.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) return [];
        const style = getComputedStyle(card);
        const k = r.width / card.offsetWidth;
        const x = r.left + (parseFloat(style.borderLeftWidth) + 1.5) * k;
        const y = r.top + r.height * 0.75;
        // Carte cachée par le défilement de sa liste : rien à relever.
        const top = document.elementFromPoint(x, y);
        if (top === null || !card.contains(top)) return [];
        const tier = /rarity-(\d)/.exec(card.className)?.[1] ?? '?';
        const got = Array.from(
          ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data,
        ).slice(0, 3);
        return [{ tier, want: rgb(style.getPropertyValue('--rarity')), got }];
      });
    },
    { sel: selector, png: shot },
  );
}

async function rarityAtFrame(page: Page, selector: string): Promise<void> {
  const colors = await frameColors(page, selector);
  expect(colors.length).toBeGreaterThan(0);
  for (const c of colors) {
    const off = Math.max(...c.want.map((v, i) => Math.abs(v - (c.got[i] ?? 0))));
    expect(
      off,
      `${selector} rareté ${c.tier} : ${c.got.join(',')} au lieu de ${c.want.join(',')}`,
    ).toBeLessThanOrEqual(24);
  }
}

test('cartes de héros : rareté lue au cadre, sprites dans leur cadre, rien de recouvert', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.height ?? 0) > (page.viewportSize()?.width ?? 0), 'portrait');
  await load(page);

  await page.getByRole('button', { name: /^Héros/ }).click();
  const total = content.heroes.length;
  await expect(page.getByText(`${String(total - 1)} obtenus sur ${String(total)}`)).toBeVisible();
  const cards = page.locator('.hero-card');
  await expect(cards).toHaveCount(total);
  expect(await spriteIssues(page, '.hero-card')).toEqual([]);
  // Les quatre raretés, de haut en bas de la grille (tri par rareté).
  for (const tier of [4, 3, 2, 1]) {
    await page
      .locator(`.hero-card.rarity-${String(tier)}`)
      .first()
      .scrollIntoViewIfNeeded();
    await rarityAtFrame(page, `.hero-card.rarity-${String(tier)}`);
  }
  // Badge de talents : sur le cadre, sans toucher aucun texte de la carte.
  const overlaps = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hero-card__badge')).flatMap((badge) => {
      const b = badge.getBoundingClientRect();
      const card = badge.closest('.hero-card');
      if (card === null) return ['badge hors carte'];
      const c = card.getBoundingClientRect();
      // Tolérance d'un pixel : la coque est mise à l'échelle (arrondis).
      const out =
        b.left < c.left - 1 ||
        b.right > c.right + 1 ||
        b.top < c.top - 1 ||
        b.bottom > c.bottom + 1;
      const hit = Array.from(
        card.querySelectorAll('.hero-card__name, .hero-card__meta, .hero-card__thesis'),
      ).some((el) => {
        const r = el.getBoundingClientRect();
        return (
          Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 &&
          Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1
        );
      });
      return out || hit ? [card.textContent.slice(0, 16)] : [];
    }),
  );
  expect(overlaps).toEqual([]);
  await expect(page.locator('.hero-card__badge')).toHaveCount(total - 1);

  for (const id of [...WIDE, 'phenix']) {
    const name =
      { forge: 'Forge', mousson: 'Mousson', etendard: 'Étendard', ressac: 'Ressac' }[id] ??
      'Phénix';
    const card = page.locator('.hero-card', { hasText: name }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    expect(await spriteIssues(page, '.sheet__id')).toEqual([]);
    await rarityAtFrame(page, '.sheet__id');
    await page.getByRole('tab', { name: /Éveil/ }).click();
    expect(await spriteIssues(page, '.sheet__id')).toEqual([]);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Équipe/ }).click();
  expect(await spriteIssues(page, '.team__slot')).toEqual([]);
  await rarityAtFrame(page, '.team__slot:not(.team__slot--empty)');
  expect(await spriteIssues(page, '.roster__pick')).toEqual([]);
  await rarityAtFrame(page, '.roster__pick');
});
