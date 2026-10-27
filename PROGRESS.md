# Avancement

**MVP terminé** : sprints 0 à 5 livrés.

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
- Sprint 4 — Donjons et mode test : 7 donjons, 12 ennemis, mode test, lien de build, premiers pas,
  aide. Critère : un testeur naïf automatisé finit la boucle sans aide (ordinateur et mobile) ;
  test humain à faire avec `docs/PLAYTEST.md`.
- Sprint 5 — Équilibrage : héros 4 à 6, simulation des 20 équipes. Critère : R1 (86 %), R2 (60 %)
  et « aucun héros indispensable » (0 point) tenues, vérifiées en CI par `pnpm sim:check`.

## Reste à faire (hors code)

- Test humain d'un joueur extérieur (`docs/PLAYTEST.md`).
- Mise en ligne Cloudflare par le propriétaire (`docs/DEPLOY.md`), puis tags de sprint à publier.
- Licence du dépôt : décision du propriétaire.

## Prochaine action

Après le test humain : corriger ce qu'il révèle, puis piocher dans `docs/BACKLOG.md`.

## Déploiement

En attente : le propriétaire du dépôt doit connecter le dépôt à Cloudflare (voir `docs/DEPLOY.md`).
URL de production : pas encore communiquée.

## Tags

La session ne peut pas publier de tags : voir `CHANGELOG.md` pour le commit de chaque sprint.
