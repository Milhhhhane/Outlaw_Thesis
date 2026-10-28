/**
 * pnpm --filter @outlaw/sim tower [équipes] : la tour étage par étage (lecture seule) : niveau,
 * PV et ATK, ennemis, équipement visé, réussite de l'expert, durée, et le total des récompenses.
 */
import { loadContent } from '@outlaw/data';
import { towerFloor, towerReward } from '@outlaw/engine';
import { towerSim } from './tower';

const content = loadContent();
const runs = Number(process.argv[2] ?? 48);
const started = performance.now();
const report = towerSim(content, Number.isInteger(runs) && runs > 0 ? runs : 48, 1);
const dust = [0, 0, 0];
let fragments = 0;
const chests: Record<string, number> = {};
console.log('étage | niv | PV % | ATK % | objets | expert | actions (moy, min-max) | ennemis');
report.rows.forEach((row, i) => {
  const floor = i + 1;
  const f = towerFloor(content, floor);
  const reward = towerReward(content, floor);
  dust[reward.materials.tier - 1] =
    (dust[reward.materials.tier - 1] ?? 0) + reward.materials.amount;
  fragments += reward.fragments;
  if (reward.chest !== null) chests[reward.chest] = (chests[reward.chest] ?? 0) + 1;
  if (f === null) return;
  console.log(
    [
      String(floor).padStart(5),
      String(f.level).padStart(3),
      String(f.hpPct).padStart(4),
      String(f.atkPct).padStart(5),
      `${String(f.gear.items)}+${String(f.gear.upgrade)}`.padStart(6),
      `${(row.winRate * 100).toFixed(0)} %`.padStart(6),
      `${row.avgPlayer.toFixed(1)} (${String(row.minPlayer)}-${String(row.maxPlayer)})`.padStart(
        22,
      ),
      `${f.enemies.join(', ')}${f.modifier === undefined ? '' : ` [${f.modifier.id}]`}`,
    ].join(' | '),
  );
});
console.log(
  `Total des premières victoires : poussière ${dust.join(' / ')} (brute / fine / pure), ${String(fragments)} fragments, coffres ${JSON.stringify(chests)}`,
);
console.log(
  report.problems.length === 0 ? 'Règles de la tour tenues.' : report.problems.join('\n'),
);
console.log(`${((performance.now() - started) / 1000).toFixed(1)} s`);
