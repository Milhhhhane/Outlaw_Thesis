/** Configuration de combat invalide (erreur de contenu ou de programmation, jamais du joueur). */
export class InvalidSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSetupError';
  }
}

/** Action refusée par le moteur : mauvaise unité, sort inconnu, cible invalide, points insuffisants… */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
