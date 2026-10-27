/**
 * Outil de réglage (hors CI) : ajuste `atkPct` des combats de chaque donjon pour suivre la courbe
 * de difficulté cible (taux de réussite du joueur moyen au niveau conseillé, de `first` à `last`
 * en ligne droite), puis réécrit dungeons.json. Les PV (durée) ne bougent pas.
 * `pnpm --filter @outlaw/sim tunecurve [tours] [runs]`
 */
import { loadContent, type Dungeon } from '@outlaw/data';
import { pacing } from './pacing';
import { readDungeons, writeTuning } from './tunefile';

const content = loadContent();
const { first, last } = content.balance.targets.averageCurve;
let dungeons: Dungeon[] = readDungeons();
const rounds = Number(process.argv[2] ?? 4);
const runs = Number(process.argv[3] ?? 32);

for (let round = 0; round < rounds; round++) {
  const tuned = { ...content, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
  const report = pacing(tuned, runs, 1);
  const n = dungeons.length;
  const line: string[] = [];
  dungeons = dungeons.map((dungeon, d) => {
    const target = first + ((last - first) * d) / Math.max(1, n - 1);
    const rate =
      report.rows.find((r) => r.scenario === `pace_${dungeon.id}_rec_average`)?.winRate ?? 0;
    // Un écart de 10 points de réussite ≈ 6 % d'ATK ; on amortit pour ne pas osciller.
    const factor = Math.min(1.1, Math.max(0.9, 1 + (rate - target) * 0.4));
    line.push(
      `${dungeon.id} ${(rate * 100).toFixed(0)}→${(target * 100).toFixed(0)} ×${factor.toFixed(2)}`,
    );
    if (Math.abs(rate - target) < 0.04) return dungeon;
    // Le premier donjon doit rester AU MOINS aussi facile que sa cible : on ne le durcit jamais.
    if (d === 0 && rate > target) return dungeon;
    return {
      ...dungeon,
      encounters: dungeon.encounters.map((encounter) => {
        const atkPct = Math.min(400, Math.max(10, Math.round((encounter.atkPct ?? 100) * factor)));
        const rest = { ...encounter };
        delete rest.atkPct;
        return atkPct === 100 ? rest : { ...rest, atkPct };
      }),
    };
  });
  console.log(`tour ${round + 1} : ${line.join(' | ')}`);
}
writeTuning(dungeons);
console.log('dungeons.json réécrit.');
