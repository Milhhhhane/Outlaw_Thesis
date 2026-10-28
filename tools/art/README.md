# Pixel art

Les décors, effets, icônes et habillages sont générés par ces scripts (Python 3, Pillow, NumPy) ;
les personnages (25 héros, 12 ennemis) viennent d'un pack CC0 (voir `pack.py` et
`third_party/0x72/`) :

| Fichier          | Contenu                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `pix.py`         | moteur : formes, ombrage par rampes, ombres portées, contours, lueurs  |
| `pal.py`         | rampes de couleurs partagées                                           |
| `heroes.py`      | les 6 héros (64 × 64, tournés vers la droite, 2 images de repos)       |
| `enemies.py`     | les 12 ennemis (64 × 64, boss en 96 × 96, tournés vers la gauche)      |
| `fx.py`          | impacts, projectiles, auras, altérations, police 3 × 5                 |
| `backgrounds.py` | un décor 320 × 180 par donjon                                          |
| `ui.py`          | habillage des menus : fond, cadres bois, planche, corde, cuir, socles  |
| `worldmap.py`    | carte du monde 320 × 180 : contrées, reliefs, eau, repères des donjons |
| `export.py`      | écrit l'atlas, les décors, les cadres et `sprites.ts` dans le web      |
| `scene.py`       | aperçu d'une scène complète, pour juger un réglage                     |

Après une retouche : `python3 tools/art/export.py`, `pnpm prettier --write apps/web/src/art`, puis
committer `apps/web/src/art/`.
Pour voir une planche : `python3 tools/art/heroes.py /tmp/heros.png` (idem `enemies.py`,
`backgrounds.py`).
