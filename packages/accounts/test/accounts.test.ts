import { describe, expect, it } from 'vitest';
import { isCommonPassword } from '../src/common-passwords';
import { CURRENT, hashPassword, temporaryPassword, verifyPassword } from '../src/hash';
import { passwordProblem, pseudoProblem } from '../src/index';

describe('pseudo', () => {
  it('accepte lettres, chiffres, _ et -, de 3 à 20 caractères', () => {
    expect(pseudoProblem('Bob_42-x')).toBeNull();
    expect(pseudoProblem('ab')).toBe('pseudo_length');
    expect(pseudoProblem('a'.repeat(21))).toBe('pseudo_length');
    expect(pseudoProblem('élodie')).toBe('pseudo_chars');
    expect(pseudoProblem('a b c')).toBe('pseudo_chars');
  });

  it('refuse les mots interdits, même déguisés', () => {
    expect(pseudoProblem('Adm1n_du_jeu')).toBe('pseudo_banned');
    expect(pseudoProblem('n4zi')).toBe('pseudo_banned');
    expect(pseudoProblem('computer')).toBeNull();
  });
});

describe('mot de passe', () => {
  it('impose une longueur, pas une composition', () => {
    expect(passwordProblem('court', 'bob')).toBe('password_length');
    expect(passwordProblem('cheval agrafe batterie', 'bob')).toBeNull();
    expect(passwordProblem('bobbobbobbob', 'Bob')).toBe('password_pseudo');
  });

  it('reconnaît les mots de passe courants, sans distinction de casse', () => {
    expect(isCommonPassword('1234567890')).toBe(true);
    expect(isCommonPassword('QWERTYUIOP')).toBe(true);
    expect(isCommonPassword('cheval agrafe batterie')).toBe(false);
  });
});

describe('hachage', () => {
  it('vérifie le bon mot de passe et refuse les autres', async () => {
    const stored = await hashPassword('cheval agrafe batterie');
    expect(stored.startsWith(`scrypt$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$`)).toBe(true);
    expect(await verifyPassword('cheval agrafe batterie', stored)).toEqual({
      ok: true,
      rehash: false,
    });
    expect((await verifyPassword('cheval agrafe batteriE', stored)).ok).toBe(false);
    expect((await verifyPassword('x', 'n-importe-quoi')).ok).toBe(false);
  });

  it('sale chaque hash et demande un re-hachage des paramètres faibles', async () => {
    const a = await hashPassword('même mot de passe');
    const b = await hashPassword('même mot de passe');
    expect(a).not.toBe(b);
    const weak = await hashPassword('ancien compte!', { N: 1024, r: 8, p: 1 });
    expect(await verifyPassword('ancien compte!', weak)).toEqual({ ok: true, rehash: true });
  });

  it('génère des mots de passe temporaires lisibles et différents', () => {
    const a = temporaryPassword();
    expect(a).toMatch(/^[a-zA-Z2-9]{16}$/);
    expect(a).not.toMatch(/[01lIO]/);
    expect(temporaryPassword()).not.toBe(a);
  });
});
