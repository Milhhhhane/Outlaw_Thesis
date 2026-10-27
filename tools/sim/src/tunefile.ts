import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dungeonSchema, type Dungeon } from '@outlaw/data';

/** `dungeons.json` du contenu, lu et réécrit par les outils de réglage. */
export const DUNGEONS_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/data/content/dungeons.json',
);

interface RawEncounter {
  hpPct?: number;
  atkPct?: number;
}
interface RawDungeon {
  encounters: RawEncounter[];
}

/** Donjons validés (valeurs par défaut des schémas comprises) : à mesurer comme le jeu les joue. */
export function readDungeons(): Dungeon[] {
  return (JSON.parse(readFileSync(DUNGEONS_FILE, 'utf8')) as unknown[]).map((raw) =>
    dungeonSchema.parse(raw),
  );
}

/** Ne réécrit que `hpPct` et `atkPct` de chaque combat : le reste du fichier reste tel quel. */
export function writeTuning(dungeons: readonly Dungeon[]): void {
  const raws = JSON.parse(readFileSync(DUNGEONS_FILE, 'utf8')) as RawDungeon[];
  raws.forEach((raw, d) => {
    raw.encounters.forEach((encounter, e) => {
      const tuned = dungeons[d]?.encounters[e];
      const keep = (value: number | undefined): number | undefined =>
        value === undefined || value === 100 ? undefined : value;
      encounter.hpPct = keep(tuned?.hpPct);
      encounter.atkPct = keep(tuned?.atkPct);
    });
  });
  writeFileSync(DUNGEONS_FILE, `${JSON.stringify(raws, null, 2)}\n`);
}
