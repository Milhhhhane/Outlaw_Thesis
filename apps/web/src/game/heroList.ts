import {
  ELEMENTS,
  MAX_HERO_TIER,
  ROLES,
  type Content,
  type Element,
  type Hero,
  type Profile,
  type Role,
} from '@outlaw/data';

/**
 * Tri et filtres de la liste des héros (galerie, vivier de l'équipe). Ce n'est que de l'ordre
 * d'affichage : aucune règle du jeu. Le tri par nom suit la langue de l'interface, d'où sa place
 * ici plutôt que dans le moteur.
 */

export const HERO_SORTS = ['rarity', 'level', 'element', 'role', 'name'] as const;
export type HeroSort = (typeof HERO_SORTS)[number];

export interface HeroView {
  readonly sort: HeroSort;
  /** null : tous. */
  readonly element: Element | null;
  readonly role: Role | null;
  readonly rarity: number | null;
  /** Seulement les héros débloqués. */
  readonly owned: boolean;
}

export const DEFAULT_HERO_VIEW: HeroView = {
  sort: 'rarity',
  element: null,
  role: null,
  rarity: null,
  owned: false,
};

const RARITIES = Array.from({ length: MAX_HERO_TIER }, (_, i) => i + 1);

const pick = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Réglage enregistré sur l'appareil, relu champ par champ (un champ abîmé reprend son défaut). */
export function readHeroView(raw: unknown): HeroView {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_HERO_VIEW;
  const v = raw as Partial<Record<keyof HeroView, unknown>>;
  return {
    sort: pick(HERO_SORTS, v.sort, DEFAULT_HERO_VIEW.sort),
    element: pick<Element | null>([...ELEMENTS, null], v.element, null),
    role: pick<Role | null>([...ROLES, null], v.role, null),
    rarity: pick<number | null>([...RARITIES, null], v.rarity, null),
    owned: typeof v.owned === 'boolean' ? v.owned : false,
  };
}

/** Nombre de filtres actifs (le tri n'en est pas un). */
export function activeFilters(view: HeroView): number {
  return (
    [view.element, view.role, view.rarity].filter((f) => f !== null).length + Number(view.owned)
  );
}

const collator = new Intl.Collator('fr');

/**
 * Héros à afficher, dans l'ordre : les débloqués d'abord (un nouveau joueur voit les siens avant les
 * silhouettes), puis selon le tri choisi — rareté et niveau décroissants, élément et rôle dans
 * l'ordre du jeu —, à égalité par rareté décroissante puis par nom.
 */
export function heroList(
  content: Content,
  profile: Profile,
  view: HeroView,
  nameOf: (id: string) => string,
  among: readonly Hero[] = content.heroes,
): Hero[] {
  const owned = (id: string): boolean =>
    profile.unlocked.includes(id) && profile.heroes[id] !== undefined;
  const level = (id: string): number => (owned(id) ? (profile.heroes[id]?.level ?? 0) : 0);
  const key = (h: Hero): number => {
    switch (view.sort) {
      case 'rarity':
        return -h.tier;
      case 'level':
        return -level(h.id);
      case 'element':
        return ELEMENTS.indexOf(h.element);
      case 'role':
        return ROLES.indexOf(h.role);
      case 'name':
        return 0;
    }
  };
  return among
    .filter(
      (h) =>
        (view.element === null || h.element === view.element) &&
        (view.role === null || h.role === view.role) &&
        (view.rarity === null || h.tier === view.rarity) &&
        (!view.owned || owned(h.id)),
    )
    .sort(
      (a, b) =>
        Number(owned(b.id)) - Number(owned(a.id)) ||
        key(a) - key(b) ||
        b.tier - a.tier ||
        collator.compare(nameOf(a.id), nameOf(b.id)),
    );
}
