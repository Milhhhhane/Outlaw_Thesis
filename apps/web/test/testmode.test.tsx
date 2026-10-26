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
    await user.click(screen.getByRole('button', { name: t('test.enter') }));
    expect(screen.getByText(t('test.banner'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t('hub.dungeon.enter') })).toHaveLength(
      content.dungeons.length,
    );

    await user.selectOptions(
      screen.getByLabelText(t('test.level', { hero: names.hero('pyra') })),
      '12',
    );
    expect(screen.getByText(t('hub.level', { level: 12 }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ronce/ }));
    await user.click(
      screen.getByRole('button', { name: new RegExp(names.node('ronce_snare_core')) }),
    );
    await user.click(screen.getByRole('button', { name: t('nav.back') }));

    const link = screen.getByLabelText<HTMLInputElement>(t('test.share.label')).value;
    const builds = decodeBuilds(link.split('#build=')[1] ?? '', content);
    expect(builds?.map((b) => [b.hero, b.level])).toEqual([
      ['pyra', 12],
      ['maree', 30],
      ['ronce', 30],
    ]);
    expect(builds?.[2]?.talents).toEqual(['ronce_snare_core']);
    expect(window.localStorage.getItem('outlaw-thesis/save')).not.toContain('"testMode":true');

    await user.click(screen.getByRole('button', { name: t('test.exit') }));
    expect(screen.queryByText(t('test.banner'))).toBeNull();
    expect(screen.getByText(t('hub.gold', { gold: 0 }))).toBeInTheDocument();
  });

  it('un lien de build ouvre le mode test avec l’équipe partagée', () => {
    const code = encodeBuilds([
      { hero: 'maree', level: 7, talents: ['maree_bastion_core'], items: [] },
    ]);
    window.history.replaceState(null, '', `/#build=${code}`);
    render(<App version="test" />);
    expect(screen.getByText(t('test.banner'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t('hub.team.remove') })).toHaveLength(1);
    expect(screen.getByText(t('hub.level', { level: 7 }))).toBeInTheDocument();
  });

  it('un lien abîmé est signalé', () => {
    window.history.replaceState(null, '', '/#build=abime');
    render(<App version="test" />);
    expect(screen.getByText(t('test.shared.invalid'))).toBeInTheDocument();
  });
});
