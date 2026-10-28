import { SPELL_SLOTS, type Content, type Profile, type SpellSlot } from '@outlaw/data';
import type { Outcome, Refusal } from './progression';

/**
 * Montée des sorts : chaque sort d'un héros monte du niveau 1 à `spellLevels.max`, contre des
 * grimoires (communs à tous les héros) et des fragments du héros (les doublons des coffres). Les
 * effets sont compilés dans les sorts par `compileHero` (`spellPowerPct`, bonus du dernier niveau).
 * Fonctions pures : (profil, demande) → nouveau profil ou refus motivé.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

export interface SpellUpCost {
  readonly grimoires: number;
  readonly fragments: number;
}

/** Coût pour passer un sort du niveau `level` au suivant, ou null au niveau maximum. */
export function spellUpCost(content: Content, level: number): SpellUpCost | null {
  return content.balance.spellLevels.costs[level - 1] ?? null;
}

/** Coût total d'un sort, du niveau 1 au maximum (pour l'affichage et la simulation). */
export function spellMaxCost(content: Content): SpellUpCost {
  return content.balance.spellLevels.costs.reduce(
    (sum, c) => ({
      grimoires: sum.grimoires + c.grimoires,
      fragments: sum.fragments + c.fragments,
    }),
    { grimoires: 0, fragments: 0 },
  );
}

/** Monte d'un niveau le sort `slot` du héros, contre grimoires et fragments du héros. */
export function spellUp(
  content: Content,
  profile: Profile,
  heroId: string,
  slot: SpellSlot,
): Outcome {
  const hero = profile.heroes[heroId];
  if (hero === undefined || !profile.unlocked.includes(heroId)) return refuse('locked_hero');
  if (profile.testMode) return refuse('test_mode');
  const level = hero.spells[slot];
  const cost = spellUpCost(content, level);
  if (cost === null) return refuse('max_spell_level');
  if (profile.grimoires < cost.grimoires) return refuse('not_enough_grimoires');
  const owned = profile.fragments[heroId] ?? 0;
  if (owned < cost.fragments) return refuse('not_enough_fragments');
  return ok({
    ...profile,
    grimoires: profile.grimoires - cost.grimoires,
    fragments: { ...profile.fragments, [heroId]: owned - cost.fragments },
    heroes: {
      ...profile.heroes,
      [heroId]: { ...hero, spells: { ...hero.spells, [slot]: level + 1 } },
    },
  });
}

/** Mode test : règle le niveau d'un sort (ou de tous les sorts si `slot` vaut null), borné. */
export function setSpellLevel(
  content: Content,
  profile: Profile,
  heroId: string,
  slot: SpellSlot | null,
  level: number,
): Outcome {
  if (!profile.testMode) return refuse('test_only');
  const hero = profile.heroes[heroId];
  if (hero === undefined) return refuse('unknown_hero');
  const value = Math.min(content.balance.spellLevels.max, Math.max(1, Math.round(level)));
  const slots = slot === null ? SPELL_SLOTS : [slot];
  const spells = { ...hero.spells };
  for (const s of slots) spells[s] = value;
  return ok({ ...profile, heroes: { ...profile.heroes, [heroId]: { ...hero, spells } } });
}
