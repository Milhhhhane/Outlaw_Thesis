import {
  ELEMENTS,
  type Content,
  type DungeonModifier,
  type Element,
  type Profile,
} from '@outlaw/data';
import { drawFragments } from './chests';
import { energyAt, levelDustTier, type Outcome, type Refusal } from './progression';

/**
 * Tour à étages : un défi vertical, un combat par étage. Rien n'y est écrit étage par étage :
 * `balance.tower` donne les formules (niveau, PV et ATK, taille des groupes, équipement visé,
 * récompenses) et `content.tower` les groupes d'ennemis par élément et les étages de boss. Le
 * profil garde le plus haut étage battu (`tower.cleared`) : on tente le suivant ou on rejoue un
 * étage battu, qui ne rapporte plus rien. Fonctions pures : (profil, demande) → Outcome.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

export interface TowerFloor {
  readonly floor: number;
  readonly boss: boolean;
  /** Élément de l'étage (rotation feu → eau → nature, boss compris : couleur de la colonne). */
  readonly element: Element;
  /** Ennemis, de gauche à droite. */
  readonly enemies: readonly string[];
  /** Niveau des ennemis, et niveau visé par les héros. */
  readonly level: number;
  readonly hpPct: number;
  readonly atkPct: number;
  /** Modificateur de donjon (étages de boss qui en citent un), posé sur les deux camps. */
  readonly modifier: DungeonModifier | undefined;
  /** Équipement visé : objets portés par héros et leur amélioration. */
  readonly gear: { readonly items: number; readonly upgrade: number };
}

export interface TowerReward {
  readonly materials: { readonly tier: number; readonly amount: number };
  readonly fragments: number;
  /** Coffre des étages de boss, sinon null. */
  readonly chest: string | null;
}

/** Nombre d'étages. */
export function towerFloors(content: Content): number {
  return content.balance.tower.floors;
}

/** L'étage est un numéro d'étage existant. */
export function isTowerFloor(content: Content, floor: number): boolean {
  return Number.isInteger(floor) && floor >= 1 && floor <= towerFloors(content);
}

/** Dernière entrée d'une liste croissante (`from`) qui s'applique à l'étage. */
function stepAt<T extends { readonly from: number }>(
  steps: readonly T[],
  floor: number,
): T | undefined {
  return steps.findLast((s) => s.from <= floor);
}

/** Niveau des ennemis de l'étage (et niveau visé), borné au niveau maximum du jeu. */
export function towerLevel(content: Content, floor: number): number {
  const { start, perFloor } = content.balance.tower.level;
  return Math.min(content.balance.progression.maxLevel, Math.round(start + (floor - 1) * perFloor));
}

/** PV et ATK des ennemis de l'étage, en % : courbe interpolée, majorée aux étages de boss. */
export function towerPct(content: Content, floor: number): { hpPct: number; atkPct: number } {
  const { curve, boss, bossEvery } = content.balance.tower;
  // Segment [a, b] de la courbe qui contient l'étage (le schéma la fait aller du 1er au dernier).
  let a = { floor: 1, hpPct: 100, atkPct: 100 };
  let b = a;
  for (const point of curve) {
    a = b;
    b = point;
    if (point.floor >= floor) break;
  }
  const t = b.floor === a.floor ? 1 : (floor - a.floor) / (b.floor - a.floor);
  const scale = floor % bossEvery === 0 ? boss : { hpPct: 100, atkPct: 100 };
  return {
    hpPct: Math.round(((a.hpPct + (b.hpPct - a.hpPct) * t) * scale.hpPct) / 100),
    atkPct: Math.round(((a.atkPct + (b.atkPct - a.atkPct) * t) * scale.atkPct) / 100),
  };
}

/** Équipement visé à l'étage (aucun objet avant la première marche de `gear`). */
export function towerGear(content: Content, floor: number): { items: number; upgrade: number } {
  const step = stepAt(content.balance.tower.gear, floor);
  return step === undefined
    ? { items: 0, upgrade: 0 }
    : { items: step.items, upgrade: step.upgrade };
}

/**
 * Composition d'un étage. Ordinaire : l'élément tourne à chaque étage, les ennemis alternent dans
 * le groupe de cet élément (décalés tous les trois étages), et à partir de `mixFrom` le dernier
 * vient du groupe de l'élément suivant. Boss : la composition de `content.tower.bosses`.
 */
export function towerFloor(content: Content, floor: number): TowerFloor | null {
  if (!isTowerFloor(content, floor)) return null;
  const rules = content.balance.tower;
  const index = (floor - 1) % ELEMENTS.length;
  const element: Element = index === 0 ? 'fire' : index === 1 ? 'water' : 'nature';
  const base = {
    floor,
    element,
    level: towerLevel(content, floor),
    gear: towerGear(content, floor),
  };
  const pct = towerPct(content, floor);
  const at = (scale: { hpPct: number; atkPct: number }): { hpPct: number; atkPct: number } => ({
    hpPct: Math.round((pct.hpPct * scale.hpPct) / 100),
    atkPct: Math.round((pct.atkPct * scale.atkPct) / 100),
  });
  // `slice` plutôt qu'un index : un boss, un ennemi ou rien, sans valeur de repli.
  const bossIndex = floor / rules.bossEvery - 1;
  const bosses =
    floor % rules.bossEvery === 0 ? content.tower.bosses.slice(bossIndex, bossIndex + 1) : [];
  for (const boss of bosses) {
    return { ...base, boss: true, enemies: boss.enemies, ...at(boss), modifier: boss.modifier };
  }
  const group = content.tower.pools[element];
  const shift = Math.floor((floor - 1) / ELEMENTS.length);
  const size = stepAt(rules.sizes, floor)?.count ?? 1;
  const pick = (pool: readonly string[], k: number): string[] =>
    pool.slice(k % pool.length, (k % pool.length) + 1);
  const enemies = Array.from({ length: size }, (_, i) => pick(group.enemies, i + shift)).flat();
  if (floor >= rules.mixFrom && size > 1) {
    const next: Element = element === 'fire' ? 'water' : element === 'water' ? 'nature' : 'fire';
    enemies.splice(size - 1, 1, ...pick(content.tower.pools[next].enemies, shift));
  }
  return { ...base, boss: false, enemies, ...at(group), modifier: undefined };
}

/** Récompense de la première victoire d'un étage. */
export function towerReward(content: Content, floor: number): TowerReward {
  const { rewards, bossEvery } = content.balance.tower;
  const boss = floor % bossEvery === 0;
  const tier = levelDustTier(content, towerLevel(content, floor));
  // `slice` : la valeur du palier ou du boss, sans repli (le schéma garantit les longueurs).
  const base = rewards.dust.slice(tier - 1, tier).reduce((sum, n) => sum + n, 0);
  const chest = rewards.bossChests.slice(floor / bossEvery - 1, floor / bossEvery);
  return {
    materials: { tier, amount: Math.round(boss ? (base * rewards.bossDustPct) / 100 : base) },
    fragments: rewards.fragments,
    chest: boss ? chest.join('') : null,
  };
}

/** Plus haut étage battu (0 : aucun). */
export function towerCleared(profile: Profile): number {
  return profile.tower.cleared;
}

/** L'étage existe et peut être tenté : un étage battu, ou le suivant (tous en mode test). */
export function towerOpen(content: Content, profile: Profile, floor: number): boolean {
  return isTowerFloor(content, floor) && (profile.testMode || floor <= towerCleared(profile) + 1);
}

/** Entrée dans un étage ouvert : même énergie qu'un donjon (coût 0 pour l'instant). */
export function enterTower(
  content: Content,
  profile: Profile,
  floor: number,
  now: number,
): Outcome {
  if (!isTowerFloor(content, floor)) return refuse('unknown_floor');
  if (!towerOpen(content, profile, floor)) return refuse('floor_locked');
  if (profile.team.length === 0) return refuse('bad_team');
  const cost = content.balance.energy.costPerDungeon;
  const available = energyAt(content, profile, now);
  if (available < cost) return refuse('no_energy');
  return ok({ ...profile, energy: { value: available - cost, updatedAt: now } });
}

export interface TowerReport {
  readonly floor: number;
  /** Première victoire à cet étage : seule elle rapporte. */
  readonly firstClear: boolean;
  readonly materials: { readonly tier: number; readonly amount: number };
  /** Héros de chaque fragment tiré, dans l'ordre. */
  readonly fragments: readonly string[];
  readonly chest: string | null;
  /** Étage suivant, ou null au sommet. */
  readonly next: number | null;
}

/**
 * Étage gagné. Première victoire : poussière du palier de l'étage, fragments tirés comme dans un
 * coffre (héros ciblé compris), coffre aux étages de boss, et l'étage suivant s'ouvre. Rejouer un
 * étage battu ne rapporte rien et ne touche pas au profil.
 */
export function completeTower(
  content: Content,
  profile: Profile,
  floor: number,
): Outcome<{ profile: Profile; report: TowerReport }> {
  if (!isTowerFloor(content, floor)) return refuse('unknown_floor');
  if (profile.testMode) return refuse('test_mode');
  if (!towerOpen(content, profile, floor)) return refuse('floor_locked');
  const next = floor < towerFloors(content) ? floor + 1 : null;
  if (floor <= towerCleared(profile)) {
    const none = { tier: towerReward(content, floor).materials.tier, amount: 0 };
    return ok({
      profile,
      report: { floor, firstClear: false, materials: none, fragments: [], chest: null, next },
    });
  }
  const reward = towerReward(content, floor);
  const { fragmentChest } = content.balance.tower.rewards;
  const drawn = drawFragments(content, profile, fragmentChest, reward.fragments);
  const materials: Profile['materials'] = [...profile.materials];
  const tier = reward.materials.tier - 1;
  materials[tier] = (materials[tier] ?? 0) + reward.materials.amount;
  const chests =
    reward.chest === null
      ? profile.chests
      : { ...profile.chests, [reward.chest]: (profile.chests[reward.chest] ?? 0) + 1 };
  return ok({
    profile: { ...drawn.profile, materials, chests, tower: { cleared: floor } },
    report: {
      floor,
      firstClear: true,
      materials: reward.materials,
      fragments: drawn.drawn,
      chest: reward.chest,
      next,
    },
  });
}
