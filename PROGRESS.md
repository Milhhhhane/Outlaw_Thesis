# Avancement

**Sprint en cours : 2 — Combat jouable** (sprints 0 et 1 terminés).

## Fait

- Sprint 0 — Fondations : monorepo, CI Linux et Windows, configuration Cloudflare, schémas Zod,
  moteur de base, coquille web, squelette de simulation. Critère : 3 scénarios de combat verts.
- Sprint 1 — Moteur complet : 8 briques, passifs et déclencheurs sans chaîne, IA scriptée et
  intention, compilation des builds, 3 héros et 6 ennemis, simulation de 1 000 combats rejoués.
  Critère : 1 000 combats sans erreur, journal rejouable.

## Reste à faire

- Sprint 2 : combat jouable à la souris (file visible, réserve, ciblage, intention ennemie), textes
  des sorts générés depuis les données ; premier test : le combat à 3 avec réserve partagée est-il
  intéressant ? Ennemis à renforcer (100 % de victoires en simulation).
- Sprint 3 : niveaux, talents, respec, 2 emplacements d'objets, sauvegarde locale versionnée.
- Sprint 4 : 7 donjons, butin avec garantie, mode test, planificateur de build partageable par URL.
- Sprint 5 : héros 4 à 6, simulation des 20 équipes, réglage R1, R2 et « aucun héros indispensable ».

## Prochaine action

Sprint 2 : noms et textes français du contenu (`apps/web/src/i18n`), puis écran de combat.

## Déploiement

En attente : le propriétaire du dépôt doit connecter le dépôt à Cloudflare (voir `docs/DEPLOY.md`).
URL de production : pas encore communiquée.

## Tags

La session ne peut pas publier de tags : voir `CHANGELOG.md` pour le commit de chaque sprint.
