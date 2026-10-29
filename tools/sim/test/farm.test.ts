import { loadContent } from '@outlaw/data';
import { describe, expect, it } from 'vitest';
import { chapterDungeons, chapters } from '../src/chapters';
import { farmPlan } from '../src/farm';

const content = loadContent();

describe('rythme du farm', () => {
  it('un pas par paire de donjons d’un même chapitre, poussière du bon palier, cibles tenues', () => {
    const plan = farmPlan(content);
    expect(chapters(content).length).toBeGreaterThanOrEqual(1);
    for (const chapter of chapters(content)) {
      // Chaque chapitre est un enchaînement de niveaux 1 à 30 : mêmes bornes pour chacun.
      const steps = plan.filter((step) => step.chapter === chapter);
      expect(steps).toHaveLength(chapterDungeons(content, chapter).length - 1);
      for (const step of steps) {
        expect(step.tierOk, step.dungeon).toBe(true);
        expect(step.runs, step.dungeon).toBeGreaterThanOrEqual(5);
        expect(step.runs, step.dungeon).toBeLessThanOrEqual(18);
      }
      const total = steps.reduce((sum, step) => sum + step.runs, 0);
      expect(total, `chapitre ${String(chapter)}`).toBeGreaterThan(70);
      expect(total, `chapitre ${String(chapter)}`).toBeLessThan(110);
    }
  });
});
