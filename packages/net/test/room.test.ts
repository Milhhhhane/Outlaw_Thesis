import { createBattle, hashState, step, type BattleSetup, type UnitDef } from '@outlaw/engine';
import { describe, expect, it } from 'vitest';
import {
  createRoom,
  deserializeRoom,
  EMOTE_COOLDOWN_MS,
  GRACE_MS,
  nextWakeUp,
  otherSide,
  parseClientMessage,
  receive,
  reduceRoom,
  restoreBattle,
  RoomFormatError,
  serializeRoom,
  viewFor,
  type ClientMessage,
  type PlayerId,
  type Room,
  type RoomContext,
  type RoomResult,
  type ServerMessage,
} from '../src';
import {
  balance,
  content,
  HELLO,
  Replica,
  richProfile,
  squad,
  Table,
  teamRequest,
} from './helpers';

const ACTION = (spell: string, target?: string): ClientMessage => ({
  type: 'action',
  spell,
  ...(target === undefined ? {} : { target }),
});

function errors(messages: readonly ServerMessage[]): string[] {
  return messages.flatMap((msg) => (msg.type === 'error' ? [msg.code] : []));
}

function resultOf(table: Table, player: PlayerId): RoomResult {
  const msg = table.lastOf(player, 'result');
  if (msg === undefined) throw new Error('pas de résultat');
  return {
    winner: msg.winner,
    reason: msg.reason,
    ...(msg.draw === undefined ? {} : { draw: msg.draw }),
  };
}

function lobbyWithBoth(): Table {
  const table = new Table();
  table.send('p1', HELLO);
  table.send('p2', HELLO);
  table.take('p1');
  table.take('p2');
  return table;
}

describe('connexion', () => {
  it('chacun reçoit sa vue du salon ; l’hôte est le joueur 1', () => {
    const table = new Table();
    table.send('p1', HELLO);
    const first = table.lastOf('p1', 'room')!.room;
    expect(first).toMatchObject({
      phase: 'lobby',
      you: 'p1',
      side: 'player',
      host: true,
      battle: 0,
      me: { connected: true, ready: false, team: null },
      opponent: {
        present: false,
        connected: false,
        ready: false,
        hasTeam: false,
        graceUntil: null,
      },
      rematch: { me: false, opponent: false },
      result: null,
    });
    table.send('p2', HELLO);
    expect(table.lastOf('p1', 'room')!.room.opponent).toMatchObject({
      present: true,
      connected: true,
    });
    expect(table.lastOf('p2', 'room')!.room).toMatchObject({
      you: 'p2',
      side: 'enemy',
      host: false,
    });
    expect(table.room.phase).toBe('lobby');
  });

  it('refuse une autre version du protocole et un autre contenu, sans rien changer', () => {
    const table = new Table();
    const before = table.room;
    table.send('p1', { ...HELLO, v: 2 } as ClientMessage);
    expect(errors(table.take('p1'))).toEqual(['version_mismatch']);
    table.send('p1', { type: 'hello', v: 1, contentHash: 'autre' });
    expect(errors(table.take('p1'))).toEqual(['content_mismatch']);
    expect(table.room).toBe(before);
  });

  it('tout message avant « hello » est refusé', () => {
    const table = new Table();
    const before = table.room;
    const messages: ClientMessage[] = [
      { type: 'ready' },
      { type: 'set_team', heroes: teamRequest(squad('a')).heroes },
      { type: 'set_rules', rules: table.room.rules },
      ACTION('pyra_spark', 'p2_cendre'),
      { type: 'emote', id: 1 },
      { type: 'resync' },
      { type: 'rematch' },
      { type: 'leave' },
      { type: 'claim_timeout' },
    ];
    for (const msg of messages) table.send('p1', msg);
    expect(errors(table.take('p1'))).toEqual(messages.map(() => 'hello_required'));
    expect(table.room).toBe(before);
  });

  it('un deuxième « hello » est inoffensif et renvoie la vue', () => {
    const table = lobbyWithBoth();
    const before = table.room;
    table.send('p1', HELLO);
    expect(table.room).toEqual(before);
    expect(table.lastOf('p1', 'room')).toBeDefined();
  });
});

describe('règles du salon', () => {
  const tight = { maxLevel: 10, items: true, tierBudget: null, turnSeconds: 45 } as const;

  it('seul l’hôte les change, et seulement avant le combat', () => {
    const table = lobbyWithBoth();
    table.send('p2', { type: 'set_rules', rules: tight });
    expect(errors(table.take('p2'))).toEqual(['not_host']);
    expect(table.room.rules.maxLevel).toBe(30);

    table.send('p1', { type: 'set_rules', rules: tight });
    expect(table.room.rules).toEqual(tight);
    expect(table.lastOf('p2', 'room')!.room.rules).toEqual(tight);

    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a'), { level: 10 }).heroes });
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('b'), { level: 10 }).heroes });
    table.send('p1', { type: 'ready' });
    table.send('p2', { type: 'ready' });
    expect(table.room.phase).toBe('battle');
    table.take('p1');
    table.send('p1', { type: 'set_rules', rules: { ...tight, turnSeconds: 20 } });
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
    expect(table.room.rules).toEqual(tight);
  });

  it('remettent les « prêt » à faux', () => {
    const table = lobbyWithBoth();
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a')).heroes });
    table.send('p1', { type: 'ready' });
    expect(table.room.players.p1.ready).toBe(true);
    table.send('p1', { type: 'set_rules', rules: { ...table.room.rules, turnSeconds: 60 } });
    expect(table.room.players.p1.ready).toBe(false);
    expect(table.lastOf('p2', 'room')!.room.opponent.ready).toBe(false);
  });

  it('revalident les équipes : une équipe devenue invalide est retirée, le joueur prévenu', () => {
    const table = lobbyWithBoth();
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('b'), { level: 30 }).heroes });
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a'), { level: 10 }).heroes });
    table.take('p1');
    table.take('p2');
    table.send('p1', { type: 'set_rules', rules: tight });
    const rejected = table.take('p2').filter((msg) => msg.type === 'error');
    expect(rejected).toEqual([
      { type: 'error', code: 'team_rejected', detail: 'talents_over_budget' },
    ]);
    expect(table.room.players.p2.team).toBeNull();
    expect(table.room.players.p1.team).not.toBeNull();
    expect(table.lastOf('p1', 'room')!.room.opponent.hasTeam).toBe(false);
    expect(errors(table.take('p1'))).toEqual([]);
  });

  it('recompilent une équipe encore valide au nouveau plafond de niveau', () => {
    const table = lobbyWithBoth();
    // Sans talent : valable à tout plafond.
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a'), { level: 1 }).heroes });
    const hp = (): number => table.room.players.p1.team!.units[0]!.stats.hp;
    const levels = (): number[] => table.room.players.p1.team!.builds.map((b) => b.level);
    expect(levels()).toEqual([30, 30, 30]);
    const full = hp();
    table.send('p1', { type: 'set_rules', rules: { ...table.room.rules, maxLevel: 12 } });
    expect(levels()).toEqual([12, 12, 12]);
    expect(hp()).toBeLessThan(full);
    table.send('p1', { type: 'set_rules', rules: { ...table.room.rules, maxLevel: 30 } });
    expect(hp()).toBe(full);
    // Les unités compilées ont toujours les identifiants du joueur.
    expect(table.room.players.p1.team!.units.map((u) => u.id)).toEqual([
      'p1_pyra',
      'p1_maree',
      'p1_ronce',
    ]);
  });

  it('un profil devenu introuvable retire l’équipe', () => {
    const table = lobbyWithBoth();
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a')).heroes });
    table.profiles.p1 = null;
    table.take('p1');
    table.send('p1', { type: 'set_rules', rules: { ...table.room.rules, turnSeconds: 20 } });
    expect(errors(table.take('p1'))).toEqual(['no_profile']);
    expect(table.room.players.p1.team).toBeNull();
  });
});

describe('équipes et départ du combat', () => {
  it('un refus de validateTeam renvoie son code et ne change rien', () => {
    const table = lobbyWithBoth();
    const before = table.room;
    const bad = teamRequest(['pyra', 'pyra', 'ronce']);
    table.send('p1', { type: 'set_team', heroes: bad.heroes });
    expect(table.take('p1')).toEqual([{ type: 'error', code: 'duplicate_hero', detail: 'pyra' }]);
    table.send('p1', { type: 'set_team', heroes: bad.heroes.slice(0, 2) });
    expect(errors(table.take('p1'))).toEqual(['team_size']);
    expect(table.room).toBe(before);
  });

  it('un joueur sans profil ne peut pas composer d’équipe', () => {
    const table = lobbyWithBoth();
    table.profiles.p2 = null;
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('a')).heroes });
    expect(errors(table.take('p2'))).toEqual(['no_profile']);
  });

  it('l’équipe reste privée jusqu’au combat, et seul son auteur la voit', () => {
    const table = lobbyWithBoth();
    table.send('p2', {
      type: 'set_team',
      heroes: teamRequest(squad('b'), { items: [[10], [], []] }).heroes,
    });
    const forP1 = JSON.stringify(table.inbox.p1);
    for (const hero of squad('b')) expect(forP1).not.toContain(hero);
    expect(table.lastOf('p1', 'room')!.room.opponent.hasTeam).toBe(true);
    const mine = table.lastOf('p2', 'room')!.room.me.team!;
    expect(mine.map((h) => h.hero)).toEqual(squad('b'));
    expect(mine[0]).toMatchObject({
      slot: 0,
      level: 30,
      items: [{ id: 'hunter_lens', upgrade: 3 }],
    });
  });

  it('« prêt » exige une équipe valide ; changer d’équipe retire le « prêt »', () => {
    const table = lobbyWithBoth();
    table.send('p1', { type: 'ready' });
    expect(errors(table.take('p1'))).toEqual(['team_required']);
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('a')).heroes });
    table.send('p1', { type: 'ready' });
    expect(table.room.players.p1.ready).toBe(true);
    table.send('p1', { type: 'set_team', heroes: teamRequest(squad('b')).heroes });
    expect(table.room.players.p1.ready).toBe(false);
  });

  it('le combat commence quand les deux sont prêts : révélation, priorité, chrono', () => {
    const table = new Table();
    table.coin = 'enemy';
    table.startBattle();
    const start1 = table.lastOf('p1', 'battle_start')!;
    const start2 = table.lastOf('p2', 'battle_start')!;
    expect(start1.you).toBe('player');
    expect(start2.you).toBe('enemy');
    expect(start1.setup).toEqual(start2.setup);
    expect(start1).toMatchObject({
      firstSide: 'enemy',
      actions: [],
      deadline: table.now + 30_000,
      serverNow: table.now,
      rules: table.room.rules,
    });
    expect(start1.setup.rules).toEqual({ firstSide: 'enemy', limit: 'hp_ratio' });
    const ids = start1.setup.units.map((u) => u.id);
    expect(ids).toEqual(['p1_pyra', 'p1_maree', 'p1_ronce', 'p2_cendre', 'p2_ressac', 'p2_seve']);
    expect(start1.setup.units.every((u) => u.controller === 'policy')).toBe(true);
    const state = table.state();
    // La priorité ne départage que les égalités : les unités sont rangées en commençant par son camp.
    expect(state.units[0]?.def.side).toBe('enemy');
    expect(start1.stateHash).toBe(hashState(state));
    expect(table.room.phase).toBe('battle');
    expect(table.lastOf('p1', 'room')!.room).toMatchObject({ phase: 'battle', battle: 0 });
  });

  it('revalide les équipes une dernière fois avec les profils du moment', () => {
    const table = lobbyWithBoth();
    table.send('p1', {
      type: 'set_team',
      heroes: teamRequest(squad('a'), { items: [[1], [], []] }).heroes,
    });
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('b')).heroes });
    table.send('p1', { type: 'ready' });
    // Entre-temps, p1 a perdu l’objet (sauvegarde remplacée).
    table.profiles.p1 = { ...richProfile, items: richProfile.items.filter((i) => i.uid !== 1) };
    table.take('p1');
    table.send('p2', { type: 'ready' });
    expect(table.room.phase).toBe('lobby');
    expect(table.take('p1')).toContainEqual({
      type: 'error',
      code: 'team_rejected',
      detail: 'item_not_owned',
    });
    expect(table.room.players.p1.team).toBeNull();
    expect(table.room.players.p1.ready).toBe(false);
    expect(table.room.players.p2.ready).toBe(true);
  });

  it('refuse un hello venu d’une place libre une fois le combat commencé', () => {
    const table = new Table();
    table.startBattle();
    table.send('p1', { type: 'leave' });
    table.take('p1');
    table.send('p1', HELLO);
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
  });
});

describe('un combat complet', () => {
  it('joué par l’action par défaut des deux côtés jusqu’au résultat', () => {
    const table = new Table();
    table.startBattle();
    const replicas = { p1: new Replica(), p2: new Replica() };
    table.playOut();
    expect(table.room.phase).toBe('ended');
    for (const player of ['p1', 'p2'] as const) {
      for (const msg of table.inbox[player]) replicas[player].receive(msg);
      expect(replicas[player].mismatches).toBe(0);
      expect(replicas[player].state?.result).toEqual(table.state().result);
    }
    const result = resultOf(table, 'p1');
    expect(resultOf(table, 'p2')).toEqual(result);
    const engine = table.state().result!;
    expect(result).toMatchObject({ winner: engine.winner, reason: engine.reason });
    expect(['annihilation', 'action_limit']).toContain(result.reason);
    expect(table.room.result).toEqual(result);
    expect(table.room.battle!.deadline).toBeNull();
    // Le dernier « applied » annonce la fin sans échéance ; chaque autre une nouvelle échéance.
    const applied = table.inbox.p1.filter((m) => m.type === 'applied');
    expect(applied.at(-1)!.deadline).toBeNull();
    expect(applied.slice(0, -1).every((m) => m.deadline === table.now + 30_000)).toBe(true);
    expect(table.lastOf('p1', 'room')!.room).toMatchObject({ phase: 'ended', result });
  });

  it('la partie reconstruite par rejeu est celle du serveur', () => {
    const table = new Table();
    table.startBattle();
    table.playOut();
    const direct = createBattle(table.room.battle!.setup, balance);
    let state = direct.state;
    for (const logged of table.room.battle!.actions) {
      state = step(state, { type: 'cast', ...logged }).state;
    }
    expect(hashState(state)).toBe(hashState(table.state()));
  });
});

describe('actions refusées', () => {
  function started(): Table {
    const table = new Table();
    table.startBattle();
    table.take('p1');
    table.take('p2');
    return table;
  }
  function unchanged(table: Table, player: PlayerId, msg: ClientMessage, code: string): void {
    const before = table.room;
    const update = table.send(player, msg);
    expect(table.take(player)).toEqual([expect.objectContaining({ type: 'error', code })]);
    expect(table.take(player === 'p1' ? 'p2' : 'p1')).toEqual([]);
    expect(update.room).toBe(before);
  }

  it('hors tour : l’état ne change pas', () => {
    const table = started();
    const { player, action } = table.turn();
    const other: PlayerId = player === 'p1' ? 'p2' : 'p1';
    unchanged(table, other, ACTION(action.spell, action.target), 'not_your_turn');
  });

  it('coût trop haut', () => {
    const table = started();
    const { player } = table.turn();
    const state = table.state();
    const caster = state.units.find((u) => u.def.id === state.active)!;
    const ult = caster.def.spells.find((s) => s.slot === 'ult')!;
    expect(ult.cost).toBeGreaterThan(state.points[caster.def.side]);
    const foe = state.units.find((u) => u.def.side !== caster.def.side)!;
    unchanged(
      table,
      player,
      ACTION(ult.id, ult.targeting === 'enemy' ? foe.def.id : undefined),
      'illegal_action',
    );
  });

  it('cible invalide ou manquante, sort inconnu, sort d’une autre unité', () => {
    const table = started();
    const { player, action } = table.turn();
    const state = table.state();
    const mate = state.units.find(
      (u) =>
        u.def.side === state.units.find((x) => x.def.id === state.active)!.def.side &&
        u.def.id !== state.active,
    )!;
    const foe = state.units.find((u) => u.def.side !== mate.def.side)!;
    const spell = action.spell;
    unchanged(table, player, ACTION(spell, mate.def.id), 'illegal_action'); // un allié pour une attaque
    unchanged(table, player, ACTION(spell, 'p9_nobody'), 'illegal_action');
    unchanged(table, player, ACTION(spell), 'illegal_action'); // cible manquante
    unchanged(table, player, ACTION('ghost_spell', foe.def.id), 'illegal_action');
    const foreign = foe.def.spells.find((s) => s.slot === 'basic')!;
    unchanged(table, player, ACTION(foreign.id, foe.def.id), 'illegal_action');
    // Un sort sans choix de cible n'accepte pas de cible.
    const caster = state.units.find((u) => u.def.id === state.active)!;
    const selfSpell = caster.def.spells.find(
      (s) => s.targeting === 'self' || s.targeting === 'all_enemies',
    );
    if (selfSpell !== undefined)
      unchanged(table, player, ACTION(selfSpell.id, foe.def.id), 'illegal_action');
  });

  it('une cible tombée est refusée', () => {
    const room = playTo(
      craftedRoom([
        lethalUnit('p1_a', 'player', 0),
        fragile('p2_a', 'enemy', 0),
        fragile('p2_b', 'enemy', 1),
      ]),
      [
        { player: 'p1', msg: ACTION('p1_a_basic', 'p2_a') },
        { player: 'p2', msg: ACTION('p2_b_basic', 'p1_a') },
      ],
    );
    const again = reduceRoom(
      room,
      { type: 'message', player: 'p1', msg: ACTION('p1_a_basic', 'p2_a') },
      ctxFor(room, 1_000_100),
    );
    expect(again.send.map((s) => s.msg)).toEqual([
      expect.objectContaining({ type: 'error', code: 'illegal_action' }),
    ]);
    expect(again.room).toBe(room);
  });

  it('hors combat : « wrong_phase »', () => {
    const table = lobbyWithBoth();
    table.send('p1', ACTION('pyra_spark', 'p2_cendre'));
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
    table.send('p1', { type: 'claim_timeout' });
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
    table.send('p1', { type: 'rematch' });
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
  });

  it('le message ne choisit jamais l’unité : l’identité vient de l’événement', () => {
    const table = started();
    const { player, action } = table.turn();
    const other: PlayerId = player === 'p1' ? 'p2' : 'p1';
    // Même texte, autre expéditeur : refusé ; le champ « unit » ou « player » n’existe pas dans le schéma.
    for (const extra of [{ unit: action.unit }, { player }, { from: player }]) {
      const text = JSON.stringify({
        type: 'action',
        spell: action.spell,
        target: action.target,
        ...extra,
      });
      const update = receive(table.room, other, text, table.ctx());
      expect(update.room).toBe(table.room);
      expect(update.send).toHaveLength(1);
      expect(update.send[0]).toMatchObject({
        to: other,
        msg: { type: 'error', code: 'bad_schema' },
      });
    }
    const ok = receive(
      table.room,
      player,
      JSON.stringify(ACTION(action.spell, action.target)),
      table.ctx(),
    );
    expect(ok.room).not.toBe(table.room);
  });
});

/* Salons fabriqués à la main : cas que les vrais héros ne produisent pas facilement. */

function lethalUnit(id: string, side: 'player' | 'enemy', slot: number, hp = 100): UnitDef {
  return {
    id,
    kind: id,
    side,
    slot,
    element: 'fire',
    role: null,
    boss: false,
    stats: { hp, atk: 100, def: 0, vit: 100 },
    spells: [
      {
        id: `${id}_basic`,
        slot: 'basic',
        targeting: 'enemy',
        element: 'fire',
        cost: 0,
        gain: 1,
        delay: 100,
        effects: [{ kind: 'damage', target: 'primary', power: 1000 }],
      },
    ],
    triggers: [],
    controller: 'policy',
    script: [],
  };
}

const fragile = (id: string, side: 'player' | 'enemy', slot: number): UnitDef => ({
  ...lethalUnit(id, side, slot, 50),
  stats: { hp: 50, atk: 1, def: 0, vit: 90 },
});

/** Un salon déjà en combat sur une configuration choisie. */
function craftedRoom(units: UnitDef[], firstSide: 'player' | 'enemy' = 'player'): Room {
  const base = createRoom();
  const player = {
    joined: true,
    connected: true,
    ready: true,
    team: null,
    graceUntil: null,
    timeouts: 0,
    emoteAt: null,
    rematch: false,
  };
  const setup: BattleSetup = { units, rules: { firstSide, limit: 'hp_ratio' } };
  return {
    ...base,
    phase: 'battle',
    players: { p1: player, p2: player },
    battle: { index: 0, firstSide, setup, actions: [], deadline: 1_030_000 },
  };
}

function ctxFor(_room: Room, now: number): RoomContext {
  return { ...new Table().ctx(), now };
}

function playTo(room: Room, moves: { player: PlayerId; msg: ClientMessage }[]): Room {
  let current = room;
  for (const move of moves) {
    current = reduceRoom(
      current,
      { type: 'message', player: move.player, msg: move.msg },
      ctxFor(current, 1_000_000),
    ).room;
  }
  return current;
}

describe('fin de combat particulière', () => {
  it('l’anéantissement simultané est un nul', () => {
    // Le sort touche l’ennemi puis soi-même : les deux camps tombent dans la même action.
    const suicide: UnitDef = {
      ...lethalUnit('p1_a', 'player', 0),
      spells: [
        {
          ...lethalUnit('p1_a', 'player', 0).spells[0]!,
          effects: [
            { kind: 'damage', target: 'primary', power: 1000 },
            { kind: 'damage', target: 'self', power: 1000 },
          ],
        },
      ],
    };
    const room = craftedRoom([suicide, fragile('p2_a', 'enemy', 0)]);
    const update = reduceRoom(
      room,
      { type: 'message', player: 'p1', msg: ACTION('p1_a_basic', 'p2_a') },
      ctxFor(room, 1_000_100),
    );
    const result = update.send.map((s) => s.msg).find((m) => m.type === 'result');
    expect(result).toEqual({ type: 'result', winner: null, reason: 'annihilation', draw: true });
    expect(update.room.phase).toBe('ended');
    expect(update.room.result).toEqual({ winner: null, reason: 'annihilation', draw: true });
  });

  it('l’anéantissement d’un camp donne la victoire à l’autre', () => {
    const room = craftedRoom([lethalUnit('p1_a', 'player', 0), fragile('p2_a', 'enemy', 0)]);
    const update = reduceRoom(
      room,
      { type: 'message', player: 'p1', msg: ACTION('p1_a_basic', 'p2_a') },
      ctxFor(room, 1_000_100),
    );
    expect(update.room.result).toEqual({ winner: 'player', reason: 'annihilation' });
    expect(update.send.filter((s) => s.msg.type === 'result')).toHaveLength(1);
  });

  it('à la limite d’actions, le ratio de PV décide ; une égalité est un nul', () => {
    const table = new Table();
    table.balance = { ...balance, combat: { ...balance.combat, actionLimit: 14 } };
    table.startBattle();
    table.playOut();
    const state = table.state();
    expect(state.result!.reason).toBe('action_limit');
    const ratio = (side: 'player' | 'enemy'): number => {
      const units = state.units.filter((u) => u.def.side === side);
      return units.reduce((s, u) => s + u.hp, 0) / units.reduce((s, u) => s + u.def.stats.hp, 0);
    };
    const expected =
      ratio('player') > ratio('enemy')
        ? 'player'
        : ratio('player') < ratio('enemy')
          ? 'enemy'
          : null;
    expect(table.room.result).toMatchObject({ winner: expected, reason: 'action_limit' });
    expect(table.room.result?.draw === true).toBe(expected === null);
  });
});

describe('chrono', () => {
  function started(): Table {
    const table = new Table();
    table.startBattle();
    table.take('p1');
    table.take('p2');
    return table;
  }

  it('rien ne se passe avant l’échéance', () => {
    const table = started();
    const before = table.room;
    const update = table.tick(29_999);
    expect(update.room).toBe(before);
    expect(update.send).toEqual([]);
  });

  it('à l’échéance, l’action par défaut est jouée pour le joueur lent', () => {
    const table = started();
    const slow = table.turn();
    const expected = slow.action;
    table.tick(30_000);
    const applied = table.lastOf('p1', 'applied')!;
    expect(applied).toMatchObject({
      actor: expected.unit,
      action: {
        spell: expected.spell,
        ...(expected.target === undefined ? {} : { target: expected.target }),
      },
      auto: 'timeout',
      deadline: table.now + 30_000,
    });
    expect(table.room.battle!.actions[0]).toMatchObject({ unit: expected.unit, auto: 'timeout' });
    expect(table.room.players[slow.player].timeouts).toBe(1);
    expect(table.lastOf('p2', 'applied')).toEqual(applied);
  });

  it('le chrono suit la règle du salon', () => {
    const table = new Table({ maxLevel: 30, items: true, tierBudget: null, turnSeconds: 20 });
    table.startBattle();
    expect(table.room.battle!.deadline).toBe(table.now + 20_000);
    table.tick(19_999);
    expect(table.room.battle!.actions).toHaveLength(0);
    table.tick(1);
    expect(table.room.battle!.actions).toHaveLength(1);
    expect(table.room.battle!.deadline).toBe(table.now + 20_000);
  });

  it('deux dépassements consécutifs du même joueur font perdre par forfait', () => {
    const table = started();
    const slow = table.turn().player;
    for (let guard = 0; guard < 60 && table.room.phase === 'battle'; guard++) {
      const { player, action } = table.turn();
      if (player === slow) table.tick(30_000);
      else table.send(player, ACTION(action.spell, action.target));
    }
    expect(table.room.phase).toBe('ended');
    expect(table.room.result).toEqual({
      winner: otherSide(slow === 'p1' ? 'player' : 'enemy'),
      reason: 'forfeit',
    });
    const autos = table.room.battle!.actions.filter((a) => a.auto === 'timeout');
    expect(autos).toHaveLength(1);
    expect(table.room.battle!.deadline).toBeNull();
  });

  it('une action jouée remet le compteur à zéro', () => {
    const table = started();
    const slow = table.turn().player;
    let timeouts = 0;
    let manual = 0;
    for (let guard = 0; guard < 80 && table.room.phase === 'battle' && manual < 3; guard++) {
      const { player, action } = table.turn();
      if (player === slow && timeouts === manual) {
        table.tick(30_000);
        timeouts++;
      } else {
        table.send(player, ACTION(action.spell, action.target));
        if (player === slow) manual++;
      }
    }
    // Plusieurs dépassements, jamais deux de suite : pas de forfait.
    expect(timeouts).toBeGreaterThanOrEqual(2);
    expect(table.room.result?.reason).not.toBe('forfeit');
  });

  it('claim_timeout : refusé tant que l’échéance n’est pas passée, sinon appliqué', () => {
    const table = started();
    const watcher: PlayerId = table.turn().player === 'p1' ? 'p2' : 'p1';
    const before = table.room;
    table.now += 10_000;
    table.send(watcher, { type: 'claim_timeout' });
    expect(errors(table.take(watcher))).toEqual(['not_expired']);
    expect(table.room).toBe(before);
    table.now += 20_000;
    table.send(watcher, { type: 'claim_timeout' });
    expect(table.lastOf(watcher, 'applied')!.auto).toBe('timeout');
    expect(errors(table.take(watcher))).toEqual([]);
    expect(table.room.battle!.actions).toHaveLength(1);
  });

  it('une action qui arrive après l’échéance est jugée sur l’état d’après le dépassement', () => {
    const table = started();
    const { player, action } = table.turn();
    table.now += 30_001;
    table.send(player, ACTION(action.spell, action.target));
    expect(table.room.battle!.actions[0]).toMatchObject({ unit: action.unit, auto: 'timeout' });
    // L’action tardive n’a pas été jouée en plus : au plus une action de plus si c’est encore son tour.
    expect(table.room.battle!.actions.length).toBeLessThanOrEqual(2);
    expect(
      table.room.battle!.actions.filter((a) => a.auto === undefined).length,
    ).toBeLessThanOrEqual(1);
  });

  it('nextWakeUp annonce la plus proche échéance', () => {
    const table = new Table({ maxLevel: 30, items: true, tierBudget: null, turnSeconds: 60 });
    expect(nextWakeUp(table.room)).toBeNull();
    table.startBattle();
    expect(table.turn().player).toBe('p1');
    const start = table.now;
    expect(nextWakeUp(table.room)).toBe(start + 60_000);

    table.now += 5_000;
    table.disconnect('p2'); // grâce jusqu'à +65 s, chrono à +60 s : le chrono d'abord
    expect(nextWakeUp(table.room)).toBe(start + 60_000);

    table.now += 5_000;
    const { action } = table.turn();
    table.send('p1', ACTION(action.spell, action.target)); // nouveau chrono : +70 s, la grâce passe avant
    expect(nextWakeUp(table.room)).toBe(start + 65_000);

    const finished = new Table();
    finished.startBattle();
    finished.playOut();
    expect(nextWakeUp(finished.room)).toBeNull();
    expect(nextWakeUp(createRoom())).toBeNull();
  });
});

describe('déconnexion', () => {
  const longTurns = { maxLevel: 30, items: true, tierBudget: null, turnSeconds: 60 } as const;

  function started(): Table {
    const table = new Table(longTurns);
    table.startBattle();
    table.take('p1');
    table.take('p2');
    return table;
  }

  it('l’adversaire est prévenu et voit la fin de la période de grâce', () => {
    const table = started();
    table.now += 10_000;
    table.disconnect('p2');
    expect(table.room.phase).toBe('battle');
    expect(table.room.players.p2.graceUntil).toBe(table.now + GRACE_MS);
    const view = table.lastOf('p1', 'room')!.room;
    expect(view.opponent).toMatchObject({ connected: false, graceUntil: table.now + GRACE_MS });
    expect(table.inbox.p2).toEqual([]);
  });

  it('revenir pendant la grâce reprend le combat là où il en était', () => {
    const table = started();
    for (let i = 0; i < 3; i++) {
      const { player, action } = table.turn();
      table.send(player, ACTION(action.spell, action.target));
    }
    table.now += 10_000;
    table.disconnect('p2');
    table.now += 30_000;
    table.send('p2', HELLO);
    expect(table.room.players.p2).toMatchObject({ connected: true, graceUntil: null });
    const start = table.lastOf('p2', 'battle_start')!;
    expect(start.you).toBe('enemy');
    expect(start.actions).toEqual([...table.room.battle!.actions]);
    expect(start.actions).toHaveLength(3);
    const replica = new Replica();
    replica.receive(start);
    expect(replica.mismatches).toBe(0);
    expect(hashState(replica.state!)).toBe(hashState(table.state()));
    // Passé l’ancienne échéance de grâce, rien ne se termine.
    table.tick(GRACE_MS);
    expect(table.room.result?.reason).not.toBe('disconnect');
    expect(table.lastOf('p1', 'room')!.room.opponent).toMatchObject({
      connected: true,
      graceUntil: null,
    });
  });

  it('au bout de 60 s sans retour, le joueur absent perd', () => {
    const table = started();
    table.now += 10_000;
    table.disconnect('p2');
    table.tick(GRACE_MS - 1);
    expect(table.room.result).toBeNull();
    table.tick(1);
    expect(table.room.phase).toBe('ended');
    expect(table.room.result).toEqual({ winner: 'player', reason: 'disconnect' });
    expect(resultOf(table, 'p1')).toEqual({ winner: 'player', reason: 'disconnect' });
  });

  it('deux absents : le premier à expirer perd ; au même instant, nul', () => {
    const table = started();
    table.now += 5_000;
    table.disconnect('p1');
    table.now += 10_000;
    table.disconnect('p2');
    table.tick(GRACE_MS * 2);
    expect(table.room.result).toEqual({ winner: 'enemy', reason: 'disconnect' });

    const tie = started();
    tie.now += 5_000;
    tie.disconnect('p1');
    tie.disconnect('p2');
    tie.tick(GRACE_MS);
    expect(tie.room.result).toEqual({ winner: null, reason: 'disconnect', draw: true });
  });

  it('la grâce et le chrono se règlent dans l’ordre où ils sont arrivés', () => {
    // Chrono d'abord : p2 part à +40 s (grâce jusqu'à +100 s), le chrono tombe à +60 s.
    const first = started();
    first.now += 40_000;
    first.disconnect('p2');
    first.tick(20_000);
    expect(first.room.battle!.actions.some((a) => a.auto === 'timeout')).toBe(true);
    expect(first.room.phase).toBe('battle');
    first.tick(40_000);
    expect(first.room.result).toEqual({ winner: 'player', reason: 'disconnect' });

    // Grâce d'abord : p2 part, puis p1 joue et repousse le chrono au-delà de la grâce.
    const second = started();
    expect(second.turn().player).toBe('p1');
    second.now += 5_000;
    second.disconnect('p2');
    second.now += 5_000;
    const { action } = second.turn();
    second.send('p1', ACTION(action.spell, action.target));
    second.tick(60_000); // +70 s : grâce échue depuis +65 s, chrono échu à +70 s
    expect(second.room.result).toEqual({ winner: 'player', reason: 'disconnect' });
    expect(second.room.battle!.actions).toHaveLength(1);
  });

  it('un message d’un joueur déconnecté exige un nouveau « hello »', () => {
    const table = started();
    table.disconnect('p1');
    const before = table.room;
    table.send('p1', ACTION('pyra_spark', 'p2_cendre'));
    expect(errors(table.take('p1'))).toEqual(['hello_required']);
    expect(table.room).toBe(before);
  });

  it('au salon, partir retire le « prêt » et revenir garde l’équipe', () => {
    const table = lobbyWithBoth();
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('b')).heroes });
    table.send('p2', { type: 'ready' });
    table.disconnect('p2');
    expect(table.room.players.p2).toMatchObject({ connected: false, ready: false, joined: true });
    expect(table.room.players.p2.team).not.toBeNull();
    expect(table.room.phase).toBe('lobby');
    table.send('p2', HELLO);
    expect(table.lastOf('p2', 'room')!.room.me).toMatchObject({ connected: true, ready: false });
    expect(table.lastOf('p2', 'room')!.room.me.team).not.toBeNull();
  });

  it('un événement « disconnect » répété ne change rien', () => {
    const table = started();
    table.disconnect('p2');
    const grace = table.room.players.p2.graceUntil;
    table.now += 5_000;
    const update = table.disconnect('p2');
    expect(update.room).toBe(table.room);
    expect(table.room.players.p2.graceUntil).toBe(grace);
  });
});

describe('reprise', () => {
  it('resync renvoie la configuration et toutes les actions, avec l’empreinte', () => {
    const table = new Table();
    table.startBattle();
    for (let i = 0; i < 6; i++) {
      const { player, action } = table.turn();
      table.send(player, ACTION(action.spell, action.target));
    }
    table.take('p1');
    table.take('p2');
    table.send('p1', { type: 'resync' });
    const start = table.lastOf('p1', 'battle_start')!;
    expect(start.actions).toHaveLength(6);
    expect(start.setup).toEqual(table.room.battle!.setup);
    expect(start.stateHash).toBe(hashState(table.state()));
    expect(start.deadline).toBe(table.room.battle!.deadline);
    expect(table.lastOf('p1', 'room')).toBeDefined();
    expect(table.take('p2')).toEqual([]);
    const replica = new Replica();
    replica.receive(start);
    expect(replica.mismatches).toBe(0);
  });

  it('au salon, resync renvoie seulement la vue ; après le combat, aussi le résultat', () => {
    const table = lobbyWithBoth();
    table.send('p1', { type: 'resync' });
    expect(table.take('p1').map((m) => m.type)).toEqual(['room']);
    const done = new Table();
    done.startBattle();
    done.playOut();
    done.take('p1');
    done.send('p1', { type: 'resync' });
    expect(done.take('p1').map((m) => m.type)).toEqual(['battle_start', 'result', 'room']);
  });
});

describe('revanche', () => {
  it('les deux acceptent : mêmes équipes, priorité échangée, nouveau combat', () => {
    const table = new Table();
    table.coin = 'player';
    table.startBattle();
    const teams = JSON.stringify([table.room.players.p1.team, table.room.players.p2.team]);
    table.playOut();
    table.take('p1');

    table.send('p1', { type: 'rematch' });
    expect(table.room.phase).toBe('ended');
    expect(table.lastOf('p2', 'room')!.room.rematch).toEqual({ me: false, opponent: true });
    expect(table.lastOf('p1', 'room')!.room.rematch).toEqual({ me: true, opponent: false });

    table.send('p2', { type: 'rematch' });
    expect(table.room.phase).toBe('battle');
    expect(table.room.battle!.index).toBe(1);
    expect(table.room.battle!.firstSide).toBe('enemy');
    expect(table.room.battle!.actions).toEqual([]);
    expect(table.room.result).toBeNull();
    expect(JSON.stringify([table.room.players.p1.team, table.room.players.p2.team])).toBe(teams);
    const start = table.lastOf('p1', 'battle_start')!;
    expect(start.firstSide).toBe('enemy');
    expect(start.setup.rules).toEqual({ firstSide: 'enemy', limit: 'hp_ratio' });
    expect(table.state().units[0]?.def.side).toBe('enemy');
    expect(table.lastOf('p1', 'room')!.room).toMatchObject({
      phase: 'battle',
      battle: 1,
      rematch: { me: false, opponent: false },
    });

    table.playOut();
    table.send('p1', { type: 'rematch' });
    table.send('p2', { type: 'rematch' });
    expect(table.room.battle).toMatchObject({ index: 2, firstSide: 'player' });
  });

  it('hors fin de combat ou sans adversaire : refusé', () => {
    const table = new Table();
    table.startBattle();
    table.send('p1', { type: 'rematch' });
    expect(errors(table.take('p1'))).toEqual(['wrong_phase']);
    table.playOut();
    table.disconnect('p2');
    table.send('p1', { type: 'rematch' });
    expect(errors(table.take('p1'))).toEqual(['opponent_absent']);
  });

  it('une déconnexion annule la demande de revanche', () => {
    const table = new Table();
    table.startBattle();
    table.playOut();
    table.send('p1', { type: 'rematch' });
    table.disconnect('p1');
    expect(table.room.players.p1.rematch).toBe(false);
    table.send('p1', HELLO);
    table.send('p2', { type: 'rematch' });
    expect(table.room.phase).toBe('ended');
  });
});

describe('départ', () => {
  it('quitter en plein combat est un forfait', () => {
    const table = new Table();
    table.startBattle();
    table.take('p2');
    table.send('p1', { type: 'leave' });
    expect(table.room.phase).toBe('ended');
    expect(table.room.result).toEqual({ winner: 'enemy', reason: 'forfeit' });
    expect(table.lastOf('p2', 'result')).toEqual({
      type: 'result',
      winner: 'enemy',
      reason: 'forfeit',
    });
    expect(table.room.players.p1).toMatchObject({ joined: false, connected: false });
    // Plus personne à affronter.
    table.send('p2', { type: 'rematch' });
    expect(errors(table.take('p2'))).toEqual(['opponent_absent']);
  });

  it('au salon, l’invité libère sa place ; l’hôte ferme le salon', () => {
    const table = lobbyWithBoth();
    table.send('p2', { type: 'set_team', heroes: teamRequest(squad('b')).heroes });
    table.send('p2', { type: 'leave' });
    expect(table.room.players.p2).toMatchObject({ joined: false, connected: false, team: null });
    expect(table.closed).toBe(false);
    expect(table.lastOf('p1', 'room')!.room.opponent).toMatchObject({
      present: false,
      hasTeam: false,
    });
    table.send('p2', HELLO);
    expect(table.room.players.p2.joined).toBe(true);

    table.send('p1', { type: 'leave' });
    expect(table.closed).toBe(true);
    expect(table.take('p2')).toContainEqual({ type: 'error', code: 'room_closed' });
  });

  it('après le combat, le salon se ferme quand plus personne n’est connecté', () => {
    const table = new Table();
    table.startBattle();
    table.playOut();
    table.send('p1', { type: 'leave' });
    expect(table.closed).toBe(false);
    table.disconnect('p2');
    expect(table.closed).toBe(true);
  });
});

describe('émotes', () => {
  it('sont transmises à l’autre joueur seulement, avec un délai minimal', () => {
    const table = lobbyWithBoth();
    table.send('p1', { type: 'emote', id: 3 });
    expect(table.take('p2')).toEqual([{ type: 'emote', id: 3 }]);
    expect(table.take('p1')).toEqual([]);
    table.now += EMOTE_COOLDOWN_MS - 1;
    table.send('p1', { type: 'emote', id: 4 });
    expect(errors(table.take('p1'))).toEqual(['rate_limited']);
    expect(table.take('p2')).toEqual([]);
    table.now += 1;
    table.send('p1', { type: 'emote', id: 4 });
    expect(table.take('p2')).toEqual([{ type: 'emote', id: 4 }]);
    // L’autre joueur a son propre délai.
    table.send('p2', { type: 'emote', id: 0 });
    expect(table.take('p1')).toEqual([{ type: 'emote', id: 0 }]);
  });

  it('personne à qui parler : refusé', () => {
    const table = new Table();
    table.send('p1', HELLO);
    table.send('p1', { type: 'emote', id: 1 });
    expect(errors(table.take('p1'))).toEqual(['opponent_absent']);
  });

  it('fonctionnent pendant le combat', () => {
    const table = new Table();
    table.startBattle();
    table.take('p1');
    table.take('p2');
    table.send('p2', { type: 'emote', id: 5 });
    expect(table.take('p1')).toEqual([{ type: 'emote', id: 5 }]);
  });
});

describe('stockage', () => {
  it('sérialiser puis restaurer redonne le même salon et le même état de combat', () => {
    const table = new Table();
    table.startBattle();
    for (let i = 0; i < 9; i++) {
      const { player, action } = table.turn();
      table.send(player, ACTION(action.spell, action.target));
    }
    table.tick(30_000);
    const text = serializeRoom(table.room);
    const restored = deserializeRoom(text);
    expect(restored).toEqual(table.room);
    expect(serializeRoom(restored)).toBe(text);
    expect(hashState(restoreBattle(restored, balance))).toBe(hashState(table.state()));
    // Assez léger pour une clé de stockage de Durable Object.
    expect(text.length).toBeLessThan(128 * 1024);
  });

  it('la partie continue à l’identique depuis un salon restauré', () => {
    const live = new Table();
    live.startBattle();
    for (let i = 0; i < 7; i++) {
      const { player, action } = live.turn();
      live.send(player, ACTION(action.spell, action.target));
    }
    const resumed = new Table();
    resumed.room = deserializeRoom(serializeRoom(live.room));
    resumed.now = live.now;
    live.playOut();
    resumed.playOut();
    expect(serializeRoom(resumed.room)).toBe(serializeRoom(live.room));
    expect(resumed.inbox.p1.at(-1)).toEqual(live.inbox.p1.at(-1));
  });

  it('salon neuf, terminé et en revanche : mêmes garanties', () => {
    const fresh = createRoom();
    expect(deserializeRoom(serializeRoom(fresh))).toEqual(fresh);
    const table = new Table();
    table.startBattle();
    table.playOut();
    const ended = deserializeRoom(serializeRoom(table.room));
    expect(ended).toEqual(table.room);
    expect(hashState(restoreBattle(ended, balance))).toBe(hashState(table.state()));
  });

  it('refuse un texte qui n’est pas un salon de ce format', () => {
    const table = new Table();
    table.startBattle();
    const good = JSON.parse(serializeRoom(table.room)) as Record<string, unknown>;
    const bad: unknown[] = [
      'nope',
      null,
      {},
      { ...good, format: 2 },
      { ...good, phase: 'pause' },
      { ...good, extra: true },
      { ...good, rules: { ...(good.rules as object), turnSeconds: 25 } },
      { ...good, players: { p1: (good.players as { p1: unknown }).p1 } },
      { ...good, battle: { ...(good.battle as object), actions: [{ unit: 'p1_pyra' }] } },
    ];
    for (const value of bad) {
      expect(() =>
        deserializeRoom(typeof value === 'string' ? value : JSON.stringify(value)),
      ).toThrow(RoomFormatError);
    }
    expect(() => deserializeRoom('{')).toThrow(RoomFormatError);
    expect(() => restoreBattle(createRoom(), balance)).toThrow();
  });
});

describe('messages mal formés', () => {
  it('ne touchent pas au salon et ne reçoivent qu’une erreur', () => {
    const table = lobbyWithBoth();
    const cases: [string, string][] = [
      ['x'.repeat(5000), 'too_large'],
      ['{"type":"ready"', 'bad_json'],
      ['', 'bad_json'],
      ['{"type":"ready","player":"p2"}', 'bad_schema'],
      ['{"type":"emote","id":9}', 'bad_schema'],
      [
        '{"type":"set_team","heroes":[{"hero":"pyra","slot":0,"talents":[],"items":[],"level":99}]}',
        'bad_schema',
      ],
      ['{"type":"hello","v":1,"contentHash":"a","__proto__":{"admin":true}}', 'bad_schema'],
      ['{"type":"constructor"}', 'bad_schema'],
      ['[]', 'bad_schema'],
      ['null', 'bad_schema'],
    ];
    for (const [text, code] of cases) {
      const before = table.room;
      const update = receive(table.room, 'p1', text, table.ctx());
      expect(update.room).toBe(before);
      expect(update.send).toHaveLength(1);
      expect(update.send[0]).toMatchObject({ to: 'p1', msg: { type: 'error', code } });
      expect(update.closed).toBeUndefined();
    }
  });

  it('un message lisible passe par le même chemin que reduceRoom', () => {
    const table = new Table();
    const viaText = receive(table.room, 'p1', JSON.stringify(HELLO), table.ctx());
    const direct = reduceRoom(
      table.room,
      { type: 'message', player: 'p1', msg: HELLO },
      table.ctx(),
    );
    expect(viaText).toEqual(direct);
    expect(parseClientMessage(JSON.stringify(HELLO)).ok).toBe(true);
  });
});

describe('déterminisme', () => {
  it('mêmes entrées, mêmes sorties ; le réducteur ne modifie jamais ce qu’il reçoit', () => {
    const run = (freeze: boolean): string => {
      const table = new Table();
      table.freeze = freeze;
      table.startBattle();
      table.disconnect('p2');
      table.tick(10_000);
      table.send('p2', HELLO);
      table.playOut();
      table.send('p1', { type: 'rematch' });
      table.send('p2', { type: 'rematch' });
      table.tick(30_000);
      table.send('p1', { type: 'emote', id: 2 });
      return JSON.stringify([table.room, table.inbox]);
    };
    const first = run(false);
    expect(run(false)).toBe(first);
    expect(run(true)).toBe(first);
  });

  it('la vue d’un joueur ne dépend que du salon', () => {
    const table = new Table();
    table.startBattle();
    expect(viewFor(table.room, 'p1')).toEqual(viewFor(structuredClone(table.room), 'p1'));
    expect(content.heroes.length).toBeGreaterThan(0);
  });
});

describe('équité en miroir', () => {
  function mirrorOf(result: RoomResult | null): RoomResult | null {
    if (result === null) return null;
    return {
      winner: result.winner === null ? null : otherSide(result.winner),
      reason: result.reason,
      ...(result.draw === true ? { draw: true as const } : {}),
    };
  }

  function game(
    coin: 'player' | 'enemy',
    p1: readonly string[],
    p2: readonly string[],
    level = 30,
  ): Table {
    const table = new Table();
    table.coin = coin;
    table.startBattle({ p1: teamRequest(p1, { level }), p2: teamRequest(p2, { level }) });
    table.playOut();
    return table;
  }

  const squads = [
    squad('a'),
    squad('b'),
    ['pyra', 'ressac', 'seve'],
    ['maree', 'ronce', 'cendre'],
    ['ronce', 'seve', 'ressac'],
  ];

  it('mêmes équipes, priorité échangée : résultat et PV en miroir', () => {
    for (const [i, team] of squads.entries()) {
      const other = squads[(i + 1) % squads.length]!;
      for (const [x, y] of [
        [team, team],
        [team, other],
      ] as const) {
        for (const level of [30, 12]) {
          const direct = game('player', x, y, level);
          const mirrored = game('enemy', y, x, level);
          // Dans la seconde partie, p1 joue ce que p2 jouait dans la première : mêmes équipes, côtés échangés.
          expect(mirrored.room.result).toEqual(mirrorOf(direct.room.result));
          const a = direct.state();
          const b = mirrored.state();
          expect(b.actionCount).toBe(a.actionCount);
          for (const unit of a.units) {
            const twin = b.units.find(
              (u) =>
                u.def.id ===
                unit.def.id.replace(/^p(\d)/, (_m, n: string) => `p${n === '1' ? 2 : 1}`),
            );
            expect(twin?.hp).toBe(unit.hp);
            expect(twin?.alive).toBe(unit.alive);
          }
        }
      }
    }
  }, 60_000);
});
