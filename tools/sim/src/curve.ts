/**
 * Courbe de difficulté : pour chaque donjon, taux de réussite expert et joueur moyen au niveau
 * conseillé, durée moyenne de chaque combat, et les écarts aux cibles. Lecture seule.
 * `pnpm --filter @outlaw/sim curve [runs]`
 */
import { loadContent } from '@outlaw/data';
import { pacing } from './pacing';

const content = loadContent();
const runs = Number(process.argv[2] ?? 16);
const report = pacing(content, runs, 1);
const row = (name: string) => report.rows.find((r) => r.scenario === name);
console.log('donjon              niv  expert  moyen   combats (actions)');
content.dungeons.forEach((d) => {
  const exp = row(`pace_${d.id}_rec_expert`)?.winRate ?? 0;
  const avg = row(`pace_${d.id}_rec_average`)?.winRate ?? 0;
  const fights = d.encounters
    .map((_, e) => (row(`pace_${d.id}_f${e + 1}`)?.avgPlayer ?? 0).toFixed(0))
    .join(' / ');
  console.log(
    `${d.id.padEnd(20)}${String(d.recommendedLevel).padStart(3)}  ${(exp * 100).toFixed(0).padStart(4)} %  ${(avg * 100).toFixed(0).padStart(4)} %   ${fights}`,
  );
});
console.log(
  `moyenne : expert ${(report.expertRate * 100).toFixed(0)} %, moyen ${(report.averageRate * 100).toFixed(0)} %`,
);
for (const p of report.problems) console.log(`  ! ${p}`);
