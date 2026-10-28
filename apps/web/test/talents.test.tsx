import { sandboxProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { BOARD, treeLayout, type Point } from '../src/game/talentTree';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

/** Ouvre l'onglet Talents d'un héros, en mode test (tout débloqué, niveau maximum). */
async function openTalents(heroId: string): Promise<HTMLElement[]> {
  const user = userEvent.setup();
  render(
    <App version="test" initial={sandboxProfile(content)} start={{ name: 'hero', id: heroId }} />,
  );
  await user.click(screen.getByRole('tab', { name: new RegExp(t('sheet.tab.talents')) }));
  return [...document.querySelectorAll<HTMLElement>('.talents .tree')];
}

/** Centre d'un nœud affiché, lu dans son style. */
function center(tree: HTMLElement, id: string): Point {
  const node = tree.querySelector<HTMLElement>(`[data-node="${id}"]`);
  expect(node, `nœud ${id} absent`).not.toBeNull();
  return { x: parseFloat(node!.style.left), y: parseFloat(node!.style.top) };
}

function links(tree: HTMLElement): SVGLineElement[] {
  return [...tree.querySelectorAll<SVGLineElement>('.tree__link')];
}

function linkState(tree: HTMLElement, from: string, to: string): string | null {
  return (
    links(tree)
      .find((l) => l.dataset.from === from && l.dataset.to === to)
      ?.getAttribute('data-state') ?? null
  );
}

describe('liens de l’arbre des talents', () => {
  it.each(content.heroes.map((h) => [h.id] as const))(
    '%s : un trait par prérequis, du parent vers l’enfant, et rien de plus',
    async (heroId) => {
      const def = content.heroById.get(heroId)!;
      const trees = await openTalents(heroId);
      expect(trees).toHaveLength(def.pages.length);
      def.pages.forEach((page, p) => {
        const tree = trees[p]!;
        const expected = page.nodes
          .filter((n) => n.requires !== undefined)
          .map((n) => `${n.requires!} → ${n.id}`)
          .sort();
        const drawn = links(tree).map((l) => `${l.dataset.from ?? '?'} → ${l.dataset.to ?? '?'}`);
        expect(drawn.sort(), names.page(page.id)).toEqual(expected);
        // Le cœur n'a pas de trait entrant.
        for (const n of page.nodes.filter((m) => m.requires === undefined)) {
          expect(links(tree).some((l) => l.dataset.to === n.id)).toBe(false);
        }
        // Chaque trait part du centre du parent et arrive au centre de l'enfant.
        for (const line of links(tree)) {
          const a = center(tree, line.dataset.from!);
          const b = center(tree, line.dataset.to!);
          const ends = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(line.getAttribute(k)));
          expect(ends).toEqual([a.x, a.y, b.x, b.y]);
        }
      });
    },
  );

  it('un lien s’ouvre quand le parent est pris et s’allume quand l’enfant l’est', async () => {
    const user = userEvent.setup();
    const trees = await openTalents('pyra');
    const tree = trees[0]!;
    const take = async (id: string): Promise<void> => {
      await user.click(
        within(tree).getByRole('button', { name: new RegExp(`^${names.node(id)}`) }),
      );
      await user.click(screen.getByRole('button', { name: t('sheet.take') }));
    };

    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_focus')).toBe('locked');
    await take('pyra_exe_core');
    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_focus')).toBe('open');
    expect(linkState(tree, 'pyra_exe_focus', 'pyra_exe_refund')).toBe('locked');
    expect(linkState(tree, 'pyra_exe_mark', 'pyra_exe_volley')).toBe('locked');

    await take('pyra_exe_focus');
    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_focus')).toBe('on');
    expect(linkState(tree, 'pyra_exe_focus', 'pyra_exe_refund')).toBe('open');
    // Le parent de « volley » n'est pas pris : son lien reste fermé.
    expect(linkState(tree, 'pyra_exe_mark', 'pyra_exe_volley')).toBe('locked');

    // Choix exclusif : prendre l'un ferme le lien vers l'autre.
    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_finisher')).toBe('open');
    await take('pyra_exe_cheap');
    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_cheap')).toBe('on');
    expect(linkState(tree, 'pyra_exe_core', 'pyra_exe_finisher')).toBe('locked');
    expect(tree.querySelectorAll('.tree__link--on')).toHaveLength(2);
  });

  it('le choix exclusif est signalé par « ou » sous les deux nœuds rivaux', async () => {
    const trees = await openTalents('pyra');
    for (const tree of trees) {
      expect(within(tree).getAllByText(t('sheet.or'))).toHaveLength(1);
      expect(tree.querySelectorAll('.tree__or-bracket')).toHaveLength(1);
    }
  });
});

describe('mise en page de l’arbre', () => {
  const pages = content.heroes.flatMap((h) => h.pages);
  /** Distance d'un point à un segment. */
  const distance = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
  };
  /** Deux segments se coupent hors de leurs extrémités. */
  const cross = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const side = (p: Point, q: Point, r: Point): number =>
      Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  };

  it.each(pages.map((p) => [p.id, p] as const))(
    '%s : nœuds dans le plateau, sans chevauchement, traits sans croisement',
    (_, page) => {
      const { pos, links } = treeLayout(page.nodes);
      const at = (id: string): Point => pos.get(id)!;
      const ids = page.nodes.map((n) => n.id);
      expect([...pos.keys()].sort()).toEqual([...ids].sort());
      for (const id of ids) {
        const { x, y } = at(id);
        expect(x - 16).toBeGreaterThanOrEqual(0);
        expect(x + 16).toBeLessThanOrEqual(BOARD.width);
        expect(y - 16).toBeGreaterThanOrEqual(0);
        expect(y + 16).toBeLessThanOrEqual(BOARD.height);
        for (const other of ids.filter((o) => o !== id)) {
          const d = Math.max(Math.abs(at(other).x - x), Math.abs(at(other).y - y));
          expect(d, `${id} / ${other}`).toBeGreaterThanOrEqual(32);
        }
      }
      for (const link of links) {
        const a = at(link.from);
        const b = at(link.to);
        // Un enfant est sous son parent ; un trait ne frôle aucun autre nœud (carré de 32 px).
        expect(b.y).toBeGreaterThan(a.y);
        for (const id of ids.filter((o) => o !== link.from && o !== link.to)) {
          expect(distance(at(id), a, b), `${link.from} → ${link.to} sur ${id}`).toBeGreaterThan(
            16 * Math.SQRT2,
          );
        }
        for (const other of links.filter((l) => l !== link)) {
          expect(cross(a, b, at(other.from), at(other.to))).toBe(false);
        }
      }
    },
  );
});
