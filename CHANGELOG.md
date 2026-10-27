# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Une entrée par sprint.

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
