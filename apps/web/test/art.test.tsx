import { createBattle } from '@outlaw/engine';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backgroundUrl, sprite, SPRITES } from '../src/art';
import { content, demoSetup } from '../src/combat/session';
import { placeOf, Stage, STAGE_W } from '../src/combat/Stage';
import { viewFromState } from '../src/combat/view';

describe('pixel art', () => {
  it('chaque héros et chaque ennemi a son sprite, avec quatre images de repos', () => {
    const kinds = [...content.heroes.map((h) => h.id), ...content.enemies.map((e) => e.id)];
    for (const kind of kinds) {
      const info = sprite(kind);
      expect(info, kind).toBeDefined();
      expect(info?.frames.length).toBeGreaterThanOrEqual(4);
    }
    // Les héros ont en plus une image de dégâts.
    for (const hero of content.heroes) expect(sprite(hero.id)?.frames.length).toBe(5);
  });

  it('chaque donjon a son décor', () => {
    for (const dungeon of content.dungeons) {
      expect(backgroundUrl(dungeon.id), dungeon.id).toMatch(new RegExp(dungeon.id));
    }
  });

  it('les effets visuels nommés par la vue existent dans l’atlas', () => {
    for (const name of ['burst_fire', 'burst_water', 'burst_nature', 'heal', 'shield', 'buff']) {
      expect(SPRITES[name], name).toBeDefined();
    }
    for (const name of ['debuff', 'burn', 'stun', 'mark', 'font_damage', 'font_heal']) {
      expect(SPRITES[name], name).toBeDefined();
    }
  });

  it('les deux camps se font face, en miroir', () => {
    const hero = placeOf({ side: 'player', slot: 0 });
    const enemy = placeOf({ side: 'enemy', slot: 0 });
    expect(hero.x).toBeLessThan(STAGE_W / 2);
    expect(enemy.x).toBe(STAGE_W - hero.x);
    expect(enemy.y).toBe(hero.y);
  });

  it('le champ de bataille montre une unité par combattant', () => {
    const view = viewFromState(createBattle(demoSetup(), content.balance).state);
    const { container } = render(
      <Stage view={view} scene="thorn_maze" active={null} targets={new Set()} />,
    );
    expect(container.querySelectorAll('.actor')).toHaveLength(view.units.length);
  });
});
