import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { t } from '../src/i18n';

describe('App', () => {
  it('camp : titre, équipe, donjons et combat d’essai', async () => {
    render(<App version="0.0.0" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Outlaw Thesis' })).toBeInTheDocument();
    expect(screen.getByText('Pyra')).toBeInTheDocument();
    expect(screen.getByText('Version 0.0.0')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('hub.demo') }));
    expect(screen.getByRole('heading', { level: 1, name: t('combat.title') })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('combat.quit') }));
    expect(screen.getByRole('button', { name: t('hub.demo') })).toBeInTheDocument();
  });
});

describe('t', () => {
  it('remplace les paramètres et laisse les inconnus intacts', () => {
    expect(t('home.version', { version: '1.2.3' })).toBe('Version 1.2.3');
    expect(t('home.version')).toBe('Version {version}');
  });
});
