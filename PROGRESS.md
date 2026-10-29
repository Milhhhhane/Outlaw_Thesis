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
- Lot 12 — Carte pilotée par les données (place, repère et chapitre dans `dungeons.json`),
  butin en liste avec poids par rareté, rare au premier passage, doublons démontés ; liste de
  contrôle « Ajouter un donjon » dans `docs/CONTENT.md`.
- Lot 13 — Équipes de quatre héros (`teamSize`), Cendre au départ, salles de 3–4 ennemis,
  donjons reconvergés ; outils de réglage corrigés.
- Lot 14 — Texte courant en police lisible (Atkinson Hyperlegible), lexique survolable sur les
  termes de règle, barre d'initiative à huit unités.

- Coffres et fragments : trois paliers de coffres donnés par les donjons, fragments de héros,
  invocation à 10 fragments, étoiles tous les 10 niveaux (10 puis 20 fragments), héros ciblé,
  écran « Coffres » avec ouverture animée. Anciennes sauvegardes compatibles sans migration.
  Équilibre à valider au test humain (voir `docs/BALANCE.md`).
- Combat automatique : bouton « Auto » (touche A), règle déterministe du moteur indépendante de la
  taille des équipes, mesurée à 58 % de donjons réussis contre 51 % pour le joueur moyen simulé et
  85 % pour l'expert. Équipes de 4 héros : chantier à faire, liste dans `docs/ARCHITECTURE.md`.
- Grind (PR A) — butin exclusif par donjon (commun + rare), copies pour améliorer les objets,
  maîtrise de donjon, rare garanti par donjon, bouton « Rejouer », collection à l'atelier.
  Espérances de farm calculées dans `docs/BALANCE.md` ; à confirmer au test humain.
- Grind (PR B) — niveaux payants (XP en banque + poussière du palier), XP et poussière des donjons
  recalibrées sur le calculateur `farm` (89 passages gagnants, ≈ 150 tentatives avec Auto, bornes
  en CI). Or non recalibré.
- Paliers de donjon et économie (PR C/D) — I, II, III par donjon (formule dans `balance.tiers`,
  mesure en CI), choix sur la carte ; audit de l'économie (`docs/ECONOMY.md`, calculateur
  `economy`) puis réglage : premier objet au maximum en 8 passages, coûts d'objets par palier de
  poussière, collection complète en 244 passages, bornes en CI. Étoiles non réglées.
- Enchaînement automatique — en mode Auto, décompte de 5 s entre les salles et sur l'écran de
  récompenses, qui enchaîne le passage suivant d'une série (voir « Confort de farm ») ; tout clic ou touche rend la main. Vitesse
  « instantanée » supprimée (×1, ×2). Tests : `apps/web/test/countdown.test.tsx`, e2e à 1280×720
  et 844×390.
- Confort de farm (MaJ 1/7) — séries de 1, 3, 5, 10 ou ∞ passages en Auto, bilan de série, trois
  équipes enregistrées, tri et filtres des héros, badges « à faire » au camp. Tests :
  `packages/engine/test/farm.test.ts`, `apps/web/test/farm.test.tsx`, e2e série de trois.
- 25 héros et rareté — 19 héros ajoutés (10 communs, 8 rares, 5 épiques, 2 légendaires en
  tout), obtenus par invocation ; coffres pondérés et invocation payée selon la rareté ; rareté
  affichée partout. « Aucun héros indispensable » tenue pour la première fois depuis le lot 7
  (écart 7 points, cible ≤ 10). Cibles de rythme ajustées (voir BALANCE.md), à revoir avec les
  paliers de donjon. Ouvert : marier les raretés hautes avec des donjons plus durs.

- Animations de combat — attaque de base au contact, impacts par élément, ultimes (bandes,
  zoom sur le lanceur, flash à l'impact), soins et bulles de bouclier, altérations persistantes
  (brûlure, marque, étourdissement), mort par dissolution. Tout en CSS et sprites générés, piloté
  par la vue rejouée ; durées à l'échelle de la vitesse ; tests dans
  `apps/web/test/stage-sim.test.tsx`.
- PvP, salon personnalisé (« Duel en ligne ») : moteur (règles de combat, action par défaut,
  empreinte d'état), protocole et salon purs (`packages/net`), serveur (Durable Object `PvpRoom`),
  interface (salon, équipe, combat en direct, émotes, revanche, reprise). Remis à jour après le
  grind : équipes de `teamSize` (4) héros, entrée « PvP » au camp. Ouvert : équilibrage PvP (voir
  `docs/PVP.md`), propriété des héros non prouvée.

- Silhouettes des héros — 18 héros récents habillés d'une coiffe ou d'un accessoire dessiné
  (`tools/art/looks.py`), palettes franches, armes mieux réparties ; aucune paire de héros n'a la
  même silhouette (vérifié par `export.py`). Gameplay inchangé.

- Coffres revus — héros ciblé proportionnel à sa rareté (poids × 12 au lieu de 50 % fixes),
  coffres distincts (poids de rareté propres, 4 / 7 / 14 fragments), chance de coffre selon la
  difficulté du palier (l'or ne tombe que dans les passages durs). Répond au point ouvert
  ci-dessus « marier les raretés hautes avec des donjons plus durs ». Chiffres dans
  `docs/ECONOMY.md`.
- Montée des sorts — chaque sort monte du niveau 1 à 5 (+2,5 % de puissance par niveau, −10 de
  délai à l'ultime au niveau 5), payé en grimoires (paliers II/III, coffres d'argent et d'or) et
  en fragments du héros ; onglet « Grimoire » de la fiche. Écart sorts au maximum : +13,8 points
  de donjons terminés en retard (cible ≤ 20) ; R1, R2 et « aucun héros indispensable » tenues
  sorts au maximum. Ouvert : les quêtes (autre chantier) pourront aussi donner des grimoires ;
  le PvP reste au niveau 1 (à trancher par le propriétaire).

- Quêtes et succès — 5 quêtes du jour et 5 de la semaine tirées selon la date UTC et la graine
  du profil, bonus du jour (coffre de bronze), 20 succès par paliers ; progression comptée par le
  moteur (compteurs à vie), récompenses relatives au meilleur donjon terminé, écran « Quêtes » au
  camp avec badge. Effet mesuré : au plus 13,7 % de raccourcissement d'un jalon (cible ≤ 15 %,
  en CI). Pas de quête PvP (voir DECISIONS).

- Tour à étages — 50 étages générés par formule (un combat chacun, boss tous les 10 étages),
  progression dans le profil, récompenses de première victoire, écran « Tour » au camp, Auto qui
  peut monter d'étage, règles de simulation en CI (`targets.tower`). Ouvert : pas de remise à zéro
  ni de récompense de rejeu ; courbe à confirmer au test humain.

- Administration — écran réservé aux pseudos du secret `ADMIN_PSEUDOS` : comptes, activité,
  avancement, fiche par compte. Reste au propriétaire : créer le secret dans Cloudflare
  (`docs/DEPLOY.md`).

- Éveil et sanctuaires d'essence — trois donjons d'essence (un par élément, paliers I à III,
  essences seulement), éveil une fois par héros (niveau 20, essences de son élément, or) : +4 %
  de stats et passif +20 % par une formule commune ; badge et liseré en combat. Mesuré : écart
  d'un héros éveillé ≤ 9 points, règles tenues avec tous éveillés, premier héros éveillé au 81ᵉ
  passage et équipe au 137ᵉ (`economy`). Ouvert : pas de quête ni de succès d'éveil, essences non
  échangeables entre éléments.

- Boss de la semaine — rotation hebdomadaire de 3 boss, 4 difficultés, 3 tentatives par jour,
  paliers de dégâts payés une fois par semaine, accès depuis la tour, règles et effet économique
  en CI. Ouvert : l'équipement pèse peu sur les dégâts (voir DECISIONS) ; pas de classement.

- Or utile — l'or paie chaque niveau et chaque étoile (éveil ramené à 1 000 or) ; or en réserve
  ramené de 73–79 % à 18–20 % de l'or gagné en milieu de partie, début inchangé. Ouvert : en fin de
  partie l'or reste surtout dépensé en objets ; marché à stock tournant prévu.

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
