# Économie

Tout ce qui tombe, tout ce qui se dépense, et le nombre de donjons gagnants que demande chaque
jalon. Les valeurs vivent dans [`packages/data/balance.json`](../packages/data/balance.json) et
[`packages/data/content/dungeons.json`](../packages/data/content/dungeons.json) ; les chiffres de
ce document sortent de `pnpm --filter @outlaw/sim economy` (`tools/sim/src/economy.ts`), à relancer
après tout changement. La première partie (« audit ») est l'état **avant** réglage ; la dernière
partie donne les valeurs **après** réglage (voir aussi `docs/BALANCE.md`).

## Ce qui tombe

Un passage gagnant d'un donjon donne, au premier passage comme au rejeu (`replayRewardRate` = 1) :

| Donjon          | Niv. |   XP |   Or | Poussière | Coffre (fragments) | Butin (commun / rare)          |
| --------------- | ---: | ---: | ---: | --------- | ------------------ | ------------------------------ |
| ember_wastes    |    1 |   60 |   80 | 4 brute   | bronze (3)         | ember_charm / eternal_ember    |
| drowned_halls   |    4 |  260 |  160 | 4 brute   | bronze (3)         | tide_pendant / drowned_pearl   |
| thorn_maze      |    8 |  470 |  260 | 7 fine    | argent (5)         | thorn_ring / storm_sigil       |
| cinder_citadel  |   12 |  880 |  380 | 15 fine   | argent (5)         | quick_spurs / phoenix_feather  |
| sunken_spire    |   17 | 1200 |  520 | 20 fine   | argent (5)         | hunter_lens / aegis_shard      |
| verdant_crown   |   22 | 1500 |  700 | 12 pure   | or (8)             | spare_flask / verdant_seed     |
| broken_crossing |   27 | 1700 |  950 | 8 pure    | or (8)             | mender_token / chrono_gear     |
| salt_flats      |   28 | 1900 | 1100 | 9 pure    | or (8)             | iron_band / salt_mirror        |
| obsidian_pass   |   29 | 2100 | 1250 | 10 pure   | or (8)             | obsidian_shard / obsidian_fang |
| hollow_throne   |   30 | 2400 | 1500 | 12 pure   | or (8)             | hollow_seal / throne_relic     |

- **XP** : chaque héros débloqué la reçoit, à 50 % (`restXpRate`) s'il n'est pas dans l'équipe.
  Elle se met en banque : le niveau se paie (voir plus bas).
- **Or** : à tous les passages.
- **Poussière** : trois paliers (brute, fine, pure), celui du donjon ; +10 % par rang de maîtrise
  (rangs à 5, 15, 40 et 100 victoires dans le donjon).
- **Objet** : un par passage, parmi les deux du donjon (commun 85, rare 15 + 4 par rang de
  maîtrise, en poids) ; le rare est garanti au premier passage et au 10ᵉ passage sans rare dans ce
  donjon. Un objet déjà possédé devient une **copie** ; un objet déjà au niveau maximum dissout
  la copie en poussière (3 pour un commun, 4 pour un rare, au palier du donjon).
- **Coffre** : toujours au premier passage, une fois sur deux ensuite (`replayChestRate`). Il ne
  contient que des **fragments** de héros (3, 5 ou 8), chacun tiré au hasard parmi les 6 héros,
  sauf la part du héros ciblé (`focusRate` 50 %).

## Ce qui se dépense

| Dépense                 | Coût                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Niveau suivant          | XP = round(40 × N^1,5) ; poussière brute 2 (niveaux 1 à 7), fine 3 + 1 par niveau (8 à 21), pure 5 + 2 par niveau (22 à 29) (`levelUp`)        |
| Niveaux 1 → 8 (1 héros) | 2 457 XP et 14 brute (56 pour quatre héros)                                                                                                    |
| Niveaux 8 → 22          | 31 825 XP et 133 fine (532 pour quatre)                                                                                                        |
| Niveaux 22 → 30         | 41 331 XP et 96 pure (384 pour quatre)                                                                                                         |
| Étoile                  | 10 fragments du héros au niveau 10, 20 au niveau 20 (`starCosts`) ; sans elle, le niveau est plafonné                                          |
| Invocation              | 10 fragments d'un héros non possédé (`summonCost`)                                                                                             |
| Améliorer un objet      | niveau 1 : 1 copie, 100 or, 5 poussière ; niveau 2 : 2 copies, 300 or, 8 ; niveau 3 : 3 copies, 800 or, 12 — poussière du palier de son donjon |
| Objet au maximum        | 6 copies, 1 200 or, 25 poussière                                                                                                               |
| Équipe équipée au max   | 8 objets : 48 copies, 9 600 or, 200 poussière                                                                                                  |
| Respec                  | gratuit la première fois par héros, puis 20 or × niveau                                                                                        |

L'or n'a que deux puits (améliorations et respec) ; la poussière en a deux (niveaux et
améliorations), ce qui en fait la monnaie d'arbitrage ; les fragments en ont deux (étoiles et
invocations) ; les copies n'en ont qu'un (améliorer, ou se dissoudre).

## Simulation : le joueur modèle

`pnpm --filter @outlaw/sim economy [--auto 58] [--seeds 20] [--runs 600]` enchaîne des passages
**gagnants** avec les vraies fonctions du moteur (`completeDungeon`, `openChest`, `starUp`,
`levelUpMax`, `upgradeItem`, `equip`) ; seul le butin est tiré (graine du profil), d'où la moyenne
sur 20 graines. Les tentatives divisent par le taux de réussite d'Auto (58 %, `docs/BALANCE.md`).
Politique :

- il farme le donjon le plus avancé dont le niveau conseillé ne dépasse pas le niveau du plus
  faible héros de l'équipe (le suivant s'ouvre en le terminant) ;
- après chaque passage : coffres ouverts (héros ciblé : celui qui attend son étoile, sinon le plus
  haut), étoile payée dès que possible, tout objet neuf équipé sur un emplacement libre, les objets
  portés améliorés dès qu'ils sont payables (le plus de copies d'abord), puis les niveaux avec le
  reste.

Ce joueur ne fait aucun arbitrage fin : il dépense tout ce qu'il peut, dans cet ordre. Un vrai
joueur garde de la poussière pour un objet précis, ou l'inverse ; les chiffres sont un ordre de
grandeur, pas une prédiction.

## Audit : valeurs avant réglage (2026-10-27)

| Jalon                                 | Passages gagnants | Tentatives à 58 % | Dispersion (20 graines) |
| ------------------------------------- | ----------------: | ----------------: | ----------------------- |
| Premier objet au niveau maximum       |              28,8 |                50 | 26 à 32                 |
| Première étoile                       |              21,8 |                38 | 21 à 24                 |
| Équipe de 4 équipée (2 objets chacun) |              38,5 |                66 | 34 à 46                 |
| Équipe de 4 au niveau 30              |             115,5 |               199 | 100 à 129               |

Première victoire de chaque donjon (passage gagnant moyen) : 1 / 9,6 / 19,2 / 37,4 / 47,5 / 79,5 /
94,5 / 101,5 / 108,5 / 115,5.

Bilan moyen à la fin : or gagné 62 500, dépensé 2 900 ; poussière brute 73 gagnée (56 en niveaux,
16 en objets), fine 1 031 (+22 dissoutes) pour 532 en niveaux et 62 en objets, pure 397 pour 384 en
niveaux ; 116 objets tombés dont 30 rares, 11,6 améliorations (1,8 objet au maximum, niveau moyen
des objets portés 1,44) ; 62 coffres, 350 fragments.

Constats :

1. **Le premier objet au maximum arrive tard (28 passages, ≈ 50 tentatives) et ce n'est jamais
   celui du premier donjon** : c'est `thorn_ring` (commun du 3ᵉ donjon) dans les 20 parties. Le
   premier donjon donne 4 poussières brutes par passage pour 56 de niveaux (quatre héros, niveaux
   1 à 7) et 25 par objet : le joueur a quitté les Landes (9,6 passages) bien avant d'avoir les
   7 exemplaires et les 25 poussières de `ember_charm`.
2. **L'or ne compte pas** : 62 500 gagnés, 2 900 dépensés (4,6 %). Le respec est le seul autre
   puits.
3. **Les fragments gouvernent le milieu de partie, pas la poussière ni l'XP** : la première
   étoile (10 fragments sur un héros ciblé) tombe au 22ᵉ passage et retient le 4ᵉ donjon (niveau 12) jusqu'au 37ᵉ (le calculateur `farm` prévoyait 24 : il ne compte pas les étoiles) ; la seconde
   étoile (20 fragments × 4 héros = 80) retient le 6ᵉ donjon (niveau 22) jusqu'au 79ᵉ passage
   au lieu de 50. Pendant cette attente, la poussière fine s'accumule : 112 à 773 inutilisées en
   fin de partie, soit la moitié de ce qui est tombé.
4. **La poussière pure est juste** : 397 gagnées pour 384 de niveaux ; aucune amélioration d'objet
   du palier pur n'est payée avant le niveau 30 (il reste 13 poussières).
5. **La courbe de craft est plate** : trois paliers (1/2/3 copies, 100/300/800 or, 5/8/12
   poussière) et 1,44 de niveau moyen sur les objets portés au niveau 30 : le rare (15 %) est le
   seul vrai frein, le reste ne demande rien. 48 copies pour une équipe au maximum, 116 objets
   tombés dont 30 rares en 115 passages : les rares arrivent pour 2 à 3 objets sur 8.

Ces constats sont l'entrée du réglage (section suivante) ; rien n'a été modifié pour les obtenir.
