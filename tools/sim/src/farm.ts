/**
 * pnpm --filter @outlaw/sim farm [--auto 58]
 *
 * Rythme de la progression hors combat : combien de passages gagnants (puis de tentatives, au taux
 * de réussite d'Auto) séparent chaque donjon du suivant du même chapitre, pour une équipe complète
 * qui farme le dernier donjon ouvert de ce chapitre (un enchaînement par chapitre : les chapitres
 * sont des régions parallèles). Calcul exact à partir de `balance.json` et `dungeons.json`, sans combat :
 * l'XP par héros d'un côté, la poussière partagée par toute l'équipe de l'autre. Les objets et
 * leurs copies ne sont pas comptés (voir `docs/BALANCE.md`, butin).
 */
import { loadContent, type Content } from '@outlaw/data';
import { levelDust, levelDustTier, xpToNext } from '@outlaw/engine';
import { chapterDungeons, chapters } from './chapters';

export interface FarmStep {
  /** Chapitre de l'enchaînement. */
  readonly chapter: number;
  /** Donjon farmé (le dernier ouvert) et niveau de départ. */
  readonly dungeon: string;
  readonly from: number;
  /** Niveau conseillé du donjon suivant. */
  readonly to: number;
  /** XP par héros et poussière pour toute l'équipe, du niveau `from` au niveau `to`. */
  readonly xp: number;
  readonly dust: number;
  readonly dustTier: number;
  /** Passages gagnants limités par l'XP, par la poussière, et le plus grand des deux. */
  readonly runsXp: number;
  readonly runsDust: number;
  readonly runs: number;
  /** La poussière du donjon est-elle du palier demandé par ces niveaux ? Sinon, blocage. */
  readonly tierOk: boolean;
}

export function farmPlan(content: Content): FarmStep[] {
  const { progression } = content.balance;
  const team = progression.teamSize;
  const steps: FarmStep[] = [];
  const path = chapters(content).flatMap((chapter) =>
    chapterDungeons(content, chapter).map((dungeon, i, list) => ({
      chapter,
      dungeon,
      following: list[i + 1],
    })),
  );
  for (const { chapter, dungeon, following } of path) {
    if (following === undefined) continue;
    const from = dungeon.recommendedLevel;
    const to = following.recommendedLevel;
    let xp = 0;
    let dust = 0;
    let tierOk = true;
    const dustTier = levelDustTier(content, from);
    for (let level = from; level < to; level++) {
      xp += xpToNext(level, content);
      const need = levelDust(content, level);
      dust += need.amount * team;
      if (need.tier !== dungeon.rewards.materials.tier) tierOk = false;
    }
    const runsXp = xp / dungeon.rewards.xp;
    const runsDust = dust / dungeon.rewards.materials.amount;
    steps.push({
      chapter,
      dungeon: dungeon.id,
      from,
      to,
      xp,
      dust,
      dustTier,
      runsXp,
      runsDust,
      runs: Math.max(runsXp, runsDust),
      tierOk,
    });
  }
  return steps;
}

function main(): void {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--auto');
  const auto = index >= 0 ? Number(argv[index + 1]) / 100 : 0.58;
  const content = loadContent();
  const plan = farmPlan(content);
  const f = (n: number): string => n.toFixed(1).padStart(6);
  console.log(
    'donjon farmé       niv   XP/héros  poussière  runs XP  runs pous.  runs  tentatives',
  );
  const totals = new Map<number, number>();
  for (const s of plan) {
    totals.set(s.chapter, (totals.get(s.chapter) ?? 0) + s.runs);
    console.log(
      `${s.dungeon.padEnd(16)} ${String(s.from).padStart(2)}→${String(s.to).padEnd(2)} ${String(s.xp).padStart(8)} ${String(s.dust).padStart(6)} T${s.dustTier}${s.tierOk ? ' ' : '!'} ${f(s.runsXp)} ${f(s.runsDust)}    ${f(s.runs)} ${f(s.runs / auto)}`,
    );
  }
  for (const [chapter, total] of totals)
    console.log(
      `total du chapitre ${String(chapter)} : ${total.toFixed(0)} passages gagnants, ${(total / auto).toFixed(0)} tentatives à ${Math.round(auto * 100)} % de réussite`,
    );
  if (plan.some((s) => !s.tierOk))
    console.log('! un palier de poussière ne correspond pas au donjon farmé : blocage');
}

if (process.argv[1]?.endsWith('farm.ts')) main();
