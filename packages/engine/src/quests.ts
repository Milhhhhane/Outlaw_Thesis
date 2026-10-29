import type {
  Achievement,
  Content,
  Metric,
  Profile,
  Quest,
  QuestPeriod,
  QuestReward,
} from '@outlaw/data';
import { counter } from './counters';
import { cyrb53 } from './hash';
import { masteryRank } from './loot';
import { heroStars, nextRandom, type Outcome } from './progression';

/**
 * Quêtes du jour, de la semaine et succès. Fonctions pures : l'heure (`now`, en ms UTC) est
 * toujours passée en paramètre. La progression vient des compteurs à vie que tiennent les
 * fonctions de progression (`profile.stats`, voir `counters.ts`) : une quête compte la différence
 * depuis le début de sa période. Le tirage dépend de la période et de la graine du profil.
 */

export type QuestKind = 'daily' | 'weekly';

const DAY_MS = 86_400_000;
/** Le 1er janvier 1970 était un jeudi : +3 jours alignent les semaines sur le lundi. */
const MONDAY_SHIFT = 3;

/** Numéro de la période qui contient `now` : jour UTC, ou semaine UTC commençant le lundi 00:00. */
export function periodOf(kind: QuestKind, now: number): number {
  const day = Math.floor(now / DAY_MS);
  return kind === 'daily' ? day : Math.floor((day + MONDAY_SHIFT) / 7);
}

/** Instant (ms UTC) où commence la période suivante : minuit UTC, ou lundi 00:00 UTC. */
export function periodEnd(kind: QuestKind, period: number): number {
  return kind === 'daily' ? (period + 1) * DAY_MS : ((period + 1) * 7 - MONDAY_SHIFT) * DAY_MS;
}

/** Millisecondes avant la prochaine réinitialisation. */
export function resetIn(kind: QuestKind, now: number): number {
  return periodEnd(kind, periodOf(kind, now)) - now;
}

/** Victoires à vie (somme des passages des donjons : une ancienne sauvegarde compte aussi). */
function totalClears(profile: Profile): number {
  return Object.values(profile.dungeons).reduce((sum, d) => sum + d.clears, 0);
}

/**
 * Quêtes tirées pour une période : `count` quêtes distinctes parmi celles que le joueur peut faire
 * (`minWins`), dans un ordre tiré de la période et de la graine. Même entrée, même tirage.
 */
export function drawQuests(
  content: Content,
  kind: QuestKind,
  period: number,
  seed: number,
  wins: number,
): string[] {
  const pool = content.quests[kind].filter((q) => q.minWins <= wins).map((q) => q.id);
  let state = cyrb53(`${kind}:${String(period)}:${String(seed)}`) | 0;
  // Fisher-Yates partiel : les `count` premières places.
  const count = Math.min(content.balance.quests[kind].count, pool.length);
  for (let i = 0; i < count; i++) {
    const roll = nextRandom(state);
    state = roll.seed;
    const j = i + Math.floor(roll.value * (pool.length - i));
    const picked = pool[j] ?? '';
    pool[j] = pool[i] ?? '';
    pool[i] = picked;
  }
  return pool.slice(0, count);
}

/**
 * Passe aux quêtes de la période courante si elle a changé : nouveau tirage, compteurs de départ
 * pris dans `previous` (le profil d'avant la dernière action : une action faite après minuit
 * compte pour le nouveau jour). Renvoie le même objet si rien ne change. Rien en mode test.
 */
export function rollQuests(
  content: Content,
  profile: Profile,
  now: number,
  previous: Profile = profile,
): Profile {
  if (profile.testMode) return profile;
  let quests = profile.quests;
  for (const kind of ['daily', 'weekly'] as const) {
    const period = periodOf(kind, now);
    if (quests[kind].period === period) continue;
    const fresh: QuestPeriod = {
      period,
      ids: drawQuests(content, kind, period, profile.seed, totalClears(previous)),
      base: { ...previous.stats },
      claimed: [],
      bonus: false,
    };
    quests = { ...quests, [kind]: fresh };
  }
  return quests === profile.quests ? profile : { ...profile, quests };
}

export interface QuestStatus {
  readonly quest: Quest;
  /** Avancement depuis le début de la période, borné à l'objectif. */
  readonly progress: number;
  readonly done: boolean;
  readonly claimed: boolean;
}

/** Quêtes de la période enregistrée dans le profil (appeler `rollQuests` avant). */
export function questStatus(content: Content, profile: Profile, kind: QuestKind): QuestStatus[] {
  const state = profile.quests[kind];
  return state.ids.flatMap((id) => {
    const quest = content.quests[kind].find((q) => q.id === id);
    if (quest === undefined) return [];
    const raw = counter(profile, quest.metric) - (state.base[quest.metric] ?? 0);
    const progress = Math.min(quest.target, Math.max(0, raw));
    return [
      { quest, progress, done: progress >= quest.target, claimed: state.claimed.includes(id) },
    ];
  });
}

/** Valeur d'une mesure de succès : compteur à vie ou valeur lue dans le profil. */
export function metricValue(content: Content, profile: Profile, metric: Metric): number {
  const dungeons = Object.values(profile.dungeons);
  const maxed = content.balance.progression.items.maxUpgradeLevel;
  const heroes = profile.unlocked.flatMap((id) => profile.heroes[id] ?? []);
  switch (metric) {
    case 'dungeons_cleared':
      return dungeons.filter((d) => d.clears > 0).length;
    case 'clears_total':
      return totalClears(profile);
    case 'tier3_cleared':
      // `tier` est le palier atteint : 4 veut dire « palier III terminé ».
      return dungeons.filter((d) => d.tier > 3).length;
    case 'mastery_rank':
      return Math.max(0, ...dungeons.map((d) => masteryRank(content, d.clears)));
    case 'items_owned':
      return new Set(profile.items.map((o) => o.item)).size;
    case 'items_maxed':
      return new Set(profile.items.filter((o) => o.upgrade >= maxed).map((o) => o.item)).size;
    case 'heroes':
      return profile.unlocked.length;
    case 'stars_total':
      return heroes.reduce((sum, h) => sum + heroStars(h, content), 0);
    case 'hero_level':
      return Math.max(0, ...heroes.map((h) => h.level));
    default:
      return counter(profile, metric);
  }
}

export interface AchievementStatus {
  readonly achievement: Achievement;
  readonly progress: number;
  readonly done: boolean;
  readonly claimed: boolean;
}

export function achievementStatus(content: Content, profile: Profile): AchievementStatus[] {
  return content.quests.achievements.map((achievement) => {
    const progress = Math.min(
      achievement.target,
      metricValue(content, profile, achievement.metric),
    );
    return {
      achievement,
      progress,
      done: progress >= achievement.target,
      claimed: profile.quests.achievements.includes(achievement.id),
    };
  });
}

export interface RewardValue {
  readonly gold: number;
  readonly dust: { readonly tier: number; readonly amount: number };
  readonly chest: string | null;
}

/**
 * Ce que vaut une récompense pour ce profil : `passagePct` % de l'or et de la poussière d'un
 * passage du donjon le plus avancé terminé (palier I, sans maîtrise ; le premier donjon sinon).
 * Le plus avancé : le plus haut niveau conseillé, à égalité le premier du fichier (les chapitres
 * sont parallèles : le dernier du fichier n'est pas le plus avancé).
 */
export function rewardValue(content: Content, profile: Profile, reward: QuestReward): RewardValue {
  const best =
    content.dungeons
      .filter((d) => (profile.dungeons[d.id]?.clears ?? 0) > 0)
      .reduce<(typeof content.dungeons)[number] | undefined>(
        (acc, d) => (acc === undefined || d.recommendedLevel > acc.recommendedLevel ? d : acc),
        undefined,
      ) ?? content.dungeons[0];
  const scale = (n: number): number => Math.round((n * reward.passagePct) / 100);
  return {
    gold: scale(best?.rewards.gold ?? 0),
    dust: {
      tier: best?.rewards.materials.tier ?? 1,
      amount: scale(best?.rewards.materials.amount ?? 0),
    },
    chest: reward.chest,
  };
}

/** Récompense de chaque quête de la période. */
export function questReward(content: Content, profile: Profile, kind: QuestKind): RewardValue {
  return rewardValue(content, profile, content.balance.quests[kind].reward);
}

export function bonusReward(content: Content, profile: Profile): RewardValue {
  return rewardValue(content, profile, content.balance.quests.daily.bonus);
}

export function achievementReward(
  content: Content,
  profile: Profile,
  achievement: Achievement,
): RewardValue {
  return rewardValue(content, profile, content.balance.quests.achievements[achievement.reward]);
}

function grant(profile: Profile, value: RewardValue): Profile {
  const materials: Profile['materials'] = [...profile.materials];
  materials[value.dust.tier - 1] = (materials[value.dust.tier - 1] ?? 0) + value.dust.amount;
  const chests =
    value.chest === null
      ? profile.chests
      : { ...profile.chests, [value.chest]: (profile.chests[value.chest] ?? 0) + 1 };
  return { ...profile, gold: profile.gold + value.gold, materials, chests };
}

/** Réclame une quête faite de la période courante. */
export function claimQuest(
  content: Content,
  profile: Profile,
  kind: QuestKind,
  id: string,
  now: number,
): Outcome {
  if (profile.testMode) return { ok: false, reason: 'test_mode' };
  const current = rollQuests(content, profile, now);
  const status = questStatus(content, current, kind).find((s) => s.quest.id === id);
  if (status === undefined) return { ok: false, reason: 'unknown_quest' };
  if (status.claimed) return { ok: false, reason: 'already_claimed' };
  if (!status.done) return { ok: false, reason: 'quest_not_done' };
  const state = current.quests[kind];
  const value = questReward(content, current, kind);
  return {
    ok: true,
    value: grant(
      {
        ...current,
        quests: { ...current.quests, [kind]: { ...state, claimed: [...state.claimed, id] } },
      },
      value,
    ),
  };
}

/** Le bonus du jour : toutes les quêtes du jour réclamées. */
export function bonusReady(profile: Profile): boolean {
  const { daily } = profile.quests;
  return (
    !daily.bonus && daily.ids.length > 0 && daily.ids.every((id) => daily.claimed.includes(id))
  );
}

export function claimBonus(content: Content, profile: Profile, now: number): Outcome {
  if (profile.testMode) return { ok: false, reason: 'test_mode' };
  const current = rollQuests(content, profile, now);
  if (current.quests.daily.bonus) return { ok: false, reason: 'already_claimed' };
  if (!bonusReady(current)) return { ok: false, reason: 'quest_not_done' };
  return {
    ok: true,
    value: grant(
      {
        ...current,
        quests: { ...current.quests, daily: { ...current.quests.daily, bonus: true } },
      },
      bonusReward(content, current),
    ),
  };
}

/** Réclame un succès atteint (une seule fois). */
export function claimAchievement(content: Content, profile: Profile, id: string): Outcome {
  if (profile.testMode) return { ok: false, reason: 'test_mode' };
  const status = achievementStatus(content, profile).find((s) => s.achievement.id === id);
  if (status === undefined) return { ok: false, reason: 'unknown_quest' };
  if (status.claimed) return { ok: false, reason: 'already_claimed' };
  if (!status.done) return { ok: false, reason: 'quest_not_done' };
  return {
    ok: true,
    value: grant(
      {
        ...profile,
        quests: { ...profile.quests, achievements: [...profile.quests.achievements, id] },
      },
      achievementReward(content, profile, status.achievement),
    ),
  };
}

/** Récompenses à réclamer (badge du camp) : quêtes faites, bonus du jour, succès atteints. */
export function claimableCount(content: Content, profile: Profile, now: number): number {
  if (profile.testMode) return 0;
  const current = rollQuests(content, profile, now);
  const ready = (list: readonly { done: boolean; claimed: boolean }[]): number =>
    list.filter((s) => s.done && !s.claimed).length;
  return (
    ready(questStatus(content, current, 'daily')) +
    ready(questStatus(content, current, 'weekly')) +
    Number(bonusReady(current)) +
    ready(achievementStatus(content, current))
  );
}
