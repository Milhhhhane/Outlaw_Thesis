# Économie

Tout ce qui tombe, tout ce qui se dépense, et le nombre de donjons gagnants que demande chaque
jalon. Les valeurs vivent dans [`packages/data/balance.json`](../packages/data/balance.json) et
[`packages/data/content/dungeons.json`](../packages/data/content/dungeons.json) ; les chiffres de
ce document sortent de `pnpm --filter @outlaw/sim economy` (`tools/sim/src/economy.ts`), à relancer
après tout changement. Les tableaux « Ce qui tombe » et « Ce qui se dépense » et la partie
« Audit » décrivent l'état **avant** réglage (2026-10-27) ; la dernière partie, « Après réglage »,
donne les valeurs en vigueur (justifications chiffrées dans `docs/BALANCE.md`).

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
- **Coffre** : une chance par passage, qui suit la difficulté (niveau des ennemis du palier,
  `chests.dropLevels` 1 → 40) ; le premier passage d'un palier en garantit au moins un de bronze.
  Il ne contient que des **fragments** de héros, tirés selon les poids de rareté **du coffre** ;
  le héros ciblé pèse × `focusMultiplier` (12). Détail dans « Coffres » plus bas.

## Ce qui se dépense

| Dépense                 | Coût                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Niveau suivant          | XP = round(40 × N^1,5) ; poussière brute 2 (niveaux 1 à 7), fine 3 + 1 par niveau (8 à 21), pure 5 + 2 par niveau (22 à 29) (`levelUp`)        |
| Niveaux 1 → 8 (1 héros) | 2 457 XP et 14 brute (56 pour quatre héros)                                                                                                    |
| Niveaux 8 → 22          | 31 825 XP et 133 fine (532 pour quatre)                                                                                                        |
| Niveaux 22 → 30         | 41 331 XP et 96 pure (384 pour quatre)                                                                                                         |
| Étoile                  | 10 fragments du héros au niveau 10, 20 au niveau 20 (`starCosts`) ; sans elle, le niveau est plafonné                                          |
| Invocation              | 10, 20, 40 ou 80 fragments d'un héros non possédé selon sa rareté (`summonCosts`)                                                              |
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

- parmi les donjons ouverts (ou à ouvrir : le suivant s'ouvre en terminant le précédent) et leurs
  paliers ouverts dont le niveau visé ne dépasse pas celui du plus faible héros de l'équipe, il
  tente d'abord un donjon jamais terminé, sinon le passage qui rapporte le plus de ce qui manque
  à ce héros pour monter (XP, poussière du palier demandé, fragments pour l'étoile), à égalité le
  plus avancé ;
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
Ils ont été mesurés avant les paliers de donjon ; avec les paliers (`balance.tiers`, avant tout
réglage de l'économie) le même joueur modèle donne 30,6 / 26,4 / 44,8 / 102,3 passages : il farme
les paliers des Landes pour la poussière brute (premier objet un peu plus tard), et finit plus
tôt grâce à la poussière pure des paliers de fin.

## Après réglage (2026-10-28)

Changements : paliers de donjon (I à III, `balance.tiers`), coûts d'objets par palier de
poussière (`progression.items.tierCostPct`), poussière brute des deux premiers donjons 4 → 8.
Tout le reste des tableaux plus haut est inchangé.

### Ce qui tombe, par palier

Au palier k d'un donjon (formule unique, `balance.tiers`) : ennemis au niveau conseillé

- 5 × (k − 1) (plafonné à 30 par le moteur) et +20 % de PV et d'ATK par palier ; XP inchangée ;
  or et poussière × (1 + 0,25 × (k − 1)) ; rare +5 de poids par palier (15 → 20 → 25 contre 85,
  soit 15 % → 19 % → 23 % au rang de maîtrise 0) ; coffre d'un cran par palier (bronze → argent →
  or). Le premier passage de chaque palier garantit le rare et le coffre.

| Donjon          | Poussière I / II / III | Or I / II / III       | Coffre I / II / III  |
| --------------- | ---------------------- | --------------------- | -------------------- |
| ember_wastes    | 8 / 10 / 12 brute      | 80 / 100 / 120        | bronze / argent / or |
| drowned_halls   | 8 / 10 / 12 brute      | 160 / 200 / 240       | bronze / argent / or |
| thorn_maze      | 7 / 9 / 11 fine        | 260 / 325 / 390       | argent / or / or     |
| cinder_citadel  | 15 / 19 / 23 fine      | 380 / 475 / 570       | argent / or / or     |
| sunken_spire    | 20 / 25 / 30 fine      | 520 / 650 / 780       | argent / or / or     |
| verdant_crown   | 12 / 15 / 18 pure      | 700 / 875 / 1 050     | or                   |
| broken_crossing | 8 / 10 / 12 pure       | 950 / 1 188 / 1 425   | or                   |
| salt_flats      | 9 / 11 / 14 pure       | 1 100 / 1 375 / 1 650 | or                   |
| obsidian_pass   | 10 / 13 / 15 pure      | 1 250 / 1 563 / 1 875 | or                   |
| hollow_throne   | 12 / 15 / 18 pure      | 1 500 / 1 875 / 2 250 | or                   |

(Arrondis comme le moteur : `Math.round`, maîtrise non comprise.)

### Ce qui se dépense : objets

| Palier de poussière de l'objet | Niveau 1           | Niveau 2            | Niveau 3             | Total au maximum               |
| ------------------------------ | ------------------ | ------------------- | -------------------- | ------------------------------ |
| 1 (donjons 1 et 2)             | 1 copie, 40, 3     | 1 copie, 120, 5     | 2 copies, 280, 8     | 4 copies, 440 or, 16 brutes    |
| 2 (donjons 3 à 5)              | 1 copie, 160, 9    | 2 copies, 480, 15   | 3 copies, 1 120, 24  | 6 copies, 1 760 or, 48 fines   |
| 3 (donjons 6 à 10)             | 1 copie, 2 000, 30 | 3 copies, 6 000, 50 | 4 copies, 14 000, 80 | 8 copies, 22 000 or, 160 pures |

Niveaux, étoiles, invocation et respec : inchangés (tableau « Ce qui se dépense »).

### Jalons

| Jalon                             | Passages gagnants | Tentatives à 58 % | Dispersion (20 graines) | Audit |
| --------------------------------- | ----------------: | ----------------: | ----------------------- | ----: |
| Premier objet au niveau maximum   |               8,1 |                14 | 6 à 14                  |  28,8 |
| Première étoile                   |              20,0 |                34 | 20                      |  21,8 |
| Équipe de 4 équipée (2 objets)    |              38,5 |                66 | 31 à 47                 |  38,5 |
| Équipe de 4 au niveau 30          |             101,6 |               175 | 95 à 109                | 115,5 |
| Équipe de 4 aux objets au maximum |             116,0 |               200 | 107 à 128               |     — |
| Collection (20 objets au maximum) |             243,9 |               421 | 225 à 267               |     — |

Première victoire de chaque donjon : 1 / 8 / 16 / 37,5 / 55,8 / 70,9 / 88,2 / 92,2 / 96,2 / 102,6.

Bilan moyen jusqu'à la collection complète : or 256 800 gagnés, 232 300 dépensés en objets ;
poussière brute 336 (+38 dissoutes) pour 56 en niveaux et 64 en objets ; fine 1 376 (+69) pour 532
et 288 ; pure 2 307 (+99) pour 384 et 1 600 ; 244 objets tombés dont 82 rares ; 135 coffres,
973 fragments.

Lecture :

1. **Début rapide** : le charme des Landes (4 copies) est au maximum vers le 8ᵉ passage ; la
   poussière brute doublée paie à la fois les niveaux 1 à 7 et l'objet.
2. **Milieu gouverné par les étoiles** : la première étoile au 20ᵉ passage, la seconde retient
   le 6ᵉ donjon ; non réglé ici (voir `docs/BALANCE.md`).
3. **Fin de jeu en grind** : après le niveau 30 (101,6), il faut encore 14 passages pour équiper
   l'équipe au maximum et 142 pour finir la collection. Le goulot reste les copies de rares
   (8 par objet du palier 3), les paliers II et III l'accélèrent (+5 et +10 de poids) ; l'or et la
   poussière pure sont désormais dépensés à 90 % et 86 %.
4. Les bornes de ces jalons sont vérifiées en CI (`tools/sim/test/economy.test.ts`).

## Coffres (2026-10-28)

Demande du propriétaire : un légendaire ciblé recevait 50 % des fragments comme un commun ; les
trois coffres ne différaient que par leur nombre de fragments ; le coffre dépendait du donjon,
pas de sa difficulté.

| Coffre | Fragments | Poids commun / rare / épique / légendaire | Raretés tirées (%) | Chance au niv. 1 → 40 |
| ------ | --------: | ----------------------------------------- | ------------------ | --------------------- |
| Bronze |         4 | 12 / 4 / 1 / 0                            | 76 / 20 / 3 / 0    | 45 % → 25 %           |
| Argent |         7 | 12 / 6 / 3 / 1                            | 65 / 26 / 8 / 1    | 5 % → 30 %            |
| Or     |        14 | 6 / 8 / 8 / 5                             | 35 / 37 / 23 / 6   | 0 % → 15 %            |

Chance d'un coffre (au moins) par passage : 50 % au premier donjon, 70 % au palier III du dernier.
Le premier passage de chaque palier en garantit un (bronze si le tirage n'en donne pas).

Héros ciblé (× 12), part de ses fragments par coffre (25 héros : 10 communs, 8 rares, 5 épiques,
2 légendaires) :

| Ciblé      | Bronze | Argent |   Or |
| ---------- | -----: | -----: | ---: |
| Commun     |   50 % |   45 % | 30 % |
| Rare       |   24 % |   29 % | 37 % |
| Épique     |    7 % |   17 % | 37 % |
| Légendaire |    0 % |    6 % | 26 % |

Avant : 50 % pour tous, dans tous les coffres. Passages (gagnants, rejeu) pour réunir
l'invocation d'un héros ciblé, au taux moyen du palier :

| Passage farmé         | Commun (10) | Rare (20) | Épique (40) | Légendaire (80) |
| --------------------- | ----------: | --------: | ----------: | --------------: |
| Landes de braise I    |           9 |        38 |         215 |           3 733 |
| Citadelle de cendre I |           7 |        24 |          85 |             387 |
| Trône creux I         |           5 |        15 |          43 |             157 |
| Trône creux III       |           5 |        12 |          34 |             118 |

Avant (or au rejeu une fois sur deux, 8 fragments, 50 % ciblés) : 40 passages du Trône pour un
légendaire, 5 pour un commun. Un légendaire est maintenant un objectif de fin de partie
(≈ 3 fois plus long), un commun ne change pas.

Joueur modèle (20 graines), avant → après : premier objet au maximum 8,1 → 8,1 ; première étoile
20,0 → 20,0 ; équipe de 4 équipée 46,0 → 44,0 ; équipe de 4 au niveau 30 110,3 → 113,8 ; objets
au maximum 122,2 → 122,7 ; collection complète 247,1 → 251,3. Coffres ouverts 138 → 170,
fragments 983 → 1 071. Les tailles 4 / 7 / 14 ont été choisies pour garder ces jalons : avec
3 / 5 / 10, l'équipe au niveau 30 passait à 133,6 (moins de fragments pour l'équipe de communs,
dont la part ciblée baisse dans l'or).

Leviers : `focusMultiplier` (légendaires plus ou moins accessibles), `weights` de l'or (part des
rares), `drop` (fréquence), `fragments` (rythme général, à recaler avec
`pnpm --filter @outlaw/sim economy`).

## Montée des sorts (2026-10-28)

Grimoires (`spellLevels.grimoires`) : 0 / 1 / 2 par passage gagnant au palier I / II / III ;
0 / 1 / 3 par coffre de bronze / d'argent / d'or. Un niveau de sort se paie en grimoires et en
fragments du héros (tableau dans `docs/BALANCE.md`, « Montée des sorts »).

Le joueur modèle ne dépense pas en sorts (ses jalons ne bougent pas : 8,1 / 20,0 / 44,0 / 113,8 /
122,7 / 251,3) ; `economy` compte ce qu'il gagne (20 graines) :

| Jalon                                      |  Passages gagnants | Tentatives à 58 % |
| ------------------------------------------ | -----------------: | ----------------: |
| Grimoires des 4 sorts d'un héros (44)      |               72,0 |               124 |
| Grimoires des sorts de l'équipe de 4 (176) |              145,7 |               251 |
| Grimoires à la collection complète         | 455 (251 passages) |                 — |

- Un héros au maximum vers le 6ᵉ donjon (première victoire au 85ᵉ passage) : un choix de milieu
  de partie, pas un passage obligé.
- L'équipe entière après ses objets au maximum (122,7) et avant la collection (251,3) : le grind
  de fin de partie a un deuxième puits.
- Fragments : 72 par héros au maximum. Le joueur modèle garde en fin de partie 111 fragments par
  héros de l'équipe (les doublons du héros ciblé, après ses deux étoiles) : ils paient les sorts.
  Un héros hors de l'équipe, rarement ciblé, reste limité par ses fragments.
- Bornes en CI (`tools/sim/test/economy.test.ts`) : un héros entre 50 et 100 passages, l'équipe
  entre 120 et 200, plus de 72 fragments restants par héros de l'équipe.
- Leviers : `grimoires.tiers` et `grimoires.chests` (rythme), `costs` (prix par niveau).

## Quêtes et succès (2026-10-28)

Nouvelles entrées hors donjon : 5 quêtes du jour (15 % d'un passage du meilleur donjon chacune,
coffre de bronze quand toutes sont réclamées), 5 de la semaine (50 % chacune), 20 succès (une
fois : 1, 2 ou 4 passages et un coffre de bronze, d'argent ou d'or). Rien de nouveau à dépenser :
or, poussière et coffres vont dans les puits existants. `pnpm --filter @outlaw/sim economy`
affiche maintenant l'effet sur les jalons à 5, 10 et 20 passages gagnants par jour
(`--per-day N` pour un autre rythme) ; tableau et justification dans `docs/BALANCE.md`,
« Quêtes et succès ». Les jalons sans quêtes (tableaux plus haut) sont inchangés.

## Tour à étages (2026-10-28)

Récompense de **première victoire** seulement (rejouer un étage ne rapporte rien) ; formule dans
`balance.tower.rewards`, total calculé par `pnpm --filter @outlaw/sim tower` :

| Étages  | Poussière (boss × 3) | Fragments | Coffre                   |
| ------- | -------------------- | --------- | ------------------------ |
| 1 à 7   | 4 brutes             | 1         | —                        |
| 8 à 21  | 5 fines              | 1         | bronze (10), argent (20) |
| 22 à 50 | 4 pures              | 1         | argent (30), or (40, 50) |

- Total des 50 étages : 28 brutes, 90 fines, 140 pures, 50 fragments tirés (poids du coffre de
  bronze, héros ciblé compris) et 5 coffres (bronze, 2 argent, 2 or : 46 fragments).
- Comparé au bilan du joueur modèle jusqu'à la collection (`economy` : 336 brutes, 1 376 fines,
  2 307 pures, 973 fragments) : 8 %, 7 %, 6 % et 10 %. La tour est un bonus ponctuel ; le
  calculateur `economy` ne la joue pas, ses jalons et les bornes `farm` / `economy` sont donc
  inchangés.
- Brute volontairement basse (4) : les étages 1 à 7 se gagnent dès le premier jour à 100 % ; à 6,
  ils auraient payé 75 % des niveaux 1 à 7 de l'équipe (56 brutes) avant le moindre donjon.
- Or et XP : rien. L'XP reste le rythme des donjons (le niveau se paie en XP et en poussière) ;
  l'or n'a déjà pas assez de puits.
