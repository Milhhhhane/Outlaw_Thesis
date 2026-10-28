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
  /** Élément du groupe (rotation feu → eau → nature) ; un étage de boss suit son boss. */
  readonly element: Element;
  /** Ennemis, de gauche à droite. */
  readonly enemies: readonly string[];
  /** Niveau des ennemis, et niveau visé par les héros. */
  readonly level: number;
  readonly hpPct: number;
  readonly atkPct: number;
  readonly modifier?: DungeonModifier;
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
  const upper = curve.find((p) => p.floor >= floor) ?? curve[curve.length - 1];
  const lower = curve.findLast((p) => p.floor <= floor) ?? upper;
  if (lower === undefined || upper === undefined) return { hpPct: 100, atkPct: 100 };
  const t = upper.floor === lower.floor ? 0 : (floor - lower.floor) / (upper.floor - lower.floor);
  const isBoss = floor % bossEvery === 0;
  const at = (a: number, b: number, bossPct: number): number =>
    Math.round((a + (b - a) * t) * (isBoss ? bossPct / 100 : 1));
  return {
    hpPct: at(lower.hpPct, upper.hpPct, boss.hpPct),
    atkPct: at(lower.atkPct, upper.atkPct, boss.atkPct),
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
  const level = towerLevel(content, floor);
  const pct = towerPct(content, floor);
  const gear = towerGear(content, floor);
  if (floor % rules.bossEvery === 0) {
    const boss = content.tower.bosses[floor / rules.bossEvery - 1];
    const enemies = boss?.enemies ?? [];
    const lead = enemies.find((id) => content.enemyById.get(id)?.boss === true) ?? '';
    return {
      floor,
      boss: true,
      element: content.enemyById.get(lead)?.element ?? 'fire',
      enemies,
      level,
      hpPct: Math.round((pct.hpPct * (boss?.hpPct ?? 100)) / 100),
      atkPct: Math.round((pct.atkPct * (boss?.atkPct ?? 100)) / 100),
      ...(boss?.modifier === undefined ? {} : { modifier: boss.modifier }),
      gear,
    };
  }
  const index = (floor - 1) % ELEMENTS.length;
  const element = ELEMENTS[index] ?? 'fire';
  const next = ELEMENTS[(index + 1) % ELEMENTS.length] ?? 'fire';
  const group = content.tower.pools[element];
  const pool = group.enemies;
  const shift = Math.floor((floor - 1) / ELEMENTS.length);
  const size = stepAt(rules.sizes, floor)?.count ?? 1;
  const enemies = Array.from({ length: size }, (_, i) => pool[(i + shift) % pool.length] ?? '');
  if (floor >= rules.mixFrom && size > 1) {
    const other = content.tower.pools[next].enemies;
    enemies[size - 1] = other[shift % other.length] ?? '';
  }
  return {
    floor,
    boss: false,
    element,
    enemies,
    level,
    hpPct: Math.round((pct.hpPct * group.hpPct) / 100),
    atkPct: Math.round((pct.atkPct * group.atkPct) / 100),
    gear,
  };
}

/** Récompense de la première victoire d'un étage. */
export function towerReward(content: Content, floor: number): TowerReward {
  const { rewards, bossEvery } = content.balance.tower;
  const boss = floor % bossEvery === 0;
  const tier = levelDustTier(content, towerLevel(content, floor));
  const base = rewards.dust[tier - 1] ?? 0;
  return {
    materials: { tier, amount: Math.round(boss ? (base * rewards.bossDustPct) / 100 : base) },
    fragments: rewards.fragments,
    chest: boss ? (rewards.bossChests[floor / bossEvery - 1] ?? null) : null,
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
