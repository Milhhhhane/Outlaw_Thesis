/**
 * Outil de réglage (hors CI) : ajuste le champ hpPct de chaque combat de donjon pour viser une
 * durée moyenne (actions de joueur, politique experte), puis réécrit dungeons.json.
 * `--chapter N` : ne mesure et ne retouche que ce chapitre.
 * `pnpm --filter @outlaw/sim autotune [itérations] [--chapter N]`
 */
import { loadContent, type Dungeon } from '@outlaw/data';
import { pacing } from './pacing';
import { chapterOption, readDungeons, writeTuning } from './tunefile';

const TARGET = { first: 11, normal: 20, boss: 26 };
const content = loadContent();
const { chapter, rest } = chapterOption(process.argv.slice(2));
let dungeons: Dungeon[] = readDungeons();

for (let round = 0; round < Number(rest[0] ?? 4); round++) {
  const tuned = {
    ...content,
    dungeons,
    dungeonById: new Map(dungeons.map((d) => [d.id, d] as const)),
  };
  const report = pacing(tuned, 16, 1, chapter);
  const avg = new Map(report.rows.map((r) => [r.scenario, r.avgPlayer] as const));
  dungeons = dungeons.map((dungeon, d) => {
    if (chapter !== undefined && dungeon.map.chapter !== chapter) return dungeon;
    return {
      ...dungeon,
      encounters: dungeon.encounters.map((encounter, e) => {
        const boss = encounter.enemies.some((id) => content.enemyById.get(id)?.boss === true);
        // Prise en main : seul le tout premier combat du jeu a sa cible propre.
        const target = d === 0 && e === 0 ? TARGET.first : boss ? TARGET.boss : TARGET.normal;
        const now = avg.get(`pace_${dungeon.id}_f${e + 1}`) ?? target;
        const pct = Math.round(((encounter.hpPct ?? 100) * (target / now)) ** 1 / 1);
        const hpPct = Math.min(400, Math.max(10, Math.round(pct)));
        return { ...encounter, hpPct };
      }),
    };
  });
  console.log(
    `tour ${round + 1} : ${report.problems.length} écarts, expert ${(report.expertRate * 100).toFixed(0)} %, moyen ${(report.averageRate * 100).toFixed(0)} %`,
  );
}
writeTuning(dungeons);
