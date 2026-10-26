import fr from './fr.json';

/** Clés de texte : le français est la langue par défaut et la référence des clés. */
export type TextKey = keyof typeof fr;

const dictionary: Readonly<Record<TextKey, string>> = fr;

/** Texte traduit ; les {paramètres} sont remplacés, une clé inconnue est rendue telle quelle. */
export function t(key: TextKey, params: Readonly<Record<string, string | number>> = {}): string {
  return dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
