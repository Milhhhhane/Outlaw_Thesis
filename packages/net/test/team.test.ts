import { heroSchema, type Content, type Profile } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import {
  compilePlayerTeam,
  defaultRules,
  TEAM_ERROR_CODES,
  validateTeam,
  type RoomRules,
  type TeamCheck,
  type TeamRequest,
} from '../src';
import { balance, content, richProfile, squad, talentsFor, teamRequest } from './helpers';

function check(
  request: TeamRequest,
  options: { profile?: Profile; rules?: Partial<RoomRules>; content?: Content } = {},
): TeamCheck {
  return validateTeam({
    profile: options.profile ?? richProfile,
    request,
    rules: { ...defaultRules, ...options.rules },
    content: options.content ?? content,
  });
}

function code(result: TeamCheck): string {
  if (result.ok) throw new Error('équipe acceptée');
  return result.code;
}

const base = teamRequest(squad('a'), { items: [[1], [4], [7]] });
const withHeroes = (mutate: (heroes: TeamRequest['heroes'][number][]) => void): TeamRequest => {
  const heroes = structuredClone(base.heroes);
  mutate(heroes);
  return { heroes };
};

/** Profil dont les niveaux et objets sont ceux demandés. */
function profileWith(patch: (profile: Profile) => Profile): Profile {
  return patch(structuredClone(richProfile));
}

describe('équipe valide', () => {
  it('rend les builds finaux classés par emplacement', () => {
    const shuffled = withHeroes((heroes) => {
      heroes.reverse(); // maree et ronce changent de place dans le message
    });
    const result = check(shuffled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.builds.map((b) => b.hero)).toEqual(squad('a'));
    expect(result.builds[0]).toEqual({
      hero: 'pyra',
      level: 30,
      talents: talentsFor('pyra', 30),
      items: [{ id: 'ember_charm', upgrade: 3 }],
    });
    expect(result.tier).toBe(3);
  });

  it('le niveau est le plus petit du profil et du plafond du salon', () => {
    const capped = check(teamRequest(squad('a'), { level: 10 }), { rules: { maxLevel: 10 } });
    expect(capped.ok && capped.builds.map((b) => b.level)).toEqual([10, 10, 10]);

    const lower = profileWith((profile) => ({
      ...profile,
      heroes: {
        ...profile.heroes,
        pyra: { ...profile.heroes.pyra!, level: 4 },
      },
    }));
    const mixed = check(teamRequest(squad('a'), { level: 4 }), {
      profile: lower,
      rules: { maxLevel: 12 },
    });
    expect(mixed.ok && mixed.builds.map((b) => b.level)).toEqual([4, 12, 12]);
  });

  it('un niveau de profil hors bornes est ramené au maximum du jeu', () => {
    const cheat = profileWith((profile) => ({
      ...profile,
      heroes: { ...profile.heroes, pyra: { ...profile.heroes.pyra!, level: 9999 } },
    }));
    const result = check(teamRequest(squad('a'), { level: 30 }), { profile: cheat });
    expect(result.ok && result.builds[0]?.level).toBe(balance.progression.maxLevel);
  });

  it('compile les unités avec des identifiants p1_<héros> / p2_<héros>', () => {
    const result = check(base);
    if (!result.ok) throw new Error('équipe refusée');
    const one = compilePlayerTeam(content, result.builds, 'p1');
    const two = compilePlayerTeam(content, result.builds, 'p2');
    expect(one.map((u) => u.id)).toEqual(['p1_pyra', 'p1_maree', 'p1_ronce']);
    expect(two.map((u) => u.id)).toEqual(['p2_pyra', 'p2_maree', 'p2_ronce']);
    expect(one.map((u) => u.side)).toEqual(['player', 'player', 'player']);
    expect(two.map((u) => u.side)).toEqual(['enemy', 'enemy', 'enemy']);
    expect(one.map((u) => u.slot)).toEqual([0, 1, 2]);
    expect(one.every((u) => u.controller === 'policy')).toBe(true);
  });
});

describe('refus de validateTeam', () => {
  it('team_size : il faut exactement trois héros', () => {
    expect(code(check({ heroes: [] }))).toBe('team_size');
    expect(code(check(withHeroes((h) => h.pop())))).toBe('team_size');
    expect(
      code(
        check(
          withHeroes((h) => {
            h.push({ hero: 'seve', slot: 3, talents: [], items: [] });
          }),
        ),
      ),
    ).toBe('team_size');
  });

  it('bad_slots : les emplacements doivent être 0, 1 et 2, chacun une fois', () => {
    expect(code(check(withHeroes((h) => (h[1]!.slot = 0))))).toBe('bad_slots');
    expect(code(check(withHeroes((h) => (h[2]!.slot = 3))))).toBe('bad_slots');
    expect(
      code(
        check(
          withHeroes((h) => {
            for (const entry of h) entry.slot++;
          }),
        ),
      ),
    ).toBe('bad_slots');
  });

  it('bad_slots : trop d’objets pour un héros, ou deux fois le même objet', () => {
    const slots = balance.progression.items.slots;
    const tooMany = withHeroes(
      (h) => (h[0]!.items = Array.from({ length: slots + 1 }, (_, i) => i * 3 + 1)),
    );
    expect(code(check(tooMany))).toBe('bad_slots');
    // uid 1 et 2 sont deux exemplaires du même objet.
    expect(code(check(withHeroes((h) => (h[0]!.items = [1, 2]))))).toBe('bad_slots');
  });

  it('duplicate_hero : le même héros deux fois', () => {
    const twice = withHeroes((h) => (h[2]!.hero = 'pyra'));
    const result = check(twice);
    expect(code(result)).toBe('duplicate_hero');
    expect(!result.ok && result.detail).toBe('pyra');
  });

  it('hero_not_owned : héros bloqué, inconnu, ou absent de la progression', () => {
    const starters = newProfile(content);
    expect(code(check(teamRequest(squad('b')), { profile: starters }))).toBe('hero_not_owned');
    expect(code(check(withHeroes((h) => (h[0]!.hero = 'inconnu'))))).toBe('hero_not_owned');
    const hollow = profileWith((profile) => ({
      ...profile,
      heroes: Object.fromEntries(Object.entries(profile.heroes).filter(([id]) => id !== 'pyra')),
    }));
    expect(code(check(base, { profile: hollow }))).toBe('hero_not_owned');
    const locked = profileWith((profile) => ({
      ...profile,
      unlocked: profile.unlocked.filter((id) => id !== 'maree'),
    }));
    expect(code(check(base, { profile: locked }))).toBe('hero_not_owned');
  });

  it('items_forbidden : objets interdits par le salon', () => {
    expect(code(check(base, { rules: { items: false } }))).toBe('items_forbidden');
    expect(check(teamRequest(squad('a')), { rules: { items: false } }).ok).toBe(true);
  });

  it('item_not_owned : exemplaire inconnu, déjà pris par un autre héros, amélioration absurde', () => {
    expect(code(check(withHeroes((h) => (h[0]!.items = [9999]))))).toBe('item_not_owned');
    expect(code(check(withHeroes((h) => (h[1]!.items = [1]))))).toBe('item_not_owned');
    const cheat = profileWith((profile) => ({
      ...profile,
      items: profile.items.map((i) => (i.uid === 1 ? { ...i, upgrade: 99 } : i)),
    }));
    expect(code(check(base, { profile: cheat }))).toBe('item_not_owned');
    const retired = profileWith((profile) => ({
      ...profile,
      items: profile.items.map((i) => (i.uid === 1 ? { ...i, item: 'objet_retire' } : i)),
    }));
    expect(code(check(base, { profile: retired }))).toBe('item_not_owned');
  });

  it('unknown_talent : un talent qui n’existe pas pour ce héros', () => {
    expect(code(check(withHeroes((h) => (h[0]!.talents = ['nope']))))).toBe('unknown_talent');
    // Le talent d’un autre héros n’est pas un talent de celui-ci.
    const other = talentsFor('maree', 30)[0]!;
    expect(code(check(withHeroes((h) => (h[0]!.talents = [other]))))).toBe('unknown_talent');
  });

  it('talent_invalid : doublon, prérequis manquant, choix exclusif violé', () => {
    const pyra = content.heroById.get('pyra')!;
    const nodes = pyra.pages.flatMap((p) => p.nodes);
    const needy = nodes.find((n) => n.requires !== undefined)!;
    expect(code(check(withHeroes((h) => (h[0]!.talents = [needy.id]))))).toBe('talent_invalid');
    const root = talentsFor('pyra', 30)[0]!;
    expect(code(check(withHeroes((h) => (h[0]!.talents = [root, root]))))).toBe('talent_invalid');
    const group = nodes.find((n) => n.group !== undefined)!;
    const rival = nodes.find((n) => n.group === group.group && n.id !== group.id)!;
    const chain = (id: string): string[] => {
      const node = nodes.find((n) => n.id === id)!;
      return node.requires === undefined ? [id] : [...chain(node.requires), id];
    };
    const both = [...new Set([...chain(group.id), ...chain(rival.id)])];
    expect(both.length).toBeLessThanOrEqual(talentsFor('pyra', 30).length + 2);
    expect(code(check(withHeroes((h) => (h[0]!.talents = both))))).toBe('talent_invalid');
  });

  it('talents_over_budget : plus de talents que de points au niveau plafonné', () => {
    const full = teamRequest(squad('a'), { level: 30 });
    expect(check(full).ok).toBe(true);
    expect(code(check(full, { rules: { maxLevel: 10 } }))).toBe('talents_over_budget');
    const ok = teamRequest(squad('a'), { level: 10 });
    expect(check(ok, { rules: { maxLevel: 10 } }).ok).toBe(true);
    // Niveau 1 : aucun point de talent.
    expect(code(check(full, { rules: { maxLevel: 1 } }))).toBe('talents_over_budget');
    expect(check(teamRequest(squad('a'), { level: 1 }), { rules: { maxLevel: 1 } }).ok).toBe(true);
  });

  it('talents_over_budget : une page encore verrouillée au niveau plafonné', () => {
    const pyra = content.heroById.get('pyra')!;
    const secondPage = pyra.pages[1]!.nodes.find((n) => n.requires === undefined)!;
    // Niveau 9 : 3 points, page 2 ouverte au niveau 10 seulement.
    const request = withHeroes((h) => {
      h[0]!.talents = [secondPage.id];
      h[1]!.talents = [];
      h[2]!.talents = [];
    });
    expect(code(check(request, { rules: { maxLevel: 9 } }))).toBe('talents_over_budget');
    expect(check(request, { rules: { maxLevel: 10 } }).ok).toBe(true);
  });

  it('tier_budget_exceeded : somme des paliers au-dessus du budget', () => {
    const tiers: Record<string, number> = { pyra: 4, maree: 3, ronce: 2 };
    const heroes = content.heroes.map((h) => ({ ...h, tier: tiers[h.id] ?? 1 }));
    const tiered: Content = {
      ...content,
      heroes,
      heroById: new Map(heroes.map((h) => [h.id, h])),
    };
    const rules = (tierBudget: number | null): Partial<RoomRules> => ({ tierBudget });
    const result = check(base, { content: tiered, rules: rules(8) });
    expect(code(result)).toBe('tier_budget_exceeded');
    expect(!result.ok && result.detail).toBe('9 > 8');
    const exact = check(base, { content: tiered, rules: rules(9) });
    expect(exact.ok && exact.tier).toBe(9);
    expect(check(base, { content: tiered, rules: rules(null) }).ok).toBe(true);
    // Avec les héros actuels (tous de palier I), le budget minimum suffit.
    expect(check(base, { rules: rules(3) }).ok).toBe(true);
  });

  it('couvre tous les codes annoncés', () => {
    expect(new Set(TEAM_ERROR_CODES).size).toBe(TEAM_ERROR_CODES.length);
  });

  it('l’ordre des contrôles est stable : le premier refus l’emporte', () => {
    const messy = withHeroes((h) => {
      h[0]!.talents = ['nope'];
      h[1]!.hero = 'pyra';
    });
    expect(code(check(messy))).toBe('duplicate_hero');
    expect(code(check({ heroes: messy.heroes.slice(0, 2) }))).toBe('team_size');
    expect(code(check(messy, { rules: { items: false } }))).toBe('duplicate_hero');
  });
});

describe('palier des héros', () => {
  const hero = content.heroes[0]!;

  it('vaut 1 par défaut, de 1 à 4 sinon', () => {
    expect(content.heroes.every((h) => h.tier === 1)).toBe(true);
    expect(heroSchema.parse({ ...hero, tier: undefined }).tier).toBe(1);
    for (const tier of [1, 2, 3, 4]) expect(heroSchema.parse({ ...hero, tier }).tier).toBe(tier);
    for (const tier of [0, 5, 1.5, '2']) {
      expect(heroSchema.safeParse({ ...hero, tier }).success).toBe(false);
    }
  });
});
