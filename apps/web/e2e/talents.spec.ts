import { expect, test, type Page } from '@playwright/test';

/**
 * Onglet Talents de la fiche d'un héros : pour chacun des 25 héros (mode test, tout est débloqué)
 * et chaque nœud de ses trois pages, aucun texte de l'onglet (arbres et aperçu du talent choisi)
 * n'en chevauche un autre, n'est caché sous un nœud ni coupé par son cadre. Un texte qui sort
 * d'un cadre qui défile reste lisible : seul compte alors le cadre lui-même.
 */

/** Choisit chaque nœud de chaque page tour à tour et relève l'onglet à chaque fois. */
async function auditHero(page: Page, hero: string): Promise<string[]> {
  return page.evaluate(async (hero) => {
    /** Relevé fait dans la page : une ligne par défaut trouvé, vide si tout est lisible. */
    function run(where: string): string[] {
      const root = document.querySelector('.talents');
      if (root === null) return [`${where} : onglet Talents absent`];
      const name = (el: Element): string => {
        const cls = el.getAttribute('class')?.split(' ')[0];
        return cls === undefined || cls === '' ? el.tagName.toLowerCase() : `.${cls}`;
      };
      const overlap = (a: DOMRect, b: DOMRect): boolean =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const inside = (a: DOMRect, b: DOMRect): boolean =>
        a.left >= b.left - 1 &&
        a.right <= b.right + 1 &&
        a.top >= b.top - 1 &&
        a.bottom <= b.bottom + 1;

      // Chaque ligne de chaque texte visible, avec l'élément qui la porte.
      const lines: { el: Element; text: string; rect: DOMRect }[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (text === '' || el === null || getComputedStyle(el).visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) lines.push({ el, text: text.slice(0, 40), rect });
        }
      }

      const issues: string[] = [];
      const nodes = [...root.querySelectorAll('.node')].map((n) => n.getBoundingClientRect());
      lines.forEach((a, i) => {
        const label = `${name(a.el)} « ${a.text} »`;
        for (const b of lines.slice(i + 1)) {
          if (a.el !== b.el && overlap(a.rect, b.rect)) {
            issues.push(`${where} : ${label} chevauche ${name(b.el)} « ${b.text} »`);
          }
        }
        if (nodes.some((r) => overlap(a.rect, r)))
          issues.push(`${where} : ${label} caché sous un nœud`);
        const size = parseFloat(getComputedStyle(a.el).fontSize);
        if (size < 11) issues.push(`${where} : ${label} en ${String(size)} px`);
        // Les cadres qui coupent leur contenu : le texte doit y tenir ; un cadre qui défile doit,
        // lui, tenir dans ceux qui l'entourent.
        let seen = a.rect;
        for (let p = a.el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
          const box = p.getBoundingClientRect();
          if (/auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) {
            seen = box;
            continue;
          }
          if (!inside(seen, box)) {
            issues.push(`${where} : ${label} coupé par ${name(p)}`);
            break;
          }
        }
      });
      // Un texte plus large que sa boîte (coupé ou en débord), hors cadres qui défilent.
      for (const el of root.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        if (
          el.closest('svg') !== null ||
          style.display === 'inline' ||
          el.textContent.trim() === ''
        )
          continue;
        if (/auto|scroll/.test(style.overflowX)) continue;
        if (el.scrollWidth > el.clientWidth + 1) {
          issues.push(
            `${where} : ${name(el)} déborde (${String(el.scrollWidth)} > ${String(el.clientWidth)})`,
          );
        }
      }
      return [...new Set(issues)];
    }

    const frame = (): Promise<void> =>
      new Promise((done) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            done();
          });
        });
      });
    const issues = run(`${hero}, aucun nœud choisi`);
    const trees = [...document.querySelectorAll('.talents .tree')];
    for (const [p, tree] of trees.entries()) {
      for (const node of tree.querySelectorAll<HTMLButtonElement>('.node')) {
        node.click();
        await frame();
        issues.push(
          ...run(`${hero}, page ${String(p + 1)}, ${node.getAttribute('aria-label') ?? '?'}`),
        );
      }
    }
    return issues;
  }, hero);
}

test('talents des 25 héros : aucun texte ne se chevauche ni ne déborde', async ({ page }) => {
  test.skip((page.viewportSize()?.height ?? 0) > (page.viewportSize()?.width ?? 0), 'portrait');
  await page.addInitScript(() => {
    localStorage.setItem('outlaw-thesis/options', JSON.stringify({ speed: 'fast' }));
    localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mode test' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Héros/ }).click();
  const cards = page.locator('.hero-card');
  await expect(cards).toHaveCount(25);

  const issues: string[] = [];
  for (let i = 0; i < 25; i += 1) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    const hero = (await card.locator('.hero-card__name').innerText()).split('\n')[0] ?? '?';
    await card.click();
    await page.getByRole('tab', { name: /^Talents/ }).click();
    await expect(page.locator('.talents .tree')).toHaveCount(3);
    issues.push(...(await auditHero(page, hero)));
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
    }));
    expect(m.sw).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    expect(m.sh).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
    await page.keyboard.press('Escape');
  }
  expect(issues.slice(0, 40), `${String(issues.length)} défaut(s)`).toEqual([]);
});
