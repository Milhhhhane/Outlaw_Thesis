# Avancement

**MVP terminé** : sprints 0 à 6 livrés.

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

- Graphismes — pixel art original (héros, ennemis, effets, décors, interface) et combat animé ;
  outils dans `tools/art/`.

- Sprint 6 — Habillage « jeu plein écran » : coque 16:9, écran-titre, camp, combat en un écran,
  fiche à onglets et arbres de talents, carte des donjons. Critère : aucun défilement et boucle
  jouable au clic et au clavier à 5 résolutions (`pnpm e2e`).

- Lot 7 — Combats plus courts et plus durs : durées et taux de victoire mesurés et tenus en CI
  (expert 84 %, joueur moyen 44 %), vitesse ×2 en combat. Ouvert : « aucun héros indispensable »
  (17 points, cause côté héros) et plafonds de durée des donjons relevés (voir BALANCE.md).
- Lot 8B — Comptes et sauvegarde en ligne : Worker `/api/*` + D1, scrypt, sessions par cookie
  HttpOnly, limites de débit, synchronisation locale d'abord avec écran de conflit, migration
  d'une partie invitée, page de confidentialité (brouillon), réinitialisation par le
  propriétaire (`pnpm admin:reset-password`). Tests : Worker, outil, e2e contre `wrangler dev`.
- Lot 9 — Grosse amélioration graphique : menus habillés (cadres bois, fond, socles), combat
  avec du jus (impacts, étincelles, secousses, chutes, flash d'ultime), carte du monde repeinte
  avec repères et sentier animé. Bundle : 178 ko gzip sur 300.
- Lot 10 — Talents : 8 nœuds par page, 14 points, trois spécialisations ouvertes dès le départ ;
  rééquilibrage mesuré par la simulation (docs/BALANCE.md).
- Lot 11 — Début plus facile et courbe de difficulté vérifiée par la simulation ; trois donjons
  de fin de progression (niveaux 28 à 30).

- Coffres et fragments : trois paliers de coffres donnés par les donjons, fragments de héros,
  invocation à 10 fragments, étoiles tous les 10 niveaux (10 puis 20 fragments), héros ciblé,
  écran « Coffres » avec ouverture animée. Anciennes sauvegardes compatibles sans migration.
  Équilibre à valider au test humain (voir `docs/BALANCE.md`).

## Reste à faire (hors code)

- Test humain d'un joueur extérieur (`docs/PLAYTEST.md`).
- Mise en ligne Cloudflare par le propriétaire (`docs/DEPLOY.md`), puis tags de sprint à publier.
- Licence du dépôt : décision du propriétaire.
- Comptes : vérifier que le premier déploiement a bien créé la base D1 (sinon `DEPLOY.md`),
  renseigner `contact` dans `apps/web/public/config.json`, faire valider la page de
  confidentialité, surveiller les erreurs 1102 à la connexion sur le plan gratuit.

## Prochaine action

Après le test humain : corriger ce qu'il révèle, puis piocher dans `docs/BACKLOG.md`.

## Déploiement

Déploiement automatique actif : chaque push sur `main` est construit et publié par Workers Builds
(premier déploiement réussi : commit `8e8300e`). URL de production : `outlaw-thesis.<sous-domaine>.workers.dev`,
sous-domaine à reporter ici.

## Tags

La session ne peut pas publier de tags : voir `CHANGELOG.md` pour le commit de chaque sprint.
