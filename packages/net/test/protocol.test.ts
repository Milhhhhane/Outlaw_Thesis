import { describe, expect, it } from 'vitest';
import {
  encodeMessage,
  ERROR_CODES,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  utf8Length,
  type ClientMessage,
} from '../src';
import { HELLO, Replica, squad, Table, teamRequest } from './helpers';

const examples: ClientMessage[] = [
  HELLO,
  {
    type: 'set_rules',
    rules: { maxLevel: 12, items: false, tierBudget: 6, turnSeconds: 45 },
  },
  { type: 'set_team', heroes: teamRequest(squad('a'), { items: [[1], [], [7, 4]] }).heroes },
  { type: 'ready' },
  { type: 'action', spell: 'pyra_spark', target: 'p2_cendre' },
  { type: 'action', spell: 'pyra_kindle' },
  { type: 'claim_timeout' },
  { type: 'emote', id: 0 },
  { type: 'emote', id: 5 },
  { type: 'resync' },
  { type: 'rematch' },
  { type: 'leave' },
];

describe('messages client', () => {
  it.each(examples.map((msg) => [msg.type, msg] as const))('%s : aller-retour', (_type, msg) => {
    const parsed = parseClientMessage(encodeMessage(msg));
    expect(parsed).toEqual({ ok: true, msg });
  });

  it('la version du protocole est un entier positif', () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  it('refuse un message trop gros, mesuré en octets et non en caractères', () => {
    const base = { type: 'set_team', heroes: [] };
    expect(parseClientMessage(JSON.stringify(base)).ok).toBe(true);
    const padded = JSON.stringify({ ...base, pad: 'x'.repeat(MAX_MESSAGE_BYTES) });
    expect(parseClientMessage(padded)).toEqual({ ok: false, code: 'too_large' });
    // 1 400 caractères de 3 octets : 4 200 octets pour moins de 4 096 caractères.
    const wide = JSON.stringify({ type: 'hello', v: 1, contentHash: '€'.repeat(1400) });
    expect(wide.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(utf8Length(wide)).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(wide)).toEqual({ ok: false, code: 'too_large' });
  });

  it('accepte un message pile à la taille maximale', () => {
    // contentHash est borné à 64 caractères : on complète avec des espaces JSON, qui ne comptent pas.
    const text = JSON.stringify({ type: 'ready' }).padEnd(MAX_MESSAGE_BYTES, ' ');
    expect(utf8Length(text)).toBe(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(text)).toEqual({ ok: true, msg: { type: 'ready' } });
    expect(parseClientMessage(`${text} `)).toEqual({ ok: false, code: 'too_large' });
  });

  it('compte les octets UTF-8 comme un encodeur, paires de substituts comprises', () => {
    const samples = ['', 'abc', 'é', '€', '😀', 'a😀€é', '\ud800', 'x\udc00y', '日本語'];
    for (const text of samples) {
      // Un substitut isolé est encodé en U+FFFD (3 octets) par TextEncoder : même compte.
      expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
    }
  });

  it('refuse un JSON invalide', () => {
    for (const text of ['', '{', 'nope', '{"type":"ready"', '[1,2', "{'type':'ready'}"]) {
      expect(parseClientMessage(text)).toEqual({ ok: false, code: 'bad_json' });
    }
    expect(parseClientMessage(undefined as unknown as string).ok).toBe(false);
  });

  it('refuse un message qui ne respecte pas le schéma', () => {
    const bad: unknown[] = [
      null,
      42,
      'ready',
      [],
      {},
      { type: 'nope' },
      { type: 'ready', extra: 1 },
      { type: 'hello', v: 1 },
      { type: 'hello', v: '1', contentHash: 'abc' },
      { type: 'hello', v: 1, contentHash: '' },
      { type: 'hello', v: 1, contentHash: 'abc', player: 'p1' },
      { type: 'action' },
      { type: 'action', spell: 'Pyra Spark' },
      { type: 'action', spell: 'pyra_spark', unit: 'p1_pyra' },
      { type: 'action', spell: 'pyra_spark', target: 3 },
      { type: 'emote', id: 6 },
      { type: 'emote', id: -1 },
      { type: 'emote', id: 1.5 },
      { type: 'emote', id: '1' },
      { type: 'emote', text: 'bonjour' },
      { type: 'set_rules' },
      { type: 'set_rules', rules: { maxLevel: 30, items: true, tierBudget: null } },
      {
        type: 'set_rules',
        rules: { maxLevel: 31, items: true, tierBudget: null, turnSeconds: 30 },
      },
      { type: 'set_rules', rules: { maxLevel: 30, items: true, tierBudget: 2, turnSeconds: 30 } },
      {
        type: 'set_rules',
        rules: { maxLevel: 30, items: true, tierBudget: null, turnSeconds: 25 },
      },
      {
        type: 'set_rules',
        rules: { maxLevel: 30, items: true, tierBudget: null, turnSeconds: 30, extra: true },
      },
      { type: 'set_team', heroes: [{ hero: 'pyra', slot: 0, talents: [], items: [], extra: 1 }] },
      { type: 'set_team', heroes: [{ hero: 'pyra', slot: 0, talents: [], items: [-1] }] },
      { type: 'set_team', heroes: [{ hero: 'pyra', slot: 0.5, talents: [], items: [] }] },
      {
        type: 'set_team',
        heroes: Array.from({ length: 7 }, () => ({
          hero: 'pyra',
          slot: 0,
          talents: [],
          items: [],
        })),
      },
    ];
    for (const value of bad) {
      const parsed = parseClientMessage(JSON.stringify(value));
      expect(parsed.ok, JSON.stringify(value)).toBe(false);
      if (!parsed.ok) expect(parsed.code).toBe('bad_schema');
    }
  });

  it('le détail d’un refus de schéma reste court', () => {
    const parsed = parseClientMessage(JSON.stringify({ type: 'ready', ['x'.repeat(300)]: 1 }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.detail ?? '').length).toBeLessThanOrEqual(200);
  });
});

describe('messages serveur', () => {
  it('tout ce qu’un vrai combat envoie est lisible, et le client rejoue à l’identique', () => {
    const table = new Table();
    table.startBattle();
    table.playOut();
    table.send('p1', { type: 'rematch' });
    table.send('p2', { type: 'rematch' });
    table.playOut();
    for (const player of ['p1', 'p2'] as const) {
      const replica = new Replica();
      const types = new Set<string>();
      for (const msg of table.inbox[player]) {
        const parsed = parseServerMessage(encodeMessage(msg));
        expect(parsed.ok).toBe(true);
        types.add(msg.type);
        replica.receive(msg);
      }
      expect([...types].sort()).toEqual(['applied', 'battle_start', 'result', 'room']);
      expect(replica.mismatches).toBe(0);
      expect(replica.applied).toBeGreaterThan(20);
      expect(replica.state?.result).not.toBeNull();
    }
  });

  it('refuse un message serveur invalide ou en trop', () => {
    expect(parseServerMessage('nope')).toEqual({ ok: false, detail: 'JSON invalide' });
    expect(parseServerMessage('{"type":"emote","id":9}').ok).toBe(false);
    expect(parseServerMessage('{"type":"emote","id":2,"from":"p1"}').ok).toBe(false);
    expect(parseServerMessage('{"type":"error","code":"boom"}').ok).toBe(false);
    expect(
      parseServerMessage('{"type":"result","winner":"player","reason":"annihilation","x":1}').ok,
    ).toBe(false);
    expect(
      parseServerMessage('{"type":"result","winner":null,"reason":"forfeit","draw":true}').ok,
    ).toBe(true);
    expect(parseServerMessage('{"type":"error","code":"too_large"}').ok).toBe(true);
  });

  it('chaque code d’erreur est unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
