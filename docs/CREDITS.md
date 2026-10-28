# Crédits

## Icônes et images

- `apps/web/public/favicon.svg` : création originale pour le projet.
- Pixel art (`apps/web/src/art/` : sprites des héros et ennemis, effets, police 3×5, décors,
  cadres d'interface) : création originale pour le projet, générée par les scripts de
  `tools/art/` à partir de formes dessinées à la main. Aucune image tierce.

- Icônes de l'interface, icônes d'installation et carte des donjons : création originale,
  générée par `tools/art/`.

Toute icône tierce ajoutée doit être sous licence libre et listée ici (nom, auteur, licence,
source).

## Polices

- Pixelify Sans, de Stefie Justprince et The Pixelify Sans Project Authors
  (https://github.com/eifetx/Pixelify-Sans). Licence SIL Open Font License 1.1, texte joint dans
  `apps/web/src/assets/fonts/PixelifySans-OFL.txt`. Source : dépôt google/fonts
  (`ofl/pixelifysans`), réduite aux caractères latins et convertie en WOFF2 (fichier
  `PixelifySans.woff2`, nom de la police inchangé).
- Silkscreen, de Jason Kottke et The Silkscreen Project Authors
  (https://github.com/googlefonts/silkscreen), chiffres seulement (le 5 de Pixelify Sans se
  confond avec le S). Licence SIL Open Font License 1.1, texte joint dans
  `apps/web/src/assets/fonts/Silkscreen-OFL.txt`. Source : dépôt google/fonts
  (`ofl/silkscreen`), réduite aux chiffres et convertie en WOFF2 (`SilkscreenDigits.woff2`).
- Atkinson Hyperlegible, du Braille Institute of America (dessin Applied Design Works ; voir
  https://github.com/googlefonts/atkinson-hyperlegible), police du texte courant, choisie pour sa
  lisibilité. Licence SIL Open Font License 1.1, texte joint dans
  `apps/web/src/assets/fonts/AtkinsonHyperlegible-OFL.txt`. Source : dépôt google/fonts
  (`ofl/atkinsonhyperlegible`), Regular et Bold réduites aux caractères latins et à la
  ponctuation française, converties en WOFF2 (nom de la police inchangé).
- Repli : polices système.

## Personnages

- Héros et monstres : « 16x16 DungeonTileset II » (version 1.3) de 0x72
  (https://0x72.itch.io/dungeontileset-ii), licence Creative Commons Zero (CC0), note jointe dans
  `tools/art/third_party/0x72/LICENSE.txt`. Les personnages et les armes des héros sont recolorés par
  teinte et agrandis ×2 par `tools/art/pack.py` ; les monstres sont retournés. Les anciens personnages générés
  (`heroes.py`, `enemies.py`) ne sont plus utilisés.

## Données

- Liste des mots de passe courants refusés à l'inscription : extraite de SecLists, de Daniel
  Miessler et contributeurs (https://github.com/danielmiessler/SecLists), fichier
  `Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt`, réduite aux 1000 plus
  fréquents de 10 caractères et plus. Licence MIT, texte joint dans
  `packages/accounts/src/SecLists-LICENSE.txt`.
