# Économie

Tout ce qui tombe, tout ce qui se dépense, et le nombre de donjons gagnants que demande chaque
jalon. Les valeurs vivent dans [`packages/data/balance.json`](../packages/data/balance.json) et
[`packages/data/content/dungeons.json`](../packages/data/content/dungeons.json) ; les chiffres de
ce document sortent de `pnpm --filter @outlaw/sim economy` (`tools/sim/src/economy.ts`), à relancer
après tout changement. Les tableaux « Ce qui tombe » et « Ce qui se dépense » et la partie
« Audit » décrivent l'état **avant** réglage (2026-10-27), sauf les lignes niveaux et étoiles du
tableau « Ce qui se dépense », à jour du coût en or (2026-10-29) ; « Après réglage » et les parties
suivantes donnent les valeurs en vigueur à leur date (justifications chiffrées dans
`docs/BALANCE.md`). Les jalons à jour sont dans la dernière partie.

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

| Dépense                 | Coût                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Niveau suivant          | XP = round(40 × N^1,5) ; or = round(2 × N^1,65) (`levelGold`) ; poussière brute 2 (niveaux 1 à 7), fine 3 + 1 par niveau (8 à 21), pure 5 + 2 par niveau (22 à 29) (`levelUp`) |
| Niveaux 1 → 8 (1 héros) | 2 457 XP, 156 or et 14 brute (624 or et 56 brute pour quatre héros)                                                                                                            |
| Niveaux 8 → 22          | 31 825 XP, 2 406 or et 133 fine (9 624 or et 532 fine pour quatre)                                                                                                             |
| Niveaux 22 → 30         | 41 331 XP, 3 363 or et 96 pure (13 452 or et 384 pure pour quatre)                                                                                                             |
| Étoile                  | 10 fragments du héros et 600 or au niveau 10, 20 fragments et 1 200 or au niveau 20 (`starCosts`, `starGold`) ; sans elle, le niveau est plafonné                              |
| Invocation              | 10, 20, 40 ou 80 fragments d'un héros non possédé selon sa rareté (`summonCosts`)                                                                                              |
| Améliorer un objet      | niveau 1 : 1 copie, 100 or, 5 poussière ; niveau 2 : 2 copies, 300 or, 8 ; niveau 3 : 3 copies, 800 or, 12 — poussière du palier de son donjon                                 |
| Objet au maximum        | 6 copies, 1 200 or, 25 poussière                                                                                                                                               |
| Équipe équipée au max   | 8 objets : 48 copies, 9 600 or, 200 poussière                                                                                                                                  |
| Respec                  | gratuit la première fois par héros, puis 20 or × niveau                                                                                                                        |

Avant le 2026-10-29, l'or n'avait que deux puits (améliorations et respec) ; il paie maintenant
aussi chaque niveau et chaque étoile (voir « L'or paie les niveaux et les étoiles »). La poussière en a deux (niveaux et
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

## Boss de la semaine (2026-10-28)

Paliers payés une fois par semaine et par difficulté (`balance.boss.rewards`, poussière du palier
qu'exige le niveau du boss : fine aux difficultés 1 et 2, pure aux 3 et 4) :

| Palier | Poussière | Fragments | Coffre |
| -----: | --------: | --------: | ------ |
|      1 |         3 |         0 | —      |
|      2 |         4 |         1 | —      |
|      3 |         5 |         0 | bronze |
|      4 |         6 |         0 | argent |

Mesure : `pnpm --filter @outlaw/sim economy` (modèle `boss`, sans quêtes) joue `enterBoss` et
`completeBoss` : à chaque passage, chaque difficulté ouverte dont un palier reste à payer est
tentée (3 par jour) et rapporte **tous** ses paliers. Borne haute : un vrai joueur n'atteint pas
toujours le palier 4. Raccourcissement des jalons (premier objet max / première étoile / équipe
équipée / niveau 30 / objets max / collection) :

| Rythme             | Raccourcissement (%)          | Paliers payés : poussière fine / pure, coffres |
| ------------------ | ----------------------------- | ---------------------------------------------- |
| 5 passages / jour  | 0 / 0 / 6,6 / 7,7 / 4,8 / 4,8 | 243 / 183, 47 coffres (sur 170 ouverts)        |
| 10 passages / jour | 0 / 0 / 4,9 / 4,2 / 2,1 / 0,1 | 148 / 110, 29 coffres                          |

- Cible : ≤ ~10 % sur chaque jalon (testé en CI à 10 %). Plus fort effet : 7,7 % (niveau 30, à
  5 passages par jour, le rythme qui laisse le plus de semaines).
- Réglages écartés : poussière 4/6/8/10, fragments 1/1/2/2, bronze et argent : 12,3 % sur
  l'équipe équipée ; coffre au palier 4 seul et plus de fragments : 7,5 % mais un palier 3 sans
  attrait. Le coffre d'or n'est pas donné : à 14 fragments, il dépassait la cible seul.
- Les jalons sans boss et les bornes `economy` / `farm` sont inchangés (le modèle n'est actif
  qu'avec `boss: true`). Effet cumulé avec les quêtes non borné en CI (chacun l'est seul).

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

## Éveil et sanctuaires d'essence (2026-10-28)

Nouvelle monnaie, **les essences** (par élément, trois qualités), qui n'a qu'une source et qu'un
puits : les sanctuaires d'essence (ouverts après la Citadelle de cendre, premier passage moyen au
42,9ᵉ passage gagnant) et l'éveil.

| Sanctuaire, palier | Niveau des ennemis | Par victoire       |
| ------------------ | -----------------: | ------------------ |
| I                  |                 10 | 3 essences faibles |
| II                 |                 15 | 3 moyennes         |
| III                |                 20 | 2 supérieures      |

Éveil : 15 faibles, 10 moyennes, 6 supérieures de l'élément du héros et **1 000 or** (5 000 avant
le 2026-10-29, voir « L'or paie les niveaux et les étoiles »), au niveau 20, une fois par héros,
soit 5 + 4 + 3 = 12 passages d'essence par héros au plus court (rien d'autre ne tombe : ni XP, ni
or, ni poussière, ni objet, ni coffre). Le joueur modèle (`economy`, voir `docs/BALANCE.md`)
éveille son premier héros au **85,9ᵉ passage** (dont 15,2 d'essence) et son équipe au **131,9ᵉ**
(47 passages d'essence en tout ; l'équipe de départ compte deux héros de feu) ; avant le coût en or
des niveaux : 81,0 et 136,5.
Les jalons sans éveil (tableaux plus haut) sont inchangés : le calculateur ne joue l'éveil que
sur demande (`AwakeningModel`).

## L'or paie les niveaux et les étoiles (2026-10-29)

Demande du propriétaire : l'or ne servait à rien. Sur le modèle de Summoners War (mana), Brave
Frontier (zel) ou RAID (argent), la monnaie de base devient un co-coût de chaque progression :

- **niveau** : round(`levelGold.base` × N^`levelGold.exponent`) = round(2 × N^1,65) pour passer du
  niveau N au suivant (2 or au niveau 1, 89 au 10, 280 au 20, 518 au 29 ; 5 925 or par héros de 1
  à 30, 23 700 pour quatre), payé avec l'XP et la poussière (`levelUp`, `levelUpMax` qui s'arrête
  au dernier niveau payable, refus `not_enough_gold`) ;
- **étoile** : `chests.starGold` = 600 puis 1 200 or, avec les fragments (`starUp`, `canStarUp`).

Le joueur modèle paie ces coûts avec les vraies fonctions du moteur, dans le même ordre (étoiles,
objets, niveaux, l'éveil passant avant les objets) ; quand seul l'or manque, il farme le passage
qui en rapporte le plus. Il n'épargne pas : comme un joueur moyen, il dépense son or dès qu'il peut.

**Or de l'éveil 5 000 → 1 000.** Un joueur qui paie chaque niveau et chaque étoile ne réunit plus
5 000 or d'un coup en milieu de partie : le premier éveil reculait de 81,0 à 129,8 passages et
l'équipe éveillée de 136,5 à 183,5. L'or passe d'un gros achat ponctuel (20 000 pour l'équipe) aux
dépenses régulières des niveaux et des étoiles (30 900 jusqu'au niveau 30) ; l'éveil garde un prix
en or, à l'échelle d'une étoile. Tableau des essais dans `docs/BALANCE.md`.

`pnpm --filter @outlaw/sim economy` donne maintenant, à chaque jalon, l'or **en réserve** (gagné −
dépensé) et l'or gagné cumulé (moyenne des 20 graines) :

| Jalon                             | Passages avant | Passages après |  Écart | Réserve / gagné avant   | Réserve / gagné après  |
| --------------------------------- | -------------: | -------------: | -----: | ----------------------- | ---------------------- |
| Premier objet au niveau maximum   |            8,1 |            8,1 |    0 % | 228 / 772 (30 %)        | 71 / 772 (9 %)         |
| Première étoile                   |           20,0 |           20,0 |    0 % | 1 970 / 3 140 (63 %)    | 341 / 3 140 (11 %)     |
| Équipe de 4 équipée (2 objets)    |           44,0 |           44,1 | +0,2 % | 6 331 / 8 699 (73 %)    | 1 760 / 8 719 (20 %)   |
| Équipe de 4 au niveau 30          |          113,8 |          117,6 | +3,3 % | 38 017 / 48 269 (79 %)  | 8 849 / 50 073 (18 %)  |
| Équipe de 4 aux objets au maximum |          122,7 |          127,5 | +3,9 % | 40 368 / 51 568 (78 %)  | 11 709 / 54 105 (22 %) |
| Collection complète au maximum    |          251,3 |          264,2 | +5,1 % | 24 951 / 257 271 (10 %) | 13 700 / 276 920 (5 %) |

Dispersion après (20 graines) : 6 à 15 / 20 / 37 à 56 / 110 à 126 / 117 à 144 / 245 à 299 passages ;
réserve à l'équipe équipée 7 à 36 %, au niveau 30 14 à 24 %.

Bilan jusqu'à la collection : or gagné 276 900, dépensé en objets 232 300, en niveaux 23 700, en
étoiles 7 200. L'or reste surtout le prix des objets du palier 3 en fin de partie ; ce qui change,
c'est le milieu : il n'y a plus 6 000 à 38 000 or qui dorment, chaque objet amélioré retarde un
niveau. Les chiffres plus haut dans ce document (audit, « Après réglage ») datent d'avant ce
changement et d'avant les dernières fonctions (coffres, éveil…) : les jalons en vigueur sont ceux
de ce tableau.

Effets mesurés sur les autres modèles : quêtes, raccourcissement maximal 13,3 % à 5 passages par
jour et 13,9 % à 10 (avant : 13,1 et 13,7 ; borne 15 %) ; boss, 7,6 % et 3,6 % (borne 10 %) ;
éveil (or de l'éveil à 1 000), premier héros 81,0 → 85,9 passages (+6,0 %), équipe éveillée
136,5 → 131,9 (−3,4 %), équipe au niveau 30 avec l'éveil 160,7 → 171,2 (+6,5 %). Bornes en CI
(`tools/sim/test/economy.test.ts`) : au plus 25 % de l'or gagné en réserve à l'équipe équipée et
au niveau 30 ; équipe au niveau 30 avec l'éveil ≤ 177 (5 graines). Justification des valeurs : `docs/BALANCE.md`, « L'or paie les
niveaux et les étoiles ».

## Chapitre 2 (2026-10-29)

Dix donjons parallèles au chapitre 1 (niveaux 2 à 30, voir `docs/BALANCE.md`, « Chapitre 2 »),
récompenses à l'échelle des donjons du chapitre 1 de niveau voisin (premier passage comme rejeu) :

| Donjon        | Niv. |   XP |   Or | Poussière | Butin (commun / rare)           |
| ------------- | ---: | ---: | ---: | --------- | ------------------------------- |
| frost_strand  |    2 |  120 |  100 | 8 brute   | rime_locket / frost_heart       |
| bog_mire      |    5 |  310 |  185 | 8 brute   | bog_lantern / mire_totem        |
| ember_forge   |    8 |  470 |  260 | 7 fine    | forge_rivet / anvil_core        |
| glacier_vault |   11 |  780 |  350 | 13 fine   | glacier_shard / hoarfrost_ring  |
| rotwood       |   14 | 1010 |  440 | 17 fine   | spore_pouch / heartwood_charm   |
| twin_rivers   |   18 | 1260 |  560 | 20 fine   | river_stone / confluence_orb    |
| ash_caldera   |   22 | 1500 |  700 | 8 pure    | ash_veil / magma_sigil          |
| frozen_abyss  |   25 | 1620 |  850 | 9 pure    | glacial_horn / permafrost_plate |
| elder_swamp   |   28 | 1900 | 1100 | 9 pure    | root_knot / swamp_eye           |
| eclipse_keep  |   30 | 2400 | 1500 | 8 pure    | dusk_ring / eclipse_shard       |

Coffres : la formule par niveau d'ennemis (`chests.dropLevels`), comme au chapitre 1. Paliers de
poussière des objets : 4 objets du palier 1, 8 du palier 2, 8 du palier 3 (chapitre 1 : 4, 6, 10).
Poussière pure 8 à 9 (et non 10 à 12) : avec 12, le grind de la collection du chapitre 2 laissait
dormir un tiers de la poussière pure (borne CI : les trois quarts dépensés ; mesuré 68 %, 76 %
après). Rythme du farm (`pnpm --filter @outlaw/sim farm`) : 5,3 à 18,0 passages par pas, 92 pour le
chapitre (89 pour le chapitre 1).

### Route du joueur modèle

Le joueur modèle a maintenant deux routes (`ChapterRoute` dans `tools/sim/src/economy.ts`) :

- **`main`** (référence, bornes en CI) : le chapitre 1 est la route principale ; le chapitre 2 est
  joué une fois l'équipe au niveau 30 (il en fait les dix premières victoires, puis le farme pour
  sa collection, objets du chapitre 1 d'abord) ;
- **`parallel`** (lecture seule, affichée par `economy`) : tout donjon ouvert à sa portée est joué,
  dès l'ouverture.

Jalons (passages gagnants, 20 graines). « Collection » = les 20 objets du chapitre 1, comme avant ;
« collection complète » = les 40 :

| Jalon                             | Avant (10 donjons) | Après, route `main` |  Écart | Route `parallel` |   Écart |
| --------------------------------- | -----------------: | ------------------: | -----: | ---------------: | ------: |
| Premier objet au niveau maximum   |                8,1 |                 8,1 |    0 % |             24,8 |  +206 % |
| Première étoile                   |               20,0 |                20,0 |    0 % |             16,0 |   −20 % |
| Équipe de 4 équipée (2 objets)    |               44,1 |                44,1 |    0 % |             12,2 |   −72 % |
| Équipe de 4 au niveau 30          |              117,6 |               117,6 |    0 % |            112,7 |  −4,2 % |
| Équipe de 4 aux objets au maximum |              127,5 |               137,2 | +7,6 % |            158,8 | +24,5 % |
| Collection du chapitre 1          |              264,2 |               271,1 | +2,6 % |            309,5 | +17,1 % |
| Collection complète (40 objets)   |                  — |               477,5 |      — |            455,8 |       — |
| Grimoires des sorts de l'équipe   |              147,5 |               156,5 | +6,1 % |            151,3 |  +2,6 % |

Route `main` : aucun jalon ne bouge de plus de 10 %. Les objets au maximum reculent de 7,6 % parce
que les dix premières victoires du chapitre 2 passent avant le farm des copies (un donjon jamais
terminé passe avant tout). Réserve d'or 20 % et 18 % aux jalons bornés, poussière pure dépensée
à 76 %, quêtes : raccourcissement maximal 13,3 % et 13,9 % ; boss : 7,6 % ; éveil inchangé (85,9 /
131,9 / 171,2). Toutes les bornes de `economy.test.ts` tiennent.

**Route `parallel` : les bornes ne tiennent pas, et ce n'est pas un réglage.** Deux fois plus de
donjons de bas niveau, c'est deux fois plus de premières victoires (rare garanti) : l'équipe est
équipée au 12ᵉ passage au lieu du 44ᵉ (borne 25 à 55), l'or et la poussière s'étalent sur deux fois
plus d'objets portés (premier objet au maximum au 25ᵉ passage, borne 14 ; réserve d'or 53 % à
l'équipe équipée, borne 25 %), la fin de partie s'allonge (objets au maximum 159, borne 140 ;
collection du chapitre 1 310, borne 300). Aucune valeur des récompenses du chapitre 2 ne corrige
l'équipement précoce : il vient du nombre de donjons ouverts au niveau 2 à 8, fixé par la décision
(un donjon du chapitre 2 s'ouvre avec celui du chapitre 1 de même niveau). C'est au propriétaire de
dire laquelle des deux routes représente le joueur visé, et s'il faut alors retoucher les bornes
ou l'ouverture du chapitre 2.
