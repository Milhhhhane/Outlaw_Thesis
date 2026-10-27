import type { Profile } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Trois combats joués au clic : lent sur les machines de CI (Windows surtout). */
const LONG_UI_TEST = 60_000;
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

function leveled(level: number): Profile {
  const profile = newProfile(content, 9);
  return {
    ...profile,
    heroes: Object.fromEntries(
      Object.entries(profile.heroes).map(([id, h]) => [id, { ...h, level }]),
    ),
  };
}

/** Joue le combat affiché au clic : l'ultime dès que possible, sinon l'attaque de base. */
async function playFight(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let turn = 0; turn < 200 && screen.queryByRole('dialog') === null; turn++) {
    const actions = screen.getByRole('region', { name: /Au tour de/ });
    const spells = within(actions).getAllByRole<HTMLButtonElement>('button');
    const ult = spells[3];
    await user.click(ult !== undefined && !ult.disabled ? ult : spells[0]!);
    const targets = document.querySelectorAll<HTMLButtonElement>('button.hitbox--target');
    if (targets.length > 0) await user.click(targets[0]!);
  }
}

describe('boucle donjon → récompense → investissement', () => {
  it(
    'termine un donjon au clic, reçoit l’objet, l’équipe et prend un talent',
    async () => {
      const user = userEvent.setup();
      render(<App version="test" initial={leveled(10)} start={{ name: 'hub' }} />);

      await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.dungeons')) }));
      await user.click(screen.getByRole('button', { name: new RegExp(t('map.prepare')) }));
      await user.click(
        screen.getByRole('button', {
          name: new RegExp(t('team.go', { dungeon: names.dungeon('ember_wastes') })),
        }),
      );
      for (let room = 1; room <= 3; room++) {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`combat ${room} sur 3`);
        await playFight(user);
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button'));
      }

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        names.dungeon('ember_wastes'),
      );
      const looted = screen.getByRole('heading', { level: 2, name: /Objet obtenu/ }).textContent;
      await user.click(screen.getByRole('button', { name: t('reward.continue') }));

      // De retour au camp : or gagné, deuxième donjon ouvert, objet à l'atelier.
      expect(screen.getByText(t('hub.gold', { gold: 80 }))).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.dungeons')) }));
      expect(screen.getAllByRole('button', { name: new RegExp(t('map.cleared')) })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: new RegExp(t('map.next')) })).toHaveLength(1);
      await user.keyboard('{Escape}');
      const itemName = looted.replace('Objet obtenu : ', '');
      await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.workshop')) }));
      expect(screen.getByRole('button', { name: new RegExp(itemName) })).toBeInTheDocument();
      await user.keyboard('{Escape}');

      // Investissement : équiper l'objet sur Pyra et prendre un talent.
      await user.click(
        screen.getByRole('button', { name: new RegExp(`^${t('hub.menu.heroes')}`) }),
      );
      await user.click(screen.getByRole('button', { name: /^Pyra/ }));
      await user.click(screen.getByRole('tab', { name: t('sheet.tab.items') }));
      await user.click(screen.getByRole('button', { name: t('sheet.slot.choose', { n: 1 }) }));
      const picker = screen.getByRole('dialog', { name: t('sheet.slot.title', { n: 1 }) });
      await user.click(within(picker).getByRole('button', { name: new RegExp(itemName) }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(
        screen.getByRole('button', { name: t('sheet.slot.choose', { n: 1 }) }),
      ).toHaveTextContent(itemName);

      await user.click(screen.getByRole('tab', { name: new RegExp(t('sheet.tab.talents')) }));
      const label = (state: string): string =>
        t('sheet.node.label', {
          node: names.node('pyra_exe_core'),
          state: t(`sheet.node.state.${state}` as 'sheet.node.state.ready'),
        });
      await user.click(screen.getByRole('button', { name: label('ready') }));
      // Aperçu : la valeur du sort avant et après.
      expect(screen.getByText(/\+ 215 % ATK de dégâts/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: t('sheet.take') }));
      expect(screen.getByRole('button', { name: label('taken') })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: t('hero.respec.free') }));
      expect(screen.getByRole('button', { name: label('ready') })).toBeInTheDocument();

      // Tout est sauvegardé.
      const saved = JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as {
        profile: Profile;
      };
      expect(saved.profile.gold).toBe(80);
      expect(saved.profile.heroes.pyra?.items[0]).toBe(saved.profile.items[0]?.uid);
    },
    LONG_UI_TEST,
  );

  it('un refus du moteur est expliqué', async () => {
    const user = userEvent.setup();
    const profile = { ...newProfile(content), team: ['pyra'] };
    render(<App version="test" initial={profile} start={{ name: 'team' }} />);
    await user.click(
      screen.getAllByRole('button', { name: t('team.remove', { hero: names.hero('pyra') }) })[0]!,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(t('refusal.bad_team'));
  });
});
