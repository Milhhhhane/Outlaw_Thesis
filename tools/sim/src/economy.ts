/**
 * pnpm --filter @outlaw/sim economy [--auto 58] [--seeds 20] [--runs 600]
 *
 * Économie hors combat : un joueur modèle enchaîne des passages gagnants avec les vraies fonctions
 * du moteur (`completeDungeon`, `openChest`, `starUp`, `levelUp`, `upgradeItem`, `equip`), et on
 * note à quel passage chaque jalon tombe : premier objet au niveau maximum, première étoile,
 * équipe de quatre équipée (deux objets chacun), équipe de quatre au niveau 30. Aucun combat n'est
 * joué : le passage est supposé gagné, et les « tentatives » divisent par le taux de réussite
 * d'Auto. Le seul hasard est celui du butin (graine du profil) : on moyenne sur plusieurs graines.
 *
 * Politique du joueur modèle (documentée dans `docs/ECONOMY.md`) :
 * - parmi les donjons ouverts (ou à ouvrir) et leurs paliers ouverts dont le niveau visé ne
 *   dépasse pas celui du plus faible héros, il farme celui qui rapporte le plus de ce qui lui
 *   manque pour monter ce héros (XP, poussière du palier demandé, fragments pour l'étoile), à
 *   égalité le plus avancé ;
 * - après chaque passage : il ouvre ses coffres (héros ciblé : celui de l'équipe le plus proche
 *   de son plafond), paie l'étoile dès que possible, équipe tout objet neuf sur un emplacement
 *   libre de l'équipe, améliore d'abord les objets portés qu'il peut payer, puis monte les
 *   niveaux avec ce qui reste.
 */
import { loadContent, type Content, type Profile } from '@outlaw/data';
import {
  atStarGate,
  bossDifficulties,
  bossFight,
  bossProgress,
  bossUnlocked,
  completeBoss,
  completeDungeon,
  enterBoss,
  equip,
  levelDust,
  levelUpCost,
  levelUpMax,
  masteryMaterialsFactor,
  masteryRank,
  newProfile,
  openChest,
  setFocus,
  starUp,
  chestOdds,
  achievementStatus,
  bonusReady,
  claimAchievement,
  claimBonus,
  claimQuest,
  questStatus,
  rollQuests,
  tierCleared,
  tierReached,
  tierRewardFactor,
  tierTargetLevel,
  upgradeItem,
  xpToNext,
  type DungeonReport,
} from '@outlaw/engine';

/** Jalons mesurés, en passages gagnants (null : jamais atteint dans la limite). */
export interface Milestones {
  readonly firstMaxItem: number | null;
  readonly firstStar: number | null;
  readonly teamEquipped: number | null;
  readonly teamMaxLevel: number | null;
  /** Les deux objets de chaque héros de l'équipe au niveau maximum. */
  readonly teamMaxed: number | null;
  /** Tous les objets du jeu possédés et au niveau maximum. */
  readonly collection: number | null;
  /** Passage de la première victoire de chaque donjon. */
  readonly firstClears: Readonly<Record<string, number>>;
}

/** Bilan des monnaies sur toute la partie modèle. */
export interface Ledger {
  readonly gold: { earned: number; items: number };
  /** Par palier de poussière. */
  readonly dust: { earned: number[]; levels: number[]; items: number[]; salvage: number[] };
  fragments: number;
  chests: number;
  /** Récompenses des quêtes et succès (avec `quests` seulement). */
  readonly quests: { gold: number; dust: number[]; chests: number; claims: number };
  /** Paliers du boss de la semaine payés (avec `boss` seulement). */
  readonly boss: { dust: number[]; chests: number; fragments: number; claims: number };
  readonly items: {
    drops: number;
    rares: number;
    upgrades: number;
    /** À la fin : objets au niveau maximum, et niveau moyen des objets portés par l'équipe. */
    maxed: number;
    wornLevel: number;
  };
}

export interface EconomyRun {
  readonly runs: number;
  readonly milestones: Milestones;
  readonly ledger: Ledger;
  readonly profile: Profile;
}

/** Un passage possible : le donjon, son palier, le niveau qu'il vise et ce qu'il rapporte. */
export interface Candidate {
  readonly dungeon: string;
  readonly tier: number;
  readonly level: number;
  readonly xp: number;
  readonly gold: number;
  readonly dust: { readonly tier: number; readonly amount: number };
  readonly fragments: number;
}

/** Niveau du plus faible héros de l'équipe. */
export function teamLevel(profile: Profile): number {
  return Math.min(...profile.team.map((id) => profile.heroes[id]?.level ?? 1));
}

/** Les passages que le joueur modèle peut tenter : donjons ouverts ou à ouvrir, paliers ouverts. */
export function candidates(content: Content, profile: Profile): Candidate[] {
  const out: Candidate[] = [];
  const { chests } = content.balance;
  for (const [i, dungeon] of content.dungeons.entries()) {
    const previous = content.dungeons[i - 1];
    const open = previous === undefined || (profile.dungeons[previous.id]?.clears ?? 0) > 0;
    if (!open) break;
    const rank = masteryRank(content, profile.dungeons[dungeon.id]?.clears ?? 0);
    for (let tier = 1; tier <= tierReached(content, profile, dungeon.id); tier++) {
      // Fragments attendus : chance de chaque coffre × sa taille ; au premier passage, le reste de
      // la chance tombe sur le plus modeste (coffre garanti).
      const odds = chestOdds(content, dungeon, tier);
      const sizeOf = (id: string): number => chests.tiers.find((t) => t.id === id)?.fragments ?? 0;
      const expected = odds.reduce((sum, o) => sum + (o.pct / 100) * sizeOf(o.chest), 0);
      const missing = 1 - odds.reduce((sum, o) => sum + o.pct / 100, 0);
      const first = !tierCleared(profile, dungeon.id, tier);
      const fragments = expected + (first ? missing * sizeOf(chests.tiers[0]?.id ?? '') : 0);
      out.push({
        dungeon: dungeon.id,
        tier,
        level: tierTargetLevel(content, dungeon, tier),
        xp: dungeon.rewards.xp * tierRewardFactor(content, tier, 'xp'),
        gold: dungeon.rewards.gold * tierRewardFactor(content, tier, 'gold'),
        dust: {
          tier: dungeon.rewards.materials.tier,
          amount:
            dungeon.rewards.materials.amount *
            tierRewardFactor(content, tier, 'materials') *
            masteryMaterialsFactor(content, rank),
        },
        fragments,
      });
    }
  }
  return out;
}

/** Ce qui empêche le plus faible héros de l'équipe de monter : XP, poussière (d'un palier), étoile, ou rien. */
export function blocker(
  content: Content,
  profile: Profile,
): { kind: 'xp' | 'dust' | 'star' | 'done'; dustTier: number } {
  const lowest = [...profile.team].sort(
    (a, b) => (profile.heroes[a]?.level ?? 1) - (profile.heroes[b]?.level ?? 1),
  )[0];
  const hero = lowest === undefined ? undefined : profile.heroes[lowest];
  const cost = hero === undefined ? null : levelUpCost(content, hero);
  if (hero === undefined || cost === null) return { kind: 'done', dustTier: 3 };
  if (atStarGate(hero, content)) return { kind: 'star', dustTier: cost.dust.tier };
  if (hero.xp < cost.xp) return { kind: 'xp', dustTier: cost.dust.tier };
  return { kind: 'dust', dustTier: cost.dust.tier };
}

/**
 * Donjons où il reste des copies à chercher : ceux des objets portés par l'équipe pas encore au
 * maximum, sinon ceux de tout objet (possédé ou non) pas encore au maximum (collection).
 */
function wantedOrigins(content: Content, profile: Profile): Set<string> {
  const max = content.balance.progression.items.maxUpgradeLevel;
  const worn = new Set(profile.team.flatMap((id) => profile.heroes[id]?.items ?? []));
  const wornOrigins = new Set<string>();
  const anyOrigins = new Set<string>();
  for (const item of content.items) {
    const owned = profile.items.find((o) => o.item === item.id);
    if (owned !== undefined && owned.upgrade >= max) continue;
    const origin = content.itemOrigin.get(item.id);
    if (origin === undefined) continue;
    anyOrigins.add(origin);
    if (owned !== undefined && worn.has(owned.uid)) wornOrigins.add(origin);
  }
  return wornOrigins.size > 0 ? wornOrigins : anyOrigins;
}

/**
 * Le passage le plus utile à la portée de l'équipe (niveau visé ≤ niveau du plus faible héros) :
 * un donjon jamais terminé d'abord, sinon celui qui rapporte le plus de ce qui manque — XP,
 * poussière du palier demandé, fragments, ou copies d'un objet porté une fois les niveaux finis —
 * et à égalité le plus avancé (niveau visé le plus haut, puis le plus d'or).
 */
export function pickRun(content: Content, profile: Profile): Candidate {
  const level = teamLevel(profile);
  const all = candidates(content, profile);
  const reachable = all.filter((c) => c.level <= level);
  const need = blocker(content, profile);
  // Niveaux finis : il reste à farmer les copies des objets portés pas encore au maximum.
  const wanted = need.kind === 'done' ? wantedOrigins(content, profile) : new Set<string>();
  const score = (c: Candidate): number => {
    // Un donjon jamais terminé passe avant tout : il ouvre la suite.
    if ((profile.dungeons[c.dungeon]?.clears ?? 0) === 0) return Number.POSITIVE_INFINITY;
    switch (need.kind) {
      case 'xp':
        return c.xp;
      case 'dust':
        return c.dust.tier === need.dustTier ? c.dust.amount : 0;
      case 'star':
        return c.fragments;
      case 'done':
        return wanted.has(c.dungeon) ? 1 : 0;
    }
  };
  const best = reachable.reduce<Candidate | undefined>((acc, c) => {
    if (acc === undefined) return c;
    const diff = score(c) - score(acc);
    if (diff !== 0) return diff > 0 ? c : acc;
    if (c.level !== acc.level) return c.level > acc.level ? c : acc;
    return c.gold >= acc.gold ? c : acc;
  }, undefined);
  const first = content.dungeons[0];
  return (
    best ??
    all[0] ?? {
      dungeon: first?.id ?? '',
      tier: 1,
      level: 1,
      xp: 0,
      gold: 0,
      dust: { tier: 1, amount: 0 },
      fragments: 0,
    }
  );
}

function ok<T>(outcome: { ok: true; value: T } | { ok: false }): T | null {
  return outcome.ok ? outcome.value : null;
}

/** Équipe chaque objet possédé non porté sur un emplacement libre d'un héros de l'équipe. */
function equipAll(content: Content, profile: Profile): Profile {
  let current = profile;
  const worn = new Set(Object.values(current.heroes).flatMap((h) => h.items));
  for (const owned of current.items) {
    if (worn.has(owned.uid)) continue;
    for (const heroId of current.team) {
      const hero = current.heroes[heroId];
      if (hero === undefined) continue;
      const wearsSame = hero.items.some(
        (uid) => current.items.find((o) => o.uid === uid)?.item === owned.item,
      );
      const slot = hero.items.indexOf(null);
      if (wearsSame || slot < 0) continue;
      const next = ok(equip(content, current, heroId, slot, owned.uid));
      if (next !== null) {
        current = next;
        worn.add(owned.uid);
        break;
      }
    }
  }
  return current;
}

/**
 * Améliore les objets tant qu'un paiement est possible : ceux que porte l'équipe d'abord (le plus
 * de copies en réserve en premier), puis les autres (collection).
 */
function upgradeItems(content: Content, profile: Profile, ledger: Ledger): Profile {
  let current = profile;
  for (;;) {
    const worn = new Set(current.team.flatMap((id) => current.heroes[id]?.items ?? []));
    const owned = [...current.items].sort(
      (a, b) =>
        Number(worn.has(b.uid)) - Number(worn.has(a.uid)) || b.copies - a.copies || a.uid - b.uid,
    );
    let done = false;
    for (const item of owned) {
      const before = current;
      const next = ok(upgradeItem(content, current, item.uid));
      if (next === null) continue;
      ledger.gold.items += before.gold - next.gold;
      next.materials.forEach((m, tier) => {
        ledger.dust.items[tier] =
          (ledger.dust.items[tier] ?? 0) + (before.materials[tier] ?? 0) - m;
      });
      ledger.items.upgrades += 1;
      current = next;
      done = true;
      break;
    }
    if (!done) return current;
  }
}

/** Monte chaque héros de l'équipe autant que possible, du plus bas niveau au plus haut. */
function levelTeam(content: Content, profile: Profile, ledger: Ledger): Profile {
  let current = profile;
  const order = [...current.team].sort(
    (a, b) => (current.heroes[a]?.level ?? 1) - (current.heroes[b]?.level ?? 1),
  );
  for (const heroId of order) {
    const before = current;
    const next = ok(levelUpMax(content, current, heroId));
    if (next === null) continue;
    next.materials.forEach((m, tier) => {
      ledger.dust.levels[tier] =
        (ledger.dust.levels[tier] ?? 0) + (before.materials[tier] ?? 0) - m;
    });
    current = next;
  }
  return current;
}

/** Ouvre tous les coffres, puis paie les étoiles possibles. Le héros ciblé : le plus proche de son plafond. */
function openAll(content: Content, profile: Profile, ledger: Ledger): Profile {
  let current = profile;
  // Héros ciblé : celui qui attend son étoile (le plus de fragments déjà réunis), sinon le plus haut.
  const waiting = current.team.filter((id) => {
    const hero = current.heroes[id];
    return hero !== undefined && atStarGate(hero, content);
  });
  const focus = (waiting.length > 0 ? waiting : [...current.team]).sort((a, b) =>
    waiting.length > 0
      ? (current.fragments[b] ?? 0) - (current.fragments[a] ?? 0)
      : (current.heroes[b]?.level ?? 1) - (current.heroes[a]?.level ?? 1),
  )[0];
  if (focus !== undefined && current.focus !== focus)
    current = ok(setFocus(content, current, focus)) ?? current;
  for (const tier of content.balance.chests.tiers) {
    while ((current.chests[tier.id] ?? 0) > 0) {
      const opened = ok(openChest(content, current, tier.id));
      if (opened === null) break;
      ledger.fragments += opened.report.fragments.length;
      ledger.chests += 1;
      current = opened.profile;
    }
  }
  return current;
}

function starAll(content: Content, profile: Profile): { profile: Profile; starred: boolean } {
  let current = profile;
  let starred = false;
  for (const heroId of current.team) {
    const hero = current.heroes[heroId];
    if (hero === undefined || !atStarGate(hero, content)) continue;
    const next = ok(starUp(content, current, heroId));
    if (next !== null) {
      current = next;
      starred = true;
    }
  }
  return { profile: current, starred };
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

function emptyLedger(): Ledger {
  return {
    gold: { earned: 0, items: 0 },
    dust: { earned: [0, 0, 0], levels: [0, 0, 0], items: [0, 0, 0], salvage: [0, 0, 0] },
    fragments: 0,
    chests: 0,
    quests: { gold: 0, dust: [0, 0, 0], chests: 0, claims: 0 },
    boss: { dust: [0, 0, 0], chests: 0, fragments: 0, claims: 0 },
    items: { drops: 0, rares: 0, upgrades: 0, maxed: 0, wornLevel: 0 },
  };
}

/** Un passage gagnant du donjon choisi, à son palier. */
export function winRun(
  content: Content,
  profile: Profile,
  pick: Candidate,
): { profile: Profile; report: DungeonReport } | null {
  return ok(completeDungeon(content, profile, pick.dungeon, pick.tier));
}

/**
 * Quêtes dans la partie modèle : le joueur fait `perDay` passages gagnants par jour (UTC) et
 * réclame tout ce qui est prêt après chaque passage (quêtes du jour, de la semaine, bonus, succès).
 */
export interface QuestModel {
  readonly perDay: number;
  /** Sans quêtes ni succès (pour mesurer le boss seul). */
  readonly noQuests?: boolean;
  /**
   * Boss de la semaine : après chaque passage, chaque difficulté ouverte dont un palier reste à
   * payer cette semaine est tentée (tentatives du jour permises) et rapporte **tous** ses paliers.
   * Borne haute : un vrai joueur n'atteint pas toujours le dernier palier.
   */
  readonly boss?: boolean;
}

/** Tente le boss à chaque difficulté qui a encore un palier à payer ; note ce qu'il rapporte. */
function bossAll(content: Content, profile: Profile, now: number, ledger: Ledger): Profile {
  let current = profile;
  for (let d = 1; d <= bossDifficulties(content); d++) {
    const fight = bossFight(content, now, d);
    if (fight === null || !bossUnlocked(content, current, d)) continue;
    const claimed = bossProgress(content, current, now).claimed[d - 1] ?? 0;
    if (claimed >= fight.thresholds.length) continue;
    const entered = ok(enterBoss(content, current, d, now));
    if (entered === null) break;
    const done = ok(completeBoss(content, entered, d, fight.thresholds.at(-1) ?? 0, now));
    if (done === null) break;
    for (const paid of done.report.paid) {
      ledger.boss.dust[paid.materials.tier - 1] =
        (ledger.boss.dust[paid.materials.tier - 1] ?? 0) + paid.materials.amount;
      ledger.boss.fragments += paid.fragments.length;
      if (paid.chest !== null) ledger.boss.chests += 1;
      ledger.boss.claims += 1;
    }
    current = done.profile;
  }
  return current;
}

const DAY_MS = 86_400_000;
/** Premier jour de la partie modèle : un lundi (la semaine commence avec la partie). */
const START = Date.UTC(2026, 10, 2);

/** Réclame tout ce qui est prêt ; note ce que les récompenses ont rapporté. */
function claimAll(content: Content, profile: Profile, now: number, ledger: Ledger): Profile {
  let current = profile;
  const take = (next: Profile | null): void => {
    if (next === null) return;
    ledger.quests.gold += next.gold - current.gold;
    next.materials.forEach((m, tier) => {
      ledger.quests.dust[tier] =
        (ledger.quests.dust[tier] ?? 0) + m - (current.materials[tier] ?? 0);
    });
    const chests = (p: Profile): number => Object.values(p.chests).reduce((a, b) => a + b, 0);
    ledger.quests.chests += chests(next) - chests(current);
    ledger.quests.claims += 1;
    current = next;
  };
  for (const kind of ['daily', 'weekly'] as const)
    for (const status of questStatus(content, current, kind))
      if (status.done && !status.claimed)
        take(ok(claimQuest(content, current, kind, status.quest.id, now)));
  if (bonusReady(current)) take(ok(claimBonus(content, current, now)));
  for (const status of achievementStatus(content, current))
    if (status.done && !status.claimed)
      take(ok(claimAchievement(content, current, status.achievement.id)));
  return current;
}

/** Joue la partie modèle jusqu'au dernier jalon ou à `maxRuns` passages gagnants. */
export function simulateEconomy(
  content: Content,
  seed: number,
  maxRuns = 600,
  quests: QuestModel | null = null,
): EconomyRun {
  let profile = newProfile(content, seed);
  const ledger = emptyLedger();
  const firstClears: Record<string, number> = {};
  const { maxLevel, items: itemRules } = content.balance.progression;
  let firstMaxItem: number | null = null;
  let firstStar: number | null = null;
  let teamEquipped: number | null = null;
  let teamMaxLevel: number | null = null;
  let teamMaxed: number | null = null;
  let collection: number | null = null;
  let runs = 0;
  const allCleared = (): boolean =>
    content.dungeons.every((d) => (profile.dungeons[d.id]?.clears ?? 0) > 0);
  while (runs < maxRuns && (teamMaxLevel === null || collection === null || !allCleared())) {
    const now = quests === null ? 0 : START + Math.floor(runs / quests.perDay) * DAY_MS;
    const questsOn = quests !== null && quests.noQuests !== true;
    if (questsOn) profile = rollQuests(content, profile, now);
    const pick = pickRun(content, profile);
    const won = winRun(content, profile, pick);
    if (won === null) break;
    runs += 1;
    const { report } = won;
    profile = won.profile;
    if (profile.dungeons[report.dungeon]?.clears === 1) firstClears[report.dungeon] = runs;
    ledger.gold.earned += report.gold;
    ledger.dust.earned[report.materials.tier - 1] =
      (ledger.dust.earned[report.materials.tier - 1] ?? 0) + report.materials.amount;
    if (report.item.salvaged !== null) {
      const { tier, amount } = report.item.salvaged;
      ledger.dust.salvage[tier - 1] = (ledger.dust.salvage[tier - 1] ?? 0) + amount;
    }
    ledger.items.drops += 1;
    if (content.itemById.get(report.item.item)?.rarity === 'rare') ledger.items.rares += 1;

    if (questsOn) profile = claimAll(content, profile, now, ledger);
    if (quests?.boss === true) profile = bossAll(content, profile, now, ledger);
    profile = openAll(content, profile, ledger);
    const stars = starAll(content, profile);
    profile = stars.profile;
    if (stars.starred && firstStar === null) firstStar = runs;
    profile = equipAll(content, profile);
    profile = upgradeItems(content, profile, ledger);
    profile = levelTeam(content, profile, ledger);
    // Une étoile payée juste après un niveau : on retente une fois (le plafond vient de sauter).
    const again = starAll(content, profile);
    profile = again.profile;
    if (again.starred) {
      if (firstStar === null) firstStar = runs;
      profile = levelTeam(content, profile, ledger);
    }
    // Les quêtes faites par les dépenses de ce passage (niveaux, objets, coffres) : réclamées
    // maintenant, dépensées au passage suivant.
    if (questsOn) profile = claimAll(content, profile, now, ledger);

    if (firstMaxItem === null && profile.items.some((o) => o.upgrade >= itemRules.maxUpgradeLevel))
      firstMaxItem = runs;
    const equipped = profile.team.every((id) =>
      (profile.heroes[id]?.items ?? []).every((uid) => uid !== null),
    );
    if (teamEquipped === null && equipped) teamEquipped = runs;
    if (
      teamMaxLevel === null &&
      profile.team.every((id) => (profile.heroes[id]?.level ?? 1) >= maxLevel)
    )
      teamMaxLevel = runs;
    const maxed = profile.team.every((id) =>
      (profile.heroes[id]?.items ?? []).every(
        (uid) =>
          uid !== null &&
          (profile.items.find((o) => o.uid === uid)?.upgrade ?? 0) >= itemRules.maxUpgradeLevel,
      ),
    );
    if (teamMaxed === null && maxed) teamMaxed = runs;
    if (
      collection === null &&
      content.items.every(
        (item) =>
          (profile.items.find((o) => o.item === item.id)?.upgrade ?? 0) >=
          itemRules.maxUpgradeLevel,
      )
    )
      collection = runs;
  }
  ledger.items.maxed = profile.items.filter((o) => o.upgrade >= itemRules.maxUpgradeLevel).length;
  const wornUids = profile.team.flatMap((id) => profile.heroes[id]?.items ?? []);
  const worn = profile.items.filter((o) => wornUids.includes(o.uid));
  ledger.items.wornLevel = mean(worn.map((o) => o.upgrade));
  return {
    runs,
    milestones: {
      firstMaxItem,
      firstStar,
      teamEquipped,
      teamMaxLevel,
      teamMaxed,
      collection,
      firstClears,
    },
    ledger,
    profile,
  };
}

export interface EconomySummary {
  readonly seeds: number;
  readonly milestones: Record<keyof Omit<Milestones, 'firstClears'>, number | null>;
  readonly firstClears: Record<string, number>;
  readonly ledger: Ledger;
  readonly unreached: number;
}

/** Moyenne des jalons et du bilan sur plusieurs graines (un jalon jamais atteint compte comme absent). */
export function summarizeEconomy(
  content: Content,
  seeds: number,
  maxRuns = 600,
  quests: QuestModel | null = null,
): EconomySummary {
  const runs = Array.from({ length: seeds }, (_, i) =>
    simulateEconomy(content, i + 1, maxRuns, quests),
  );
  const pick = (key: keyof Omit<Milestones, 'firstClears'>): number | null => {
    const values = runs.map((r) => r.milestones[key]).filter((v): v is number => v !== null);
    return values.length === runs.length ? mean(values) : null;
  };
  const firstClears: Record<string, number> = {};
  for (const dungeon of content.dungeons) {
    const values = runs
      .map((r) => r.milestones.firstClears[dungeon.id])
      .filter((v): v is number => v !== undefined);
    if (values.length > 0) firstClears[dungeon.id] = mean(values);
  }
  const ledger = emptyLedger();
  const avg = (get: (l: Ledger) => number): number => mean(runs.map((r) => get(r.ledger)));
  ledger.gold.earned = avg((l) => l.gold.earned);
  ledger.gold.items = avg((l) => l.gold.items);
  for (const tier of [0, 1, 2]) {
    ledger.dust.earned[tier] = avg((l) => l.dust.earned[tier] ?? 0);
    ledger.dust.levels[tier] = avg((l) => l.dust.levels[tier] ?? 0);
    ledger.dust.items[tier] = avg((l) => l.dust.items[tier] ?? 0);
    ledger.dust.salvage[tier] = avg((l) => l.dust.salvage[tier] ?? 0);
  }
  ledger.fragments = avg((l) => l.fragments);
  ledger.quests.gold = avg((l) => l.quests.gold);
  ledger.quests.chests = avg((l) => l.quests.chests);
  ledger.quests.claims = avg((l) => l.quests.claims);
  for (const tier of [0, 1, 2]) ledger.quests.dust[tier] = avg((l) => l.quests.dust[tier] ?? 0);
  ledger.boss.chests = avg((l) => l.boss.chests);
  ledger.boss.fragments = avg((l) => l.boss.fragments);
  ledger.boss.claims = avg((l) => l.boss.claims);
  for (const tier of [0, 1, 2]) ledger.boss.dust[tier] = avg((l) => l.boss.dust[tier] ?? 0);
  ledger.chests = avg((l) => l.chests);
  ledger.items.drops = avg((l) => l.items.drops);
  ledger.items.rares = avg((l) => l.items.rares);
  ledger.items.upgrades = avg((l) => l.items.upgrades);
  ledger.items.maxed = avg((l) => l.items.maxed);
  ledger.items.wornLevel = avg((l) => l.items.wornLevel);
  return {
    seeds,
    milestones: {
      firstMaxItem: pick('firstMaxItem'),
      firstStar: pick('firstStar'),
      teamEquipped: pick('teamEquipped'),
      teamMaxLevel: pick('teamMaxLevel'),
      teamMaxed: pick('teamMaxed'),
      collection: pick('collection'),
    },
    firstClears,
    ledger,
    unreached: runs.filter(
      (r) => r.milestones.teamMaxLevel === null || r.milestones.collection === null,
    ).length,
  };
}

/** Ce qui tombe et ce qui se dépense, d'après `balance.json` et `dungeons.json`. */
export function printTables(content: Content): void {
  const { progression, chests, economy } = content.balance;
  console.log(
    'Ce qui tombe (premier passage ; rejeu × ' + String(economy.replayRewardRate) + ') :',
  );
  console.log(
    '  donjon            niv   XP     or  poussière  coffres palier I (or / argent / bronze %)',
  );
  for (const d of content.dungeons) {
    const odds = chestOdds(content, d, 1)
      .map((o) => o.pct.toFixed(0))
      .join(' / ');
    console.log(
      `  ${d.id.padEnd(16)} ${String(d.recommendedLevel).padStart(3)} ${String(d.rewards.xp).padStart(5)} ${String(d.rewards.gold).padStart(5)}  ${String(d.rewards.materials.amount).padStart(3)} T${String(d.rewards.materials.tier)}     ${odds}`,
    );
  }
  console.log(
    `  coffres : ${chests.tiers.map((t) => `${t.id} ${String(t.fragments)} fragments, poids ${t.weights.join('/')}`).join(' ; ')} ; héros ciblé × ${String(chests.focusMultiplier)}`,
  );
  console.log('Ce qui se dépense :');
  const team = progression.teamSize;
  for (const tier of [1, 2, 3]) {
    let xp = 0;
    let dust = 0;
    const levels: number[] = [];
    for (let level = 1; level < progression.maxLevel; level++) {
      const need = levelDust(content, level);
      if (need.tier !== tier) continue;
      levels.push(level);
      xp += xpToNext(level, content);
      dust += need.amount;
    }
    if (levels.length === 0) continue;
    console.log(
      `  niveaux ${String(levels[0])}→${String((levels.at(-1) ?? 0) + 1)} : ${String(xp)} XP par héros, ${String(dust)} poussière T${String(tier)} par héros (${String(dust * team)} pour ${String(team)})`,
    );
  }
  const { upgradeCosts: costs, tierCostPct } = progression.items;
  for (const tier of [1, 2, 3]) {
    const scaled = (value: number, pct: readonly number[]): number =>
      Math.round((value * (pct[tier - 1] ?? 100)) / 100);
    const copies = (c: { copies: number }): number =>
      Math.max(1, scaled(c.copies, tierCostPct.copies));
    const gold = (c: { gold: number }): number => scaled(c.gold, tierCostPct.gold);
    const dust = (c: { materials: number }): number => scaled(c.materials, tierCostPct.materials);
    console.log(
      `  objet du palier ${String(tier)} au niveau ${String(progression.items.maxUpgradeLevel)} : ${String(costs.reduce((s, c) => s + copies(c), 0))} copies, ${String(costs.reduce((s, c) => s + gold(c), 0))} or, ${String(costs.reduce((s, c) => s + dust(c), 0))} poussière T${String(tier)} (${costs.map((c) => `${String(copies(c))}/${String(gold(c))}/${String(dust(c))}`).join(', ')})`,
    );
  }
  console.log(
    `  étoiles : ${chests.starCosts.join(' puis ')} fragments ; invocation : ${chests.summonCosts.join(' / ')} fragments selon la rareté ; respec : ${String(progression.respec.goldPerHeroLevel)} or × niveau après le premier`,
  );
  console.log(
    `  rare : poids ${String(economy.loot.weights.rare)} contre ${String(economy.loot.weights.common)} (+${String(economy.loot.mastery.rareWeightPerRank)} par rang de maîtrise), garanti au ${String(economy.loot.rarePity)}ᵉ passage sans rare ; dissolution ${String(economy.loot.salvage.common)}/${String(economy.loot.salvage.rare)} poussière`,
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const option = (name: string, fallback: number): number => {
    const index = argv.indexOf(name);
    const value = index >= 0 ? Number(argv[index + 1]) : fallback;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const auto = option('--auto', 58) / 100;
  const perDay = option('--per-day', 0);
  const content = loadContent();
  printTables(content);
  const seeds = option('--seeds', 20);
  const summary = summarizeEconomy(content, seeds, option('--runs', 600));
  const f = (n: number | null): string =>
    n === null ? '   —  ' : `${n.toFixed(1).padStart(5)} (${(n / auto).toFixed(0)} tent.)`;
  console.log(
    `Joueur modèle, ${summary.seeds} graines, tentatives à ${Math.round(auto * 100)} % :`,
  );
  console.log(`  premier objet au niveau maximum    : ${f(summary.milestones.firstMaxItem)}`);
  console.log(`  première étoile                    : ${f(summary.milestones.firstStar)}`);
  console.log(`  équipe de 4 équipée (2 objets)     : ${f(summary.milestones.teamEquipped)}`);
  console.log(
    `  équipe de 4 au niveau ${String(content.balance.progression.maxLevel).padEnd(12)}: ${f(summary.milestones.teamMaxLevel)}`,
  );
  console.log(`  équipe de 4 aux objets au maximum  : ${f(summary.milestones.teamMaxed)}`);
  console.log(`  collection complète au maximum     : ${f(summary.milestones.collection)}`);
  if (summary.unreached > 0)
    console.log(`  ! ${summary.unreached} partie(s) n'ont pas atteint le dernier jalon`);
  console.log('Première victoire (passage gagnant) :');
  for (const dungeon of content.dungeons) {
    const at = summary.firstClears[dungeon.id];
    console.log(`  ${dungeon.id.padEnd(16)} ${at === undefined ? '—' : at.toFixed(1)}`);
  }
  const l = summary.ledger;
  const row = (xs: readonly number[]): string => xs.map((x) => x.toFixed(0).padStart(6)).join(' ');
  console.log('Bilan moyen jusqu’au dernier jalon :');
  console.log(
    `  or gagné ${l.gold.earned.toFixed(0)}, dépensé en objets ${l.gold.items.toFixed(0)}`,
  );
  console.log(
    `  poussière (brute, fine, pure) gagnée ${row(l.dust.earned)} + dissoute ${row(l.dust.salvage)}`,
  );
  console.log(
    `                                niveaux ${row(l.dust.levels)}, objets ${row(l.dust.items)}`,
  );
  console.log(
    `  objets tombés ${l.items.drops.toFixed(0)} dont rares ${l.items.rares.toFixed(1)}, améliorations ${l.items.upgrades.toFixed(1)} (objets au maximum ${l.items.maxed.toFixed(1)}, niveau moyen des objets portés ${l.items.wornLevel.toFixed(2)}) ; coffres ${l.chests.toFixed(1)}, fragments ${l.fragments.toFixed(0)}`,
  );
  printQuestEffect(
    content,
    summary,
    seeds,
    option('--runs', 600),
    perDay > 0 ? [perDay] : [5, 10, 20],
  );
  printBossEffect(content, summary, seeds, option('--runs', 600), perDay > 0 ? [perDay] : [5, 10]);
}

function printBossEffect(
  content: Content,
  base: EconomySummary,
  seeds: number,
  maxRuns: number,
  rhythms: readonly number[],
): void {
  console.log(
    'Boss de la semaine (tous les paliers chaque semaine, borne haute) : jalons et raccourcissement :',
  );
  for (const perDay of rhythms) {
    const q = summarizeEconomy(content, seeds, maxRuns, { perDay, noQuests: true, boss: true });
    const effect = questEffect(base, q);
    const cells = (Object.keys(effect) as (keyof typeof effect)[]).map(
      (key) =>
        `${key} ${q.milestones[key]?.toFixed(1) ?? '—'} (${effect[key]?.toFixed(1) ?? '—'} %)`,
    );
    const l = q.ledger.boss;
    console.log(`  ${String(perDay)} passages/jour : ${cells.join(', ')}`);
    console.log(
      `    paliers payés ${l.claims.toFixed(0)} : poussière ${l.dust.map((d) => d.toFixed(0)).join('/')} (donjons ${q.ledger.dust.earned.map((d) => d.toFixed(0)).join('/')}), fragments ${l.fragments.toFixed(0)} + coffres ${l.chests.toFixed(1)} (sur ${q.ledger.chests.toFixed(1)} ouverts, ${q.ledger.fragments.toFixed(0)} fragments)`,
    );
  }
}

/** Effet des quêtes et succès sur les jalons, pour quelques rythmes de jeu (passages gagnants par jour). */
export function questEffect(
  base: EconomySummary,
  withQuests: EconomySummary,
): Record<keyof EconomySummary['milestones'], number | null> {
  const out = {} as Record<keyof EconomySummary['milestones'], number | null>;
  for (const key of Object.keys(base.milestones) as (keyof EconomySummary['milestones'])[]) {
    const a = base.milestones[key];
    const b = withQuests.milestones[key];
    out[key] = a === null || b === null ? null : (100 * (a - b)) / a;
  }
  return out;
}

function printQuestEffect(
  content: Content,
  base: EconomySummary,
  seeds: number,
  maxRuns: number,
  rhythms: readonly number[],
): void {
  console.log('Quêtes et succès : jalons (passages gagnants) et raccourcissement :');
  for (const perDay of rhythms) {
    const q = summarizeEconomy(content, seeds, maxRuns, { perDay });
    const effect = questEffect(base, q);
    const cells = (Object.keys(effect) as (keyof typeof effect)[]).map(
      (key) =>
        `${key} ${q.milestones[key]?.toFixed(1) ?? '—'} (${effect[key]?.toFixed(1) ?? '—'} %)`,
    );
    const l = q.ledger.quests;
    console.log(`  ${String(perDay)} passages/jour : ${cells.join(', ')}`);
    console.log(
      `    récompenses : ${l.claims.toFixed(0)} réclamées, or ${l.gold.toFixed(0)} (${((100 * l.gold) / q.ledger.gold.earned).toFixed(1)} % de l'or des donjons), poussière ${l.dust.map((d) => d.toFixed(0)).join('/')}, coffres ${l.chests.toFixed(1)} (sur ${q.ledger.chests.toFixed(1)} ouverts)`,
    );
  }
}

if (process.argv[1]?.endsWith('economy.ts')) main();
