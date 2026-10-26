import { describe, expect, it } from 'vitest';
import { content } from '../src/combat/session';
import { describeSpell, describeTrigger } from '../src/i18n/describe';
import { joinNames, names } from '../src/i18n';
import { compileHero } from '@outlaw/engine';

describe('textes du contenu', () => {
  it('chaque identifiant de contenu a son nom français', () => {
    const missing: string[] = [];
    const need = (ok: boolean, id: string) => {
      if (!ok) missing.push(id);
    };
    const all = names.all;
    for (const hero of content.heroes) {
      need(hero.id in all.heroes && names.heroThesis(hero.id) !== '', hero.id);
      need(hero.passive.id in all.passives, hero.passive.id);
      for (const spell of hero.spells) need(spell.id in all.spells, spell.id);
      for (const page of hero.pages) {
        need(page.id in all.pages && names.pageThesis(page.id) !== '', page.id);
        for (const node of page.nodes) need(node.id in all.nodes, node.id);
      }
    }
    for (const enemy of content.enemies) {
      need(enemy.id in all.enemies, enemy.id);
      for (const skill of enemy.skills) need(skill.id in all.spells, skill.id);
    }
    expect(missing).toEqual([]);
  });

  it('décrit les sorts depuis leurs briques', () => {
    const pyra = compileHero(
      content,
      { hero: 'pyra', level: 1, talents: [], items: [] },
      { side: 'player', slot: 0 },
    );
    const text = (id: string) => describeSpell(pyra.spells.find((s) => s.id === id)!);
    expect(text('pyra_blaze')).toEqual([
      '165 % ATK de dégâts',
      'Brûlure : 40 % ATK par tour, 2 tours',
    ]);
    expect(text('pyra_kindle')).toEqual(['Avance de 35', 'ATK +20 %, 2 tours']);
    expect(text('pyra_inferno')[0]).toBe('150 % ATK de dégâts');
  });

  it('décrit les passifs', () => {
    const passive = (id: string) => describeTrigger(content.heroById.get(id)!.passive.triggers[0]!);
    expect(passive('pyra')).toBe('Quand un ennemi passe sous 50 % de PV : Avance de 30 (sur soi).');
    expect(passive('maree')).toBe(
      'Quand son porteur lance une compétence (une fois par combat) : +1 à la réserve.',
    );
    expect(passive('ronce')).toBe(
      'Quand un allié inflige des dégâts sur une cible marquée (3 fois par tour) : 15 % ATK de dégâts (l’autre unité).'.replace(
        '’',
        "'",
      ),
    );
  });

  it('liste en français', () => {
    expect(joinNames(['Pyra', 'Marée', 'Ronce'])).toBe('Pyra, Marée et Ronce');
  });
});
