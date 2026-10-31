import type { BattleEvent, Side } from './types';

/** Contribution d'une unité à un ou plusieurs combats, lue dans le journal. */
export interface UnitBattleStats {
  readonly id: string;
  /** Identifiant de contenu (héros ou type d'ennemi). */
  readonly kind: string;
  readonly side: Side;
  readonly slot: number;
  /**
   * Dégâts infligés au camp adverse : ce que chaque coup a retiré (bouclier entamé et PV perdus),
   * sans le surplus au-delà de 0 PV. Égal à `direct + overTime`.
   */
  readonly dealt: number;
  /** Dont dégâts directs : sorts et déclencheurs. */
  readonly direct: number;
  /**
   * Dont dégâts sur la durée (brûlure). Le journal porte l'unité qui a posé la brûlure ; une
   * brûlure reposée par une autre unité passe à celle-ci (une seule brûlure par cible).
   */
  readonly overTime: number;
  /** Part des dégâts infligés par son camp, de 0 à 1 (0 si le camp n'a rien infligé). */
  readonly share: number;
  /** PV rendus (le journal ne garde que le soin utile, sans dépasser les PV max). */
  readonly healing: number;
  /** Bouclier donné, soi-même compris (ce qui a réellement été ajouté, plafond appliqué). */
  readonly shielding: number;
  /** PV perdus, tous coups confondus (alliés compris), sans le surplus au-delà de 0 PV. */
  readonly taken: number;
  /** Dégâts reçus absorbés par son bouclier. */
  readonly blocked: number;
  /** Unités adverses achevées. */
  readonly kills: number;
}

type Tally = { -readonly [K in keyof UnitBattleStats]: UnitBattleStats[K] };

/**
 * Statistiques par unité d'un camp, sur un ou plusieurs combats (les salles d'un donjon) : chaque
 * journal doit commencer par son `battle_start`. Une unité est la même d'un combat à l'autre si
 * elle a le même identifiant et le même contenu (`h0` : le héros du premier emplacement). Toute
 * unité présente au départ figure, même sans rien avoir fait. Tri : dégâts infligés décroissants,
 * puis emplacement.
 */
export function battleStats(
  journals: readonly (readonly BattleEvent[])[],
  side: Side = 'player',
): readonly UnitBattleStats[] {
  const tallies = new Map<string, Tally>();
  for (const journal of journals) tallyJournal(journal, tallies);
  const units = [...tallies.values()].filter((u) => u.side === side);
  const total = units.reduce((sum, u) => sum + u.dealt, 0);
  return units
    .map((u) => ({ ...u, share: total > 0 ? u.dealt / total : 0 }))
    .sort((a, b) => b.dealt - a.dealt || a.slot - b.slot);
}

function tallyJournal(journal: readonly BattleEvent[], tallies: Map<string, Tally>): void {
  // Unités du combat : identifiant → fiche cumulée et PV courants.
  const units = new Map<string, Tally>();
  const hp = new Map<string, number>();
  for (const event of journal) {
    switch (event.type) {
      case 'battle_start':
        for (const unit of event.units) {
          const key = `${unit.id}:${unit.kind}`;
          const tally = tallies.get(key) ?? blank(unit.id, unit.kind, unit.side, unit.slot);
          tallies.set(key, tally);
          units.set(unit.id, tally);
          hp.set(unit.id, unit.hp);
        }
        break;
      case 'damage': {
        const target = units.get(event.target);
        const before = hp.get(event.target);
        if (target === undefined || before === undefined) break;
        const lost = before - event.hpAfter;
        hp.set(event.target, event.hpAfter);
        target.taken += lost;
        target.blocked += event.absorbed;
        const dealer = units.get(event.source);
        if (dealer === undefined || dealer.side === target.side) break;
        const landed = lost + event.absorbed;
        dealer.dealt += landed;
        if (event.cause === 'burn') dealer.overTime += landed;
        else dealer.direct += landed;
        if (event.killed) dealer.kills += 1;
        break;
      }
      case 'heal': {
        hp.set(event.target, event.hpAfter);
        const healer = units.get(event.source);
        if (healer !== undefined) healer.healing += event.amount;
        break;
      }
      case 'shield': {
        const giver = units.get(event.source);
        if (giver !== undefined) giver.shielding += event.amount;
        break;
      }
      default:
        break;
    }
  }
}

function blank(id: string, kind: string, side: Side, slot: number): Tally {
  return {
    id,
    kind,
    side,
    slot,
    dealt: 0,
    direct: 0,
    overTime: 0,
    share: 0,
    healing: 0,
    shielding: 0,
    taken: 0,
    blocked: 0,
    kills: 0,
  };
}
