import type { Content, Element, Profile } from '@outlaw/data';
import { drawFragments } from './chests';
import { energyAt, levelDustTier, type Outcome, type Refusal } from './progression';
import { periodOf } from './quests';
import type { BattleEvent, BattleRules, Side } from './types';

/**
 * Boss de la semaine : un boss existant, seul, aux PV démesurés. Le combat finit par le temps
 * (`balance.boss.actionLimit`), presque jamais par la mort du boss : ce sont les dégâts infligés
 * qui comptent. Rotation chaque lundi 00:00 UTC (la semaine des quêtes), `attemptsPerDay`
 * tentatives par jour UTC, le meilleur score de la semaine par difficulté paie chaque palier
 * atteint, une fois par semaine. L'heure (`now`) est toujours un paramètre.
 */

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: Refusal): Outcome<T> => ({ ok: false, reason });

export interface WeeklyBoss {
  /** Numéro de la semaine (`periodOf('weekly', now)`). */
  readonly week: number;
  /** Identifiant de l'ennemi (un boss existant : sprite, nom, sorts et script). */
  readonly enemy: string;
  readonly element: Element;
}

export interface BossFight extends WeeklyBoss {
  readonly difficulty: number;
  readonly level: number;
  readonly hpPct: number;
  readonly atkPct: number;
  readonly gear: { readonly items: number; readonly upgrade: number };
  /** Dégâts de chaque palier, croissants. */
  readonly thresholds: readonly number[];
  /** Règles du combat : héros d'abord, fin à la limite d'actions du boss. */
  readonly rules: BattleRules;
}

export interface BossReward {
  readonly materials: { readonly tier: number; readonly amount: number };
  readonly fragments: number;
  readonly chest: string | null;
}

/** Boss de la semaine qui contient `now`. */
export function weeklyBoss(content: Content, now: number): WeeklyBoss {
  const { bosses } = content.balance.boss;
  const week = periodOf('weekly', now);
  const index = ((week % bosses.length) + bosses.length) % bosses.length;
  // `slice` : le boss de la rotation, sans valeur de repli (le schéma en garantit au moins un).
  const enemy = bosses.slice(index, index + 1).join('');
  const element = content.enemyById.get(enemy)?.element ?? 'fire';
  return { week, enemy, element };
}

/** Nombre de difficultés (numérotées à partir de 1). */
export function bossDifficulties(content: Content): number {
  return content.balance.boss.difficulties.length;
}

/** Combat de la difficulté `difficulty` (1, 2…) cette semaine, ou null si elle n'existe pas. */
export function bossFight(content: Content, now: number, difficulty: number): BossFight | null {
  const { difficulties, actionLimit } = content.balance.boss;
  const d = Number.isInteger(difficulty) ? difficulties[difficulty - 1] : undefined;
  if (d === undefined) return null;
  return {
    ...weeklyBoss(content, now),
    difficulty,
    level: d.level,
    hpPct: d.hpPct,
    atkPct: d.atkPct,
    gear: d.gear,
    thresholds: d.thresholds,
    rules: { firstSide: 'player', limit: 'enemy_wins', actionLimit },
  };
}

/** Niveau du plus avancé des donjons terminés (0 : aucun). */
function bestDungeonLevel(content: Content, profile: Profile): number {
  return Math.max(
    0,
    ...content.dungeons
      .filter((d) => (profile.dungeons[d.id]?.clears ?? 0) > 0)
      .map((d) => d.recommendedLevel),
  );
}

/** Donjon dont la victoire ouvre la difficulté (le premier de niveau suffisant), ou null. */
export function bossUnlockDungeon(content: Content, difficulty: number): string | null {
  const d = content.balance.boss.difficulties[difficulty - 1];
  if (d === undefined) return null;
  return content.dungeons.find((x) => x.recommendedLevel >= d.unlockLevel)?.id ?? null;
}

/** La difficulté existe et est ouverte (un donjon de son niveau terminé ; toutes en mode test). */
export function bossUnlocked(content: Content, profile: Profile, difficulty: number): boolean {
  const d = content.balance.boss.difficulties[difficulty - 1];
  if (d === undefined || !Number.isInteger(difficulty)) return false;
  return profile.testMode || bestDungeonLevel(content, profile) >= d.unlockLevel;
}

export interface BossProgress {
  readonly week: number;
  /** Meilleurs dégâts de la semaine, par difficulté (index 0 : difficulté 1). */
  readonly best: readonly number[];
  /** Paliers déjà payés cette semaine, par difficulté. */
  readonly claimed: readonly number[];
  readonly attemptsLeft: number;
}

/** État du boss pour la semaine et le jour de `now` (remis à zéro si le profil date d'avant). */
export function bossProgress(content: Content, profile: Profile, now: number): BossProgress {
  const n = bossDifficulties(content);
  const week = periodOf('weekly', now);
  const same = profile.boss.week === week;
  const pad = (list: readonly number[]): number[] =>
    Array.from({ length: n }, (_, i) => (same ? (list[i] ?? 0) : 0));
  const used = profile.boss.day === periodOf('daily', now) ? profile.boss.attempts : 0;
  return {
    week,
    best: pad(profile.boss.best),
    claimed: pad(profile.boss.claimed),
    attemptsLeft: Math.max(0, content.balance.boss.attemptsPerDay - used),
  };
}

/** Nombre de paliers que `damage` atteint à cette difficulté. */
export function bossTierReached(content: Content, difficulty: number, damage: number): number {
  const d = content.balance.boss.difficulties[difficulty - 1];
  return d === undefined ? 0 : d.thresholds.filter((x) => damage >= x).length;
}

/** Récompense du palier `tier` (1, 2…) à cette difficulté. */
export function bossReward(content: Content, difficulty: number, tier: number): BossReward {
  const { difficulties, rewards } = content.balance.boss;
  const level = difficulties[difficulty - 1]?.level ?? 1;
  const reward = rewards[tier - 1] ?? { dust: 0, fragments: 0, chest: null };
  return {
    materials: { tier: levelDustTier(content, level), amount: reward.dust },
    fragments: reward.fragments,
    chest: reward.chest,
  };
}

/**
 * Entrée dans un combat de boss : difficulté ouverte, équipe non vide, une tentative du jour
 * prise dès l'entrée (abandonner ne la rend pas). Le mode test ne compte pas les tentatives.
 */
export function enterBoss(
  content: Content,
  profile: Profile,
  difficulty: number,
  now: number,
): Outcome {
  if (bossFight(content, now, difficulty) === null) return refuse('unknown_difficulty');
  if (!bossUnlocked(content, profile, difficulty)) return refuse('boss_locked');
  if (profile.team.length === 0) return refuse('bad_team');
  if (profile.testMode) return ok(profile);
  const progress = bossProgress(content, profile, now);
  if (progress.attemptsLeft <= 0) return refuse('no_attempts');
  // Même énergie qu'un donjon (coût 0 pour l'instant) : le boss n'en contourne pas la règle.
  const cost = content.balance.energy.costPerDungeon;
  const available = energyAt(content, profile, now);
  if (available < cost) return refuse('no_energy');
  const used = content.balance.boss.attemptsPerDay - progress.attemptsLeft;
  return ok({
    ...profile,
    energy: { value: available - cost, updatedAt: now },
    boss: {
      week: progress.week,
      best: [...progress.best],
      claimed: [...progress.claimed],
      day: periodOf('daily', now),
      attempts: used + 1,
    },
  });
}

/**
 * Dégâts infligés aux unités du camp `side` d'après le journal d'un combat : PV réellement
 * perdus sous les coups (le bouclier absorbé et l'excédent d'un coup fatal ne comptent pas,
 * un soin du boss n'efface rien). Fonction pure du journal, rejouable.
 */
export function damageDealt(events: readonly BattleEvent[], side: Side = 'enemy'): number {
  const hp = new Map<string, number>();
  let total = 0;
  for (const event of events) {
    if (event.type === 'battle_start') {
      for (const unit of event.units) if (unit.side === side) hp.set(unit.id, unit.hp);
    } else if (event.type === 'heal') {
      if (hp.has(event.target)) hp.set(event.target, event.hpAfter);
    } else if (event.type === 'damage') {
      const before = hp.get(event.target);
      if (before === undefined) continue;
      total += Math.max(0, before - event.hpAfter);
      hp.set(event.target, event.hpAfter);
    }
  }
  return total;
}

export interface BossPaid {
  readonly tier: number;
  readonly materials: { readonly tier: number; readonly amount: number };
  /** Héros de chaque fragment tiré. */
  readonly fragments: readonly string[];
  readonly chest: string | null;
}

export interface BossReport {
  readonly difficulty: number;
  readonly damage: number;
  /** Meilleurs dégâts de la semaine à cette difficulté, ce combat compris. */
  readonly best: number;
  readonly newBest: boolean;
  /** Paliers atteints par ce combat. */
  readonly reached: number;
  /** Paliers payés par ce combat (atteints pour la première fois cette semaine). */
  readonly paid: readonly BossPaid[];
}

/**
 * Fin d'un combat de boss (`damage` : `damageDealt` de son journal). Garde le meilleur score de
 * la semaine et paie tout de suite chaque palier atteint pour la première fois cette semaine :
 * poussière du palier qu'exige le niveau du boss, fragments tirés comme dans un coffre, coffre.
 */
export function completeBoss(
  content: Content,
  profile: Profile,
  difficulty: number,
  damage: number,
  now: number,
): Outcome<{ profile: Profile; report: BossReport }> {
  if (bossFight(content, now, difficulty) === null) return refuse('unknown_difficulty');
  if (profile.testMode) return refuse('test_mode');
  if (!bossUnlocked(content, profile, difficulty)) return refuse('boss_locked');
  const progress = bossProgress(content, profile, now);
  const i = difficulty - 1;
  const score = Math.max(0, Math.floor(damage));
  const before = progress.best[i] ?? 0;
  const best = Math.max(before, score);
  const reached = bossTierReached(content, difficulty, score);
  const claimed = progress.claimed[i] ?? 0;
  let current = profile;
  const paid: BossPaid[] = [];
  for (let tier = claimed + 1; tier <= reached; tier++) {
    const reward = bossReward(content, difficulty, tier);
    const drawn = drawFragments(
      content,
      current,
      content.balance.boss.fragmentChest,
      reward.fragments,
    );
    const materials: Profile['materials'] = [...drawn.profile.materials];
    const t = reward.materials.tier - 1;
    materials[t] = (materials[t] ?? 0) + reward.materials.amount;
    const chests =
      reward.chest === null
        ? drawn.profile.chests
        : {
            ...drawn.profile.chests,
            [reward.chest]: (drawn.profile.chests[reward.chest] ?? 0) + 1,
          };
    current = { ...drawn.profile, materials, chests };
    paid.push({ tier, materials: reward.materials, fragments: drawn.drawn, chest: reward.chest });
  }
  const bestList = [...progress.best];
  bestList[i] = best;
  const claimedList = [...progress.claimed];
  claimedList[i] = Math.max(claimed, reached);
  const today = periodOf('daily', now);
  return ok({
    profile: {
      ...current,
      boss: {
        week: progress.week,
        best: bestList,
        claimed: claimedList,
        day: today,
        attempts: profile.boss.day === today ? profile.boss.attempts : 0,
      },
    },
    report: { difficulty, damage: score, best, newBest: score > before, reached, paid },
  });
}
