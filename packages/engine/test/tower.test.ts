import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { levelDustTier, newProfile, sandboxProfile, type Outcome } from '../src/progression';
import {
  completeTower,
  enterTower,
  towerCleared,
  towerFloor,
  towerFloors,
  towerGear,
  towerOpen,
  towerReward,
} from '../src/tower';

const content = loadContent();
const rules = content.balance.tower;
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
const floors = Array.from({ length: towerFloors(content) }, (_, i) => i + 1);
const at = (floor: number): Profile => ({ ...newProfile(content, 7), tower: { cleared: floor } });

describe('tour : étages générés par formule', () => {
  it('rotation des éléments, groupes qui grossissent, mélange, boss et modificateur', () => {
    expect(floors).toHaveLength(rules.floors);
    const one = towerFloor(content, 1)!;
    expect(one).toMatchObject({ boss: false, element: 'fire', level: rules.level.start });
    expect(one.enemies).toHaveLength(rules.sizes[0]!.count);
    expect(towerFloor(content, 2)!.element).toBe('water');
    expect(towerFloor(content, 3)!.element).toBe('nature');
    for (const floor of floors) {
      const f = towerFloor(content, floor)!;
      if (f.boss) continue;
      expect(f.enemies.every((id) => content.enemyById.get(id)?.boss !== true)).toBe(true);
      const own = f.enemies.filter((id) => content.enemyById.get(id)?.element === f.element);
      expect(own.length).toBe(floor >= rules.mixFrom ? f.enemies.length - 1 : f.enemies.length);
    }
    const boss = towerFloor(content, rules.bossEvery)!;
    expect(boss.boss).toBe(true);
    expect(boss.enemies).toEqual(content.tower.bosses[0]!.enemies);
    expect(boss.modifier).toEqual(content.tower.bosses[0]!.modifier);
    expect(towerFloor(content, rules.floors)!.level).toBe(content.balance.progression.maxLevel);
    expect(towerFloor(content, 0)).toBeNull();
    expect(towerFloor(content, rules.floors + 1)).toBeNull();
  });

  it('courbe monotone : niveau, PV, ATK et équipement visé ne baissent jamais', () => {
    const all = floors.map((floor) => towerFloor(content, floor)!);
    const ordinary = all.filter((f) => !f.boss);
    all.slice(1).forEach((f, i) => {
      const before = all[i]!;
      expect(f.level).toBeGreaterThanOrEqual(before.level);
      expect(f.gear.upgrade).toBeGreaterThanOrEqual(before.gear.upgrade);
      // Un boss est au moins aussi dur que l'étage d'avant.
      if (f.boss) expect(f.atkPct).toBeGreaterThanOrEqual(before.atkPct);
    });
    // Étages ordinaires : PV et ATK jamais en baisse (le boss est majoré à part).
    ordinary.slice(1).forEach((f, i) => {
      expect(f.atkPct).toBeGreaterThanOrEqual(ordinary[i]!.atkPct);
      expect(f.hpPct).toBeGreaterThanOrEqual(ordinary[i]!.hpPct);
    });
    expect(towerGear(content, 1)).toEqual({ items: 0, upgrade: 0 });
    const last = rules.gear.at(-1)!;
    expect(towerGear(content, rules.floors)).toEqual({ items: last.items, upgrade: last.upgrade });
  });
});

describe('tour : progression et récompenses', () => {
  it('ancienne sauvegarde sans tour : aucun étage battu, seul le premier est ouvert', () => {
    const { tower: _omitted, ...legacy } = newProfile(content, 1);
    const read = profileSchema.parse(legacy);
    expect(towerCleared(read)).toBe(0);
    expect(towerOpen(content, read, 1)).toBe(true);
    expect(towerOpen(content, read, 2)).toBe(false);
    expect(towerOpen(content, sandboxProfile(content), rules.floors)).toBe(true);
  });

  it('on tente le suivant ou on rejoue un étage battu, rien au-delà', () => {
    const profile = at(4);
    expect(reason(enterTower(content, profile, 5, 0))).toBe('ok');
    expect(reason(enterTower(content, profile, 3, 0))).toBe('ok');
    expect(reason(enterTower(content, profile, 6, 0))).toBe('floor_locked');
    expect(reason(enterTower(content, profile, 0, 0))).toBe('unknown_floor');
    expect(reason(enterTower(content, { ...profile, team: [] }, 5, 0))).toBe('bad_team');
    const costly = {
      ...content,
      balance: { ...content.balance, energy: { ...content.balance.energy, costPerDungeon: 500 } },
    };
    expect(reason(enterTower(costly, profile, 5, 0))).toBe('no_energy');
    expect(reason(completeTower(content, profile, 6))).toBe('floor_locked');
    expect(reason(completeTower(content, profile, 1.5))).toBe('unknown_floor');
    expect(reason(completeTower(content, sandboxProfile(content), 1))).toBe('test_mode');
  });

  it('première victoire : poussière du palier, fragments, coffre aux boss ; rejouer ne rapporte rien', () => {
    const floor = rules.bossEvery;
    const before = at(floor - 1);
    const { profile, report } = value(completeTower(content, before, floor));
    const reward = towerReward(content, floor);
    expect(reward.materials.tier).toBe(levelDustTier(content, towerFloor(content, floor)!.level));
    expect(report).toMatchObject({
      floor,
      firstClear: true,
      chest: rules.rewards.bossChests[0],
      next: floor + 1,
    });
    expect(report.fragments).toHaveLength(rules.rewards.fragments);
    const tier = reward.materials.tier - 1;
    expect(profile.materials[tier]).toBe(before.materials[tier]! + reward.materials.amount);
    expect(reward.materials.amount).toBe(
      Math.round((rules.rewards.dust[tier]! * rules.rewards.bossDustPct) / 100),
    );
    expect(profile.chests[reward.chest!]).toBe(1);
    expect(towerCleared(profile)).toBe(floor);
    expect(towerReward(content, floor + 1).chest).toBeNull();

    const again = value(completeTower(content, profile, floor));
    expect(again.profile).toBe(profile);
    expect(again.report).toMatchObject({ firstClear: false, fragments: [], chest: null });
    expect(again.report.materials.amount).toBe(0);
    expect(
      value(completeTower(content, at(rules.floors - 1), rules.floors)).report.next,
    ).toBeNull();
  });
});
