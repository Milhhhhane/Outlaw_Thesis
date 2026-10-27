import type { Balance, Content, Profile } from '@outlaw/data';
import {
  createBattle,
  defaultAction,
  hashState,
  IllegalActionError,
  replay,
  step,
  type Action,
  type BattleResult,
  type BattleSetup,
  type BattleState,
  type HeroBuild,
  type Side,
  type UnitDef,
} from '@outlaw/engine';
import { contentHash } from './content';
import { opponentOf, otherSide, PLAYER_IDS, playerOf, sideOf, type PlayerId } from './players';
import {
  EMOTE_COOLDOWN_MS,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type RoomResult,
  type RoomView,
  type ServerMessage,
} from './protocol';
import { defaultRules, toBattleRules, type RoomRules } from './rules';
import type { LoggedAction } from './schemas';
import { compilePlayerTeam, validateTeam, type TeamRequest } from './team';

/**
 * Salon PvP : un réducteur pur et déterministe. (salon, événement, contexte) → (salon, messages).
 * Aucune horloge, aucun hasard, aucune entrée/sortie : l'heure et le tirage au sort viennent du
 * contexte, les messages sont rendus à l'appelant (le futur Durable Object) qui les expédie.
 * L'identité du joueur vient toujours de l'événement, jamais du contenu d'un message.
 */

/** Période de grâce d'un joueur déconnecté en plein combat, en ms. */
export const GRACE_MS = 60_000;

/** Dépassements consécutifs du chrono qui font perdre par forfait. */
export const FORFEIT_AFTER_TIMEOUTS = 2;

/** Format du salon sérialisé : à incrémenter si la forme de `Room` change. */
export const ROOM_FORMAT = 1;

/** Équipe validée d'un joueur : la demande (pour revalider si les règles changent) et ses unités. */
export interface TeamEntry {
  readonly request: TeamRequest;
  readonly builds: readonly HeroBuild[];
  readonly units: readonly UnitDef[];
}

export interface RoomPlayer {
  /** A dit « hello » et occupe sa place. */
  readonly joined: boolean;
  readonly connected: boolean;
  readonly ready: boolean;
  readonly team: TeamEntry | null;
  /** Fin de la période de grâce (ms), si le joueur est déconnecté en plein combat. */
  readonly graceUntil: number | null;
  /** Dépassements du chrono consécutifs de ce joueur. */
  readonly timeouts: number;
  /** Heure de la dernière émote (ms). */
  readonly emoteAt: number | null;
  /** Veut une revanche. */
  readonly rematch: boolean;
}

export interface RoomBattle {
  /** 0 pour le premier combat, +1 à chaque revanche. */
  readonly index: number;
  readonly firstSide: Side;
  readonly setup: BattleSetup;
  /** Actions jouées dans l'ordre : l'état se reconstruit par replay(setup, balance, actions). */
  readonly actions: readonly LoggedAction[];
  /** Échéance de l'action en cours (ms) ; null quand le combat est fini. */
  readonly deadline: number | null;
}

export type RoomPhase = 'lobby' | 'battle' | 'ended';

export interface Room {
  readonly format: typeof ROOM_FORMAT;
  readonly phase: RoomPhase;
  readonly rules: RoomRules;
  readonly players: Readonly<Record<PlayerId, RoomPlayer>>;
  readonly battle: RoomBattle | null;
  readonly result: RoomResult | null;
}

export interface RoomContext {
  /** Heure du serveur, en ms. */
  readonly now: number;
  /** Tirage au sort de la priorité pour un premier combat (fourni par l'appelant : le réducteur n'a pas de hasard). */
  readonly coin: Side;
  /** Profil d'un joueur (null si inconnu). Le profil est écrit par le client : voir docs/PVP.md. */
  readonly profileOf: (player: PlayerId) => Profile | null;
  readonly content: Content;
  readonly balance: Balance;
}

export type RoomEvent =
  | { readonly type: 'message'; readonly player: PlayerId; readonly msg: ClientMessage }
  /** La connexion d'un joueur s'est fermée. La reconnexion est un nouveau « hello ». */
  | { readonly type: 'disconnect'; readonly player: PlayerId }
  /** Le temps a passé : échéances de chrono et de grâce. */
  | { readonly type: 'tick' };

export interface Outgoing {
  readonly to: PlayerId | 'all';
  readonly msg: ServerMessage;
}

export interface RoomUpdate {
  readonly room: Room;
  readonly send: readonly Outgoing[];
  /** Vrai quand le salon peut être supprimé. */
  readonly closed?: boolean;
}

/* ------------------------------------------------------------------ création et lecture */

const emptyPlayer: RoomPlayer = {
  joined: false,
  connected: false,
  ready: false,
  team: null,
  graceUntil: null,
  timeouts: 0,
  emoteAt: null,
  rematch: false,
};

export function createRoom(rules: RoomRules = defaultRules): Room {
  return {
    format: ROOM_FORMAT,
    phase: 'lobby',
    rules,
    players: { p1: emptyPlayer, p2: emptyPlayer },
    battle: null,
    result: null,
  };
}

const toAction = (logged: LoggedAction): Action => ({
  type: 'cast',
  unit: logged.unit,
  spell: logged.spell,
  ...(logged.target === undefined ? {} : { target: logged.target }),
});

/** État du combat en cours (ou fini), reconstruit par rejeu de la configuration et des actions. */
export function restoreBattle(room: Room, balance: Balance): BattleState {
  if (room.battle === null) throw new Error("ce salon n'a pas encore de combat");
  return replay(room.battle.setup, balance, room.battle.actions.map(toAction)).state;
}

/** Prochaine heure à laquelle appeler « tick » (alarme), ou null si rien n'est en attente. */
export function nextWakeUp(room: Room): number | null {
  if (room.phase !== 'battle' || room.battle === null) return null;
  const times = [room.battle.deadline, room.players.p1.graceUntil, room.players.p2.graceUntil];
  const pending = times.filter((time): time is number => time !== null);
  return pending.length === 0 ? null : Math.min(...pending);
}

/** Le salon tel que le voit un joueur : l'équipe adverse reste cachée jusqu'au début du combat. */
export function viewFor(room: Room, player: PlayerId): RoomView {
  const me = room.players[player];
  const them = room.players[opponentOf(player)];
  return {
    phase: room.phase,
    you: player,
    side: sideOf(player),
    host: player === 'p1',
    rules: room.rules,
    battle: room.battle?.index ?? 0,
    me: {
      connected: me.connected,
      ready: me.ready,
      team:
        me.team?.builds.map((build, slot) => ({
          hero: build.hero,
          slot,
          level: build.level,
          talents: [...build.talents],
          items: build.items.map((item) => ({ id: item.id, upgrade: item.upgrade })),
        })) ?? null,
    },
    opponent: {
      present: them.joined,
      connected: them.connected,
      ready: them.ready,
      hasTeam: them.team !== null,
      graceUntil: them.graceUntil,
    },
    rematch: { me: me.rematch, opponent: them.rematch },
    result: room.result,
  };
}

/* ------------------------------------------------------------------ cumul des messages */

interface Out {
  readonly send: Outgoing[];
  /** Joueurs à qui renvoyer leur vue même si elle n'a pas changé (hello, resync). */
  readonly forceView: Set<PlayerId>;
  /** Vrai si une échéance de chrono a été traitée pendant cet événement. */
  timedOut: boolean;
  closed: boolean;
}

function tell(out: Out, to: PlayerId | 'all', msg: ServerMessage): void {
  out.send.push({ to, msg });
}

function fail(out: Out, to: PlayerId, code: ErrorCode, detail?: string): void {
  tell(out, to, {
    type: 'error',
    code,
    ...(detail === undefined ? {} : { detail: detail.slice(0, 200) }),
  });
}

function patchPlayer(room: Room, player: PlayerId, patch: Partial<RoomPlayer>): Room {
  return { ...room, players: { ...room.players, [player]: { ...room.players[player], ...patch } } };
}

const turnMs = (room: Room): number => room.rules.turnSeconds * 1000;

/* ------------------------------------------------------------------ combat */

function resultOf(result: BattleResult): RoomResult {
  return {
    winner: result.winner,
    reason: result.reason,
    ...(result.winner === null ? { draw: true as const } : {}),
  };
}

/** Termine le combat : les « prêt », revanches et délais retombent, la place reste. */
function finish(room: Room, result: RoomResult, out: Out): Room {
  tell(out, 'all', { type: 'result', ...result });
  const reset = { ready: false, rematch: false, graceUntil: null, timeouts: 0 } as const;
  return {
    ...room,
    phase: 'ended',
    result,
    battle: room.battle === null ? null : { ...room.battle, deadline: null },
    players: {
      p1: { ...room.players.p1, ...reset },
      p2: { ...room.players.p2, ...reset },
    },
  };
}

function battleStart(room: Room, state: BattleState, player: PlayerId, now: number): ServerMessage {
  const battle = room.battle;
  if (battle === null) throw new Error("ce salon n'a pas encore de combat");
  return {
    type: 'battle_start',
    setup: battle.setup,
    rules: room.rules,
    firstSide: battle.firstSide,
    you: sideOf(player),
    actions: [...battle.actions],
    stateHash: hashState(state),
    deadline: battle.deadline,
    serverNow: now,
  };
}

/** Lance un combat avec les équipes en place. */
function begin(room: Room, firstSide: Side, index: number, ctx: RoomContext, out: Out): Room {
  const { p1, p2 } = room.players;
  if (p1.team === null || p2.team === null) throw new Error('équipes manquantes');
  const setup: BattleSetup = {
    units: [...p1.team.units, ...p2.team.units],
    rules: toBattleRules(firstSide),
  };
  const created = createBattle(setup, ctx.balance);
  const reset = { ready: true, rematch: false, graceUntil: null, timeouts: 0 } as const;
  let next: Room = {
    ...room,
    phase: 'battle',
    result: null,
    battle: { index, firstSide, setup, actions: [], deadline: ctx.now + turnMs(room) },
    players: { p1: { ...p1, ...reset }, p2: { ...p2, ...reset } },
  };
  for (const player of PLAYER_IDS)
    tell(out, player, battleStart(next, created.state, player, ctx.now));
  if (created.state.result !== null) next = finish(next, resultOf(created.state.result), out);
  return next;
}

/** Joue une action (d'un joueur ou du serveur) et annonce le résultat. */
function commit(
  room: Room,
  state: BattleState,
  action: Action,
  auto: 'timeout' | undefined,
  ctx: RoomContext,
  out: Out,
): Room {
  const battle = room.battle;
  if (battle === null) throw new Error("ce salon n'a pas encore de combat");
  const next = step(state, action);
  const logged: LoggedAction = {
    unit: action.unit,
    spell: action.spell,
    ...(action.target === undefined ? {} : { target: action.target }),
    ...(auto === undefined ? {} : { auto }),
  };
  const over = next.state.result;
  const deadline = over === null ? ctx.now + turnMs(room) : null;
  tell(out, 'all', {
    type: 'applied',
    actor: action.unit,
    action: {
      spell: action.spell,
      ...(action.target === undefined ? {} : { target: action.target }),
    },
    ...(auto === undefined ? {} : { auto }),
    stateHash: hashState(next.state),
    deadline,
    serverNow: ctx.now,
  });
  let updated: Room = {
    ...room,
    battle: { ...battle, actions: [...battle.actions, logged], deadline },
  };
  if (auto === undefined) {
    // Une action jouée à la main remet à zéro le compteur de dépassements de son auteur.
    updated = patchPlayer(updated, playerOf(sideOfUnit(state, action.unit)), { timeouts: 0 });
  }
  return over === null ? updated : finish(updated, resultOf(over), out);
}

function sideOfUnit(state: BattleState, unit: string): Side {
  const found = state.units.find((candidate) => candidate.def.id === unit);
  if (found === undefined) throw new Error(`unité inconnue : ${unit}`);
  return found.def.side;
}

/** Le chrono de l'action en cours est dépassé : action par défaut, ou forfait au deuxième dépassement. */
function timeOut(room: Room, ctx: RoomContext, out: Out): Room {
  const state = restoreBattle(room, ctx.balance);
  if (state.active === null) return room;
  const side = sideOfUnit(state, state.active);
  const owner = playerOf(side);
  out.timedOut = true;
  if (room.players[owner].timeouts + 1 >= FORFEIT_AFTER_TIMEOUTS) {
    return finish(room, { winner: otherSide(side), reason: 'forfeit' }, out);
  }
  const counted = patchPlayer(room, owner, { timeouts: room.players[owner].timeouts + 1 });
  return commit(counted, state, defaultAction(state), 'timeout', ctx, out);
}

/** Une période de grâce est écoulée : le premier à avoir expiré perd, ex æquo : nul. */
function disconnectLoss(room: Room, expired: readonly PlayerId[], out: Out): Room {
  const at = (player: PlayerId): number => room.players[player].graceUntil ?? 0;
  const earliest = Math.min(...expired.map(at));
  const losers = expired.filter((player) => at(player) === earliest);
  const [loser] = losers;
  const result: RoomResult =
    losers.length === 1 && loser !== undefined
      ? { winner: otherSide(sideOf(loser)), reason: 'disconnect' }
      : { winner: null, reason: 'disconnect', draw: true };
  return finish(room, result, out);
}

/** Applique ce que l'heure a déjà décidé : grâce écoulée ou chrono dépassé, le plus ancien d'abord. */
function settle(room: Room, ctx: RoomContext, out: Out): Room {
  if (room.phase !== 'battle' || room.battle === null) return room;
  const { now } = ctx;
  const expiredGraces = (current: Room): PlayerId[] =>
    PLAYER_IDS.filter((player) => {
      const until = current.players[player].graceUntil;
      return until !== null && until <= now;
    });
  const earliestGrace = (current: Room, expired: readonly PlayerId[]): number =>
    Math.min(...expired.map((player) => current.players[player].graceUntil ?? now));

  const deadline = room.battle.deadline;
  const due = deadline !== null && deadline <= now;
  const graces = expiredGraces(room);
  if (graces.length > 0 && (!due || earliestGrace(room, graces) <= deadline)) {
    return disconnectLoss(room, graces, out);
  }
  if (!due) return room;
  const next = timeOut(room, ctx, out);
  if (next.phase !== 'battle') return next;
  const late = expiredGraces(next);
  return late.length > 0 ? disconnectLoss(next, late, out) : next;
}

/* ------------------------------------------------------------------ équipes */

/**
 * Revalide la demande d'équipe d'un joueur (règles changées, début de combat) avec son profil actuel.
 * Une équipe devenue invalide est retirée et le joueur en est informé.
 */
function refreshTeam(room: Room, player: PlayerId, ctx: RoomContext, out: Out): Room {
  const team = room.players[player].team;
  if (team === null) return room;
  const profile = ctx.profileOf(player);
  if (profile === null) {
    fail(out, player, 'no_profile');
    return patchPlayer(room, player, { team: null, ready: false });
  }
  const check = validateTeam({
    profile,
    request: team.request,
    rules: room.rules,
    content: ctx.content,
    balance: ctx.balance,
  });
  if (!check.ok) {
    fail(out, player, 'team_rejected', check.code);
    return patchPlayer(room, player, { team: null, ready: false });
  }
  const entry: TeamEntry = {
    request: team.request,
    builds: check.builds,
    units: compilePlayerTeam(ctx.content, check.builds, player),
  };
  return patchPlayer(room, player, { team: entry });
}

/* ------------------------------------------------------------------ messages */

function onHello(
  room: Room,
  player: PlayerId,
  msg: Extract<ClientMessage, { type: 'hello' }>,
  ctx: RoomContext,
  out: Out,
): Room {
  if (msg.v !== PROTOCOL_VERSION) {
    fail(out, player, 'version_mismatch', String(PROTOCOL_VERSION));
    return room;
  }
  if (msg.contentHash !== contentHash(ctx.content)) {
    fail(out, player, 'content_mismatch');
    return room;
  }
  // Personne ne rejoint un combat commencé ni un salon terminé ; on y revient seulement.
  if (!room.players[player].joined && room.phase !== 'lobby') {
    fail(out, player, 'wrong_phase');
    return room;
  }
  const joined = patchPlayer(room, player, { joined: true, connected: true, graceUntil: null });
  out.forceView.add(player);
  if (joined.battle !== null) {
    const state = restoreBattle(joined, ctx.balance);
    tell(out, player, battleStart(joined, state, player, ctx.now));
    if (joined.result !== null) tell(out, player, { type: 'result', ...joined.result });
  }
  return joined;
}

function onSetRules(
  room: Room,
  player: PlayerId,
  rules: RoomRules,
  ctx: RoomContext,
  out: Out,
): Room {
  if (player !== 'p1') {
    fail(out, player, 'not_host');
    return room;
  }
  if (room.phase !== 'lobby') {
    fail(out, player, 'wrong_phase');
    return room;
  }
  let next: Room = {
    ...room,
    rules,
    players: {
      p1: { ...room.players.p1, ready: false },
      p2: { ...room.players.p2, ready: false },
    },
  };
  for (const who of PLAYER_IDS) next = refreshTeam(next, who, ctx, out);
  return next;
}

function onSetTeam(
  room: Room,
  player: PlayerId,
  heroes: TeamRequest['heroes'],
  ctx: RoomContext,
  out: Out,
): Room {
  if (room.phase !== 'lobby') {
    fail(out, player, 'wrong_phase');
    return room;
  }
  const profile = ctx.profileOf(player);
  if (profile === null) {
    fail(out, player, 'no_profile');
    return room;
  }
  const request: TeamRequest = { heroes };
  const check = validateTeam({
    profile,
    request,
    rules: room.rules,
    content: ctx.content,
    balance: ctx.balance,
  });
  if (!check.ok) {
    fail(out, player, check.code, check.detail);
    return room;
  }
  const entry: TeamEntry = {
    request,
    builds: check.builds,
    units: compilePlayerTeam(ctx.content, check.builds, player),
  };
  return patchPlayer(room, player, { team: entry, ready: false });
}

function onReady(room: Room, player: PlayerId, ctx: RoomContext, out: Out): Room {
  if (room.phase !== 'lobby') {
    fail(out, player, 'wrong_phase');
    return room;
  }
  if (room.players[player].team === null) {
    fail(out, player, 'team_required');
    return room;
  }
  const ready = patchPlayer(room, player, { ready: true });
  if (!ready.players.p1.ready || !ready.players.p2.ready) return ready;
  // Les deux sont prêts : dernière vérification des équipes avec les profils du moment.
  let checked = ready;
  for (const who of PLAYER_IDS) checked = refreshTeam(checked, who, ctx, out);
  if (checked.players.p1.team === null || checked.players.p2.team === null) return checked;
  return begin(checked, ctx.coin, 0, ctx, out);
}

function onAction(
  room: Room,
  player: PlayerId,
  msg: Extract<ClientMessage, { type: 'action' }>,
  ctx: RoomContext,
  out: Out,
): Room {
  if (room.phase !== 'battle') {
    fail(out, player, 'wrong_phase');
    return room;
  }
  const state = restoreBattle(room, ctx.balance);
  if (state.active === null || playerOf(sideOfUnit(state, state.active)) !== player) {
    fail(out, player, 'not_your_turn');
    return room;
  }
  // L'unité n'est jamais lue dans le message : c'est l'unité active, dont le joueur est propriétaire.
  const action: Action = {
    type: 'cast',
    unit: state.active,
    spell: msg.spell,
    ...(msg.target === undefined ? {} : { target: msg.target }),
  };
  try {
    return commit(room, state, action, undefined, ctx, out);
  } catch (error) {
    if (error instanceof IllegalActionError) {
      // Le message « applied » n'a pas encore été émis : commit lève avant d'écrire quoi que ce soit.
      fail(out, player, 'illegal_action', error.message);
      return room;
    }
    throw error;
  }
}

function onEmote(room: Room, player: PlayerId, id: number, ctx: RoomContext, out: Out): Room {
  const other = opponentOf(player);
  if (!room.players[other].joined || !room.players[other].connected) {
    fail(out, player, 'opponent_absent');
    return room;
  }
  const last = room.players[player].emoteAt;
  if (last !== null && ctx.now - last < EMOTE_COOLDOWN_MS) {
    fail(out, player, 'rate_limited');
    return room;
  }
  tell(out, other, { type: 'emote', id });
  return patchPlayer(room, player, { emoteAt: ctx.now });
}

function onResync(room: Room, player: PlayerId, ctx: RoomContext, out: Out): Room {
  out.forceView.add(player);
  if (room.battle !== null) {
    tell(out, player, battleStart(room, restoreBattle(room, ctx.balance), player, ctx.now));
    if (room.result !== null) tell(out, player, { type: 'result', ...room.result });
  }
  return room;
}

function onRematch(room: Room, player: PlayerId, ctx: RoomContext, out: Out): Room {
  if (room.phase !== 'ended' || room.battle === null) {
    fail(out, player, 'wrong_phase');
    return room;
  }
  const other = room.players[opponentOf(player)];
  if (!other.joined || !other.connected) {
    fail(out, player, 'opponent_absent');
    return room;
  }
  const asked = patchPlayer(room, player, { rematch: true });
  if (!asked.players.p1.rematch || !asked.players.p2.rematch) return asked;
  // Mêmes équipes, priorité échangée.
  return begin(asked, otherSide(room.battle.firstSide), room.battle.index + 1, ctx, out);
}

function onLeave(room: Room, player: PlayerId, out: Out): Room {
  if (room.phase === 'lobby') {
    if (player === 'p1') {
      // L'hôte part : le salon n'a plus de raison d'être.
      tell(out, 'p2', { type: 'error', code: 'room_closed' });
      out.closed = true;
    }
    return patchPlayer(room, player, emptyPlayer);
  }
  if (room.phase === 'battle') {
    const ended = finish(room, { winner: otherSide(sideOf(player)), reason: 'forfeit' }, out);
    return patchPlayer(ended, player, { joined: false, connected: false });
  }
  return patchPlayer(room, player, emptyPlayer);
}

function onDisconnect(room: Room, player: PlayerId, ctx: RoomContext): Room {
  const me = room.players[player];
  if (!me.connected) return room;
  if (room.phase === 'battle') {
    return patchPlayer(room, player, { connected: false, graceUntil: ctx.now + GRACE_MS });
  }
  return patchPlayer(room, player, { connected: false, ready: false, rematch: false });
}

function onMessage(
  room: Room,
  player: PlayerId,
  msg: ClientMessage,
  ctx: RoomContext,
  out: Out,
): Room {
  if (msg.type === 'hello') return onHello(room, player, msg, ctx, out);
  if (!room.players[player].connected) {
    fail(out, player, 'hello_required');
    return room;
  }
  switch (msg.type) {
    case 'set_rules':
      return onSetRules(room, player, msg.rules, ctx, out);
    case 'set_team':
      return onSetTeam(room, player, msg.heroes, ctx, out);
    case 'ready':
      return onReady(room, player, ctx, out);
    case 'action':
      return onAction(room, player, msg, ctx, out);
    case 'claim_timeout':
      if (room.phase !== 'battle') fail(out, player, 'wrong_phase');
      else if (!out.timedOut) fail(out, player, 'not_expired');
      return room;
    case 'emote':
      return onEmote(room, player, msg.id, ctx, out);
    case 'resync':
      return onResync(room, player, ctx, out);
    case 'rematch':
      return onRematch(room, player, ctx, out);
    case 'leave':
      return onLeave(room, player, out);
  }
}

/* ------------------------------------------------------------------ réducteur */

/**
 * Applique un événement au salon. Le temps est d'abord réglé (chrono, grâce) : un message qui arrive
 * après l'échéance est jugé sur l'état d'après. Un refus ne change pas le salon (même objet rendu).
 */
export function reduceRoom(room: Room, event: RoomEvent, ctx: RoomContext): RoomUpdate {
  const out: Out = { send: [], forceView: new Set(), timedOut: false, closed: false };
  const settled = settle(room, ctx, out);
  let next = settled;
  switch (event.type) {
    case 'tick':
      break;
    case 'disconnect':
      next = onDisconnect(settled, event.player, ctx);
      break;
    case 'message':
      next = onMessage(settled, event.player, event.msg, ctx, out);
      break;
  }

  // Les vues qui ont changé (ou celles qu'on a demandées) partent en dernier, aux joueurs connectés.
  for (const player of PLAYER_IDS) {
    if (!next.players[player].connected) continue;
    const changed =
      out.forceView.has(player) ||
      JSON.stringify(viewFor(room, player)) !== JSON.stringify(viewFor(next, player));
    if (changed) tell(out, player, { type: 'room', room: viewFor(next, player) });
  }

  const closed =
    out.closed ||
    (next.phase === 'ended' && !next.players.p1.connected && !next.players.p2.connected);
  return { room: next, send: out.send, ...(closed ? { closed: true } : {}) };
}

/**
 * Variante pour le texte brut d'une connexion : lit le message (taille, JSON, schéma) puis applique
 * l'événement. Un message illisible ne touche pas au salon et ne reçoit qu'une erreur.
 */
export function receive(room: Room, player: PlayerId, text: string, ctx: RoomContext): RoomUpdate {
  const parsed = parseClientMessage(text);
  if (!parsed.ok) {
    const msg: ServerMessage = {
      type: 'error',
      code: parsed.code,
      ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
    };
    return { room, send: [{ to: player, msg }] };
  }
  return reduceRoom(room, { type: 'message', player, msg: parsed.msg }, ctx);
}
