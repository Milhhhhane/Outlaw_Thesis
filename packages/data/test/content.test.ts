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
        expect(page.nodes).toHaveLength(NODES_PER_PAGE);
        expect(page.nodes.some((n) => n.group !== undefined)).toBe(true);
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
