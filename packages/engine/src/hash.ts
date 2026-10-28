import type { BattleState, UnitState } from './types';

/**
 * Hash non cryptographique de 53 bits (cyrb53, domaine public) : synchrone, sans dépendance,
 * identique sur toute plateforme (opérations entières 32 bits uniquement).
 */
export function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Champs dynamiques d'une unité, dans un ordre fixe. */
function canonicalUnit(unit: UnitState): unknown[] {
  return [
    unit.def.id,
    unit.hp,
    unit.alive,
    unit.nextTime,
    unit.scriptIndex,
    unit.shield,
    unit.shieldTurns,
    unit.shieldSince,
    unit.statuses.map((s) => [s.kind, s.turns, s.since, s.power, s.source]),
    unit.mods.map((m) => [m.key, m.stat, m.percent, m.turns, m.since, m.source]),
    unit.triggers.map((t) => [t.key, t.source, t.turns, t.since, t.uses, t.turnUses, t.turnStamp]),
  ];
}

/**
 * Chaîne canonique des champs dynamiques d'un état : un JSON de tableaux, dans un ordre fixe, donc
 * sans ambiguïté de séparateur. La définition des unités (def), les règles et l'équilibrage, statiques
 * pendant un combat, en sont exclus.
 */
export function canonicalState(state: BattleState): string {
  return JSON.stringify([
    state.clock,
    state.actionCount,
    state.active,
    [state.points.player, state.points.enemy],
    state.result === null ? null : [state.result.winner, state.result.reason],
    state.units.map(canonicalUnit),
  ]);
}

/**
 * Empreinte d'un état de combat : 14 chiffres hexadécimaux (53 bits). Sert à vérifier, entre le
 * serveur et un client, que les deux rejeux sont arrivés au même état. Pas de sécurité : un
 * client malveillant peut tricher sur ce qu'il annonce, le serveur seul fait foi.
 */
export function hashState(state: BattleState): string {
  return cyrb53(canonicalState(state)).toString(16).padStart(14, '0');
}
