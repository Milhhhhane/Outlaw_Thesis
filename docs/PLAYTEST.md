# Test par un joueur extérieur

But (critère du sprint 4) : une personne qui ne connaît pas le jeu finit la boucle **sans aide**.
Ne rien expliquer ; noter seulement où elle hésite.

## Déroulé (20 minutes)

1. Ouvrir le site dans une fenêtre privée (sauvegarde vierge).
2. Consigne unique : « Termine le premier donjon, puis prépare-toi pour le deuxième. »
3. Observer sans intervenir. Noter chaque hésitation de plus de 10 secondes.

## Grille

| Étape                                            | Réussi seul ? | Hésitation |
| ------------------------------------------------ | ------------- | ---------- |
| Comprend qu'il faut entrer dans un donjon        |               |            |
| Lance un sort et choisit une cible               |               |            |
| Comprend la réserve (pourquoi un sort est grisé) |               |            |
| Lit l'action annoncée d'un ennemi                |               |            |
| Termine les 3 combats                            |               |            |
| Lit les récompenses                              |               |            |
| Équipe l'objet gagné                             |               |            |
| Place un point de talent (niveau 3)              |               |            |
| Entre dans le deuxième donjon                    |               |            |

## Déjà vérifié automatiquement

Un parcours « testeur naïf » (navigateur réel, seulement les libellés visibles, ultime ou attaque
de base) termine le premier donjon, équipe l'objet et ouvre le deuxième, sur ordinateur et sur
mobile, sans erreur de page. `apps/web/test/loop.test.tsx` rejoue la boucle à chaque CI.
