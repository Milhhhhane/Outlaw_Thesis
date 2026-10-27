export interface SpriteInfo {
  /** Taille d'une image, en pixels natifs. */
  readonly w: number;
  readonly h: number;
  /** Première et dernière ligne non transparentes (tête et pieds). */
  readonly top: number;
  readonly bottom: number;
  /** Position de chaque image dans l'atlas. */
  readonly frames: readonly (readonly number[])[];
}

export type SpriteMap = Readonly<Record<string, SpriteInfo>>;
