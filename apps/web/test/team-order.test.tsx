import type { Profile } from '@outlaw/data';
import { newProfile } from '@outlaw/engine';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { CombatScreen } from '../src/combat/CombatScreen';
import { content, demoSetup } from '../src/combat/session';
import { placeOf } from '../src/combat/Stage';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

const savedTeam = (): readonly string[] =>
  (JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as { profile: Profile })
    .profile.team;

/** Emplacements de l'écran d'équipe, dans l'ordre du document (de l'avant vers l'arrière). */
const slots = (): HTMLElement[] =>
  within(screen.getByRole('list', { name: t('team.slots') })).getAllByRole('listitem');

describe('ordre de l’équipe', () => {
  it('l’emplacement 0 est devant sur la scène : le plus à droite, face aux ennemis', () => {
    const xs = [0, 1, 2, 3].map((slot) => placeOf({ side: 'player', slot }).x);
    expect(xs).toEqual([...xs].sort((a, b) => b - a));
    expect(placeOf({ side: 'enemy', slot: 0 }).x).toBeGreaterThan(xs[0]!);
  });

  it('les flèches changent l’ordre sauvegardé ; la place 1 affichée est le héros de devant', async () => {
    const user = userEvent.setup();
    render(<App version="test" initial={newProfile(content, 9)} start={{ name: 'team' }} />);
    const [a, b, c, d] = ['pyra', 'maree', 'ronce', 'cendre'];
    expect(slots().map((s) => s.dataset.hero)).toEqual([a, b, c, d]);
    expect(slots()[0]).toHaveAccessibleName(
      t('team.slot.label', { place: t('team.pos.front', { n: 1 }), hero: names.hero(a) }),
    );
    expect(slots()[3]).toHaveAccessibleName(
      t('team.slot.label', { place: t('team.pos.back', { n: 4 }), hero: names.hero(d) }),
    );
    // Rien à avancer devant, rien à reculer derrière.
    expect(
      screen.getByRole('button', { name: t('team.forward', { hero: names.hero(a) }) }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: t('team.backward', { hero: names.hero(d) }) }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: t('team.forward', { hero: names.hero(b) }) }),
    );
    expect(savedTeam()).toEqual([b, a, c, d]);
    expect(slots()[0]?.dataset.hero).toBe(b);
    expect(slots()[0]).toHaveAccessibleName(
      t('team.slot.label', { place: t('team.pos.front', { n: 1 }), hero: names.hero(b) }),
    );

    await user.click(
      screen.getByRole('button', { name: t('team.backward', { hero: names.hero(c) }) }),
    );
    expect(savedTeam()).toEqual([b, a, d, c]);
    expect(slots().map((s) => s.dataset.hero)).toEqual([b, a, d, c]);
  });

  it('le combat place le héros de la place 1 à l’emplacement 0, celui de devant', () => {
    const setup = demoSetup();
    render(<CombatScreen setup={setup} onExit={() => undefined} />);
    const front = document.querySelector<HTMLElement>('[data-unit="h0"]');
    expect(front?.dataset.kind).toBe('pyra');
  });

  it('l’intention ennemie dit qu’elle vise le héros de devant', async () => {
    render(<CombatScreen setup={demoSetup()} onExit={() => undefined} />);
    const rule = t('combat.intent.rule', {
      spell: names.spell('brute_smash'),
      targets: names.hero('pyra'),
      rule: t('combat.intent.rule.first'),
    });
    await waitFor(() => {
      expect(document.querySelector(`.hud__intent[title="${rule}"]`)).not.toBeNull();
    });
    const hud = document.querySelector(`.hud__intent[title="${rule}"]`);
    expect(hud?.querySelector('.hud__rule')).toHaveTextContent(t('combat.intent.short.first'));
  });
});
