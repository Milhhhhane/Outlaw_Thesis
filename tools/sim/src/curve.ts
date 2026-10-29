/**
 * Courbe de difficulté : pour chaque donjon, taux de réussite expert et joueur moyen au niveau
 * conseillé, durée moyenne de chaque combat, et les écarts aux cibles. Lecture seule.
 * `pnpm --filter @outlaw/sim curve [runs] [--chapter N]` (la courbe se lit par chapitre).
 */
import { loadContent } from '@outlaw/data';
import { chapterOption } from './tunefile';
import { pacing } from './pacing';

const content = loadContent();
const { chapter, rest } = chapterOption(process.argv.slice(2));
const runs = Number(rest[0] ?? 16);
const report = pacing(content, runs, 1, chapter);
const row = (name: string) => report.rows.find((r) => r.scenario === name);
console.log('donjon              ch  niv  expert  moyen   combats (actions)');
content.dungeons.forEach((d) => {
  if (chapter !== undefined && d.map.chapter !== chapter) return;
  const exp = row(`pace_${d.id}_rec_expert`)?.winRate ?? 0;
  const avg = row(`pace_${d.id}_rec_average`)?.winRate ?? 0;
  const fights = d.encounters
    .map((_, e) => (row(`pace_${d.id}_f${e + 1}`)?.avgPlayer ?? 0).toFixed(0))
    .join(' / ');
  console.log(
    `${d.id.padEnd(20)}${String(d.map.chapter).padStart(2)} ${String(d.recommendedLevel).padStart(3)}  ${(exp * 100).toFixed(0).padStart(4)} %  ${(avg * 100).toFixed(0).padStart(4)} %   ${fights}`,
  );
});
for (const c of report.chapters)
  console.log(
    `chapitre ${String(c.chapter)} : expert ${(c.expertRate * 100).toFixed(0)} %, moyen ${(c.averageRate * 100).toFixed(0)} %`,
  );
for (const p of report.problems) console.log(`  ! ${p}`);
