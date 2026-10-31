/**
 * Statistiques de fin de combat lues dans le journal. Combat de référence calculé à la main :
 * trois héros (ATK 50, DEF 20, VIT 100) contre un ennemi (PV 120, ATK 120, DEF 20), même élément,
 * tous les sorts au délai 100 : chaque tour, h0, h1, h2 puis e.
 *   - coup de h0 : 50 × 100 ÷ 120 = 41,7 → 42 ; brûlure de h0 : 50 × 40 % ÷ 1,2 = 16,7 → 17 ;
 *   - coup de e sur h0 : 120 × 100 ÷ 120 = 100 ; bouclier de h1 : 50 ; soin de h1 : 10.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, step } from '../src/battle';
import { battleStats } from '../src/battleStats';
import { damageDealt } from '../src/boss';
import type { BattleEvent, BattleState, Side } from '../src/types';
import { balance, hit, ofType, spell, unit } from './helpers';

function referenceBattle() {
  const pyro = unit({
    id: 'h0',
    side: 'player',
    slot: 0,
    spells: [
      spell('h0_basic', 'basic', [hit()]),
      spell('ignite', 'a', [
        { kind: 'status', target: 'primary', status: 'burn', duration: 2, power: 40 },
      ]),
    ],
  });
  const medic = unit({
    id: 'h1',
    side: 'player',
    slot: 1,
    spells: [
      spell('mend', 'basic', [{ kind: 'heal', target: 'primary', power: 20 }], {
        targeting: 'ally',
      }),
      spell('guard', 'a', [{ kind: 'shield', target: 'primary', power: 100, duration: 2 }], {
        targeting: 'ally',
      }),
    ],
  });
  // h2 ne fait que se renforcer : il doit figurer à 0 partout.
  const idle = unit({
    id: 'h2',
    side: 'player',
    slot: 2,
    spells: [
      spell(
        'brace',
        'basic',
        [{ kind: 'statMod', target: 'self', stat: 'def', percent: 10, duration: 1 }],
        { targeting: 'self' },
      ),
    ],
  });
  const foe = unit({ id: 'e', side: 'enemy', stats: { hp: 120, atk: 120 } });
  const created = createBattle({ units: [pyro, medic, idle, foe] }, balance);
  let state: BattleState = created.state;
  const events: BattleEvent[] = [...created.events];
  const play = (unitId: string, spellId: string, target?: string): void => {
    const result = step(state, {
      type: 'cast',
      unit: unitId,
      spell: spellId,
      ...(target === undefined ? {} : { target }),
    });
    state = result.state;
    events.push(...result.events);
  };
  // Tour 1 : brûlure (17 au début du tour de e), bouclier de 50 sur h0, qui absorbe la moitié du coup.
  play('h0', 'ignite', 'e');
  play('h1', 'guard', 'h0');
  play('h2', 'brace');
  // Tour 2 : 42, soin de 10, brûlure (17, puis elle expire).
  play('h0', 'h0_basic', 'e');
  play('h1', 'mend', 'h0');
  play('h2', 'brace');
  // Tour 3 : 42 (e à 2 PV), soin de 10.
  play('h0', 'h0_basic', 'e');
  play('h1', 'mend', 'h0');
  play('h2', 'brace');
  // Tour 4 : le coup de 42 achève e, qui n'avait plus que 2 PV.
  play('h0', 'h0_basic', 'e');
  return { state, events };
}

describe('battleStats', () => {
  it('combat de référence : dégâts directs et brûlure, soins, bouclier, subis, achevés', () => {
    const { state, events } = referenceBattle();
    expect(state.result).toEqual({ winner: 'player', reason: 'annihilation' });
    // Le combat s'est déroulé comme calculé.
    expect(ofType(events, 'damage').map((d) => [d.source, d.target, d.cause, d.amount])).toEqual([
      ['h0', 'e', 'burn', 17],
      ['e', 'h0', 'spell', 100],
      ['h0', 'e', 'spell', 42],
      ['h0', 'e', 'burn', 17],
      ['e', 'h0', 'spell', 100],
      ['h0', 'e', 'spell', 42],
      ['e', 'h0', 'spell', 100],
      ['h0', 'e', 'spell', 42],
    ]);

    const stats = battleStats([events]);
    expect(stats).toEqual([
      {
        id: 'h0',
        kind: 'h0',
        side: 'player',
        slot: 0,
        // 17 + 17 de brûlure, 42 + 42 + 2 (le dernier coup ne retire que les 2 PV restants).
        dealt: 120,
        direct: 86,
        overTime: 34,
        share: 1,
        healing: 0,
        shielding: 0,
        // 50 (l'autre moitié absorbée) + 100 + 100.
        taken: 250,
        blocked: 50,
        kills: 1,
      },
      {
        id: 'h1',
        kind: 'h1',
        side: 'player',
        slot: 1,
        dealt: 0,
        direct: 0,
        overTime: 0,
        share: 0,
        healing: 20,
        shielding: 50,
        taken: 0,
        blocked: 0,
        kills: 0,
      },
      {
        id: 'h2',
        kind: 'h2',
        side: 'player',
        slot: 2,
        dealt: 0,
        direct: 0,
        overTime: 0,
        share: 0,
        healing: 0,
        shielding: 0,
        taken: 0,
        blocked: 0,
        kills: 0,
      },
    ]);

    // Camp ennemi : bouclier entamé compris dans ses dégâts infligés.
    expect(battleStats([events], 'enemy')).toEqual([
      expect.objectContaining({ id: 'e', dealt: 300, direct: 300, taken: 120, kills: 0 }),
    ]);
    // Mêmes PV perdus que le score du boss de la semaine.
    expect(damageDealt(events)).toBe(120);
  });

  it('plusieurs salles : les héros de même emplacement et même contenu s’additionnent', () => {
    const { events } = referenceBattle();
    const twice = battleStats([events, events]);
    expect(twice.map((u) => [u.id, u.dealt, u.overTime, u.healing, u.taken, u.kills])).toEqual([
      ['h0', 240, 68, 0, 500, 2],
      ['h1', 0, 0, 40, 0, 0],
      ['h2', 0, 0, 0, 0, 0],
    ]);
    expect(battleStats([])).toEqual([]);
  });

  it('journal écrit à la main : surplus, tirs alliés, brûlure qui achève, parts et tri', () => {
    const start = (units: readonly [string, string, Side, number, number][]): BattleEvent => ({
      type: 'battle_start',
      units: units.map(([id, kind, side, slot, hp]) => ({
        id,
        kind,
        side,
        slot,
        element: 'fire',
        hp,
        maxHp: hp,
      })),
    });
    const dmg = (
      source: string,
      target: string,
      amount: number,
      absorbed: number,
      hpAfter: number,
      cause: 'spell' | 'burn' | 'trigger' = 'spell',
    ): BattleEvent => ({
      type: 'damage',
      source,
      target,
      cause,
      amount,
      absorbed,
      multiplier: 1,
      hpAfter,
      shieldAfter: 0,
      killed: hpAfter === 0,
    });
    const room1: BattleEvent[] = [
      start([
        ['h0', 'ana', 'player', 0, 100],
        ['h1', 'bo', 'player', 1, 100],
        ['e0', 'rat', 'enemy', 0, 50],
        ['e1', 'rat', 'enemy', 1, 30],
      ]),
      dmg('h0', 'e0', 20, 0, 30),
      // Déclencheur : compté en direct ; source inconnue : subi seulement.
      dmg('h1', 'e0', 10, 0, 20, 'trigger'),
      dmg('ghost', 'e0', 5, 0, 15),
      // Tir allié : subi par h0, pas infligé par h1.
      dmg('h1', 'h0', 7, 2, 95),
      { type: 'heal', source: 'h1', target: 'h0', cause: 'spell', amount: 5, hpAfter: 100 },
      { type: 'heal', source: 'ghost', target: 'h0', cause: 'spell', amount: 1, hpAfter: 100 },
      { type: 'shield', source: 'h0', target: 'h0', amount: 12, total: 12, turns: 1 },
      { type: 'shield', source: 'ghost', target: 'h0', amount: 3, total: 15, turns: 1 },
      // Brûlure de h1 qui achève e0 (15 PV, coup de 40) ; coup sur une cible inconnue ignoré.
      dmg('h1', 'e0', 40, 0, 0, 'burn'),
      dmg('h0', 'nobody', 9, 0, 0),
      dmg('h0', 'e1', 10, 4, 24),
      { type: 'battle_end', winner: 'player', reason: 'annihilation' },
    ];
    // Salle 2 : même h0 ; h1 porte un autre héros, donc une autre ligne, placée après à égalité.
    const room2: BattleEvent[] = [
      start([
        ['h0', 'ana', 'player', 0, 100],
        ['h1', 'cy', 'player', 1, 100],
        ['e0', 'rat', 'enemy', 0, 10],
      ]),
      dmg('h0', 'e0', 10, 0, 0),
    ];
    const stats = battleStats([room1, room2]);
    expect(stats.map((u) => [u.kind, u.dealt, u.direct, u.overTime, u.kills, u.share])).toEqual([
      ['ana', 20 + 10 + 10, 40, 0, 1, 40 / 65],
      ['bo', 10 + 15, 10, 15, 1, 25 / 65],
      ['cy', 0, 0, 0, 0, 0],
    ]);
    expect(stats[0]).toMatchObject({ taken: 5, blocked: 2, shielding: 12, healing: 0 });
    expect(stats[1]).toMatchObject({ healing: 5, shielding: 0, taken: 0 });
    expect(battleStats([room1], 'enemy')).toEqual([
      expect.objectContaining({ id: 'e0', taken: 50, blocked: 0, dealt: 0, share: 0 }),
      expect.objectContaining({ id: 'e1', taken: 6, blocked: 4 }),
    ]);
  });
});
