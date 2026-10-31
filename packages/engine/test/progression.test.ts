import { loadContent, profileSchema, type Profile } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import {
  addXp,
  canLevelUp,
  completeDungeon,
  dungeonOpen,
  dungeonPrerequisite,
  energyAt,
  enterDungeon,
  equip,
  goldToNext,
  heroBuild,
  levelDust,
  levelDustTier,
  levelUp,
  levelUpCost,
  levelUpMax,
  newProfile,
  respec,
  respecCost,
  SANDBOX_COPIES,
  sandboxProfile,
  setLevel,
  moveInTeam,
  setTeam,
  setUpgrade,
  starterHeroes,
  takeTalent,
  xpToNext,
  type Outcome,
} from '../src/progression';

const content = loadContent();
const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.value;
};
const reason = (outcome: Outcome<unknown>): string => (outcome.ok ? 'ok' : outcome.reason);
const withLevel = (profile: Profile, hero: string, level: number): Profile => ({
  ...profile,
  heroes: { ...profile.heroes, [hero]: { ...profile.heroes[hero]!, level } },
});

describe('profil', () => {
  it('nouveau profil valide : héros de départ au niveau 1, équipe complète', () => {
    const profile = newProfile(content, 7, 1000);
    expect(profileSchema.parse(profile)).toEqual(profile);
    expect(starterHeroes(content)).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
    expect(profile.team).toEqual(['pyra', 'maree', 'ronce', 'cendre']);
    expect(profile.heroes.pyra).toEqual({
      level: 1,
      xp: 0,
      talents: [],
      items: [null, null],
      freeRespecUsed: false,
      stars: 0,
      spells: { basic: 1, a: 1, b: 1, ult: 1 },
      awakened: false,
    });
    expect(profile.fragments).toEqual({});
    expect(profile.chests).toEqual({});
    expect(profile.focus).toBeNull();
  });

  it('les héros de coffre ne sont pas offerts : ni au départ, ni par un donjon', () => {
    const profile = newProfile(content, 7, 1000);
    const fromDungeons = content.dungeons.flatMap((d) => d.unlocksHero ?? []);
    const summonOnly = content.heroes.filter((h) => !h.starter && !fromDungeons.includes(h.id));
    expect(summonOnly.length).toBeGreaterThan(0);
    for (const hero of summonOnly) {
      expect(profile.unlocked).not.toContain(hero.id);
      expect(profile.heroes[hero.id]).toBeUndefined();
    }
    // Départ et donjons : communs ou rares seulement.
    for (const id of [...starterHeroes(content), ...fromDungeons]) {
      expect(content.heroById.get(id)!.tier).toBeLessThanOrEqual(2);
    }
  });

  it('une sauvegarde d’avant les raretés reste valide, sans rien débloquer', () => {
    // Profil enregistré avec les six héros d'origine : le format n'a pas changé (rareté = contenu).
    const old = {
      ...newProfile(content, 3, 0),
      unlocked: ['pyra', 'maree', 'ronce', 'cendre', 'ressac'],
    };
    const parsed = profileSchema.parse(JSON.parse(JSON.stringify(old)));
    expect(parsed.unlocked).toEqual(old.unlocked);
    expect(parsed.unlocked.every((id) => content.heroById.has(id))).toBe(true);
  });

  it('une sauvegarde d’avant les coffres reste lisible, sans perdre ses niveaux', () => {
    const profile = newProfile(content, 7, 1000);
    const old = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
    delete old.fragments;
    delete old.chests;
    delete old.focus;
    for (const hero of Object.values(old.heroes as Record<string, Record<string, unknown>>)) {
      delete hero.stars;
    }
    const read = profileSchema.parse(old);
    expect(read).toEqual(profile);
  });
});

describe('XP et niveaux', () => {
  // Poussière donnée, et de l'or en suffisance (le coût en or a son propre test).
  const dust = (profile: Profile, materials: Profile['materials'], gold = 1000): Profile => ({
    ...profile,
    materials,
    gold,
  });

  it('l’XP se met en banque, le niveau se paie en XP et en poussière du palier', () => {
    expect(xpToNext(1, content)).toBe(40);
    expect(xpToNext(4, content)).toBe(320);
    const base = newProfile(content);
    const hero = base.heroes.pyra!;
    // Rien ne monte tout seul, quelle que soit l'XP.
    expect(addXp(hero, 10 ** 6, content)).toEqual({ ...hero, xp: 10 ** 6 });
    expect(levelUpCost(content, hero)).toEqual({ xp: 40, dust: { tier: 1, amount: 2 }, gold: 2 });
    expect(levelDustTier(content, 7)).toBe(1);
    expect(levelDustTier(content, 8)).toBe(2);
    expect(levelDustTier(content, 22)).toBe(3);
    // Dans un palier, la poussière demandée croît avec le niveau (fine +1, pure +2).
    expect(levelDust(content, 7)).toEqual({ tier: 1, amount: 2 });
    expect(levelDust(content, 8)).toEqual({ tier: 2, amount: 3 });
    expect(levelDust(content, 11)).toEqual({ tier: 2, amount: 6 });
    expect(levelDust(content, 22)).toEqual({ tier: 3, amount: 5 });
    expect(levelDust(content, 29)).toEqual({ tier: 3, amount: 19 });

    const banked = {
      ...base,
      gold: 1000,
      heroes: { ...base.heroes, pyra: { ...hero, xp: 40 + 113 + 5 } },
    };
    expect(reason(levelUp(content, banked, 'pyra'))).toBe('not_enough_materials');
    expect(reason(levelUp(content, dust(base, [9, 0, 0]), 'pyra'))).toBe('not_enough_xp');
    expect(canLevelUp(content, dust(banked, [9, 0, 0]), banked.heroes.pyra)).toBe(true);
    const once = value(levelUp(content, dust(banked, [9, 0, 0]), 'pyra'));
    expect(once.heroes.pyra).toMatchObject({ level: 2, xp: 113 + 5 });
    expect(once.materials).toEqual([7, 0, 0]);
    expect(once.gold).toBe(1000 - 2);
    // « Au maximum » : deux niveaux possibles, le troisième manque d'XP.
    const twice = value(levelUpMax(content, dust(banked, [9, 0, 0]), 'pyra'));
    expect(twice.heroes.pyra).toMatchObject({ level: 3, xp: 5 });
    expect(twice.materials).toEqual([5, 0, 0]);
    expect(twice.gold).toBe(1000 - 2 - 6);
    expect(reason(levelUpMax(content, twice, 'pyra'))).toBe('not_enough_xp');
    expect(reason(levelUp(content, base, 'nope'))).toBe('locked_hero');
  });

  it('le niveau se paie aussi en or : refus sans or, débit exact', () => {
    expect(goldToNext(1, content)).toBe(2);
    expect(goldToNext(10, content)).toBe(89);
    expect(goldToNext(29, content)).toBe(518);
    const base = newProfile(content);
    const ready = (gold: number): Profile => ({
      ...base,
      gold,
      materials: [99, 99, 99],
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 4, xp: 10 ** 6 } },
    });
    const cost = levelUpCost(content, ready(0).heroes.pyra!)!;
    expect(cost.gold).toBe(20);
    // XP et poussière suffisent, l'or manque d'une pièce.
    expect(reason(levelUp(content, ready(cost.gold - 1), 'pyra'))).toBe('not_enough_gold');
    expect(canLevelUp(content, ready(cost.gold - 1), ready(0).heroes.pyra!)).toBe(false);
    expect(reason(levelUpMax(content, ready(cost.gold - 1), 'pyra'))).toBe('not_enough_gold');
    // Juste assez : le niveau est payé, l'or tombe à zéro.
    expect(canLevelUp(content, ready(cost.gold), ready(0).heroes.pyra!)).toBe(true);
    const paid = value(levelUp(content, ready(cost.gold), 'pyra'));
    expect(paid.heroes.pyra!.level).toBe(5);
    expect(paid.gold).toBe(0);
  });

  it('« au maximum » s’arrête au dernier niveau payable en or', () => {
    const base = newProfile(content);
    // Niveaux 4 → 5 → 6 payables (20 + 28), pas le suivant (38) : il reste 10 pièces.
    const gold = goldToNext(4, content) + goldToNext(5, content) + 10;
    expect(goldToNext(6, content)).toBeGreaterThan(10);
    const profile: Profile = {
      ...base,
      gold,
      materials: [99, 99, 99],
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 4, xp: 10 ** 6 } },
    };
    const raised = value(levelUpMax(content, profile, 'pyra'));
    expect(raised.heroes.pyra!.level).toBe(6);
    expect(raised.gold).toBe(10);
    expect(raised.materials).toEqual([99 - 2 - 2, 99, 99]);
    expect(reason(levelUpMax(content, raised, 'pyra'))).toBe('not_enough_gold');
  });

  it('plafond d’étoile et niveau maximum', () => {
    const base = newProfile(content);
    const gated = {
      ...dust(base, [99, 99, 99]),
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 10, xp: 10 ** 6 } },
    };
    expect(reason(levelUp(content, gated, 'pyra'))).toBe('star_gate');
    expect(canLevelUp(content, gated, gated.heroes.pyra)).toBe(false);
    const maxed = {
      ...gated,
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 30, xp: 50, stars: 2 } },
    };
    expect(levelUpCost(content, maxed.heroes.pyra)).toBeNull();
    expect(reason(levelUp(content, maxed, 'pyra'))).toBe('max_level');
    expect(addXp(maxed.heroes.pyra, 500, content)).toMatchObject({ level: 30, xp: 0 });
    // Le dernier niveau vide la banque.
    const almost = {
      ...gated,
      heroes: { ...base.heroes, pyra: { ...base.heroes.pyra!, level: 29, xp: 10 ** 6, stars: 2 } },
    };
    expect(value(levelUp(content, almost, 'pyra')).heroes.pyra).toMatchObject({ level: 30, xp: 0 });
  });
});

describe('talents et respec', () => {
  it('prend un talent seulement si le build reste valide', () => {
    let profile = newProfile(content);
    expect(takeTalent(content, profile, 'pyra', 'pyra_exe_core')).toEqual({
      ok: false,
      reason: 'talent_invalid',
    });
    profile = withLevel(profile, 'pyra', 6);
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_cheap'));
    expect(takeTalent(content, profile, 'pyra', 'pyra_exe_finisher')).toMatchObject({ ok: false });
    expect(takeTalent(content, profile, 'pyra', 'nope')).toEqual({
      ok: false,
      reason: 'unknown_node',
    });
    expect(takeTalent(content, profile, 'ghost', 'pyra_exe_core')).toEqual({
      ok: false,
      reason: 'unknown_hero',
    });
    expect(heroBuild(profile, 'pyra').talents).toEqual(['pyra_exe_core', 'pyra_exe_cheap']);
  });

  it('premier respec gratuit, puis or × niveau ; gratuit en mode test', () => {
    let profile = withLevel(newProfile(content), 'pyra', 6);
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    expect(respecCost(content, profile, 'pyra')).toBe(0);
    profile = value(respec(content, profile, 'pyra'));
    expect(profile.heroes.pyra?.talents).toEqual([]);
    expect(respec(content, profile, 'pyra')).toEqual({ ok: false, reason: 'no_talent' });
    profile = value(takeTalent(content, profile, 'pyra', 'pyra_exe_core'));
    expect(respecCost(content, profile, 'pyra')).toBe(120);
    expect(respec(content, profile, 'pyra')).toEqual({ ok: false, reason: 'not_enough_gold' });
    profile = value(respec(content, { ...profile, gold: 200 }, 'pyra'));
    expect(profile.gold).toBe(80);
    expect(respecCost(content, { ...profile, testMode: true }, 'pyra')).toBe(0);
  });
});

describe('objets', () => {
  const owned: Profile = {
    ...newProfile(content),
    items: [
      { uid: 1, item: 'ember_charm', upgrade: 0, copies: 0 },
      { uid: 2, item: 'ember_charm', upgrade: 1, copies: 0 },
      { uid: 3, item: 'iron_band', upgrade: 3, copies: 0 },
    ],
    nextUid: 4,
  };

  it('équipe, déplace d’un héros à l’autre et refuse les doublons', () => {
    let profile = value(equip(content, owned, 'pyra', 0, 1));
    expect(heroBuild(profile, 'pyra').items).toEqual([{ id: 'ember_charm', upgrade: 0 }]);
    expect(equip(content, profile, 'pyra', 1, 2)).toEqual({ ok: false, reason: 'bad_slot' });
    profile = value(equip(content, profile, 'maree', 1, 1));
    expect(profile.heroes.pyra?.items).toEqual([null, null]);
    expect(profile.heroes.maree?.items).toEqual([null, 1]);
    profile = value(equip(content, profile, 'maree', 1, null));
    expect(profile.heroes.maree?.items).toEqual([null, null]);
    expect(equip(content, profile, 'maree', 2, 1)).toEqual({ ok: false, reason: 'bad_slot' });
    expect(equip(content, profile, 'maree', 0, 99)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(equip(content, profile, 'ghost', 0, 1)).toEqual({ ok: false, reason: 'unknown_hero' });
  });
});

describe('équipe et énergie', () => {
  it('1 à teamSize héros débloqués, sans doublon', () => {
    const profile = newProfile(content);
    const size = content.balance.progression.teamSize;
    expect(size).toBe(4);
    expect(profile.team).toHaveLength(size);
    expect(
      setTeam(content, profile, [...content.heroes.map((h) => h.id), 'ghost'].slice(0, size + 1)),
    ).toEqual({ ok: false, reason: 'bad_team' });
    expect(value(setTeam(content, profile, ['ronce'])).team).toEqual(['ronce']);
    expect(setTeam(content, profile, [])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(content, profile, ['pyra', 'pyra'])).toEqual({ ok: false, reason: 'bad_team' });
    expect(setTeam(content, profile, ['ghost'])).toEqual({ ok: false, reason: 'locked_hero' });
  });

  it('change la place d’un héros : déplacement, échange, bornes et refus', () => {
    const profile = newProfile(content);
    const [a, b, c, d] = profile.team;
    expect(profile.team).toHaveLength(4);
    // Déplacement : le héros s'insère, les autres se décalent ; vers l'avant comme vers l'arrière.
    expect(value(moveInTeam(content, profile, 3, 0)).team).toEqual([d, a, b, c]);
    expect(value(moveInTeam(content, profile, 0, 2)).team).toEqual([b, c, a, d]);
    // Échange : seuls les deux héros changent de place.
    expect(value(moveInTeam(content, profile, 3, 0, 'swap')).team).toEqual([d, b, c, a]);
    expect(value(moveInTeam(content, profile, 1, 2, 'swap')).team).toEqual([a, c, b, d]);
    // Un pas vers l'avant ou l'arrière : déplacer et échanger reviennent au même.
    expect(value(moveInTeam(content, profile, 1, 0)).team).toEqual(
      value(moveInTeam(content, profile, 1, 0, 'swap')).team,
    );
    // Sur place : rien ne change ; le profil reçu n'est jamais modifié.
    expect(value(moveInTeam(content, profile, 2, 2)).team).toEqual([a, b, c, d]);
    expect(profile.team).toEqual([a, b, c, d]);
    // Emplacement libre : le héros passe en dernier.
    const two = value(setTeam(content, profile, ['pyra', 'maree']));
    expect(value(moveInTeam(content, two, 0, 3)).team).toEqual(['maree', 'pyra']);
    expect(value(moveInTeam(content, two, 0, 3, 'swap')).team).toEqual(['maree', 'pyra']);
    const three = value(setTeam(content, profile, ['pyra', 'maree', 'ronce']));
    expect(value(moveInTeam(content, three, 0, 3, 'swap')).team).toEqual([
      'maree',
      'ronce',
      'pyra',
    ]);
    // Bornes : `from` dans l'équipe, `to` dans les emplacements, entiers positifs.
    for (const [from, to] of [
      [-1, 0],
      [2, 0],
      [0, -1],
      [0, 4],
      [0.5, 1],
      [0, 1.5],
    ] as const) {
      expect(moveInTeam(content, two, from, to)).toEqual({ ok: false, reason: 'bad_position' });
    }
    // Les contrôles de setTeam s'appliquent toujours.
    expect(moveInTeam(content, { ...profile, unlocked: [a ?? ''] }, 0, 1)).toEqual({
      ok: false,
      reason: 'locked_hero',
    });
  });

  it('l’énergie existe mais ne coûte rien dans le MVP', () => {
    const profile = { ...newProfile(content, 1, 0), energy: { value: 10, updatedAt: 0 } };
    expect(energyAt(content, profile, 5 * 60000)).toBe(15);
    expect(energyAt(content, profile, 10 ** 9)).toBe(content.balance.energy.cap);
    expect(value(enterDungeon(content, profile, 'ember_wastes', 60000)).energy).toEqual({
      value: 11,
      updatedAt: 60000,
    });
    expect(enterDungeon(content, profile, 'nowhere', 0)).toEqual({
      ok: false,
      reason: 'unknown_dungeon',
    });
    expect(enterDungeon(content, { ...profile, team: [] }, 'ember_wastes', 0)).toEqual({
      ok: false,
      reason: 'bad_team',
    });
  });
});

describe('donjons et butin', () => {
  it('récompenses : XP (équipe seulement), or, matériaux, objet, ouverture du suivant', () => {
    let profile = value(setTeam(content, newProfile(content, 3), ['pyra', 'maree']));
    expect(dungeonOpen(content, profile, 'ember_wastes')).toBe(true);
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(false);
    const first = value(completeDungeon(content, profile, 'ember_wastes'));
    profile = first.profile;
    expect(first.report).toMatchObject({
      firstClear: true,
      gold: 80,
      materials: { tier: 1, amount: 8 },
    });
    expect(first.report.xp.pyra).toEqual({ gained: 60, ready: true });
    // Ronce, débloquée mais hors équipe, ne gagne rien et ne figure pas au bilan.
    expect(first.report.xp.ronce).toBeUndefined();
    expect(profile.heroes.ronce).toMatchObject({ level: 1, xp: 0 });
    expect(profile.heroes.pyra).toMatchObject({ level: 1, xp: 60 });
    expect(profile.items).toHaveLength(1);
    expect(profile.dungeons.ember_wastes).toEqual({ clears: 1, dry: 0, tier: 2 });
    expect(first.report).toMatchObject({ tier: 1, tierUnlocked: 2 });
    expect(dungeonOpen(content, profile, 'drowned_halls')).toBe(true);
    expect(dungeonOpen(content, { ...profile, testMode: true }, 'thorn_maze')).toBe(true);
    expect(dungeonOpen(content, profile, 'nowhere')).toBe(false);
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('déblocage par opensAfter : seul le donjon cité compte, pas le précédent du fichier', () => {
    const last = content.dungeons.at(-1)!;
    const base = content.dungeonById.get('drowned_halls')!;
    const parallel = {
      ...base,
      id: 'test_parallel',
      opensAfter: 'ember_wastes',
      map: { ...base.map, chapter: 9 },
    };
    const custom = { ...content, dungeons: [...content.dungeons, parallel] };
    custom.dungeonById = new Map(custom.dungeons.map((d) => [d.id, d]));
    const fresh = newProfile(custom, 3);
    expect(dungeonPrerequisite(custom, 'test_parallel')).toBe('ember_wastes');
    expect(dungeonOpen(custom, fresh, 'test_parallel')).toBe(false);
    // Le précédent dans le fichier ne l'ouvre pas.
    const afterLast = { ...fresh, dungeons: { [last.id]: { clears: 1, dry: 0, tier: 2 } } };
    expect(dungeonOpen(custom, afterLast, 'test_parallel')).toBe(false);
    const afterFirst = value(completeDungeon(custom, fresh, 'ember_wastes')).profile;
    expect(dungeonOpen(custom, afterFirst, 'test_parallel')).toBe(true);
    expect(dungeonOpen(custom, afterFirst, 'drowned_halls')).toBe(true);
    expect(value(completeDungeon(custom, afterFirst, 'test_parallel')).report.firstClear).toBe(
      true,
    );
    expect(dungeonPrerequisite(custom, 'ember_wastes')).toBeNull();
    expect(dungeonPrerequisite(custom, 'nowhere')).toBeUndefined();
  });

  it('sauvegarde existante inchangée : sans opensAfter, le précédent du fichier ouvre le suivant', () => {
    // Les donjons d'origine n'ont pas de prérequis explicite : leur ouverture ne change pas.
    const original = content.dungeons.filter((d) => d.opensAfter === undefined);
    expect(original.map((d) => d.id)).toEqual(content.dungeons.slice(0, 10).map((d) => d.id));
    for (let cleared = 0; cleared <= original.length; cleared++) {
      // Sauvegarde d'avant le chapitre 2 : les `cleared` premiers donjons terminés.
      const save: Profile = {
        ...newProfile(content, 3),
        dungeons: Object.fromEntries(
          original.slice(0, cleared).map((d) => [d.id, { clears: 1, dry: 0, tier: 2 }]),
        ),
      };
      original.forEach((dungeon, i) => {
        expect(dungeonOpen(content, save, dungeon.id), `${dungeon.id} après ${cleared}`).toBe(
          i <= cleared,
        );
      });
    }
  });

  it('déblocage d’un héros au niveau recommandé du donjon', () => {
    const custom = {
      ...content,
      dungeons: content.dungeons.map((d) =>
        d.id === 'drowned_halls' ? { ...d, unlocksHero: 'ronce' } : d,
      ),
    };
    custom.dungeonById = new Map(custom.dungeons.map((d) => [d.id, d]));
    const start = { ...newProfile(custom), unlocked: ['pyra', 'maree'], team: ['pyra', 'maree'] };
    const { profile, report } = value(completeDungeon(custom, start, 'drowned_halls'));
    expect(report.unlockedHero).toBe('ronce');
    expect(profile.unlocked).toContain('ronce');
    expect(profile.heroes.ronce?.level).toBe(4);
  });
});

describe('mode test', () => {
  it('tout débloqué, niveau maximum, objets améliorés, rien n’est gagné', () => {
    const sandbox = sandboxProfile(content);
    expect(profileSchema.parse(sandbox)).toEqual(sandbox);
    expect(sandbox.testMode).toBe(true);
    expect(sandbox.unlocked).toEqual(content.heroes.map((h) => h.id));
    expect(sandbox.heroes.pyra?.level).toBe(30);
    expect(sandbox.items).toHaveLength(content.items.length * SANDBOX_COPIES);
    expect(new Set(sandbox.items.map((i) => i.upgrade))).toEqual(new Set([3]));
    expect(dungeonOpen(content, sandbox, 'broken_crossing')).toBe(true);
    expect(completeDungeon(content, sandbox, 'ember_wastes')).toEqual({
      ok: false,
      reason: 'test_mode',
    });
    expect(respecCost(content, sandbox, 'pyra')).toBe(0);
  });

  it('préremplit l’équipe depuis des builds partagés', () => {
    const sandbox = sandboxProfile(content, [
      {
        hero: 'ronce',
        level: 12,
        talents: ['ronce_snare_core'],
        items: [{ id: 'storm_sigil', upgrade: 1 }],
      },
      {
        hero: 'pyra',
        level: 5,
        talents: [],
        items: [
          { id: 'storm_sigil', upgrade: 2 },
          { id: 'nope', upgrade: 0 },
        ],
      },
    ]);
    expect(sandbox.team).toEqual(['ronce', 'pyra']);
    expect(heroBuild(sandbox, 'ronce')).toEqual({
      hero: 'ronce',
      level: 12,
      talents: ['ronce_snare_core'],
      items: [{ id: 'storm_sigil', upgrade: 1 }],
      spells: { basic: 1, a: 1, b: 1, ult: 1 },
    });
    expect(heroBuild(sandbox, 'pyra').items).toEqual([{ id: 'storm_sigil', upgrade: 2 }]);
  });

  it('niveau libre : les talents en trop tombent ; amélioration libre', () => {
    let sandbox = sandboxProfile(content, [
      {
        hero: 'pyra',
        level: 9,
        talents: ['pyra_exe_core', 'pyra_exe_focus', 'pyra_exe_refund'],
        items: [],
      },
    ]);
    sandbox = value(setLevel(content, sandbox, 'pyra', 2));
    expect(sandbox.heroes.pyra).toMatchObject({ level: 2, talents: ['pyra_exe_core'] });
    expect(value(setLevel(content, sandbox, 'pyra', 99)).heroes.pyra?.level).toBe(30);
    expect(setLevel(content, sandbox, 'ghost', 3)).toEqual({ ok: false, reason: 'unknown_hero' });
    expect(setLevel(content, newProfile(content), 'pyra', 3)).toEqual({
      ok: false,
      reason: 'test_only',
    });
    expect(value(setUpgrade(content, sandbox, 1, 7)).items[0]?.upgrade).toBe(3);
    expect(value(setUpgrade(content, sandbox, 1, 0)).items[0]?.upgrade).toBe(0);
    expect(setUpgrade(content, sandbox, 9999, 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(setUpgrade(content, newProfile(content), 1, 1)).toEqual({
      ok: false,
      reason: 'test_only',
    });
  });
});
