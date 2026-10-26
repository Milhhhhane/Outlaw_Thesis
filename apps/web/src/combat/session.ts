import { loadContent, type Content } from '@outlaw/data';
import { compileEncounter, compileTeam, type BattleSetup, type HeroBuild } from '@outlaw/engine';

/** Contenu validé au démarrage : tout est embarqué dans le build, aucun appel réseau. */
export const content: Content = loadContent();

/**
 * Combat d'essai du sprint 2 : les 3 héros prototypes au niveau 1, sans talent,
 * contre une rencontre qui montre bouclier, coup lourd et étourdissement.
 */
export const DEMO_ENEMIES = ['ash_acolyte', 'moss_brute', 'thorn_witch'] as const;

export function demoSetup(): BattleSetup {
  const builds: HeroBuild[] = ['pyra', 'maree', 'ronce'].map((hero) => ({
    hero,
    level: 1,
    talents: [],
    items: [],
  }));
  return {
    units: [...compileTeam(content, builds), ...compileEncounter(content, DEMO_ENEMIES, 1)],
  };
}
