# Contenu

Tout le contenu est en JSON (ou en TypeScript qui exporte des données brutes) sous
`packages/data/content/`, validé par les schémas de `packages/data/src/schemas/`. Les textes
affichés ne sont pas dans le contenu : ils vivent dans les fichiers de traduction
(`apps/web/src/i18n/fr.json`), indexés par identifiant.

## Identifiants

`snake_case`, stables, uniques dans tout le jeu (sorts, passifs, nœuds et pages de talents).

## Les 8 briques d'effet

| Brique       | Champs                                   | Rôle                               |
| ------------ | ---------------------------------------- | ---------------------------------- |
| `damage`     | `target`, `power` (% ATK), `element?`    | dégâts                             |
| `heal`       | `target`, `power` (% ATK du lanceur)     | soin                               |
| `shield`     | `target`, `power`, `duration`            | bouclier                           |
| `tempo`      | `target`, `amount` (− avance, + retarde) | modification de tempo              |
| `statMod`    | `target`, `stat`, `percent`, `duration`  | modification de stat avec durée    |
| `status`     | `target`, `status`, `duration`, `power?` | marque, brûlure, étourdissement    |
| `teamPoints` | `amount`, `side` (`own` ou `opposing`)   | gain ou dépense de points d'équipe |
| `trigger`    | `target`, `duration?`, `trigger`         | déclencheur sur événement          |

Cibles : `primary` (cibles du sort), `self`, `subject`, `other`, `all_allies`, `other_allies`,
`all_enemies`, `lowest_hp_ally`, `lowest_hp_enemy`.

Règles (voir `docs/DECISIONS.md`) :

- Les durées comptent les tours du porteur ; un effet posé pendant son tour ne s'use pas ce tour-là.
- Une seule altération de chaque sorte par unité ; boucliers additifs plafonnés ; modifications de
  stat additives bornées, une même origine remplace la précédente.
- `burn` et `mark` prennent leur puissance par défaut dans `balance.json` si `power` est absent.
  **Mettre `power` explicitement** si un talent ou un objet doit l'ajuster.

## Déclencheurs

| `on`             | sujet            | `other`               | options           |
| ---------------- | ---------------- | --------------------- | ----------------- |
| `combat_start`   | le porteur       | —                     |                   |
| `turn_start/end` | l'unité qui joue | —                     |                   |
| `spell_cast`     | le lanceur       | sa première cible     | `slots`           |
| `damage_dealt`   | l'attaquant      | la victime            | `targetHasStatus` |
| `damage_taken`   | la victime       | l'attaquant           | `targetHasStatus` |
| `hp_crossed`     | la victime       | l'attaquant           | `thresholdPct`    |
| `unit_down`      | l'unité tombée   | celle qui l'a abattue |                   |
| `status_applied` | l'unité touchée  | le lanceur            | `status`          |

`subject` filtre le sujet par rapport au porteur : `self`, `ally` (porteur compris), `enemy`,
`any`. `limit` : `per` `combat` ou `turn`. Les effets d'un déclencheur utilisent les stats du
porteur et ne déclenchent jamais d'autre déclencheur.

## Héros

25 héros, chaque couple élément × rôle au moins deux fois. Les six premiers (Pyra, Marée,
Ronce, Cendre, Ressac, Sève) sont communs ; quatre forment l'équipe de départ (`"starter": true`),
Ressac et Sève se débloquent en terminant les donjons 4 et 6. Les 19 autres s'obtiennent par
invocation (fragments des coffres). Ordre d'affichage : `content/heroes/index.ts`.

**Rareté** (`tier`, 1 à 4 : commun, rare, épique, légendaire ; 1 par défaut). Elle fixe le poids
du héros dans le tirage des fragments (`weights` de chaque coffre de `balance.chests.tiers`) et son coût d'invocation
(`chests.summonCosts`). Elle enrichit le kit (passif à deux déclencheurs, mécanique qui plie une
règle pour les légendaires), pas les stats : le chargement refuse un héros dont l'indice de stats
dépasse celui du commun le mieux doté de plus de `TIER_STAT_BUDGET_PCT` (2 %) par palier, et un
héros de départ ou de donjon au-dessus de rare.

Ajouter un héros : un fichier JSON (élément, rôle, rareté, stats, sorts, passif, trois pages de
huit nœuds : racine, choix exclusif de deux, deux branches de deux, sommet), une ligne dans
`content/heroes/index.ts`, ses textes dans `content.fr.json`, son sprite (`HEROES` et `WEAPONS`
dans `tools/art/pack.py`, ou une coiffe propre dans `tools/art/looks.py` : deux héros n'ont jamais
la même silhouette, `export.py` le vérifie ; prise d'arme depuis le milieu du sprite dans
`apps/web/src/art/HeroSprite.tsx`), puis
`pnpm --filter @outlaw/sim heroes` pour situer sa force et `pnpm sim` pour les règles.

4 sorts (un par emplacement : `basic`, `a`, `b`, `ult`), un passif, 3 pages de 5 nœuds de
talents. Un nœud porte 1 à 3 modifications de sort (`addEffect`, `scaleEffect`, `cost`, `gain`,
`delay`, `retarget`) ; `requires` crée un prérequis, `group` un choix exclusif « A ou B ».
Chaque héros et chaque page a une **thèse** : une phrase qui dit comment on joue.

## Ennemis

Mêmes stats que les héros, 1 à 4 sorts, un script de 1 à 6 actions joué en boucle (règle de cible
`auto`, `lowest_hp`, `highest_atk`, `first`, `last`). L'action suivante est affichée au joueur.

## Objets et donjons

Un objet modifie le passif (`scale`, `addEffect`, `threshold`, `limit`) et peut porter une petite
stat plafonnée. Un donjon : élément, modificateur, 3 combats (2 salles + boss), récompenses,
butin, place sur la carte et **coffre** (`chest` : palier de `balance.json` → `chests.tiers`, donné
à la première victoire).

### Butin

`loot` est la liste des objets **propres à ce donjon** : exactement un commun et un rare. Un objet
n'apparaît dans le butin d'aucun autre donjon, et tout objet de `items.json` doit figurer dans un
donjon (le chargement le vérifie et refuse le contenu sinon). Les poids ne sont pas dans le
donjon : `balance.json` → `economy.loot.weights` (commun 85, rare 15), plus 4 de poids de rare par
rang de maîtrise. Règles autour (toutes dans `economy.loot`) :

- `firstClearRare` : le premier passage d'un donjon donne toujours son rare.
- `rarePity` : au plus tard au N-ième passage sans rare dans ce donjon (`profile.dungeons[id].dry`).
- `mastery` : rangs de maîtrise (`clears`), bonus de poids de rare et de poussière par rang.
- `salvage` : poussière rendue par une copie dissoute (`common`, `rare`), au palier de l'objet.

Un objet déjà possédé donne une **copie**, nécessaire pour l'améliorer (`upgradeCosts`). Le palier
de poussière d'un objet est celui de son donjon (`rewards.materials.tier`).

Le tirage reste déterministe (graine du profil) : même profil, même butin.

### Paliers

Chaque donjon a des paliers (I, II, III… : `balance.json` → `tiers.count`) ; terminer un palier
ouvre le suivant du même donjon. Rien n'est écrit par donjon : une seule formule, dans
`balance.tiers`, s'applique à tous. Au palier k :

- les ennemis sont au niveau conseillé + (k − 1) × `levelsPerTier` (le moteur borne au niveau
  maximum) et leurs PV et ATK sont multipliés par 1 + (k − 1) × `enemyPctPerTier` % ;
- XP, or et poussière sont multipliés par 1 + (k − 1) × `rewardPctPerTier` % (XP à 0 par défaut :
  les niveaux viennent de la progression, les paliers servent au craft) ;
- le rare gagne (k − 1) × `rareWeightPerTier` de poids ;
- les ennemis plus forts montent la chance des coffres riches (`chests.dropLevels` et `drop` de
  chaque coffre : le niveau d'ennemis du palier choisit la chance de bronze, d'argent et d'or).

Le premier passage de chaque palier compte comme un premier passage (rare et coffre garantis).
La maîtrise et la garantie du rare restent par donjon, tous paliers confondus. Le profil garde
`dungeons[id].tier` (palier atteint, I par défaut ; voir `packages/engine/src/tiers.ts`).

### Carte

`map` place le donjon sur la carte du monde : `x`, `y` en pixels de la carte native (320 × 180,
`MAP_SIZE` dans `@outlaw/data`), `landmark` (sprite `landmark_<nom>` de l'atlas : `camp`,
`ruins`, `gate`, `tower`, `spire`, `crown`, `bridge`, `salt`, `pass`, `throne`) et `chapter`
(1 par défaut). L'image de la carte ne contient **aucun** repère ni chemin : l'écran les dessine
depuis les données, dans l'ordre du fichier (le chemin relie chaque donjon au précédent). Deux
donjons d'un même chapitre doivent être à plus de 24 px l'un de l'autre (vérifié au chargement).

Un chapitre = une image de carte : `bg/world_map.png` pour le chapitre 1, `bg/world_map_<n>.png`
pour les suivants (à ajouter dans `tools/art/backgrounds.py`). Les onglets de chapitre
n'apparaissent que s'il y en a plusieurs.

`scene` (facultatif) : identifiant du décor de combat (`bg/<scene>.png`) si le donjon réutilise
celui d'un autre ; sinon le décor porte l'identifiant du donjon.

## Quêtes et succès

`content/quests.json` : trois listes, `daily`, `weekly` et `achievements`.

- Une quête : `id`, `metric` (un compteur : `wins`, `wins_tier2`, `wins_tier3`, `levels`,
  `upgrades`, `chests`, `summons`, `stars`), `target` (combien pendant la période) et `minWins`
  (victoires à vie avant qu'elle puisse être tirée, 0 par défaut). Chaque jour (semaine)
  `balance.quests.daily.count` (`weekly.count`) quêtes sont tirées parmi celles permises ; il en
  faut au moins autant avec `minWins` à 0 (vérifié au chargement).
- Un succès : `id`, `metric` (un compteur, ou une mesure du profil : `dungeons_cleared`,
  `clears_total`, `tier3_cleared`, `mastery_rank`, `items_owned`, `items_maxed`, `heroes`,
  `stars_total`, `hero_level`), `target`, `reward` (`small`, `medium` ou `large` : classes de
  `balance.quests.achievements`). Son nom va dans `apps/web/src/i18n/quests.fr.json`
  (`quests.ach.<id>`) ; l'objectif s'écrit tout seul depuis la mesure.
- Une nouvelle mesure demande du code (moteur et texte `quests.metric.<mesure>`) ; tout le reste
  est du JSON. Après un ajout : `pnpm --filter @outlaw/sim economy` pour vérifier l'effet sur les
  jalons (le test `economy.test.ts` le borne à 15 %).

## Textes

Tout identifiant de contenu a son nom dans `apps/web/src/i18n/content.fr.json` (héros et pages :
nom et thèse ; donjons : nom et phrase d'ambiance). Un test échoue s'il en manque un. Les
descriptions (sorts, passifs, talents, objets) sont générées depuis les briques : ne pas les écrire.

## Ajouter un donjon

1. Ennemis et boss dans `content/enemies.json` (un boss : `"boss": true`, seulement au 3e combat).
2. Ses deux objets dans `content/items.json` (un commun, un rare) et leurs noms dans
   `content.fr.json`, puis leurs icônes `item_<id>` (masque 12 × 12 dans `tools/art/icons.py`).
3. Le donjon dans `content/dungeons.json`, **à sa place dans l'ordre de progression** (l'ordre du
   fichier est l'ordre du chemin) : élément, niveau conseillé, modificateur, 3 combats (avec
   `hpPct` / `atkPct` si besoin), récompenses, `loot` (un commun et un rare, nouveaux), `map`
   (`x`, `y`, `landmark`, `chapter`), `scene` si le décor est emprunté.
4. Les noms dans `content.fr.json` (donjon : nom et phrase d'ambiance ; modificateur : nom).
5. Le décor de combat : une entrée dans `tools/art/backgrounds.py` (nouveau tableau ou `tinted`
   d'un existant) puis `python3 tools/art/export.py` ; ou `scene` vers un décor existant.
6. Un nouveau repère si aucun ne convient : `LANDMARKS` dans `tools/art/worldmap.py` **et**
   `LANDMARKS` dans `packages/data/src/schemas/dungeons.ts`, puis export.
7. `pnpm test` (textes, décor, repère, distances, butin vérifiés), puis `pnpm sim` et
   `pnpm --filter @outlaw/sim curve` pour placer le donjon sur la courbe ; `pnpm sim --update` si la baseline change.
