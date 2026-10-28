import { describe, expect, it } from 'vitest';
import {
  EFFECT_KINDS,
  ContentError,
  balanceSchema,
  dungeonSchema,
  effectSchema,
  enemySchema,
  heroSchema,
  itemSchema,
  MAX_HERO_TIER,
  MAX_SIDE,
  TIER_STAT_BUDGET_PCT,
  loadContent,
  parseContent,
  talentPageSchema,
  triggerSchema,
  type RawContent,
} from '../src/index';
import balanceJson from '../balance.json' with { type: 'json' };
import {
  bossFixture,
  dungeonFixture,
  enemyFixture,
  heroFixture,
  itemFixture,
  rareItemFixture,
} from './fixtures';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Copie du héros de référence avec des identifiants de sorts, passif et talents tous préfixés. */
function rename<T extends { id: string }>(hero: T): T {
  const text = JSON.stringify(hero).replace(/"(test_[a-z0-9_]+)"/g, (_m, id: string) =>
    id === hero.id ? `"${id}"` : `"${hero.id}_${id}"`,
  );
  return JSON.parse(text) as T;
}

function rawFixture(): RawContent {
  return {
    balance: clone(balanceJson),
    heroes: [clone(heroFixture)],
    enemies: [clone(enemyFixture), clone(bossFixture)],
    items: [clone(itemFixture), clone(rareItemFixture)],
    dungeons: [clone(dungeonFixture)],
  };
}

describe('balance.json', () => {
  it('est valide', () => {
    expect(balanceSchema.safeParse(balanceJson).success).toBe(true);
  });

  it('refuse une clé inconnue (faute de frappe)', () => {
    const bad = { ...clone(balanceJson), combatt: {} };
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse une réserve de départ au-dessus du plafond', () => {
    const bad = clone(balanceJson);
    bad.combat.teamPoints.start = 9;
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('exige une entrée de coût par niveau d’amélioration', () => {
    const bad = clone(balanceJson);
    bad.progression.items.upgradeCosts.pop();
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse des niveaux de pages non croissants', () => {
    const bad = clone(balanceJson);
    bad.progression.pageUnlockLevels = [10, 1, 20];
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un niveau de point de talent au-dessus du niveau maximum', () => {
    const bad = clone(balanceJson);
    bad.progression.talentPointLevels = [3, 99];
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('exige un coût d’étoile par palier de niveau (maxLevel 30, 10 niveaux par étoile : 2)', () => {
    const bad = clone(balanceJson);
    bad.chests.starCosts = [10];
    expect(balanceSchema.safeParse(bad).success).toBe(false);
    const raised = clone(balanceJson);
    raised.progression.maxLevel = 100;
    expect(balanceSchema.safeParse(raised).success).toBe(false);
    raised.chests.starCosts = Array.from({ length: 9 }, (_, i) => 10 * (i + 1));
    expect(balanceSchema.safeParse(raised).success).toBe(true);
  });

  it('refuse deux paliers de coffre de même identifiant', () => {
    const bad = clone(balanceJson);
    bad.chests.tiers.push({ id: 'bronze', fragments: 1 });
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });
});

describe('les 8 briques d’effet', () => {
  it('sont exactement 8', () => {
    expect(EFFECT_KINDS).toHaveLength(8);
  });

  const samples: Record<(typeof EFFECT_KINDS)[number], unknown> = {
    damage: { kind: 'damage', power: 100 },
    heal: { kind: 'heal', power: 50 },
    shield: { kind: 'shield', power: 40, duration: 2 },
    tempo: { kind: 'tempo', amount: -20 },
    statMod: { kind: 'statMod', stat: 'def', percent: 15, duration: 3 },
    status: { kind: 'status', status: 'mark', duration: 2 },
    teamPoints: { kind: 'teamPoints', amount: 1 },
    trigger: {
      kind: 'trigger',
      duration: 3,
      trigger: { on: 'turn_start', effects: [{ kind: 'heal', target: 'self', power: 10 }] },
    },
  };

  it.each(EFFECT_KINDS)('accepte « %s »', (kind) => {
    expect(effectSchema.safeParse(samples[kind]).success).toBe(true);
  });

  it('refuse une brique inconnue', () => {
    expect(effectSchema.safeParse({ kind: 'teleport' }).success).toBe(false);
  });

  it('refuse une modification de PV (stat non modifiable)', () => {
    expect(
      effectSchema.safeParse({ kind: 'statMod', stat: 'hp', percent: 10, duration: 2 }).success,
    ).toBe(false);
  });

  it('applique la cible « primary » par défaut', () => {
    const parsed = effectSchema.parse({ kind: 'damage', power: 100 });
    expect(parsed).toMatchObject({ target: 'primary' });
  });

  it('refuse un tempo ou une dépense de points nuls', () => {
    expect(effectSchema.safeParse({ kind: 'tempo', amount: 0 }).success).toBe(false);
    expect(effectSchema.safeParse({ kind: 'teamPoints', amount: 0 }).success).toBe(false);
  });
});

describe('déclencheurs', () => {
  const base = { effects: [{ kind: 'heal', target: 'self', power: 10 }] };

  it('exigent un seuil pour hp_crossed', () => {
    expect(triggerSchema.safeParse({ on: 'hp_crossed', ...base }).success).toBe(false);
    expect(triggerSchema.safeParse({ on: 'hp_crossed', thresholdPct: 50, ...base }).success).toBe(
      true,
    );
  });

  it('réservent thresholdPct, slots, status et targetHasStatus à leur événement', () => {
    expect(triggerSchema.safeParse({ on: 'turn_start', thresholdPct: 50, ...base }).success).toBe(
      false,
    );
    expect(triggerSchema.safeParse({ on: 'turn_start', slots: ['a'], ...base }).success).toBe(
      false,
    );
    expect(triggerSchema.safeParse({ on: 'turn_start', status: 'burn', ...base }).success).toBe(
      false,
    );
    expect(
      triggerSchema.safeParse({ on: 'turn_start', targetHasStatus: 'mark', ...base }).success,
    ).toBe(false);
    expect(
      triggerSchema.safeParse({ on: 'spell_cast', slots: ['b', 'ult'], ...base }).success,
    ).toBe(true);
    expect(
      triggerSchema.safeParse({ on: 'damage_dealt', targetHasStatus: 'mark', ...base }).success,
    ).toBe(true);
  });

  it('exigent status pour status_applied', () => {
    expect(triggerSchema.safeParse({ on: 'status_applied', ...base }).success).toBe(false);
    expect(triggerSchema.safeParse({ on: 'status_applied', status: 'stun', ...base }).success).toBe(
      true,
    );
  });

  it('refusent un sujet autre que « self » pour combat_start', () => {
    expect(triggerSchema.safeParse({ on: 'combat_start', subject: 'enemy', ...base }).success).toBe(
      false,
    );
  });

  it('refusent les cibles « other », « subject » et « primary » hors de leur contexte', () => {
    const effect = (target: string) => ({ effects: [{ kind: 'heal', target, power: 10 }] });
    expect(triggerSchema.safeParse({ on: 'turn_start', ...effect('other') }).success).toBe(false);
    expect(triggerSchema.safeParse({ on: 'combat_start', ...effect('subject') }).success).toBe(
      false,
    );
    expect(triggerSchema.safeParse({ on: 'damage_dealt', ...effect('primary') }).success).toBe(
      false,
    );
    expect(triggerSchema.safeParse({ on: 'damage_dealt', ...effect('other') }).success).toBe(true);
  });

  it('ne s’imbriquent pas : un déclencheur ne contient pas de déclencheur', () => {
    const nested = {
      on: 'turn_start',
      effects: [
        {
          kind: 'trigger',
          trigger: { on: 'turn_end', effects: [{ kind: 'heal', power: 10, target: 'self' }] },
        },
      ],
    };
    expect(triggerSchema.safeParse(nested).success).toBe(false);
  });
});

describe('héros', () => {
  it('accepte le héros de référence', () => {
    expect(heroSchema.safeParse(heroFixture).success).toBe(true);
  });

  it('exige exactement un sort par emplacement', () => {
    const bad = clone(heroFixture);
    bad.spells[3]!.slot = 'b';
    expect(heroSchema.safeParse(bad).success).toBe(false);
  });

  it('exige 3 pages de 5 nœuds', () => {
    const fewPages = clone(heroFixture);
    fewPages.pages.pop();
    expect(heroSchema.safeParse(fewPages).success).toBe(false);
    const fewNodes = clone(heroFixture);
    fewNodes.pages[0]!.nodes.pop();
    expect(heroSchema.safeParse(fewNodes).success).toBe(false);
  });

  it('refuse un passif réduit à un bonus de stat', () => {
    const bad = clone(heroFixture);
    bad.passive.triggers[0]!.effects = [
      { kind: 'statMod', target: 'self', stat: 'atk', percent: 10, duration: 99 },
    ] as never;
    expect(heroSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse les identifiants en double', () => {
    const bad = clone(heroFixture);
    bad.pages[1]!.nodes[0]!.id = bad.pages[0]!.nodes[0]!.id;
    expect(heroSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un talent qui serait un simple bonus de stat', () => {
    const bad = clone(heroFixture);
    bad.pages[0]!.nodes[0]!.mods = [{ type: 'stat', stat: 'atk', percent: 10 }] as never;
    expect(heroSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un identifiant qui n’est pas en snake_case', () => {
    const bad = clone(heroFixture);
    bad.id = 'Test-Hero';
    expect(heroSchema.safeParse(bad).success).toBe(false);
  });

  it('rareté : commun par défaut, de 1 à 4 entiers seulement', () => {
    expect(heroSchema.parse(heroFixture).tier).toBe(1);
    expect(heroSchema.parse({ ...clone(heroFixture), tier: MAX_HERO_TIER }).tier).toBe(4);
    for (const tier of [0, 5, 2.5]) {
      expect(heroSchema.safeParse({ ...clone(heroFixture), tier }).success, String(tier)).toBe(
        false,
      );
    }
  });

  it('héros de départ : faux par défaut', () => {
    const plain: Record<string, unknown> = clone(heroFixture);
    delete plain.starter;
    expect(heroSchema.parse(plain).starter).toBe(false);
  });
});

describe('pages de talents', () => {
  const page = () => clone(heroFixture.pages[0]!);

  it('refusent un prérequis absent de la page', () => {
    const bad = page();
    bad.nodes[1]!.requires = 'inconnu';
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });

  it('refusent un cycle de prérequis', () => {
    const bad = page();
    bad.nodes[0]!.requires = bad.nodes[3]!.id; // root -> deep -> left -> root
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });

  it('refusent un groupe exclusif d’un seul nœud', () => {
    const bad = page();
    delete (bad.nodes[2] as { group?: string }).group;
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });

  it('refusent un ajustement sur un champ que la brique n’a pas', () => {
    const bad = page();
    bad.nodes[0]!.mods = [
      { type: 'scaleEffect', slot: 'a', kind: 'heal', field: 'duration', mulPct: 10 },
    ] as never;
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });

  it('exigent add ou mulPct pour un ajustement', () => {
    const bad = page();
    bad.nodes[0]!.mods = [
      { type: 'scaleEffect', slot: 'a', kind: 'damage', field: 'power' },
    ] as never;
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });

  it('refusent un coût sur l’attaque de base', () => {
    const bad = page();
    bad.nodes[0]!.mods = [{ type: 'cost', slot: 'basic', delta: -1 }] as never;
    expect(talentPageSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ennemis, objets, donjons', () => {
  it('acceptent les fixtures', () => {
    expect(enemySchema.safeParse(enemyFixture).success).toBe(true);
    expect(itemSchema.safeParse(itemFixture).success).toBe(true);
    expect(dungeonSchema.safeParse(dungeonFixture).success).toBe(true);
  });

  it('refusent un script qui cite un sort inconnu', () => {
    const bad = clone(enemyFixture);
    bad.script[0]!.skill = 'fantome';
    expect(enemySchema.safeParse(bad).success).toBe(false);
  });

  it('exigent une règle de cible pour un sort à cible unique, et « auto » sinon', () => {
    const single = clone(enemyFixture);
    single.script[0]!.target = 'auto';
    expect(enemySchema.safeParse(single).success).toBe(false);
    const aoe = clone(enemyFixture);
    aoe.script[1]!.target = 'first';
    expect(enemySchema.safeParse(aoe).success).toBe(false);
  });

  it('refusent des sorts en double', () => {
    const bad = clone(enemyFixture);
    bad.skills.push(clone(bad.skills[0]!));
    expect(enemySchema.safeParse(bad).success).toBe(false);
  });

  it('exigent 3 combats par donjon', () => {
    const bad = clone(dungeonFixture);
    bad.encounters.pop();
    expect(dungeonSchema.safeParse(bad).success).toBe(false);
  });

  it('limitent un combat à MAX_SIDE ennemis', () => {
    const bad = clone(dungeonFixture);
    bad.encounters[0]!.enemies = Array.from({ length: MAX_SIDE + 1 }, (_, i) => `e${String(i)}`);
    expect(dungeonSchema.safeParse(bad).success).toBe(false);
  });
});

describe('parseContent : références croisées', () => {
  it('accepte un contenu cohérent', () => {
    const content = parseContent(rawFixture());
    expect(content.heroById.get('test_hero')?.id).toBe('test_hero');
    expect(content.enemyById.size).toBe(2);
    expect(content.itemById.size).toBe(2);
    expect(content.dungeonById.get('test_dungeon')?.encounters).toHaveLength(3);
  });

  const expectIssue = (mutate: (raw: RawContent) => void, fragment: string): void => {
    const raw = rawFixture();
    mutate(raw);
    try {
      parseContent(raw);
      expect.unreachable('parseContent aurait dû échouer');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      expect((error as ContentError).issues.join('\n')).toContain(fragment);
    }
  };

  it('refuse un ennemi inconnu dans un donjon', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).encounters[0]!.enemies = ['fantome'];
    }, 'ennemi inconnu');
  });

  it('exige un boss dans le dernier combat uniquement', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).encounters[2]!.enemies = ['test_grunt'];
    }, 'dernier combat doit contenir un boss');
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).encounters[0]!.enemies = ['test_boss'];
    }, 'seul le dernier combat contient un boss');
  });

  it('exige un objet rare dans chaque table de butin', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).loot = ['test_charm', 'test_charm'];
    }, 'au moins un objet rare');
  });

  it('refuse un objet de butin inconnu et un héros débloqué inconnu', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).loot = ['fantome', 'test_relic'];
    }, 'objet de butin inconnu');
    expectIssue((raw) => {
      (raw.dungeons[0] as Record<string, unknown>).unlocksHero = 'fantome';
    }, 'héros débloqué inconnu');
  });

  it('refuse un palier de coffre inconnu', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).chest = 'diamant';
    }, 'palier de coffre inconnu');
  });

  it('refuse un niveau recommandé au-dessus du niveau maximum', () => {
    expectIssue((raw) => {
      (raw.dungeons[0] as typeof dungeonFixture).recommendedLevel = 99;
    }, 'niveau maximum');
  });

  it('refuse une petite stat d’objet au-dessus du plafond', () => {
    expectIssue((raw) => {
      (raw.items[0] as typeof itemFixture).stat.pct = 50;
    }, 'plafond');
  });

  it('refuse un identifiant de sort réutilisé entre un héros et un ennemi', () => {
    expectIssue((raw) => {
      (raw.enemies[0] as typeof enemyFixture).skills[0]!.id = 'test_strike';
      (raw.enemies[0] as typeof enemyFixture).script[0]!.skill = 'test_strike';
    }, 'utilisé par');
  });

  it('exige au moins un héros de départ, jamais offert par un donjon', () => {
    expectIssue((raw) => {
      (raw.heroes[0] as Record<string, unknown>).starter = false;
    }, 'aucun héros de départ');
    expectIssue((raw) => {
      (raw.dungeons[0] as Record<string, unknown>).unlocksHero = 'test_hero';
    }, 'de départ et débloqué par un donjon');
  });

  it('un héros de départ ou de donjon est commun ou rare', () => {
    expectIssue((raw) => {
      (raw.heroes[0] as Record<string, unknown>).tier = 3;
    }, 'commun ou rare');
  });

  it('borne les stats d’un héros par sa rareté', () => {
    const rich = { ...clone(heroFixture), id: 'test_rich', starter: false, tier: 2 };
    rich.stats = { hp: 400, atk: 50, def: 20, vit: 103 }; // +3 % sur une stat : dans le budget
    const content = parseContent({ ...rawFixture(), heroes: [clone(heroFixture), rename(rich)] });
    expect(content.heroById.get('test_rich')?.tier).toBe(2);
    expectIssue((raw) => {
      const greedy = { ...rename(rich), stats: { hp: 480, atk: 60, def: 24, vit: 100 } };
      Object.assign(raw, { heroes: [clone(heroFixture), greedy] });
    }, 'budget de sa rareté');
    expect(TIER_STAT_BUDGET_PCT).toBeGreaterThan(0);
  });

  it('refuse des doublons d’identifiant de héros', () => {
    expectIssue((raw) => {
      Object.assign(raw, { heroes: [clone(heroFixture), clone(heroFixture)] });
    }, 'identifiant en double');
  });

  it('exige moins de points de talent que de nœuds', () => {
    expectIssue((raw) => {
      (raw.balance as typeof balanceJson).progression.talentPointLevels = Array.from(
        { length: 20 },
        (_, i) => i + 1,
      );
    }, 'moins de points que de nœuds');
  });

  it('remonte les erreurs de schéma avec le chemin fautif', () => {
    expectIssue((raw) => {
      (raw.heroes[0] as typeof heroFixture).stats.hp = -5;
    }, 'stats.hp');
  });

  it('remonte les erreurs de balance', () => {
    expectIssue((raw) => {
      raw.balance = { version: 1 };
    }, 'balance :');
  });
});

describe('contenu embarqué', () => {
  it('se charge et se valide', () => {
    const content = loadContent();
    expect(content.balance.combat.teamPoints.cap).toBe(6);
  });
});
