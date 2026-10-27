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
 * - il farme le donjon le plus avancé dont le niveau conseillé ne dépasse pas le niveau du plus
 *   faible héros de l'équipe (ouvert ou à ouvrir : le donjon suivant s'ouvre en le terminant) ;
 * - après chaque passage : il ouvre ses coffres (héros ciblé : celui de l'équipe le plus proche
 *   de son plafond), paie l'étoile dès que possible, équipe tout objet neuf sur un emplacement
 *   libre de l'équipe, améliore d'abord les objets portés qu'il peut payer, puis monte les
 *   niveaux avec ce qui reste.
 */
import { loadContent, type Content, type Profile } from '@outlaw/data';
import {
  atStarGate,
  completeDungeon,
  equip,
  levelDust,
  levelUpMax,
  newProfile,
  openChest,
  setFocus,
  starUp,
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

/** Un passage possible : le donjon, son palier et le niveau qu'il vise. */
export interface Candidate {
  readonly dungeon: string;
  readonly tier: number;
  readonly level: number;
}

/** Niveau du plus faible héros de l'équipe. */
export function teamLevel(profile: Profile): number {
  return Math.min(...profile.team.map((id) => profile.heroes[id]?.level ?? 1));
}

/** Les passages que le joueur modèle peut tenter : donjons ouverts ou à ouvrir, au palier I. */
export function candidates(content: Content, profile: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [i, dungeon] of content.dungeons.entries()) {
    const previous = content.dungeons[i - 1];
    const open = previous === undefined || (profile.dungeons[previous.id]?.clears ?? 0) > 0;
    if (!open) break;
    out.push({ dungeon: dungeon.id, tier: 1, level: dungeon.recommendedLevel });
  }
  return out;
}

/** Le passage le plus rentable à la portée de l'équipe : niveau visé le plus haut sans la dépasser. */
export function pickRun(content: Content, profile: Profile): Candidate {
  const level = teamLevel(profile);
  const all = candidates(content, profile);
  const reachable = all.filter((c) => c.level <= level);
  const best = reachable.reduce<Candidate | undefined>(
    (acc, c) => (acc === undefined || c.level >= acc.level ? c : acc),
    undefined,
  );
  return best ?? all[0] ?? { dungeon: content.dungeons[0]?.id ?? '', tier: 1, level: 1 };
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

/** Améliore les objets portés par l'équipe tant qu'un paiement est possible (le plus de copies d'abord). */
function upgradeWorn(content: Content, profile: Profile, ledger: Ledger): Profile {
  let current = profile;
  for (;;) {
    const worn = new Set(current.team.flatMap((id) => current.heroes[id]?.items ?? []));
    const owned = current.items
      .filter((o) => worn.has(o.uid))
      .sort((a, b) => b.copies - a.copies || a.uid - b.uid);
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
    items: { drops: 0, rares: 0, upgrades: 0, maxed: 0, wornLevel: 0 },
  };
}

/** Un passage gagnant du donjon choisi, avec le palier (ignoré tant que les donjons n'en ont pas). */
export function winRun(
  content: Content,
  profile: Profile,
  pick: Candidate,
): { profile: Profile; report: DungeonReport } | null {
  return ok(completeDungeon(content, profile, pick.dungeon));
}

/** Joue la partie modèle jusqu'au dernier jalon ou à `maxRuns` passages gagnants. */
export function simulateEconomy(content: Content, seed: number, maxRuns = 600): EconomyRun {
  let profile = newProfile(content, seed);
  const ledger = emptyLedger();
  const firstClears: Record<string, number> = {};
  const { maxLevel, items: itemRules } = content.balance.progression;
  let firstMaxItem: number | null = null;
  let firstStar: number | null = null;
  let teamEquipped: number | null = null;
  let teamMaxLevel: number | null = null;
  let runs = 0;
  const allCleared = (): boolean =>
    content.dungeons.every((d) => (profile.dungeons[d.id]?.clears ?? 0) > 0);
  while (runs < maxRuns && (teamMaxLevel === null || !allCleared())) {
    const pick = pickRun(content, profile);
    const won = winRun(content, profile, pick);
    if (won === null) break;
    runs += 1;
    const { report } = won;
    profile = won.profile;
    if (report.firstClear) firstClears[report.dungeon] = runs;
    ledger.gold.earned += report.gold;
    ledger.dust.earned[report.materials.tier - 1] =
      (ledger.dust.earned[report.materials.tier - 1] ?? 0) + report.materials.amount;
    if (report.item.salvaged !== null) {
      const { tier, amount } = report.item.salvaged;
      ledger.dust.salvage[tier - 1] = (ledger.dust.salvage[tier - 1] ?? 0) + amount;
    }
    ledger.items.drops += 1;
    if (content.itemById.get(report.item.item)?.rarity === 'rare') ledger.items.rares += 1;

    profile = openAll(content, profile, ledger);
    const stars = starAll(content, profile);
    profile = stars.profile;
    if (stars.starred && firstStar === null) firstStar = runs;
    profile = equipAll(content, profile);
    profile = upgradeWorn(content, profile, ledger);
    profile = levelTeam(content, profile, ledger);
    // Une étoile payée juste après un niveau : on retente une fois (le plafond vient de sauter).
    const again = starAll(content, profile);
    profile = again.profile;
    if (again.starred) {
      if (firstStar === null) firstStar = runs;
      profile = levelTeam(content, profile, ledger);
    }

    if (firstMaxItem === null && profile.items.some((o) => o.upgrade >= itemRules.maxUpgradeLevel))
      firstMaxItem = runs;
    const equipped = profile.team.every((id) =>
      (profile.heroes[id]?.items ?? []).every((uid) => uid !== null),
    );
    if (teamEquipped === null && equipped) teamEquipped = runs;
    if (profile.team.every((id) => (profile.heroes[id]?.level ?? 1) >= maxLevel))
      teamMaxLevel = runs;
  }
  ledger.items.maxed = profile.items.filter((o) => o.upgrade >= itemRules.maxUpgradeLevel).length;
  const wornUids = profile.team.flatMap((id) => profile.heroes[id]?.items ?? []);
  const worn = profile.items.filter((o) => wornUids.includes(o.uid));
  ledger.items.wornLevel = mean(worn.map((o) => o.upgrade));
  return {
    runs,
    milestones: { firstMaxItem, firstStar, teamEquipped, teamMaxLevel, firstClears },
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
export function summarizeEconomy(content: Content, seeds: number, maxRuns = 600): EconomySummary {
  const runs = Array.from({ length: seeds }, (_, i) => simulateEconomy(content, i + 1, maxRuns));
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
    },
    firstClears,
    ledger,
    unreached: runs.filter((r) => r.milestones.teamMaxLevel === null).length,
  };
}

/** Ce qui tombe et ce qui se dépense, d'après `balance.json` et `dungeons.json`. */
export function printTables(content: Content): void {
  const { progression, chests, economy } = content.balance;
  console.log(
    'Ce qui tombe (premier passage ; rejeu × ' + String(economy.replayRewardRate) + ') :',
  );
  console.log('  donjon            niv   XP     or  poussière  coffre (fragments)');
  for (const d of content.dungeons) {
    const chest = chests.tiers.find((t) => t.id === d.chest);
    console.log(
      `  ${d.id.padEnd(16)} ${String(d.recommendedLevel).padStart(3)} ${String(d.rewards.xp).padStart(5)} ${String(d.rewards.gold).padStart(5)}  ${String(d.rewards.materials.amount).padStart(3)} T${String(d.rewards.materials.tier)}     ${d.chest} (${String(chest?.fragments ?? 0)})`,
    );
  }
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
  const costs = progression.items.upgradeCosts;
  console.log(
    `  objet au niveau ${String(progression.items.maxUpgradeLevel)} : ${String(costs.reduce((s, c) => s + c.copies, 0))} copies, ${String(costs.reduce((s, c) => s + c.gold, 0))} or, ${String(costs.reduce((s, c) => s + c.materials, 0))} poussière du palier de son donjon (${costs.map((c) => `${String(c.copies)}/${String(c.gold)}/${String(c.materials)}`).join(', ')})`,
  );
  console.log(
    `  étoiles : ${chests.starCosts.join(' puis ')} fragments ; invocation : ${String(chests.summonCost)} fragments ; respec : ${String(progression.respec.goldPerHeroLevel)} or × niveau après le premier`,
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
  const content = loadContent();
  printTables(content);
  const summary = summarizeEconomy(content, option('--seeds', 20), option('--runs', 600));
  const f = (n: number | null): string =>
    n === null ? '   —  ' : `${n.toFixed(1).padStart(5)} (${(n / auto).toFixed(0)} tent.)`;
  console.log(
    `Joueur modèle, ${summary.seeds} graines, tentatives à ${Math.round(auto * 100)} % :`,
  );
  console.log(`  premier objet au niveau maximum : ${f(summary.milestones.firstMaxItem)}`);
  console.log(`  première étoile                 : ${f(summary.milestones.firstStar)}`);
  console.log(`  équipe de 4 équipée (2 objets)  : ${f(summary.milestones.teamEquipped)}`);
  console.log(
    `  équipe de 4 au niveau ${content.balance.progression.maxLevel}        : ${f(summary.milestones.teamMaxLevel)}`,
  );
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
}

if (process.argv[1]?.endsWith('economy.ts')) main();
