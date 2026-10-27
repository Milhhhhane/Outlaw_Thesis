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

Six héros, deux par élément, chaque rôle deux fois : Pyra (feu/dégâts), Marée (eau/soutien),
Ronce (nature/contrôle), Cendre (feu/contrôle), Ressac (eau/dégâts), Sève (nature/soutien). Les
trois derniers se débloquent en terminant les donjons 2, 4 et 6.

4 sorts (un par emplacement : `basic`, `a`, `b`, `ult`), un passif, 3 pages de 5 nœuds de
talents. Un nœud porte 1 à 3 modifications de sort (`addEffect`, `scaleEffect`, `cost`, `gain`,
`delay`, `retarget`) ; `requires` crée un prérequis, `group` un choix exclusif « A ou B ».
Chaque héros et chaque page a une **thèse** : une phrase qui dit comment on joue.

## Ennemis

Mêmes stats que les héros, 1 à 4 sorts, un script de 1 à 6 actions joué en boucle (règle de cible
`auto`, `lowest_hp`, `highest_atk`, `first`, `last`). L'action suivante est affichée au joueur.

## Objets et donjons

Un objet modifie le passif (`scale`, `addEffect`, `threshold`, `limit`) et peut porter une petite
stat plafonnée. Un donjon : élément, modificateur, 3 combats (2 salles + boss), récompenses, table
de butin avec au moins un objet rare, et un **coffre** (`chest` : palier de `balance.json`) donné à
la première victoire.

## Textes

Tout identifiant de contenu a son nom dans `apps/web/src/i18n/content.fr.json` (héros et pages :
nom et thèse ; donjons : nom et phrase d'ambiance). Un test échoue s'il en manque un. Les
descriptions (sorts, passifs, talents, objets) sont générées depuis les briques : ne pas les écrire.

## Ajouter un donjon

1. Ennemis et boss dans `content/enemies.json` (un boss : `"boss": true`, seulement au 3e combat).
2. Le donjon dans `content/dungeons.json` : élément, niveau conseillé, modificateur, 3 combats,
   récompenses, butin (au moins un objet rare).
3. Les noms dans `content.fr.json`, puis `pnpm sim` pour voir son taux de réussite.
