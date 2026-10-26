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

État du moteur : `damage`, `heal` et `teamPoints` sont gérés depuis le sprint 0 ; les autres
arrivent au sprint 1 (une configuration qui les utilise est refusée d'ici là).

## Héros

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
de butin avec au moins un objet rare.
