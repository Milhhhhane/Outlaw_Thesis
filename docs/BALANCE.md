# Équilibrage

Tous les paramètres vivent dans [`packages/data/balance.json`](../packages/data/balance.json),
validé par `packages/data/src/schemas/balance.ts`. On équilibre en modifiant ce fichier et le
contenu, **jamais les règles du moteur**.

## Formules

| Quantité          | Formule                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| Prochain tour     | maintenant + délai × 100 ÷ min(VIT, `speedCap`)                            |
| Premier tour      | `initialDelay` × 100 ÷ VIT                                                 |
| Dégâts            | max(`minDamage`, arrondi(ATK × puissance % × K ÷ (K + DEF) × élément))     |
| Élément           | feu > nature > eau > feu : ×`advantage` (1,25) ou ×`disadvantage` (0,8)    |
| Soin              | arrondi(ATK du lanceur × puissance %), plafonné aux PV max                 |
| Stats au niveau N | base × (1 + croissance × (N − 1) ÷ (niveau max − 1)) ; la VIT ne croît pas |

| Marque | dégâts subis × (1 + puissance %), `markBonusPct` par défaut (25) |
| Brûlure | ATK × puissance % × K ÷ (K + DEF), fixée à la pose, `burnPowerPct` (40) |
| Bouclier | ATK × puissance %, cumulable jusqu'à `shieldCapPctMaxHp` (60 %) des PV max |
| Modif. de stat | somme des % bornée à [`statMod.minPct`, `statMod.maxPct`] = [−50, +100] |
| Tempo | ± montant × 100 centièmes, jamais avant l'instant présent |
| Étourdissement | tour sauté, puis immunité `stunImmunityTurns` (1) tour |

K = `defenseScale` (100). Avec DEF = K, la moitié des dégâts passe. ATK, DEF et VIT sont les
stats effectives (modifications comprises).

## Réserve de points

Départ `teamPoints.start` (3), plafond `cap` (6), attaque de base `+basicGain` (1). Coûts :
A = 1, B = 2, ultime = 4. Délais : base 100, A 100, B 120, ultime 150.

## Règles d'équilibre (cibles de la simulation)

Mesurées par `pnpm sim` sur 50 équipes tirées avec une graine fixe parmi les 12 650 possibles (voir
« 25 héros et rareté ») ; `pnpm sim:check` (CI) échoue si l'une
d'elles n'est plus tenue. Définitions exactes dans `tools/sim/src/rules.ts` :

- **R1** : pour chaque équipe et chaque niveau conseillé (où les talents permettent des builds
  différents), 6 builds tirés au hasard sont classés par leurs duels contre 4 builds de référence ;
  le meilleur et le pire s'affrontent ensuite, dans les deux sens.
- **R2** : pour chaque donjon, part des équipes dont le meilleur des 6 builds termine le donjon
  avec 3 niveaux de retard.
- **Aucun héros indispensable** : score d'une équipe = donjons terminés au niveau conseillé et
  avec 3 niveaux de retard (13 essais) ; la meilleure équipe sans chaque héros est comparée à la
  meilleure équipe.

### Résultats (sprint 5)

| Règle                     | Mesure                                  | Cible  |
| ------------------------- | --------------------------------------- | ------ |
| R1                        | 86 % (82 à 90 % selon le donjon)        | ≥ 70 % |
| R2                        | 60 % sur le pire donjon (60 à 80 %)     | > 50 % |
| Aucun héros indispensable | écart 0 point (13/13 sans chaque héros) | ≤ 10   |

### Journal de réglage (sprint 5)

1. R1 était à 64–72 % quand « meilleur » et « pire » build étaient jugés en donjon : ce classement
   ne prédit pas les duels. Jugés au duel (contre un groupe de référence qu'ils ne rencontrent
   qu'après), les builds vont de 6 % à 81 % de victoires : les talents pèsent ; R1 passe à 83–86 %.
2. R2 était à 35 % : même au niveau conseillé, seules 12 à 16 équipes sur 20 passaient les donjons.
   Les équipes à deux soutiens manquaient de dégâts. Croissance des stats × 0,6 (héros et ennemis,
   comme le prévoit le rapport), talents positifs × 1,5, Marée et Sève plus offensives (attaque de
   base 110 % et 105 %, Marée montante avance les alliés, Éclosion ATK +25 %), modificateurs des
   donjons 2 et 3 adoucis : R2 = 60 %.
3. Constat : les équipes avec un contrôleur (Ronce, Cendre) sont les plus robustes ; aucune n'est
   pourtant indispensable au sens de la règle. À surveiller si de nouveaux héros arrivent.

## Lot 7 : combats plus courts et plus durs

Mesure (`pnpm sim`, module `tools/sim/src/pacing.ts`) : pour chaque donjon, 16 équipes de 3
héros tirées au hasard (builds aléatoires), au niveau conseillé, jouées par deux politiques.
Durées en **actions de joueur** (un tour d'équipe ≈ 3), politique experte ; « Expert » et
« Moyen » : part des donjons terminés au niveau conseillé.

- **Expert** : anticipation d'un coup (chaque action jouée par le moteur, état évalué).
- **Joueur moyen** : une décision sur quatre sous-optimale (une autre action, au hasard) ; les
  autres à anticipation limitée, moitié règle simple du glouton (le sort le plus cher payable sur
  l'ennemi le plus affaibli, sans regarder les menaces), moitié anticipation d'un coup.
  Déterministe par graine. Avec la seule anticipation, l'écart expert / moyen restait sous
  15 points quel que soit le réglage ; avec le seul glouton, il dépassait 50 points.

Leviers (côté monstres uniquement) :

- `balance.json` → `enemyScale` : **PV × 0,55, ATK × 1,85** pour tous les ennemis (après la
  croissance par niveau). Deux nombres à retoucher librement ; `pnpm --filter @outlaw/sim tune
'{"enemyScale":{"hp":0.6,"atk":1.7}}'` montre l'effet sans rien écrire.
- `dungeons.json` → `hpPct` par combat (78 à 159 %) : règle la durée combat par combat. Calculé
  par `pnpm --filter @outlaw/sim autotune` (vise 19 actions par combat, 25 par boss, en remontant
  les combats dont le plus court passe sous le plancher), puis retouché à la main.
- Menaces plus marquées, dans les scripts existants (une grosse action tous les 3 à 5 coups) :
  puissance de Bond 170, Éruption 190, Tempête de feu 160, Déferlante 100, Séisme 110, Lame de fond 180, Rugissement 80, Flamboiement 90, Contre-courant 90 (en % d'ATK). PV de base revus : boss allégés (950 à 1 650),
  Sorcière 540, Héraut 420, Acolyte 540, Crabe 520.
- Combats : donjon 1, combat 1 à deux molosses ; Citadelle, combat 2 : molosse, sorcière,
  acolyte ; Flèche engloutie : un molosse et un acolyte remplacent un héraut et un crabe.

Résultat : expert **84 %**, joueur moyen **44 %** au niveau conseillé ; R1 86 %, R2 70 % (pire
donjon, 3 niveaux de retard) ; toutes les durées dans les bornes, planchers compris.

Écarts assumés, à arbitrer par le propriétaire :

- **Plafond du donjon 1 (40 actions)** : incompatible avec les planchers. Le plus court possible
  est 9 + 12 + 21 = 42 actions ; avec la dispersion des équipes, la moyenne ne descend pas sous
  ~55 sans faire passer des combats sous le plancher. Plafond fixé à 60 dans `balance.json`.
- **Plafond des autres donjons (66)** : même cause (plancher 12 tenu par l'équipe la plus rapide,
  qui va environ deux fois plus vite que la moyenne). Plafond fixé à 72.
- **Aucun héros indispensable** (nouvelle définition : part des donjons terminés avec 3 niveaux
  de retard, joueur moyen, 6 builds par équipe et par donjon) : **non tenue, écart 17 points**.
  La meilleure équipe (Ronce, Cendre, Ressac) passe 50 % des donjons ; sans Ressac, la meilleure
  tombe à 33 %. Les équipes avec Marée ou Sève, jouées sans finesse, peinent dans les donjons
  5 à 7. La cause est dans les héros, que ce lot ne devait pas toucher : la mesure est affichée
  par `pnpm sim:check` mais ne bloque pas la CI. Piste : rendre les sorts de soutien plus
  rentables ou plus simples à bien jouer.

## Règles (rappel des cibles)

- **R1** : à niveau égal, le meilleur build bat le pire dans au moins `r1MinWinRate` (70 %) des
  combats.
- **R2** : avec `r2LevelGap` (3) niveaux de retard sur le niveau recommandé du donjon, le
  meilleur build termine le donjon (3 combats) dans plus de `r2MinWinRate` (50 %) des cas.
- **Aucun héros indispensable** : la meilleure équipe sans un héros donné reste à moins de
  `dispensableMaxGapPoints` (10 points) du meilleur taux de victoire.

## Simulation

`pnpm sim` écrit `tools/sim/out/results.csv` (colonnes `scenario, battles, wins, win_rate,
avg_actions`). Sprint 0 : scénarios synthétiques (duels par paire d'éléments, 3 contre 3,
limite d'actions). Depuis le sprint 1 : 1 000 combats aléatoires reproductibles (graine 1) — niveau, ordre de
l'équipe, talents et rencontre tirés au sort — joués par une politique d'anticipation d'un coup,
chaque journal étant rejoué et comparé. Options : `--battles N`, `--seed S`. Les 20 équipes et
R1/R2 arrivent au sprint 5.

## Premier test (sprint 2) : la réserve partagée

Combat d'essai joué par la politique d'anticipation (victoire) : Marée enchaîne les attaques de base
pour nourrir la réserve (12), Ronce la dépense en marques et entraves (10), Pyra place deux
Embrasements. La réserve n'atteint jamais son plafond : les points sont rares et disputés, c'est
l'effet recherché. Point ouvert : aucun ultime n'est lancé (coût 4 trop lourd pour son effet ?),
à régler au sprint 5. Ce test ne remplace pas un essai humain.

## Donjons (sprint 3)

`pnpm sim` ajoute `dungeon_<id>_rec` et `dungeon_<id>_minus3` : 40 passages, builds tirés au
hasard, politique d'anticipation. Constat : au niveau conseillé, 68 à 100 % ; 3 niveaux sous,
0 % dès le deuxième donjon (mur au 2e combat). R2 n'est donc pas tenue : à régler au sprint 5
(croissance des stats, puis ennemis). Une politique gloutonne perd même 9 niveaux au-dessus :
elle achète des sorts utilitaires sans infliger de dégâts et atteint la limite d'actions.

## Lot 10 — arbres de talents plus riches

Chaque page passe de 5 à 8 nœuds (24 par héros) et les trois spécialisations sont ouvertes dès le
niveau 1 ; les points montent de 10 à 14 (un tous les deux niveaux, du niveau 2 au 28). Un build
laisse donc 10 nœuds de côté : le choix est réel. Les trois nouveaux nœuds d'une page sont des
compromis (puissance contre coût ou délai, zone contre puissance, cadence contre dégâts) et un
sommet au bout de la branche profonde.

Effet mesuré : avec plus de nœuds, les meilleurs builds tuaient plus vite (plancher d'actions
enfreint sur quatre combats, expert à 92 %). Réglage : PV des monstres × 0,58 (au lieu de 0,55),
`hpPct` retouchés par `autotune` puis à la main, et le premier combat du Carrefour brisé troque la
sorcière des ronces (trop fragile face aux builds explosifs : son combat oscillait entre 10 et
25 actions selon un seuil) contre la brute de mousse. Résultat : expert 87 %, joueur moyen 42 %,
R1 90 %, R2 85 %, tous les combats dans leurs bornes. « Aucun héros indispensable » reste
non tenue (17 points, non bloquant, cause côté héros comme avant).

## Lot 11 — courbe de difficulté et trois donjons de plus

Constat : le premier donjon était le plus dur pour un joueur moyen (25 % de réussite au niveau
conseillé, contre 50 à 62 % plus loin) : PV à 131–146 %, modificateur +10 % ATK, équipe sans
talent. Nouveau levier `atkPct` par combat (dégâts des ennemis, sans toucher à la durée) et règle
de courbe dans la simulation (`targets.averageCurve` : premier donjon ≥ 70 %, jamais plus de 12
points plus facile que le précédent, jamais sous 30 %). Rythme mesuré sur 48 équipes en CI
(16 avant : trop bruité pour une courbe), plancher de durée 10 actions.

| Donjon            | Niv. | Expert | Moyen | atkPct |
| ----------------- | ---: | -----: | ----: | -----: |
| Landes de braise  |    1 |  100 % |  90 % |     72 |
| Salles englouties |    4 |  100 % |  75 % |     92 |
| Dédale de ronces  |    8 |   92 % |  65 % |    100 |
| Citadelle         |   12 |   98 % |  54 % |     86 |
| Flèche engloutie  |   17 |   92 % |  40 % |    100 |
| Couronne          |   22 |   75 % |  40 % |    107 |
| Carrefour brisé   |   27 |   81 % |  38 % |    130 |
| Salines blêmes    |   28 |   73 % |  33 % |    160 |
| Col d'obsidienne  |   29 |   58 % |  38 % |    115 |
| Trône creux       |   30 |   63 % |  42 % |    140 |

Trois donjons de fin de progression (niveaux 28 à 30, après le Carrefour brisé) : Salines blêmes
(DEF −10 % à chaque tour, deux boss), Col d'obsidienne (brûlure à chaque coup reçu, tyran et
matrone ensemble), Trône creux (−1 point de réserve à l'entrée, colosse et gardien). La fin de
courbe est plate (33–42 %) : les derniers donjons sont durs mais pas plus que le Carrefour, parce
qu'au-delà l'expert décroche avant le joueur moyen. Outils : `pnpm --filter @outlaw/sim curve`
(lecture) et `tunecurve` (écrit `atkPct`).

## Coffres et fragments

Valeurs de `balance.json`, partie `chests`. Espérances calculées à la main (6 héros), pas mesurées
sur des joueurs : ni la simulation ni `sim:check` ne modélisent les coffres (elle fixe les niveaux).

| Palier | Fragments | Donjons | Avec héros ciblé (50 %)               | Sans ciblage    |
| ------ | --------- | ------- | ------------------------------------- | --------------- |
| Bronze | 3         | 1, 2    | 1,75 par coffre : 5,7 coffres pour 10 | 0,50 par coffre |
| Argent | 5         | 3, 4, 5 | 2,92 par coffre : 3,4 coffres pour 10 | 0,83 par coffre |
| Or     | 8         | 6 à 10  | 4,67 par coffre : 2,1 coffres pour 10 | 1,33 par coffre |

- Premières victoires : 61 fragments au total sur les dix donjons (2 × 3 + 3 × 5 + 5 × 8).
- Rejeu : un coffre une fois sur deux, soit 11 rejeux de bronze, 7 d'argent ou 4 d'or en moyenne
  pour 10 fragments sur le héros ciblé.
- Niveaux conseillés : 1, 4, 8, 12, 17, 22, 27, 28, 29, 30. Le donjon 4 (niveau 12) demande la première étoile
  (plafond 10 → 20) et le donjon 6 (niveau 22) la seconde (20 → 30), soit 30 fragments par héros
  de l'équipe pour aller au bout. À vérifier au test humain : si c'est trop lent, baisser
  `starCosts` ou monter les chances de coffre (`chests.tiers[].drop`) avant de toucher aux niveaux.

## Combat automatique

Mesure : `pnpm --filter @outlaw/sim auto [équipes]` (`tools/sim/src/auto.ts`, lecture seule). Même
protocole que le rythme : équipes de 3 héros aléatoires au niveau conseillé, donjon réussi si les
trois combats sont gagnés ; 300 équipes par donjon, soit une marge d'environ ±5 points par ligne.

| Donjon          | Expert | Joueur moyen simulé | Auto |
| --------------- | ------ | ------------------- | ---- |
| ember_wastes    | 100 %  | 91 %                | 85 % |
| drowned_halls   | 100 %  | 74 %                | 76 % |
| thorn_maze      | 91 %   | 62 %                | 73 % |
| cinder_citadel  | 93 %   | 49 %                | 65 % |
| sunken_spire    | 88 %   | 47 %                | 71 % |
| verdant_crown   | 79 %   | 42 %                | 59 % |
| broken_crossing | 83 %   | 46 %                | 49 % |
| salt_flats      | 78 %   | 35 %                | 28 % |
| obsidian_pass   | 61 %   | 32 %                | 39 % |
| hollow_throne   | 78 %   | 36 %                | 38 % |
| **Moyenne**     | 85 %   | 51 %                | 58 % |

- Auto fait un peu mieux que le joueur moyen simulé (une décision sur quatre au hasard) dans les
  donjons du début et du milieu, autant dans les trois derniers, et reste 27 points sous l'expert.
  Il n'enchaîne donc pas de façon fiable les donjons difficiles : c'est voulu.
- Le « joueur moyen » est un modèle, pas un humain : l'écart avec un vrai joueur se jugera au test
  humain (`docs/PLAYTEST.md`). Si Auto s'avère meilleur que les joueurs, baisser `WOUNDED` ou
  retirer la règle « sort le plus cher d'abord » dans `auto.ts` avant de toucher aux donjons.
- Ces chiffres valent pour des équipes de 3 ; à refaire dès que les équipes passent à 4
  (`TEAM_SIZE` dans `auto.ts` de la simulation).

## Lot 13 — équipes de quatre

`balance.progression.teamSize` = 4 : quatre emplacements côté joueur, quatre ennemis au plus par
combat (`MAX_SIDE` dans `@outlaw/data`). Cendre rejoint l'équipe de départ (Ressac et Sève se
débloquent toujours aux donjons 4 et 6). Un quatrième héros ajoute une attaque de base par tour,
donc un point de réserve de plus : la réserve (3 / 6 / +1) n'a pas bougé, le surplus se dépense en
ultimes plus fréquents, ce que la courbe absorbe.

Réglage : plus d'ennemis plutôt que des ennemis qui frappent deux fois plus fort. Les salles
passent à 3–4 ennemis (2 / 2 / 1 au premier donjon, qui reste une prise en main), puis `autotune`
(PV, durée) et `tunecurve` (ATK, difficulté) ont reconvergé. Deux corrections aux outils : ils
lisaient `dungeons.json` sans les valeurs par défaut des schémas (le modificateur de donjon
n'était pas appliqué pendant la mesure, d'où des mesures fausses de ±30 points sur certains
donjons), et `tunecurve` ne durcit plus jamais le premier donjon au-dessus de sa cible.
`pacing.floor` passe de 10 à 8 : à quatre, une salle expert peut tomber en deux tours.

Courbe mesurée (48 équipes, joueur moyen au niveau conseillé) : 100 / 75 / 71 / 65 / 63 / 54 /
58 / 42 / 38 / 31 % ; expert 87 % en moyenne. Au premier donjon, quatre attaques de base sans
aucun sort suffisent à n'importe quel niveau (vérifié) ; au deuxième, il faut utiliser ses sorts
en dessous du niveau 10.

Limite connue : « aucun héros indispensable » n'est pas tenue (26 points ; déjà 19 avant ce lot).
À quatre parmi six, retirer un héros ne laisse que 5 équipes : la règle mesure surtout la
dépendance aux deux soutiens. À revoir quand il y aura plus de héros.

## Butin, copies et maîtrise

Valeurs de `balance.json` → `economy.loot` et `progression.items.upgradeCosts`. Espérances
**calculées**, pas mesurées sur des joueurs ; la simulation ne modélise pas les objets.

- Un passage donne un seul objet : commun 85, rare 15 + 4 par rang de maîtrise (poids). Rare
  garanti au premier passage et au plus tard au 10ᵉ passage sans rare dans le donjon.
- Passages gagnants entre deux rares (pitié comprise) : 5,35 au rang 0, 4,27 au rang 2, 3,57 au
  rang 4. Pendant ce temps le donjon donne en moyenne 27 communs pour 6 utiles : le surplus se dissout en poussière, ce qui finance les améliorations.
- Coût d'un objet jusqu'au niveau 3 (valeurs de ce lot, remplacées depuis : voir « Économie :
  réglage ») : 6 copies (1 + 2 + 3), 1 200 or et 25 poussières du palier.
- Le rare est le goulot : 6 copies = environ 32 passages gagnants au rang 0, 21 au rang 4. À
  58 % de réussite d'Auto (voir plus haut) : environ 55 et 37 tentatives.
- Collection complète (20 objets au niveau 3) : environ 320 passages gagnants (10 donjons × 32) ;
  les communs arrivent d'eux-mêmes pendant la chasse aux rares. C'est la cible « long terme » ;
  au rang maximum de maîtrise (100 victoires par donjon) elle serait d'un tiers plus courte.
- Une copie dissoute rend 3 (commun) ou 4 (rare) poussières du palier de l'objet : moins qu'une
  amélioration ne coûte, pour que dissoudre ne soit jamais la voie rapide.
- À vérifier au test humain : si 32 passages pour un rare paraissent trop longs, monter
  `rareWeightPerRank` ou baisser `rarePity` avant de toucher aux coûts.

## Rythme du farm (niveaux)

`pnpm --filter @outlaw/sim farm [--auto 58]` : passages gagnants entre un donjon et le suivant
pour une équipe de quatre qui farme le dernier donjon ouvert, limités par l'XP (par héros) ou par
la poussière (partagée). Calcul exact depuis `balance.json` et `dungeons.json` ; objets, copies et
maîtrise (+10 % de poussière par rang) ne sont pas comptés, le vrai rythme est donc un peu plus
long sur les objets et un peu plus court sur la poussière.

| Donjon farmé    | Niveaux | Passages (XP / poussière) | Tentatives à 58 % |
| --------------- | ------- | ------------------------- | ----------------- |
| ember_wastes    | 1 → 4   | 6 (6,0 / 6,0)             | 10                |
| drowned_halls   | 4 → 8   | 8 (8,1 / 8,0)             | 14                |
| thorn_maze      | 8 → 12  | 10 (10,0 / 10,3)          | 18                |
| cinder_citadel  | 12 → 17 | 12 (12,0 / 12,0)          | 21                |
| sunken_spire    | 17 → 22 | 14 (13,8 / 14,0)          | 24                |
| verdant_crown   | 22 → 27 | 16 (15,7 / 15,0)          | 27                |
| broken_crossing | 27 → 28 | 7,5 (3,3 / 7,5)           | 13                |
| salt_flats      | 28 → 29 | 7,6 (3,1 / 7,6)           | 13                |
| obsidian_pass   | 29 → 30 | 7,6 (3,0 / 7,6)           | 13                |
| **Total**       |         | **89**                    | **153**           |

- Avant ce lot : 4 à 5 passages entre deux donjons, moins d'un en fin de jeu. Le test de la
  simulation (`tools/sim/test/farm.test.ts`) borne chaque pas entre 5 et 18 et le total entre 70
  et 110 : une récompense retouchée hors de ces bornes casse la CI.
- XP et poussière sont réglées pour se croiser (même nombre de passages) jusqu'au donjon 7 ; en
  fin de jeu c'est la poussière qui gouverne, l'XP est abondante : c'est voulu, le joueur arbitre
  entre niveaux et objets avec la même poussière pure.
- Or : non recalibré (≈ 50 000 or sur le parcours pour 24 000 d'améliorations d'objets au total) ;
  à resserrer si le test humain montre qu'il ne compte pas.
- À vérifier au test humain : si 150 tentatives pour finir paraissent trop, baisser
  `levelUp.dustPerLevel` avant de toucher aux récompenses des donjons.

## Paliers de donjon

`balance.json` → `tiers` : 3 paliers, +5 niveaux d'ennemis par palier (bornés à 30 par le
moteur), **+20 % de PV et d'ATK par palier**, or et poussière +25 % par palier (réglés au chapitre
« Économie : réglage »), rare +5 de poids,
coffre d'un cran (bronze → argent → or). Mesure : `tools/sim/src/tiers.ts`, lignes
`tier_<donjon>_<palier>_expert` de `pnpm sim` (48 équipes par ligne, politique experte, niveau
visé = celui des ennemis borné à 30, équipement visé : aucun objet au I, deux objets bruts au II,
deux objets au maximum au III). Règles en CI (`targets.tiers`) : expert ≥ 50 % à chaque palier,
jamais plus de 12 points plus facile que le palier précédent.

| Donjon          | Niv. I / II / III | Expert I | Expert II | Expert III |
| --------------- | ----------------- | -------: | --------: | ---------: |
| ember_wastes    | 1 / 6 / 11        |    100 % |     100 % |      100 % |
| drowned_halls   | 4 / 9 / 14        |     98 % |     100 % |      100 % |
| thorn_maze      | 8 / 13 / 18       |     94 % |     100 % |      100 % |
| cinder_citadel  | 12 / 17 / 22      |     96 % |     100 % |      100 % |
| sunken_spire    | 17 / 22 / 27      |     96 % |      98 % |       98 % |
| verdant_crown   | 22 / 27 / 30      |     83 % |      92 % |       90 % |
| broken_crossing | 27 / 30 / 30      |     88 % |      83 % |       75 % |
| salt_flats      | 28 / 30 / 30      |     77 % |      85 % |       73 % |
| obsidian_pass   | 29 / 30 / 30      |     75 % |      77 % |       73 % |
| hollow_throne   | 30 / 30 / 30      |     75 % |      79 % |       67 % |

- Les niveaux seuls ne font rien : la croissance des monstres est plate et le moteur borne leur
  niveau à 30. Sans `enemyPctPerTier`, les paliers II et III des quatre derniers donjons étaient
  identiques au I (77/77/77 aux Salines) et ceux du début plus faciles.
- Les objets pèsent lourd : à +20 % par palier, un palier II avec deux objets bruts reste plus
  facile qu'un palier I nu sur les donjons de fin ; c'est le palier III (objets au maximum) qui
  retrouve la difficulté du I. Essais écartés : +25 % (Trône creux III à 44 %), +30 % (trois
  paliers III sous 50 %), +15 % (palier II plus facile de plus de 12 points sur quatre donjons).
- Les six premiers donjons restent à 100 % à tous les paliers : avec des objets, l'expert ne perd
  plus dans le premier tiers du jeu. C'est là que le joueur moyen choisira son palier.
- Le butin par palier est dans `docs/ECONOMY.md`.

## Économie : réglage

Mesure : `pnpm --filter @outlaw/sim economy` (joueur modèle, 20 graines, passages **gagnants** ;
tentatives à 58 % de réussite d'Auto ; méthode et audit dans `docs/ECONOMY.md`). Bornes en CI :
`tools/sim/test/economy.test.ts`. Cibles : un premier objet au maximum en quelques donjons, puis
un craft de fin de jeu qui demande du vrai grind, avec or et poussière pure réellement dépensés.

| Jalon (passages gagnants)         | Audit (avant paliers) | Paliers seuls | Après réglage | Dispersion |
| --------------------------------- | --------------------: | ------------: | ------------: | ---------- |
| Premier objet au niveau maximum   |                  28,8 |          30,6 |       **8,1** | 6 à 14     |
| Première étoile                   |                  21,8 |          26,4 |          20,0 | 20         |
| Équipe de 4 équipée (2 objets)    |                  38,5 |          44,8 |          38,5 | 31 à 47    |
| Équipe de 4 au niveau 30          |                 115,5 |         102,3 |         101,6 | 95 à 109   |
| Équipe de 4 aux objets au maximum |                     — |             — |         116,0 | 107 à 128  |
| Collection (20 objets au maximum) |                     — |             — |     **243,9** | 225 à 267  |

Valeurs changées, chacune avec la mesure qui la justifie (configuration finale, une seule valeur
remise à l'ancienne à la fois) :

- **`upgradeCosts` de base** 1/100/5, 2/300/8, 3/800/12 → **1/40/3, 2/120/5, 3/280/8** (copies / or
  / poussière) et **`tierCostPct`** (nouveau, % appliqués selon le palier de poussière de l'objet) :
  copies 60 / 100 / 130, or 100 / 400 / 5 000, poussière 100 / 300 / 1 000. Un objet au maximum
  coûte 4 copies, 440 or et 16 brutes au palier 1 ; 6 copies, 1 760 or et 48 fines au palier 2 ;
  8 copies, 22 000 or et 160 pures au palier 3 (avant : 6 copies, 1 200 or, 25 poussières partout).
  Mesures : avec les coûts d'avant, premier objet au maximum 31,9 passages, or dépensé 24 000 sur
  192 500 gagnés (12 %), poussière pure 634 sur 1 605 ; avec les nouveaux, 8,1 passages, or
  232 300 sur 256 800 (90 %), pure 1 984 sur 2 307 (86 %). Copies plates (100/100/100) : premier
  objet au maximum 21,4 et équipe au maximum 127,2 (au lieu de 116,0). Or plat : 8 800 dépensés.
  Poussière plate : 544 pures dépensées.
- **Poussière brute des deux premiers donjons 4 → 8** (`dungeons.json`). Mesure : avec 4, premier
  objet au maximum 15,3 passages, équipe équipée 45,8, niveau 30 à 107,8 ; avec 8 : 8,1, 38,5 et
  101,6. Les niveaux 1 à 7 coûtent 56 brutes pour quatre héros : à 4 par passage, l'objet du
  premier donjon attendait la fin des niveaux. Le calculateur `farm` ne bouge pas (Landes 6,0 et
  Salles 8,1 passages, toujours limités par l'XP ; poussière 3,0 et 4,0) : ses bornes tiennent.
- **Paliers : or et poussière +50 % → +25 % par palier** (`tiers.rewardPctPerTier`). Mesure : à
  +50 %, or 314 000 gagnés et poussière pure 2 738 pour les mêmes dépenses : plus de 300 pures et
  80 000 or jamais utilisés ; à +25 %, 90 % et 86 % dépensés, pour 3 passages de plus jusqu'au
  niveau 30 (98,5 → 101,6) et 9 de plus pour la collection (234,7 → 243,9). À 0 %, jouer les
  paliers ne rapporte plus que des rares : niveau 30 à 108,6, collection à 289,6.
- **Gardés tels quels, mesurés** : rare +5 de poids par palier (à 0 : collection 265,4 ; à 10 :
  235,8) ; coffre d'un cran par palier (à 0 : niveau 30 à 105,8 au lieu de 101,6, les fragments des
  étoiles venant des coffres) ; poids 85/15, pitié 10, maîtrise et dissolution 3/4 : aucun jalon
  ne les rend nécessaires. Sans paliers (`tiers.count` = 1) : collection 320,9 passages, équipe au
  maximum 157,1, niveau 30 à 111,9 : les paliers sont la voie rapide du craft, comme voulu.

Limite assumée : la collection complète n'est que 15 % plus longue qu'avec les coûts d'avant
(243,9 contre 212,3), car le goulot de fin de jeu reste les copies de rares ; ce qui change, c'est
que l'or et la poussière pure comptent désormais et que la fin coûte bien plus que le début.

Ce que le réglage ne règle pas : la première étoile (20 passages, 10 fragments) et la seconde
(niveau 22, 80 fragments pour quatre héros) gouvernent le milieu de partie (4ᵉ donjon ouvert au
37ᵉ passage en moyenne, 30 à 46 selon le tirage) ; `starCosts` et la chance de coffre n'ont pas été
touchés, faute de cible chiffrée dans le brief. L'or n'a toujours que les objets et le respec
comme puits : une fois la collection finie, il s'accumule.

## 25 héros et rareté

### Simulation : un échantillon d'équipes

25 héros font 12 650 équipes de quatre ; les règles les jouaient toutes (15 avec six héros). Les
duels de R1 font 84 % du temps de calcul (mesuré : 30,5 s de duels pour 3,7 s de classement R2 et
2,2 s de joueur moyen sur 4 équipes × 10 donjons). Choix (`tools/sim/src/rules.ts`) :

- **50 équipes** (`TEAM_SAMPLE`), tirées par tours avec la graine de la simulation : à chaque tour
  les héros sont mélangés puis groupés en équipes, donc chaque héros figure dans 8 équipes (±1).
  R2 et « aucun héros indispensable » portent sur les 50.
- **R1 sur les 12 premières** (`R1_TEAMS`) : deux tours de mélange, chaque héros y figure.
- **Équipes jouables** : au plus deux héros du même rôle (`pickTeam`, aussi pour le rythme). Avec
  six héros (deux par rôle), toute équipe l'était ; avec 25, trois soutiens sans personne pour
  frapper finissaient à la limite d'actions et faussaient les durées.
- Temps : `pnpm sim:check` ≈ 70 s de calcul (52 s avant), 80 s à 240 s de temps réel selon la charge
  de la machine.

### Force des héros

`pnpm --filter @outlaw/sim heroes 16` : pour chaque héros, 16 équipes qui le contiennent par
donjon (trois coéquipiers au hasard), part de donjons finis avec 3 niveaux de retard par le joueur
moyen (la mesure de « aucun héros indispensable »), durée des boss et combats trop courts
(expert). Marge d'environ ±4 points (160 essais par héros).

| Rareté     | Héros (part finie en retard)                                                                      | Moyenne |
| ---------- | ------------------------------------------------------------------------------------------------- | ------: |
| Commun     | Pyra 44, Tison 44, Écume 43, Yucca 43, Cendre 42, Ressac 39, Houx 39, Ronce 38, Sève 31, Marée 24 |    39 % |
| Rare       | Genêt 48, Forge 46, Chardon 46, Mousse 44, Brume 41, Sillage 40, Mousson 34, Lanterne 33          |    42 % |
| Épique     | Torrent 48, Soufre 43, Étendard 39, Éden 36, Séquoia 35                                           |    40 % |
| Légendaire | Sablier 51, Phénix 48                                                                             |    50 % |

- Les 19 nouveaux vont de 33 à 51 %, les six premiers de 24 à 44 % : aucun nouveau n'est sous
  Sève ni au-dessus de Pyra de plus de 7 points. Les légendaires sont devant (kits plus riches,
  stats dans le budget de la rareté), mais pas indispensables : **écart 7 points** dans
  `pnpm sim:check` (cible ≤ 10), contre 26 avec six héros. Règle tenue pour la première fois
  depuis le lot 7 : avec 25 héros, retirer un héros laisse assez d'équipes. Marée reste la plus
  faible (inchangée, hors périmètre).
- Meilleure équipe échantillonnée contenant chaque héros : de 37 % (Pyra) à 69 % (Phénix) ; avec
  8 équipes par héros, c'est surtout un garde-fou contre un héros inutilisable.
- R1 86 %, R2 82 % (pire donjon), expert 90 %, joueur moyen 63 % au niveau conseillé.
- Réglage : sept passes. Les premiers jets de Sablier, Torrent, Phénix et Forge passaient 52 à
  61 % (trop de tempo gratuit : reprises de tour, retards à l'entrée) ; les soutiens neufs
  allongeaient les boss (attaques de base relevées à 105–115 %, bonus d'ATK sur leurs
  compétences) ; Mousson et les sorts B rendus « tous les ennemis » vidaient des salles en 5
  actions (bonus de DEF de l'ultime retiré, zone à −55 %) ; Lanterne démarrait avec un point de
  plus et lançait un ultime au premier tour (retiré).

### Cibles de rythme ajustées (à arbitrer par le propriétaire)

Les donjons n'ont pas été retouchés (chantier des paliers en parallèle). Trois cibles ne tenaient
plus, pour des raisons de mesure plus que de héros :

- **Plancher du tout premier combat 9 → 7 actions.** Au niveau 1, sur 400 équipes de quatre tirées
  parmi les 25, Pyra (27 combats sous 9 actions), Ressac (25), Torrent (23) et Mousson (23) sont les
  plus rapides : deux héros d'origine y descendent aussi à 7. Le 9 tenait parce que les 15 équipes
  possibles ne réunissaient jamais assez de dégâts d'eau contre les molosses de feu. Il est
  désormais sous le plancher général (8) ; c'est une salle de prise en main.
- **Boss 21–30 → 21–32 actions.** Dédale de ronces 30,3 et Couronne verdoyante 31,0 : les équipes à
  deux soutiens et deux contrôleurs (8,6 % des équipes jouables, 6,7 % avec six héros) y passent
  50 à 70 actions et tirent la moyenne.
- **Tolérance de la courbe 12 → 15 points.** Carrefour brisé 67 % après Couronne verdoyante 52 %
  (joueur moyen) : à 48 équipes la marge d'erreur est d'environ ±7 points par donjon.

Ces trois cibles se règlent mieux par les donjons (`autotune`, `tunecurve`) : à refaire après la
fusion des paliers de donjon, en revenant si possible à 9 / 30 / 12.

### Coffres et rareté

Valeurs de `balance.json` → `chests`. Répartition : 10 communs, 8 rares, 5 épiques, 2 légendaires.

| Rareté     | Poids |     Part d'un fragment au hasard | Invocation | Fragments pour un héros ciblé | Sans ciblage |
| ---------- | ----: | -------------------------------: | ---------: | ----------------------------: | -----------: |
| Commun     |    12 |   6,5 % par héros (65 % en tout) |         10 |                            19 |          154 |
| Rare       |     6 |   3,2 % par héros (26 % en tout) |         20 |                            39 |          617 |
| Épique     |     3 |  1,6 % par héros (8,1 % en tout) |         40 |                            79 |        2 467 |
| Légendaire |     1 | 0,54 % par héros (1,1 % en tout) |         80 |                           159 |       14 800 |

- Calcul : part d'un héros = poids ÷ 185 (somme des poids) ; ciblé, 50 % + la moitié de sa part.
- Les 61 fragments des premières victoires paient un commun et un rare ciblés, ou les deux étoiles
  d'un héros (30). Un légendaire ciblé demande environ 20 coffres d'or, soit 40 rejeux des
  donjons 6 à 10 : c'est l'objectif long terme. Sans ciblage, un légendaire précis est hors de
  portée : le ciblage est la voie, la rareté le prix.
- Les étoiles coûtent pareil quelle que soit la rareté : une fois invoqué, un héros n'est pas plus
  cher à monter.
- À vérifier au test humain : si un légendaire paraît trop loin, baisser `summonCosts[3]` avant de
  toucher aux poids (qui ne jouent presque plus quand on cible).
- Effet sur l'économie (`pnpm --filter @outlaw/sim economy`, après fusion des paliers) : les
  fragments tirés au hasard se répartissent sur 25 héros au lieu de 6, les étoiles de l'équipe
  viennent donc surtout de la part ciblée. Équipe de 4 équipée 38,5 → 46,0 passages gagnants,
  équipe au niveau 30 101,6 → 110,3, objets au maximum 116,0 → 122,2 ; premier objet (8,1) et
  première étoile (20,0) inchangés. Dans les bornes de `economy.test.ts` ; si le propriétaire
  trouve la fin trop longue, monter `focusMultiplier` avant de toucher aux coûts d'étoile (voir « Coffres » dans `docs/ECONOMY.md`).

### Après fusion des paliers de donjon

La mesure des paliers (`tools/sim/src/tiers.ts`) tire elle aussi des équipes jouables
(`pickTeam`). Résultat : toutes les règles tenues (R1 86 %, R2 82 %, écart 7 points, rythme, paliers
de 50 à 100 % pour l'expert) ; sans `pickTeam`, le palier II des Salines blêmes passait 12 points
au-dessus du palier I.

## Montée des sorts

Valeurs de `balance.json` → `spellLevels`. Mesures : `pnpm --filter @outlaw/sim skillups --rules`
(`tools/sim/src/skillups.ts`) ; mêmes 50 équipes que les règles, deux builds par équipe et par
donjon, le même build et le même joueur moyen des deux côtés (seuls les sorts changent).

| Réglage                            | Valeur                                           |
| ---------------------------------- | ------------------------------------------------ |
| Niveaux                            | 1 à 5                                            |
| Puissance (dégâts, soin, bouclier) | +2,5 % par niveau, +10 % au niveau 5             |
| Bonus du niveau 5                  | ultime : délai −10 (150 → 140) ; autres : aucun  |
| Coût vers 2 / 3 / 4 / 5            | 1 / 2 / 3 / 5 grimoires, 2 / 3 / 5 / 8 fragments |
| Un sort au maximum                 | 11 grimoires, 18 fragments                       |
| Un héros au maximum (4 sorts)      | 44 grimoires, 72 fragments                       |

Écart « tous les sorts au niveau 5 » contre « niveau 1 », à niveau de héros égal (1 900 donjons) :

| Mesure                                    | Niveau 1 | Niveau 5 |        Écart |
| ----------------------------------------- | -------: | -------: | -----------: |
| Donjons terminés avec 3 niveaux de retard |   33,2 % |   47,0 % | +13,8 points |
| Donjons terminés au niveau conseillé      |   63,3 % |   72,4 % |  +9,1 points |
| Duel miroir, même équipe et mêmes talents |          |   61,7 % |              |

- Cible : ≤ 20 points en retard (`targets.spellLevelsMaxGapPoints`), vérifiée en CI sur 12 équipes
  (`tools/sim/test/skillups.test.ts`). En relatif : +14 % au niveau conseillé, +42 % en retard
  (voir `docs/DECISIONS.md`, « Montée des sorts »).
- Règles avec tous les sorts au niveau 5 : R1 84,3 % (86 % au niveau 1), R2 82 % sur le pire
  donjon, « aucun héros indispensable » écart 6 points (7 au niveau 1). Toutes tenues : la montée
  renforce tous les héros pareil, elle ne crée pas de héros obligatoire.
- Réglage (25 équipes, un build, écart en retard) : premier jet +4 %/niveau, délai −10 de A et
  B, coût −1 de l'ultime : +36 points. Seuls : +4 %/niveau 25 ; +2 % 12 ; coût de l'ultime −1
  10 ; délais de A et B 11 ; délai −15 de l'ultime 6 (avec +2 % : 14). Retenu : +2,5 % et délai −10
  de l'ultime (13,8 sur 50 équipes), un gain lisible (+10 %) sous la cible avec 6 points de marge.
- `baseline.csv` inchangée : les scénarios gardent les sorts au niveau 1.

## Quêtes et succès

Valeurs de `balance.json` → `quests` ; contenu dans `packages/data/content/quests.json`. Une
récompense vaut `passagePct` % de l'or et de la poussière d'**un passage du donjon le plus avancé
terminé** (palier I, sans maîtrise), plus un coffre facultatif. Elle garde donc le même poids
relatif au premier donjon (80 or, 8 brutes par passage) et au dernier (1 500 or, 12 pures).

| Récompense                  | `passagePct` | Coffre | Par période              |
| --------------------------- | -----------: | ------ | ------------------------ |
| Quête du jour (×5)          |           15 | —      | 0,75 passage par jour    |
| Bonus « tout fait » du jour |            0 | bronze | 4 fragments par jour     |
| Quête de la semaine (×5)    |           50 | —      | 2,5 passages par semaine |
| Succès « small » (8)        |          100 | bronze | une fois                 |
| Succès « medium » (6)       |          200 | argent | une fois                 |
| Succès « large » (6)        |          400 | or     | une fois                 |

Cible du propriétaire : le gain des quêtes ne raccourcit aucun jalon de plus d'environ 15 %.
Mesure : `pnpm --filter @outlaw/sim economy` joue la partie modèle avec les vraies fonctions
(`rollQuests`, `claimQuest`, `claimBonus`, `claimAchievement`), `perDay` passages gagnants par
jour UTC, tout réclamé dès que prêt (20 graines). Jalons en passages gagnants, raccourcissement
entre parenthèses :

| Rythme             | Premier objet max | Première étoile | Équipe équipée | Équipe niv. 30 |    Objets max |    Collection | Or des quêtes |
| ------------------ | ----------------: | --------------: | -------------: | -------------: | ------------: | ------------: | ------------: |
| Sans quêtes        |               8,1 |            20,0 |           44,0 |          113,8 |         122,7 |         251,3 |             — |
| Succès seuls       |      8,7 (−6,8 %) |      20,0 (0 %) |   39,9 (9,4 %) |  108,3 (4,7 %) | 119,5 (2,6 %) | 244,8 (2,6 %) |        + 12 % |
| 5 passages / jour  |      8,7 (−6,8 %) |   20,6 (−2,8 %) |  38,3 (13,1 %) |  105,0 (7,7 %) | 119,8 (2,3 %) | 240,7 (4,3 %) |        + 28 % |
| 10 passages / jour |      8,7 (−6,8 %) |   20,4 (−2,2 %) |  38,0 (13,7 %) |  103,2 (9,3 %) | 116,0 (5,5 %) | 236,2 (6,0 %) |        + 22 % |
| 20 passages / jour |      8,7 (−6,8 %) |      20,0 (0 %) |  39,1 (11,2 %) |  106,2 (6,7 %) | 118,5 (3,4 %) | 236,2 (6,0 %) |        + 17 % |

(« Succès seuls » : un jour de 1 000 passages, les quêtes ne comptent presque plus.)

Lecture :

- **Plus fort raccourcissement : 13,7 %** (équipe de quatre équipée, à 10 passages par jour) ; la
  fin de progression (niveau 30, collection) gagne 5 à 9 %. La cible tient, avec peu de marge sur
  l'équipe équipée : les deux tiers de cet effet viennent des succès (9,4 % seuls), surtout des
  coffres des premiers succès qui avancent les étoiles, donc les donjons, donc les objets.
- Un négatif veut dire « plus tard » : le joueur modèle dépense la poussière brute des succès en
  niveaux avant l'objet des Landes (premier objet au maximum 8,1 → 8,7). Effet de sa politique,
  sans conséquence pour un vrai joueur.
- L'or des quêtes pèse 17 à 28 % de l'or des donjons : l'or ne sert qu'aux objets, il avance
  surtout la collection. Ce n'est pas un raccourci de progression (niveaux et étoiles n'en
  dépendent pas).
- Premier réglage essayé : 20 % par quête du jour et 60 % par quête de la semaine : même plafond
  (13,7 %, il vient des succès) mais niveau 30 à −10,4 % et or + 33 % à 5 passages par jour ;
  ramené à 15 / 50 pour garder de la marge.
- Vérifié en CI (`tools/sim/test/economy.test.ts`) : à 5 et 10 passages par jour, aucun jalon
  plus de 15 % plus tôt. Leviers : `passagePct` (gain continu), coffres des succès (milieu de
  partie), `count` (nombre de quêtes).

## Tour à étages

Valeurs : `balance.json` → `tower` et `targets.tower`, compositions dans `content/tower.json`.
Mesure : lignes `tower_<étage>_expert` de `pnpm sim` (32 équipes jouables par étage, builds
aléatoires, niveau visé = étage jusqu'à 30, équipement visé de `gear`, politique experte, un
combat) ; détail lisible : `pnpm --filter @outlaw/sim tower [équipes]`. Coût : 1 600 combats,
environ 10 s de calcul ajoutées à `sim:check` (140 s mesurées avant, sur une machine chargée).

| Étages  | Niveau | ATK % (courbe) |      PV % | Objets        | Expert, moyenne (min) | Actions |
| ------- | -----: | -------------- | --------: | ------------- | --------------------- | ------- |
| 1 à 9   |  1 à 9 | 80 → 133       |       100 | aucun         | 100 % (97)            | 13 à 25 |
| 11 à 19 |  11–19 | 145 → 185      | 100 → 105 | aucun         | 84 % (66)             | 19 à 29 |
| 21 à 29 |  21–29 | 199 → 271      | 106 → 110 | aucun         | 79 % (66)             | 18 à 26 |
| 31 à 39 |     30 | 300 → 318      | 115 → 125 | 2 + 0 / 2 + 1 | 80 % (53)             | 17 à 24 |
| 41 à 49 |     30 | 318 → 320      | 129 → 139 | 2 + 2 / 2 + 3 | 79 % (59)             | 18 à 23 |

Boss (étages 10 / 20 / 30 / 40 / 50) : expert 72 / 75 / 66 / 75 / 59 %, 29 à 35 actions.
Groupes : 2 ennemis (étages 1–3), 3 (4–11), 4 (12 et plus) ; à partir de l'étage 21, le dernier
vient de l'élément suivant.

- **Corrections par élément** (`pools.*.atkPct`) : eau 125, feu 100, nature 90. Mesure à 48 équipes
  sans correction : eau 94 % en moyenne des étages 11 à 49, feu 75 %, nature 70 %. Après : les
  trois groupes à quelques points près ; il reste ±20 points selon l'alternance des ennemis d'un
  même élément (deux molosses et un crabe à l'étage 49 : 59 % ; deux acolytes et une appelante à
  l'étage 46 : 81 %), d'où la règle par groupes de trois étages.
- **Boss** (`bosses[].atkPct`) : 100 / 140 / 82 / 85 / 80. Mesures à 48 équipes, sans correction :
  92 % au 20 (le modificateur des Salles englouties avance les héros), 46 % au 30, 46 % au 40, 8 %
  au 50 avec trois boss ; le 40 et le 50 passent à deux boss (tyran et hydre, colosse et tyran).
  Essais écartés : 40 à 95 % (56 %) et 30 à 88 % (50 %, à la limite).
- **Courbe après 30** : un appui à l'étage 31 (300) puis 36 (318) absorbe les deux objets bruts ;
  sans eux (ATK 280 → 340 en ligne droite), les étages 31 à 36 repassaient à 90–98 % et l'étage 49
  tombait à 33 %. Fin de courbe à 320 et PV à 140 % : à 340 / 150 %, les étages 49 et 50 passaient
  sous 50 %.
- **Lecture** : le premier boss attend à l'étage 10 ce qu'un donjon de niveau 10 demande ; ensuite
  la tour se stabilise autour de 80 % pour l'expert à l'étage ordinaire, avec un pic à chaque boss.
  Au-delà du niveau 30, gagner un étage demande d'avoir crafté : la tour récompense l'équipement.
- Règle la plus serrée : l'étage 37 à 53 % (feu, deux molosses). Si un réglage des héros ou des
  ennemis la fait passer sous 50 %, baisser `pools.fire.atkPct` avant de toucher à la courbe.
- À vérifier au test humain : le joueur moyen n'est pas mesuré ici (la règle porte sur l'expert,
  comme les paliers) ; si la tour paraît trop dure dès l'étage 11, baisser l'appui de l'étage 20.

## Éveil et sanctuaires d'essence

Valeurs : `balance.json` → `awakening` et `targets.awakening` ; sanctuaires dans
`content/essences.json`. Mesures : lignes `awakening_*`, `essence_*` et `awake_*` de `pnpm sim`
(en CI), jalons par `pnpm --filter @outlaw/sim economy`.

**Écart d'un héros éveillé** (règle : ≤ `maxGapPoints` = 10 points) — pour chaque héros, 16
équipes jouables par donjon où l'éveil est possible (niveau en retard ≥ 20 : Carrefour brisé,
Salines blêmes, Col d'obsidienne, Trône creux), jouées par le joueur moyen avec 3 niveaux de
retard, une fois le héros non éveillé, une fois éveillé (mêmes builds, même politique). Un héros
au-dessus de 10 points est remesuré sur 48 équipes de plus (voir `docs/DECISIONS.md`).

| Réglage essayé (stats % / passif %) | Moyenne des 25 héros | Pire héros (graine 1 / 2)          |
| ----------------------------------- | -------------------: | ---------------------------------- |
| 5 / 25 (premier jet)                |            4,1 à 4,3 | Cendre 10,2 / Soufre 15,2          |
| 4 / 25 sans `percent`               |            2,5 à 3,6 | Cendre 9,8 / Soufre 10,5           |
| 3 / 20                              |            2,8 à 3,8 | Mousse 9,4 / Soufre 9,4            |
| **4 / 20 (retenu)**                 |            3,0 à 4,2 | **Pyra 9,4 / Brume, Étendard 9,8** |

Retenu : 4 % et 20 %, le plus visible des réglages qui tiennent sur deux graines. Le tempo
(Cendre, Sillage) et le ralentissement (Soufre) sont les effets qui gagnent le plus à +20 % ; si la
règle casse, baisser `mulPct` avant `statPct`. Mesure en CI (graine 1) : **pire écart 9 points
(Pyra), moyenne 3,0**.

**Règles avec tous les héros éveillés** (mêmes définitions, builds tirés puis éveillés) : R1 79 %
sur 4 équipes (82 % sur 12), R2 92 % (pire donjon), « aucun héros indispensable » 4 points.
Toutes tenues, en CI.

**Sanctuaires** — niveau 10 au palier I (15 et 20 aux paliers II et III, +20 % puis +40 % de PV
et d'ATK : `balance.tiers`), mêmes ennemis que la tour par élément. Correction d'ATK par élément
(`atkPct`) : eau 140, nature 90, feu 100. Sans correction, l'expert passait l'eau à 100 / 100 /
100 % ; à 125 % encore 100 / 100 / 84. Mesure en CI (32 équipes, expert au niveau visé) : feu
100 / 84 / 66, eau 100 / 91 / 78, nature 97 / 91 / 59 (règle : chaque palier ≥ 50 %). Le palier
III est le plus dur, comme le palier III des donjons tardifs.

**Rythme** (cible du brief : un héros vers le milieu de partie, l'équipe en fin de partie) —
joueur modèle de `economy` avec l'éveil (`AwakeningModel` : dès qu'un héros de l'équipe atteint le
niveau 20 et que les sanctuaires sont ouverts, il y passe tant qu'une qualité lui manque, au plus
haut palier à sa portée ; l'éveil passe avant les objets pour l'or), 20 graines :

| Réglage (niveau du palier I, coût faible / moyenne / supérieure) |    Premier héros | dont essence |     Équipe éveillée |
| ---------------------------------------------------------------- | ---------------: | -----------: | ------------------: |
| 14, 30 / 20 / 10 (premier jet, 5 graines)                        |            117,4 |         28,8 |               178,8 |
| **10, 15 / 10 / 6 (retenu)**                                     | **81,0** (71–95) |     **14,7** | **136,5** (131–146) |

Repères : sans éveil, l'équipe atteint le niveau 30 au 113,8ᵉ passage et la collection au 251ᵉ ;
avec, ces jalons reculent des 47 passages d'essence (160,7 et 306,2). Le premier héros s'éveille
donc entre l'équipe équipée (44) et l'équipe au niveau 30, l'équipe juste avant le niveau 30 de
l'équipe. Bornes en CI (`economy.test.ts`, 5 graines) : premier héros entre 60 et 100 passages,
équipe entre 110 et 170, au plus 20 passages d'essence pour le premier.
