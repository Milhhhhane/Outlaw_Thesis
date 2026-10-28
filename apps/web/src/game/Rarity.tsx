import { tk } from '../i18n';

const ROMAN = ['I', 'II', 'III', 'IV'] as const;

/** Chiffre romain d'une rareté (1 à 4). */
export const roman = (tier: number): string => ROMAN[tier - 1] ?? String(tier);

/** Nom d'une rareté : commun, rare, épique, légendaire. */
export const rarityName = (tier: number): string => tk(`rarity.${String(tier)}`);

/**
 * Pastille de rareté d'un héros : chiffre romain sur la couleur du palier, avec le nom en clair
 * (ou seulement pour les lecteurs d'écran en version courte). La couleur seule ne porte jamais
 * l'information.
 */
export function Rarity({
  tier,
  short = false,
}: {
  readonly tier: number;
  readonly short?: boolean;
}) {
  return (
    <span className={`rarity rarity-${String(tier)}`}>
      <span className="rarity__mark" aria-hidden={short ? true : undefined}>
        {roman(tier)}
      </span>
      {short ? (
        <span className="visually-hidden">{rarityName(tier)}</span>
      ) : (
        <span className="rarity__name">{rarityName(tier)}</span>
      )}
    </span>
  );
}
