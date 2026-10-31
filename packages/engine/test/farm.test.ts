import {
  loadContent,
  PRESET_NAME_MAX,
  profileSchema,
  type Content,
  type Profile,
} from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  campTodo,
  canUpgradeItem,
  chestCount,
  completeDungeon,
  FARM_RUNS,
  farmTarget,
  heroTodo,
  levelUpCost,
  loadPreset,
  moveInTeam,
  newProfile,
  presetMissing,
  presetSlots,
  sandboxProfile,
  savePreset,
  seriesNext,
  starCost,
  starGold,
  summarizeSeries,
  talentPoints,
  upgradeCost,
  type DungeonReport,
  type Outcome,
} from '../src';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = <T>(outcome: Outcome<T>): string => (outcome.ok ? 'ok' : outcome.reason);
const base = (): Profile => newProfile(content, 11, 0);

/** Contenu dont l'équilibrage est retouché pour un test (taille d'équipe, énergie). */
function tweaked(change: { teamSize?: number; costPerDungeon?: number }): Content {
  const { balance } = content;
  return {
    ...content,
    balance: {
      ...balance,
      progression: {
        ...balance.progression,
        teamSize: change.teamSize ?? balance.progression.teamSize,
      },
      energy: {
        ...balance.energy,
        costPerDungeon: change.costPerDungeon ?? balance.energy.costPerDungeon,
      },
    },
  };
}

describe('équipes enregistrées', () => {
  it('trois emplacements vides au départ', () => {
    expect(presetSlots(base())).toEqual([null, null, null]);
  });

  it('enregistre l’équipe courante sous un nom, sans toucher au profil reçu', () => {
    const profile = Object.freeze({ ...base(), team: ['pyra', 'maree'] });
    const saved = value(savePreset(content, profile, 1, '  Feu et eau  '));
    expect(saved.presets).toEqual([null, { name: 'Feu et eau', team: ['pyra', 'maree'] }, null]);
    expect(profile.presets).toEqual([]);
    // Le profil reste une sauvegarde valide, aller-retour compris.
    expect(profileSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('un emplacement rempli est remplacé ; les autres ne bougent pas', () => {
    let profile = value(savePreset(content, base(), 0, 'A'));
    profile = value(savePreset(content, { ...profile, team: ['ronce'] }, 2, 'C'));
    profile = value(savePreset(content, { ...profile, team: ['cendre', 'pyra'] }, 0, 'A2'));
    expect(presetSlots(profile)).toEqual([
      { name: 'A2', team: ['cendre', 'pyra'] },
      null,
      { name: 'C', team: ['ronce'] },
    ]);
  });

  it('refuse un emplacement inconnu, un nom vide ou trop long, une équipe vide', () => {
    for (const slot of [-1, 3, 1.5]) {
      expect(reason(savePreset(content, base(), slot, 'A'))).toBe('no_preset');
    }
    expect(reason(savePreset(content, base(), 0, '   '))).toBe('bad_name');
    expect(reason(savePreset(content, base(), 0, 'x'.repeat(PRESET_NAME_MAX + 1)))).toBe(
      'bad_name',
    );
    expect(reason(savePreset(content, base(), 0, 'x'.repeat(PRESET_NAME_MAX)))).toBe('ok');
    expect(reason(savePreset(content, { ...base(), team: [] }, 0, 'A'))).toBe('bad_team');
  });

  it('charge une équipe en un appel', () => {
    const saved = value(savePreset(content, { ...base(), team: ['ronce', 'pyra'] }, 2, 'R'));
    const loaded = value(loadPreset(content, { ...saved, team: ['maree'] }, 2));
    expect(loaded.team).toEqual(['ronce', 'pyra']);
  });

  it('garde l’ordre de l’équipe (la place de chaque héros compte en combat)', () => {
    const ordered = value(
      moveInTeam(content, { ...base(), team: ['pyra', 'maree', 'ronce'] }, 2, 0),
    );
    expect(ordered.team).toEqual(['ronce', 'pyra', 'maree']);
    const saved = value(savePreset(content, ordered, 0, 'Ronce devant'));
    expect(saved.presets[0]?.team).toEqual(['ronce', 'pyra', 'maree']);
    const loaded = value(loadPreset(content, { ...saved, team: ['maree', 'pyra', 'ronce'] }, 0));
    expect(loaded.team).toEqual(['ronce', 'pyra', 'maree']);
  });

  it('refuse un emplacement vide ou inconnu', () => {
    expect(reason(loadPreset(content, base(), 0))).toBe('no_preset');
    expect(reason(loadPreset(content, base(), 7))).toBe('no_preset');
    expect(presetMissing(content, base(), 0)).toEqual([]);
    expect(presetMissing(content, base(), -1)).toEqual([]);
  });

  it('refus clair si un héros n’est plus disponible, l’équipe courante reste', () => {
    const saved = value(savePreset(content, base(), 0, 'Départ'));
    const without = { ...saved, unlocked: saved.unlocked.filter((id) => id !== 'maree') };
    expect(presetMissing(content, without, 0)).toEqual(['maree']);
    expect(reason(loadPreset(content, without, 0))).toBe('preset_unavailable');
    // Un héros retiré du contenu compte aussi comme indisponible.
    const ghost: Profile = { ...saved, presets: [{ name: 'X', team: ['pyra', 'ghost'] }] };
    expect(presetMissing(content, ghost, 0)).toEqual(['ghost']);
    expect(reason(loadPreset(content, ghost, 0))).toBe('preset_unavailable');
  });

  it('une équipe devenue trop grande pour les règles est refusée', () => {
    const saved = value(savePreset(content, base(), 0, 'Quatre'));
    expect(reason(loadPreset(tweaked({ teamSize: 2 }), saved, 0))).toBe('bad_team');
  });

  it('une sauvegarde d’avant les équipes enregistrées se lit sans erreur', () => {
    const old = JSON.parse(JSON.stringify(base())) as Record<string, unknown>;
    delete old.presets;
    const read = profileSchema.parse(old);
    expect(read.presets).toEqual([]);
    expect(read).toEqual(base());
    expect(presetSlots(read)).toEqual([null, null, null]);
  });

  it('le schéma refuse plus de trois emplacements ou une équipe vide', () => {
    const preset = { name: 'A', team: ['pyra'] };
    expect(profileSchema.safeParse({ ...base(), presets: [preset, null, preset] }).success).toBe(
      true,
    );
    expect(
      profileSchema.safeParse({ ...base(), presets: [preset, preset, preset, preset] }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...base(), presets: [{ name: 'A', team: [] }] }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({ ...base(), presets: [{ name: '', team: ['pyra'] }] }).success,
    ).toBe(false);
  });
});

const withHero = (
  profile: Profile,
  hero: string,
  change: Partial<Profile['heroes'][string]>,
): Profile => ({
  ...profile,
  heroes: { ...profile.heroes, [hero]: { ...profile.heroes[hero]!, ...change } },
});

describe('choses à faire au camp', () => {
  it('un profil neuf n’a rien à faire', () => {
    expect(campTodo(content, base())).toEqual({
      levelUp: 0,
      talents: 0,
      stars: 0,
      items: 0,
      chests: 0,
    });
  });

  it('niveau payable : XP, poussière et or, aucun sans les autres', () => {
    const cost = levelUpCost(content, base().heroes.pyra!)!;
    const xpOnly = { ...withHero(base(), 'pyra', { xp: cost.xp }), gold: cost.gold };
    expect(campTodo(content, xpOnly).levelUp).toBe(0);
    const materials: Profile['materials'] = [0, 0, 0];
    materials[cost.dust.tier - 1] = cost.dust.amount;
    const both = { ...xpOnly, materials };
    expect(campTodo(content, both).levelUp).toBe(1);
    expect(heroTodo(content, both, 'pyra').levelUp).toBe(true);
    expect(heroTodo(content, both, 'maree').levelUp).toBe(false);
    // XP et poussière, mais une pièce d'or de moins : pas de badge.
    expect(cost.gold).toBeGreaterThan(0);
    expect(campTodo(content, { ...both, gold: cost.gold - 1 }).levelUp).toBe(0);
    expect(heroTodo(content, { ...both, gold: cost.gold - 1 }, 'pyra').levelUp).toBe(false);
  });

  it('talents à placer : les points libres de chaque héros débloqué', () => {
    const level = 4;
    const profile = withHero(withHero(base(), 'pyra', { level }), 'maree', { level });
    const points = talentPoints(level, content.balance);
    expect(points).toBeGreaterThan(0);
    expect(campTodo(content, profile).talents).toBe(points * 2);
    expect(heroTodo(content, profile, 'pyra').talents).toBe(points);
  });

  it('étoile payable : au plafond, avec assez de fragments et d’or', () => {
    const gold = starGold(content, withHero(base(), 'ronce', { level: 10 }).heroes.ronce!)!;
    const atCap = { ...withHero(base(), 'ronce', { level: 10 }), gold };
    const cost = starCost(content, atCap.heroes.ronce!)!;
    expect(campTodo(content, { ...atCap, fragments: { ronce: cost - 1 } }).stars).toBe(0);
    expect(campTodo(content, { ...atCap, fragments: { ronce: cost } }).stars).toBe(1);
    // Les fragments sans l'or : pas de badge.
    const poor = { ...atCap, gold: gold - 1, fragments: { ronce: cost } };
    expect(campTodo(content, poor).stars).toBe(0);
    expect(heroTodo(content, poor, 'ronce').star).toBe(false);
    // Pas au plafond : rien à payer, même avec les fragments.
    expect(campTodo(content, { ...base(), fragments: { ronce: cost } }).stars).toBe(0);
    // Au niveau maximum, plus d'étoile.
    const max = withHero(base(), 'ronce', { level: content.balance.progression.maxLevel });
    expect(heroTodo(content, { ...max, fragments: { ronce: 99 } }, 'ronce').star).toBe(false);
  });

  it('objet améliorable : copies, or et poussière suffisants', () => {
    const item = content.dungeons[0]!.loot[0]!;
    const cost = upgradeCost(content, item, 0)!;
    const owned = { uid: 1, item, upgrade: 0, copies: cost.copies };
    const materials: Profile['materials'] = [0, 0, 0];
    materials[cost.materials.tier - 1] = cost.materials.amount;
    const rich: Profile = { ...base(), items: [owned], gold: cost.gold, materials };
    expect(campTodo(content, rich).items).toBe(1);
    expect(canUpgradeItem(content, rich, owned)).toBe(true);
    expect(campTodo(content, { ...rich, gold: cost.gold - 1 }).items).toBe(0);
    expect(campTodo(content, { ...rich, materials: [0, 0, 0] }).items).toBe(0);
    const fewer = { ...owned, copies: cost.copies - 1 };
    expect(campTodo(content, { ...rich, items: [fewer] }).items).toBe(0);
    const maxed = {
      ...owned,
      upgrade: content.balance.progression.items.maxUpgradeLevel,
      copies: 50,
    };
    expect(canUpgradeItem(content, { ...rich, gold: 1e9 }, maxed)).toBe(false);
  });

  it('coffres à ouvrir', () => {
    const profile = { ...base(), chests: { bronze: 2, gold: 1 } };
    expect(campTodo(content, profile).chests).toBe(chestCount(profile));
    expect(campTodo(content, profile).chests).toBe(3);
  });

  it('un héros non débloqué n’attend rien ; le mode test n’a rien à faire', () => {
    expect(heroTodo(content, base(), 'sablier')).toEqual({
      levelUp: false,
      talents: 0,
      star: false,
    });
    const sandbox = sandboxProfile(content);
    expect(campTodo(content, { ...sandbox, chests: { bronze: 3 } })).toEqual({
      levelUp: 0,
      talents: 0,
      stars: 0,
      items: 0,
      chests: 0,
    });
  });
});

/** Profil d'équipe de niveau 30 (les récompenses ne dépendent pas du combat). */
function veteran(): Profile {
  const profile = base();
  return {
    ...profile,
    heroes: Object.fromEntries(
      Object.entries(profile.heroes).map(([id, h]) => [id, { ...h, level: 30 }]),
    ),
  };
}

describe('séries de passages', () => {
  it('passages visés : le nombre choisi, ou ce que l’énergie permet', () => {
    expect(FARM_RUNS).toEqual([1, 3, 5, 10, 'energy']);
    expect(farmTarget(content, base(), 3, 0)).toBe(3);
    // Entrée gratuite : aucune borne, la série s'arrête sur défaite ou sur action du joueur.
    expect(content.balance.energy.costPerDungeon).toBe(0);
    expect(farmTarget(content, base(), 'energy', 0)).toBeNull();
    const paid = tweaked({ costPerDungeon: 30 });
    const full = newProfile(paid, 1, 0);
    expect(farmTarget(paid, full, 'energy', 0)).toBe(Math.floor(paid.balance.energy.cap / 30));
    const empty = { ...full, energy: { value: 0, updatedAt: 0 } };
    expect(farmTarget(paid, empty, 'energy', 0)).toBe(1);
  });

  it('la série continue tant que le compte n’est pas atteint et que l’entrée est acceptée', () => {
    const profile = base();
    expect(seriesNext(content, profile, 'ember_wastes', 1, 0, 1, 3)).toBeNull();
    expect(seriesNext(content, profile, 'ember_wastes', 1, 0, 3, 3)).toBe('complete');
    expect(seriesNext(content, profile, 'ember_wastes', 1, 0, 50, null)).toBeNull();
    const paid = tweaked({ costPerDungeon: 30 });
    const tired = { ...newProfile(paid, 1, 0), energy: { value: 10, updatedAt: 0 } };
    expect(seriesNext(paid, tired, 'ember_wastes', 1, 0, 1, null)).toBe('no_energy');
    expect(seriesNext(content, profile, 'ember_wastes', 3, 0, 1, 5)).toBe('tier_locked');
  });

  it('le bilan additionne exactement ce que les passages ont rapporté', () => {
    const start = veteran();
    let profile = start;
    const reports: DungeonReport[] = [];
    for (let run = 0; run < 6; run++) {
      const done = value(completeDungeon(content, profile, 'ember_wastes', 1));
      profile = done.profile;
      reports.push(done.report);
    }
    const summary = summarizeSeries(reports);
    expect(summary.wins).toBe(6);
    expect(summary.losses).toBe(0);
    expect(summary.gold).toBe(profile.gold - start.gold);
    expect(summary.materials).toEqual(profile.materials.map((n, i) => n - start.materials[i]!));
    expect(Object.values(summary.chests).reduce((a, b) => a + b, 0)).toBe(chestCount(profile));
    expect(summary.items.reduce((sum, i) => sum + i.count, 0)).toBe(6);
    expect(summary.newItems).toBe(profile.items.length);
    expect(summary.newItems + summary.copies + summary.salvaged).toBe(6);
    // Le premier passage du palier I l'ouvre : le palier II s'annonce une fois.
    expect(summary.tiersUnlocked).toEqual([{ dungeon: 'ember_wastes', tier: 2 }]);
    expect(summary.mastery).toEqual([{ dungeon: 'ember_wastes', rank: 1 }]);
    expect(summary.heroes).toEqual([]);
  });

  it('copies, objets dissous, héros débloqués, niveaux prêts et défaites', () => {
    const report = (change: Partial<DungeonReport>): DungeonReport => ({
      dungeon: 'drowned_halls',
      tier: 2,
      tierUnlocked: null,
      firstClear: false,
      xp: {},
      gold: 10,
      grimoires: 0,
      materials: { tier: 2, amount: 4 },
      item: {
        uid: 1,
        item: 'a',
        guaranteed: false,
        isNew: false,
        copies: 1,
        salvaged: null,
      },
      mastery: { rank: 0, rankUp: false, clears: 1, next: 5 },
      unlockedHero: null,
      chest: null,
      ...change,
    });
    const summary = summarizeSeries(
      [
        report({
          item: { uid: 1, item: 'a', guaranteed: true, isNew: true, copies: 0, salvaged: null },
          unlockedHero: 'maree',
          chest: 'silver',
          xp: { pyra: { gained: 5, ready: true } },
        }),
        report({}),
        report({
          item: {
            uid: 2,
            item: 'b',
            guaranteed: false,
            isNew: false,
            copies: 0,
            salvaged: { tier: 3, amount: 7 },
          },
          chest: 'silver',
          xp: { pyra: { gained: 5, ready: true }, ronce: { gained: 5, ready: false } },
          mastery: { rank: 1, rankUp: true, clears: 5, next: 15 },
        }),
      ],
      1,
    );
    expect(summary).toMatchObject({
      wins: 3,
      losses: 1,
      gold: 30,
      materials: [0, 12, 7],
      newItems: 1,
      copies: 1,
      salvaged: 1,
      chests: { silver: 2 },
      levelReady: ['pyra'],
      mastery: [{ dungeon: 'drowned_halls', rank: 1 }],
      heroes: ['maree'],
    });
    expect(summary.items).toEqual([
      { item: 'a', count: 2, isNew: true, copies: 1, salvaged: 0 },
      { item: 'b', count: 1, isNew: false, copies: 0, salvaged: 1 },
    ]);
  });

  it('une série perdue d’entrée : rien de gagné, une défaite', () => {
    expect(summarizeSeries([], 1)).toEqual({
      wins: 0,
      losses: 1,
      gold: 0,
      materials: [0, 0, 0],
      items: [],
      newItems: 0,
      copies: 0,
      salvaged: 0,
      chests: {},
      levelReady: [],
      mastery: [],
      tiersUnlocked: [],
      heroes: [],
    });
    expect(summarizeSeries([]).losses).toBe(0);
  });
});
