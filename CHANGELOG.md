# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Une entrée par sprint.

## [Non publié] — 2026-10-27 — coffres et fragments

### Ajouté

- Coffres de bronze, d'argent et d'or (pixel art recoloré depuis le pack 0x72) : donnés à la
  première victoire d'un donjon, puis une fois sur deux au rejeu.
- Fragments de héros : 10 invoquent un héros ; un héros ciblé reçoit la moitié des fragments.
- Étoiles : le niveau d'un héros est plafonné tous les 10 niveaux jusqu'à ce qu'on paie l'étoile
  suivante en fragments (10, puis 20). Écran « Coffres », entrée dans le camp avec compteur,
  carte de récompense, plafond et bouton d'étoile sur la fiche du héros.

### Modifié

- Les sauvegardes existantes restent valides : les étoiles sont déduites du niveau.

## [lot-10] — 2026-10-27 — arbres de talents plus riches

### Modifié

- Trois spécialisations ouvertes dès le niveau 1 ; 8 nœuds par page (24 par héros) au lieu de 5,
  14 points de talent au lieu de 10 (un tous les deux niveaux). Nouveaux nœuds : compromis
  (puissance contre coût ou délai, zone contre puissance) et un sommet par page.
- Équilibrage : PV des monstres × 0,58, `hpPct` retouchés, premier combat du Carrefour brisé
  recomposé ; expert 87 %, joueur moyen 42 %, R1 90 %, R2 85 % (`docs/BALANCE.md`).
- Arbres dessinés par profondeur de prérequis (quatre rangées).

## [lot-9] — 2026-10-27 — grosse amélioration graphique

### Modifié

- Héros et monstres remplacés par les personnages du « DungeonTileset II » de 0x72 (CC0),
  recolorés par élément et agrandis ×2 : quatre images de repos, image de dégâts, visages lisibles.

### Corrigé

- Les unités à terre rejouaient leur chute à chaque coup (le conteneur secoué était recréé) ;
  test de simulation `apps/web/test/stage-sim.test.tsx` qui rejoue un combat complet dans le
  champ de bataille et vérifie qu'aucun acteur n'est recréé.

### Ajouté

- Chaque héros tient son arme (bâtons, épées, lance du même pack CC0), qui balaie à l'attaque ;
  douze icônes d'objets distinctes (charme, pendentif, anneau, lentille, fiole, éperons, bague,
  jeton, plume, sceau, engrenage, éclat) à la place de l'anneau unique.
- Menus habillés (`tools/art/ui.py`) : fond de nuit derrière les écrans, cadres bois cloutés
  (9 tranches), planche d'en-tête, corde, cuir, socles sous les héros, icônes de statistiques.
- Combat : arcs de frappe, étincelles, gros impacts sur les coups lourds (≥ 30 % des PV ou
  mortels), secousse d'écran légère ou forte, voile rouge quand un héros encaisse, flash et
  zoom sur les ultimes, chute avec poussière, cartes de sorts qui pulsent ; fente avec
  anticipation et étirement, recul avec rotation. Tout s'éteint avec « Animations : désactivées ».
- Carte du monde repeinte (`tools/art/worldmap.py`) : sept contrées aux contours organiques
  (dunes, forêts, lac, volcan, mer, canyon), montagnes, repères dessinés pour chaque donjon,
  marqueurs ronds, sentier animé vers le prochain donjon, rose des vents.

## [lot-8b] — 2026-10-27 — comptes et sauvegarde en ligne

### Ajouté

- Comptes sans e-mail : création (pseudo, mot de passe de 10 caractères, liste des mots de passe
  courants refusés, case « pas de récupération automatique »), connexion, déconnexion,
  changement de mot de passe, export des données, suppression effective du compte.
- Worker Cloudflare (`apps/api`) sur `/api/*`, base D1 provisionnée au déploiement, migrations
  appliquées par le Worker ; hachage scrypt partagé avec l'outil d'administration
  (`packages/accounts`) ; sessions par cookie HttpOnly, contrôle de l'Origin, limites de débit à
  délai croissant, adresses IP jamais en clair.
- Sauvegarde en ligne : locale d'abord, envoi temporisé, indicateur d'état, écran « Version du
  cloud / Version de cet appareil » en cas de conflit, migration d'une partie invitée.
- Page « Confidentialité et conditions » (brouillon), `public/config.json` (contact du créateur).
- `pnpm admin:reset-password <pseudo>` et procédure `docs/ACCOUNTS.md`.
- Tests : Worker (17), outil d'administration, e2e des comptes contre `wrangler dev`.

### Modifié

- Écran-titre : Jouer en invité, Se connecter, Créer un compte ; boutons secondaires compactés.

## [lot-7] — 2026-10-27 — combats plus courts et plus durs

### Ajouté

- Simulation : actions de joueur par combat et par donjon, politique « joueur moyen », bornes de
  durée et de taux de victoire vérifiées par `pnpm sim:check` ; outils `tune` et `autotune`.
- `balance.json` : échelle globale des monstres (`enemyScale`, PV × 0,55, ATK × 1,85) ;
  `dungeons.json` : PV par combat (`hpPct`).
- Combat : bouton de vitesse ×1/×2 (touche X), retenu dans les options.

### Modifié

- Monstres : grosses actions plus fortes, boss moins épais, trois combats recomposés. Combats
  normaux ~20 actions de joueur, boss ~26 ; expert 84 %, joueur moyen 44 %.
- Animations plus courtes (environ 0,6 s par action à vitesse normale).
- « Aucun héros indispensable » : nouvelle mesure (3 niveaux de retard, joueur moyen), non tenue
  (17 points), affichée mais non bloquante.

## [sprint-6] — 2026-10-27 — habillage « jeu plein écran »

### Ajouté

- Coque de jeu 16:9 (960 × 540 logiques) mise à l'échelle de la fenêtre, bandes noires, aucun
  défilement ni zoom ; écran « Tournez votre appareil » en portrait ; plein écran (bouton, F11) ;
  manifeste d'installation et icônes ; police Pixelify Sans embarquée (OFL).
- Écran-titre (Continuer, Nouvelle partie, Mode test, Options, Crédits), camp en un écran,
  options (plein écran, vitesse des combats, animations, export, import et effacement de la
  sauvegarde), crédits lus dans `docs/CREDITS.md`.
- Combat tenant sur un écran : file en haut, scène au centre, barre de sorts en bas, PV et
  intentions dans la scène, menu pause (Échap), victoire et défaite en plein écran,
  récompenses en cartes.
- Fiche de héros à onglets, arbres de talents reliés avec aperçu avant/après sur les sorts,
  icônes par type d'effet, emplacements d'objets avec fenêtre de choix ; carte des donjons et
  écran de composition à trois emplacements ; atelier des objets.
- Tests Playwright à 1920×1080, 1366×768, 1280×720, 844×390 et 390×844 (`pnpm e2e`, en CI).

### Modifié

- Plus aucun menu déroulant natif ni lien souligné ; Échap revient en arrière partout.

## [graphismes] — 2026-10-27

### Ajouté

- Pixel art original : 6 héros, 12 ennemis (boss en 96 px), effets, police pixel, 7 décors de
  donjon et cadres d'interface, générés par `tools/art/`.
- Champ de bataille animé : décor du donjon, sprites au repos, fente à l'attaque, projectile,
  éclair blanc et éclats à l'impact, chiffres en police pixel, cible et unité active soulignées.
- Camp : scène de l'équipe autour du feu, portraits des héros, décor de chaque donjon ; fiche de
  héros avec portrait.

### Modifié

- Interface en cadres pixel (cartes, boutons, barre d'action) ; cartes d'unité plus compactes.
- Rejeu : chaque événement affiché garde sa durée avant le suivant.

## [sprint-5] — 2026-10-27 — commit `0196ba5`

### Ajouté

- Héros 4 à 6 : Cendre (feu/contrôle), Ressac (eau/dégâts), Sève (nature/soutien), débloqués par
  les donjons 2, 4 et 6 ; 6 héros, 24 sorts, 6 passifs, 90 nœuds de talent.
- Simulation des 20 équipes : R1, R2 et « aucun héros indispensable » mesurées et vérifiées en CI.

### Modifié

- Équilibrage : croissance des stats × 0,6, talents positifs × 1,5, Marée et Sève plus
  offensives, modificateurs des donjons 2 et 3 adoucis. R1 86 %, R2 60 %, écart 0 point.

## [sprint-4] — 2026-10-26 — commit `2deb366`

### Ajouté

- Contenu : 3 boss de plus (12 types d'ennemis) et 4 donjons (Citadelle de cendre, Flèche
  engloutie, Couronne verdoyante, Carrefour brisé, ce dernier mixte) : 7 donjons au total.
- Mode test : bac à sable non sauvegardé, niveaux et améliorations libres, respec gratuit, tous
  les donjons ouverts, aucune récompense.
- Planificateur de build partagé par lien (`#build=…`), aussi depuis un onglet déjà ouvert.
- Premiers pas au camp, aide en combat, relance du donjon après une défaite.
- Simulation : politique « débutant » et lignes `dungeon_<id>_novice`.

### Modifié

- Premier donjon transformé en tutoriel ; croissance des ennemis provisoire (0,9/0,7/0,7).
- Réglages de niveau et d'amélioration en menus déroulants.

## [sprint-3] — 2026-10-26 — commit `96e3d62`

### Ajouté

- Profil du joueur (schéma Zod) et règles de progression pures : XP et niveaux, talents (points,
  pages, prérequis, choix exclusifs), respec (premier gratuit, puis or × niveau), 2 emplacements
  d'objets, 3 niveaux d'amélioration, équipe, énergie à coût nul, récompenses, butin à graine avec
  rare garanti, déblocage de héros.
- Contenu : 12 objets, 3 boss, 3 donjons (Landes de braise, Salles englouties, Dédale de ronces).
- Interface : camp (équipe, donjons, objets), fiche de héros (stats, sorts, passif, objets, pages
  de talents), donjon en 3 combats, récompenses, sauvegarde locale versionnée.
- Simulation : taux de réussite des donjons au niveau conseillé et 3 niveaux sous.

## [sprint-2] — 2026-10-26 — commit `be068e4`

### Ajouté

- Écran de combat jouable à la souris et au clavier : file d'initiative en ligne de temps, cartes
  d'unité (PV, bouclier, altérations, modifications, intention ennemie), réserve, ciblage, journal,
  résultat ; mobile compris.
- Textes français de tout le contenu, descriptions des sorts et passifs générées depuis les données.
- Tests : combat complet joué au clic, rejeu du journal égal à l'état du moteur, textes complets.

### Modifié

- Ennemis renforcés (premier réglage) ; R2 relu : héros avec 3 niveaux de retard sur le donjon.

## [sprint-1] — 2026-10-26 — commit `8a10c29`

### Ajouté

- Moteur : les 8 briques (bouclier, tempo, modification de stat, marque, brûlure,
  étourdissement avec immunité, déclencheurs), durées par tour du porteur, déclencheurs sans
  chaîne (passifs, objets, modificateurs de donjon), intention des ennemis (`enemyIntent`).
- Compilation héros + niveau + talents + objets → unité, validation des builds, ennemis par
  niveau, modificateurs de donjon.
- Contenu : 3 héros prototypes (Pyra feu/dégâts, Marée eau/soutien, Ronce nature/contrôle), chacun
  avec 4 sorts, un passif et 3 pages de 5 talents ; 6 types d'ennemis.
- Simulation : 1 000 combats aléatoires reproductibles, politique d'anticipation, rejeu vérifié.

## [sprint-0] — 2026-10-26 — commit `cf89710`

### Ajouté

- Monorepo pnpm (Node 24, TypeScript strict), ESLint, Prettier, CI GitHub Actions sur Linux et
  Windows : lint, format, types, tests, régression de simulation, build, budget de taille.
- `@outlaw/data` : schémas Zod des héros, sorts, passifs, talents, objets, ennemis, donjons et de
  `balance.json` ; contrôles croisés du contenu.
- `@outlaw/engine` : combat déterministe et pur — stats par niveau, file d'initiative en temps
  entier, réserve de points par camp, dégâts avec triangle des éléments, soins, points d'équipe,
  ennemis scriptés, limite de 100 actions, rejeu à partir des actions.
- `@outlaw/web` : coquille React en français, en-têtes de sécurité pour Cloudflare.
- `@outlaw/sim` : scénarios synthétiques, CSV, test de régression contre `baseline.csv`.
- Configuration Cloudflare Workers (assets statiques, repli SPA) et `docs/DEPLOY.md`.
