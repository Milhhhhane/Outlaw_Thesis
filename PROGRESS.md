# Avancement

**Sprint en cours : 1 — Moteur complet** (sprint 0 terminé, tag `sprint-0`).

## Fait

- Sprint 0 — Fondations : monorepo pnpm, CI (Linux et Windows), configuration Cloudflare, schémas
  Zod de tout le contenu, `balance.json`, moteur (stats par niveau, file d'initiative, réserve
  partagée, dégâts, soins, points d'équipe, limite d'actions, rejeu), coquille web en français,
  squelette de simulation avec test de régression. Critère de sortie atteint : 3 scénarios de
  combat verts (`packages/engine/test/scenarios.test.ts`).

## Reste à faire

- Sprint 1 : briques bouclier, tempo, modification de stat, altérations, déclencheurs ; passifs ;
  compilation héros + talents + objets → unité ; IA scriptée des ennemis ; 3 héros prototypes ;
  simulation de 1 000 combats sans erreur, journal rejouable.
- Sprint 2 : combat jouable à la souris (file visible, réserve, ciblage, intention ennemie).
- Sprint 3 : niveaux, talents, respec, 2 emplacements d'objets, sauvegarde locale versionnée.
- Sprint 4 : 7 donjons, butin avec garantie, mode test, planificateur de build partageable par URL.
- Sprint 5 : héros 4 à 6, simulation des 20 équipes, réglage R1, R2 et « aucun héros indispensable ».

## Prochaine action

Sprint 1 : étendre `UnitState` (bouclier, altérations, modifications de stat, déclencheurs) et
ajouter les 5 briques manquantes dans `packages/engine/src/effects.ts`.

## Déploiement

En attente : le propriétaire du dépôt doit connecter le dépôt à Cloudflare (voir `docs/DEPLOY.md`).
URL de production : pas encore communiquée.
