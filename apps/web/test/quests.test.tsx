import type { Profile } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { t, tk } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

/** Un donjon terminé : le succès « Premier sang » attend d'être réclamé. */
function cleared(): Profile {
  return {
    ...newProfile(content, 5),
    dungeons: { ember_wastes: { clears: 1, dry: 0, tier: 2 } },
  };
}

describe('écran des quêtes', () => {
  it('chaque quête et chaque succès du contenu a ses textes', () => {
    const { daily, weekly, achievements } = content.quests;
    for (const q of [...daily, ...weekly, ...achievements]) {
      expect(tk(`quests.metric.${q.metric}`)).not.toBe(`quests.metric.${q.metric}`);
      expect(tk(`quests.metric.${q.metric}.one`)).not.toBe(`quests.metric.${q.metric}.one`);
    }
    for (const a of achievements) expect(tk(`quests.ach.${a.id}`)).not.toBe(`quests.ach.${a.id}`);
  });

  it('badge du camp, onglets, succès réclamé une fois', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={cleared()} start={{ name: 'hub' }} />);
    const entry = screen.getByRole('button', { name: new RegExp(t('hub.menu.quests')) });
    expect(within(entry).getByLabelText(t('hub.quests.badge', { n: 1 }))).toHaveTextContent('1');
    await user.click(entry);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('quests.title'));

    // Quotidiennes : les quêtes tirées, plus le bonus du jour, et l'heure de réinitialisation.
    const list = (): HTMLElement => screen.getByRole('list');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(
      content.balance.quests.daily.count + 1,
    );
    expect(screen.getByText(/Nouvelles quêtes dans/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: new RegExp(t('quests.tab.weekly')) }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(
      content.balance.quests.weekly.count,
    );

    await user.click(screen.getByRole('tab', { name: new RegExp(t('quests.tab.achievements')) }));
    const first = screen.getByText(tk('quests.ach.ach_first_win')).closest('li');
    if (first === null) throw new Error('succès introuvable');
    const gold = (): string => screen.getByText(/ or$/, { selector: '.resources__gold' }).textContent;
    const before = gold();
    await user.click(within(first).getByRole('button', { name: t('quests.claim') }));
    expect(within(first).getByText(t('quests.claimed'))).toBeInTheDocument();
    expect(gold()).not.toBe(before);
    expect(screen.getByText(t('quests.achievements.summary', { n: 1, total: content.quests.achievements.length }))).toBeVisible();
  });
});
