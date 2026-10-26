# Avancement

**Sprint en cours : 4 — Donjons et mode test** (sprints 0 à 3 terminés).

## Fait

- Sprint 0 — Fondations : monorepo, CI Linux et Windows, configuration Cloudflare, schémas Zod,
  moteur de base, coquille web, squelette de simulation. Critère : 3 scénarios de combat verts.
- Sprint 1 — Moteur complet : 8 briques, passifs et déclencheurs sans chaîne, IA scriptée et
  intention, compilation des builds, 3 héros et 6 ennemis, simulation de 1 000 combats rejoués.
  Critère : 1 000 combats sans erreur, journal rejouable.
- Sprint 2 — Combat jouable : écran de combat (ligne de temps, réserve, ciblage, intentions,
  journal), textes français générés depuis les données. Critère : combat complet joué au clic
  (test automatisé). Premier test de la réserve partagée : voir `docs/BALANCE.md`.
- Sprint 3 — Progression : profil, XP, talents, respec, objets, améliorations, sauvegarde, camp,
  fiche de héros, 3 donjons. Critère : boucle donjon → récompense → investissement jouée au clic
  (test `apps/web/test/loop.test.tsx`).

## Reste à faire

- Sprint 4 : 7 donjons, butin avec garantie, mode test, planificateur de build partageable par URL.
- Sprint 5 : héros 4 à 6, simulation des 20 équipes, réglage R1, R2 et « aucun héros indispensable ».

## Prochaine action

Sprint 4 : 4 donjons de plus (dont le mixte) et leurs boss, mode test (tout ouvert, respec
gratuit), planificateur de build partageable par URL, parcours d'un testeur sans aide.

## Déploiement

En attente : le propriétaire du dépôt doit connecter le dépôt à Cloudflare (voir `docs/DEPLOY.md`).
URL de production : pas encore communiquée.

## Tags

La session ne peut pas publier de tags : voir `CHANGELOG.md` pour le commit de chaque sprint.
