/**
 * Outil de réglage (hors CI) : ajuste le champ hpPct de chaque combat de donjon pour viser une
 * durée moyenne (actions de joueur, politique experte), puis réécrit dungeons.json.
 * `pnpm --filter @outlaw/sim autotune [itérations]`
 */
import { loadContent, type Dungeon } from '@outlaw/data';
import { pacing } from './pacing';
import { readDungeons, writeTuning } from './tunefile';

const TARGET = { first: 11, normal: 20, boss: 26 };
const content = loadContent();
let dungeons: Dungeon[] = readDungeons();

for (let round = 0; round < Number(process.argv[2] ?? 4); round++) {
  const tuned = {
    ...content,
    dungeons,
    dungeonById: new Map(dungeons.map((d) => [d.id, d] as const)),
  };
  const report = pacing(tuned, 16, 1);
  const avg = new Map(report.rows.map((r) => [r.scenario, r.avgPlayer] as const));
  dungeons = dungeons.map((dungeon, d) => ({
    ...dungeon,
    encounters: dungeon.encounters.map((encounter, e) => {
      const boss = encounter.enemies.some((id) => content.enemyById.get(id)?.boss === true);
      const target = d === 0 && e === 0 ? TARGET.first : boss ? TARGET.boss : TARGET.normal;
      const now = avg.get(`pace_${dungeon.id}_f${e + 1}`) ?? target;
      const pct = Math.round(((encounter.hpPct ?? 100) * (target / now)) ** 1 / 1);
      const hpPct = Math.min(400, Math.max(10, Math.round(pct)));
      return { ...encounter, hpPct };
    }),
  }));
  console.log(
    `tour ${round + 1} : ${report.problems.length} écarts, expert ${(report.expertRate * 100).toFixed(0)} %, moyen ${(report.averageRate * 100).toFixed(0)} %`,
  );
}
writeTuning(dungeons);
