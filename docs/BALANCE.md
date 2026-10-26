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

- **R1** : à niveau égal, le meilleur build bat le pire dans au moins `r1MinWinRate` (70 %) des
  combats.
- **R2** : au niveau recommandé + `r2LevelGap` (3), le meilleur build gagne plus de
  `r2MinWinRate` (50 %) des combats du donjon.
- **Aucun héros indispensable** : la meilleure équipe sans un héros donné reste à moins de
  `dispensableMaxGapPoints` (10 points) du meilleur taux de victoire.

## Simulation

`pnpm sim` écrit `tools/sim/out/results.csv` (colonnes `scenario, battles, wins, win_rate,
avg_actions`). Sprint 0 : scénarios synthétiques (duels par paire d'éléments, 3 contre 3,
limite d'actions). Depuis le sprint 1 : 1 000 combats aléatoires reproductibles (graine 1) — niveau, ordre de
l'équipe, talents et rencontre tirés au sort — joués par une politique d'anticipation d'un coup,
chaque journal étant rejoué et comparé. Options : `--battles N`, `--seed S`. Les 20 équipes et
R1/R2 arrivent au sprint 5.
