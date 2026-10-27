/** Contenu minimal valide servant de base aux tests de schémas (jamais chargé par le jeu). */

export const heroFixture = {
  id: 'test_hero',
  element: 'fire',
  role: 'damage',
  stats: { hp: 400, atk: 50, def: 20, vit: 100 },
  spells: [
    {
      id: 'test_strike',
      slot: 'basic',
      targeting: 'enemy',
      effects: [{ kind: 'damage', power: 100 }],
    },
    {
      id: 'test_guard',
      slot: 'a',
      targeting: 'ally',
      effects: [{ kind: 'shield', power: 80, duration: 2 }],
    },
    {
      id: 'test_blast',
      slot: 'b',
      targeting: 'enemy',
      effects: [
        { kind: 'damage', power: 180 },
        { kind: 'status', status: 'burn', duration: 2 },
      ],
    },
    {
      id: 'test_nova',
      slot: 'ult',
      targeting: 'all_enemies',
      effects: [{ kind: 'damage', power: 150 }],
    },
  ],
  passive: {
    id: 'test_passive',
    triggers: [
      {
        on: 'hp_crossed',
        subject: 'enemy',
        thresholdPct: 50,
        limit: { per: 'combat', count: 1 },
        effects: [{ kind: 'tempo', target: 'self', amount: -30 }],
      },
    ],
  },
  pages: [1, 2, 3].map((p) => ({
    id: `test_page_${p}`,
    nodes: [
      {
        id: `test_p${p}_root`,
        mods: [{ type: 'scaleEffect', slot: 'basic', kind: 'damage', field: 'power', mulPct: 10 }],
      },
      {
        id: `test_p${p}_left`,
        requires: `test_p${p}_root`,
        group: `test_p${p}_choice`,
        mods: [{ type: 'cost', slot: 'b', delta: -1 }],
      },
      {
        id: `test_p${p}_right`,
        requires: `test_p${p}_root`,
        group: `test_p${p}_choice`,
        mods: [{ type: 'delay', slot: 'ult', delta: -10 }],
      },
      {
        id: `test_p${p}_deep`,
        requires: `test_p${p}_left`,
        mods: [{ type: 'gain', delta: 1 }],
      },
      {
        id: `test_p${p}_cap`,
        requires: `test_p${p}_root`,
        mods: [{ type: 'retarget', slot: 'b', targeting: 'all_enemies' }],
      },
    ],
  })),
};

export const enemyFixture = {
  id: 'test_grunt',
  element: 'water',
  stats: { hp: 300, atk: 40, def: 15, vit: 90 },
  skills: [
    {
      id: 'grunt_hit',
      slot: 'basic',
      targeting: 'enemy',
      effects: [{ kind: 'damage', power: 100 }],
    },
    {
      id: 'grunt_roar',
      slot: 'b',
      targeting: 'all_enemies',
      effects: [{ kind: 'damage', power: 60 }],
    },
  ],
  script: [
    { skill: 'grunt_hit', target: 'lowest_hp' },
    { skill: 'grunt_roar', target: 'auto' },
  ],
};

export const bossFixture = {
  id: 'test_boss',
  element: 'nature',
  boss: true,
  stats: { hp: 900, atk: 55, def: 25, vit: 95 },
  skills: [
    {
      id: 'boss_hit',
      slot: 'basic',
      targeting: 'enemy',
      effects: [{ kind: 'damage', power: 110 }],
    },
  ],
  script: [{ skill: 'boss_hit', target: 'highest_atk' }],
};

export const itemFixture = {
  id: 'test_charm',
  rarity: 'common',
  stat: { stat: 'hp', pct: 5 },
  mods: [{ type: 'scale', field: 'power', mulPct: 20 }],
};

export const rareItemFixture = {
  id: 'test_relic',
  rarity: 'rare',
  mods: [{ type: 'threshold', delta: 10 }],
};

export const dungeonFixture = {
  id: 'test_dungeon',
  element: 'fire',
  recommendedLevel: 3,
  modifier: {
    id: 'test_heat',
    rules: [
      {
        appliesTo: 'enemies',
        trigger: {
          on: 'combat_start',
          effects: [{ kind: 'statMod', target: 'self', stat: 'atk', percent: 10, duration: 99 }],
        },
      },
    ],
  },
  encounters: [
    { enemies: ['test_grunt'] },
    { enemies: ['test_grunt', 'test_grunt'] },
    { enemies: ['test_boss'] },
  ],
  rewards: { xp: 100, gold: 50, materials: { tier: 1, amount: 2 } },
  loot: ['test_charm', 'test_relic'],
  map: { x: 40, y: 140, landmark: 'camp', chapter: 1 },
};
