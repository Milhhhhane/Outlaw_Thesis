import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t } from '../src/i18n';
import { decodeBuilds, encodeBuilds } from '../src/save/share';

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('mode test', () => {
  it('tout débloqué, niveau libre, talents, lien partagé, rien de sauvegardé', async () => {
    const user = userEvent.setup();
    render(<App version="test" />);
    await user.click(screen.getByRole('button', { name: t('title.test') }));
    // Le mode test s'ouvre sur l'équipe, tous les héros débloqués.
    expect(screen.getByText(t('test.badge'))).toBeInTheDocument();
    const less = screen.getByRole('button', {
      name: t('ui.less', { what: t('test.level', { hero: names.hero('pyra') }) }),
    });
    for (let i = 0; i < 18; i++) await user.click(less);
    expect(
      screen.getByRole('group', { name: t('test.level', { hero: names.hero('pyra') }) }),
    ).toHaveTextContent('12');

    await user.click(screen.getAllByRole('button', { name: new RegExp(t('team.sheet')) })[2]!);
    await user.click(screen.getByRole('tab', { name: new RegExp(t('sheet.tab.talents')) }));
    await user.click(
      screen.getByRole('button', { name: new RegExp(`^${names.node('ronce_snare_core')}`) }),
    );
    await user.click(screen.getByRole('button', { name: t('sheet.take') }));
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: new RegExp(t('hub.menu.team')) }));

    const link = screen.getByLabelText<HTMLInputElement>(t('test.share.label')).value;
    const builds = decodeBuilds(link.split('#build=')[1] ?? '', content);
    expect(builds?.map((b) => [b.hero, b.level])).toEqual([
      ['pyra', 12],
      ['maree', 30],
      ['ronce', 30],
      ['cendre', 30],
    ]);
    expect(builds?.[2]?.talents).toEqual(['ronce_snare_core']);
    expect(window.localStorage.getItem('outlaw-thesis/save')).not.toContain('"testMode":true');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: t('hub.menu.testExit') }));
    expect(screen.queryByText(t('test.badge'))).toBeNull();
    expect(screen.getByText(t('hub.gold', { gold: 0 }))).toBeInTheDocument();
    // Le mode test débloque les 25 héros : dix-huit clics rerendent tout le vivier, d'où le délai.
  }, 20_000);

  it('un lien de build ouvre le mode test avec l’équipe partagée', () => {
    const code = encodeBuilds([
      { hero: 'maree', level: 7, talents: ['maree_bastion_core'], items: [] },
    ]);
    window.history.replaceState(null, '', `/#build=${code}`);
    render(<App version="test" />);
    expect(screen.getByText(t('test.badge'))).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: t('team.remove', { hero: names.hero('maree') }) }),
    ).toHaveLength(2);
    expect(
      screen.getByRole('group', { name: t('test.level', { hero: names.hero('maree') }) }),
    ).toHaveTextContent('7');
  });

  it('un lien abîmé est signalé', () => {
    window.history.replaceState(null, '', '/#build=abime');
    render(<App version="test" />);
    expect(screen.getByText(t('test.shared.invalid'))).toBeInTheDocument();
  });
});
