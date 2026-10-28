import type { Profile } from '@outlaw/data';
import { newProfile, spellPowerPct, spellUpCost } from '@outlaw/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { content } from '../src/combat/session';
import { names, t } from '../src/i18n';

beforeEach(() => {
  window.localStorage.setItem('outlaw-thesis/intro-dismissed', '1');
});
afterEach(() => {
  window.localStorage.clear();
});

function saved(): Profile {
  return (
    JSON.parse(window.localStorage.getItem('outlaw-thesis/save') ?? '{}') as { profile: Profile }
  ).profile;
}

describe('onglet Grimoire de la fiche', () => {
  it('affiche niveau, coût et aperçu, monte un sort et débite grimoires et fragments', async () => {
    const user = userEvent.setup();
    const cost = spellUpCost(content, 1)!;
    const profile: Profile = {
      ...newProfile(content, 3),
      grimoires: cost.grimoires,
      fragments: { pyra: cost.fragments },
    };
    render(<App version="test" initial={profile} start={{ name: 'hero', id: 'pyra' }} />);
    await user.click(screen.getByRole('tab', { name: t('sheet.tab.spells') }));
    const ult = content.heroById.get('pyra')!.spells.find((s) => s.slot === 'ult')!;
    const basic = content.heroById.get('pyra')!.spells.find((s) => s.slot === 'basic')!;
    expect(
      screen.getAllByText(
        t('spells.cost', { grimoires: cost.grimoires, fragments: cost.fragments }),
      ),
    ).toHaveLength(4);
    expect(screen.getAllByText(t('spells.next', { level: 2 }))).toHaveLength(4);
    await user.click(
      screen.getByRole('button', { name: t('spells.up', { spell: names.spell(basic.id) }) }),
    );
    expect(saved().heroes.pyra?.spells.basic).toBe(2);
    expect(saved().grimoires).toBe(0);
    expect(saved().fragments.pyra).toBe(0);
    expect(
      screen.getByText(t('spells.gain', { pct: spellPowerPct(content.balance, 2) })),
    ).toBeInTheDocument();
    // Plus rien en réserve : les autres boutons sont grisés.
    expect(
      screen.getByRole('button', { name: t('spells.up', { spell: names.spell(ult.id) }) }),
    ).toBeDisabled();
  });
});
