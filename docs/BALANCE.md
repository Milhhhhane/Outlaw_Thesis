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

Mesurées par `pnpm sim` sur les 20 équipes possibles ; `pnpm sim:check` (CI) échoue si l'une
d'elles n'est plus tenue. Définitions exactes dans `tools/sim/src/rules.ts` :

- **R1** : pour chaque équipe et chaque niveau conseillé (où les talents permettent des builds
  différents), 6 builds tirés au hasard sont classés par leurs duels contre 4 builds de référence ;
  le meilleur et le pire s'affrontent ensuite, dans les deux sens.
- **R2** : pour chaque donjon, part des 20 équipes dont le meilleur des 6 builds termine le donjon
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
