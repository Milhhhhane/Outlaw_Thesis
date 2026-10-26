import maree from './maree.json' with { type: 'json' };
import pyra from './pyra.json' with { type: 'json' };
import ronce from './ronce.json' with { type: 'json' };

/** Héros, dans l'ordre d'affichage. Ajouter un héros : un fichier JSON et une ligne ici. */
export const rawHeroes: readonly unknown[] = [pyra, maree, ronce];
