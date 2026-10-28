import { describe, expect, it } from 'vitest';
import { loadContent, NODES_PER_PAGE, PAGES_PER_HERO, SPELL_SLOTS } from '../src';

describe('contenu embarqué', () => {
  const content = loadContent();

  it('se charge et se valide', () => {
    expect(content.heroes.length).toBeGreaterThanOrEqual(3);
    expect(content.enemies.length).toBeGreaterThanOrEqual(6);
  });

  it('chaque héros : 4 sorts, 1 passif, 3 pages de 5 nœuds avec un choix exclusif', () => {
    for (const hero of content.heroes) {
      expect(hero.spells.map((s) => s.slot)).toEqual([...SPELL_SLOTS]);
      expect(hero.pages).toHaveLength(PAGES_PER_HERO);
      for (const page of hero.pages) {
        expect(page.nodes.length).toBeGreaterThanOrEqual(NODES_PER_PAGE.min);
        expect(page.nodes.length).toBeLessThanOrEqual(NODES_PER_PAGE.max);
        expect(page.nodes.some((n) => n.group !== undefined)).toBe(true);
      }
    }
  });

  it('25 héros : rareté répartie 10 / 8 / 5 / 2, chaque élément et chaque rôle au moins 8 fois', () => {
    expect(content.heroes).toHaveLength(25);
    const count = (pick: (h: (typeof content.heroes)[number]) => string | number) => {
      const map = new Map<string | number, number>();
      for (const hero of content.heroes) map.set(pick(hero), (map.get(pick(hero)) ?? 0) + 1);
      return map;
    };
    expect([1, 2, 3, 4].map((tier) => count((h) => h.tier).get(tier))).toEqual([10, 8, 5, 2]);
    for (const n of count((h) => h.element).values()) expect(n).toBeGreaterThanOrEqual(8);
    for (const n of count((h) => h.role).values()) expect(n).toBeGreaterThanOrEqual(8);
    // Chaque couple élément × rôle existe au moins deux fois.
    for (const n of count((h) => `${h.element}/${h.role}`).values())
      expect(n).toBeGreaterThanOrEqual(2);
    expect(count((h) => `${h.element}/${h.role}`).size).toBe(9);
  });

  it('les talents d’un héros : 8 nœuds par page, une racine, un choix exclusif de deux', () => {
    for (const hero of content.heroes) {
      for (const page of hero.pages) {
        expect(page.nodes, page.id).toHaveLength(8);
        expect(
          page.nodes.filter((n) => n.requires === undefined),
          page.id,
        ).toHaveLength(1);
        const groups = new Set(page.nodes.flatMap((n) => n.group ?? []));
        expect(groups.size, page.id).toBe(1);
      }
    }
  });

  it('les trois éléments et les trois rôles sont représentés', () => {
    expect(new Set(content.heroes.map((h) => h.element))).toEqual(
      new Set(['fire', 'water', 'nature']),
    );
    expect(new Set(content.heroes.map((h) => h.role))).toEqual(
      new Set(['damage', 'support', 'control']),
    );
  });
});
