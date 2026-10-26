import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { t } from '../src/i18n';

describe('App', () => {
  it('affiche le titre et des sections étiquetées', () => {
    render(<App version="0.0.0" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Outlaw Thesis' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: t('home.pillars.heading') })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: t('home.status.heading') })).toBeInTheDocument();
    expect(screen.getByText('Version 0.0.0')).toBeInTheDocument();
  });
});

describe('t', () => {
  it('remplace les paramètres et laisse les inconnus intacts', () => {
    expect(t('home.version', { version: '1.2.3' })).toBe('Version 1.2.3');
    expect(t('home.version')).toBe('Version {version}');
  });
});
