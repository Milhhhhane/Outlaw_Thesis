# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Une entrée par sprint.

## [Non publié] — 2026-10-28 — boss de la semaine

### Ajouté

- Boss de la semaine, ouvert depuis la tour (bouton « Boss de la semaine » de sa barre) : un boss
  existant seul, aux PV × 15, en rotation feu → eau → nature chaque lundi 00:00 UTC (tyran du
  bûcher, hydre des marées, colosse du bosquet). Le combat s'arrête à 50 actions ; ce sont les
  dégâts infligés qui comptent (`damageDealt`, lu dans le journal du combat).
- 4 difficultés (niveaux 10, 18, 25, 30) ouvertes par le meilleur donjon terminé (labyrinthe de
  ronces, flèche engloutie, couronne verdoyante, trône creux), 3 tentatives par jour UTC (prises à
  l'entrée), meilleur score de la semaine par difficulté.
- 4 paliers de dégâts par difficulté, payés tout de suite et une fois par semaine : poussière
  (3/4/5/6, palier du niveau du boss), 1 fragment, coffre de bronze puis d'argent.
- Écran du boss (script du boss, difficultés, tentatives, meilleur score, paliers) et bilan du
  combat (dégâts, nouveau record, paliers atteints, récompenses).
- Simulation : `pnpm --filter @outlaw/sim boss` (dégâts par difficulté, expert et joueur moyen) ;
  règles `targets.boss` et effet économique (≤ 10 %) vérifiés en CI (`tools/sim/test/boss.test.ts`).
- Moteur : `BattleRules.actionLimit` (limite d'actions propre à un combat). Profil : `boss`
  (absent des anciennes sauvegardes).

## [Non publié] — 2026-10-28 — quêtes et succès

### Ajouté

- Écran « Quêtes » au camp (onglets Quotidiennes, Hebdomadaires, Succès ; bouton Réclamer ; temps
  avant la réinitialisation) et badge sur l'entrée quand une récompense attend.
- 5 quêtes du jour (minuit UTC) et 5 de la semaine (lundi 00:00 UTC) tirées dans
  `content/quests.json` : donjons gagnés, palier II ou III, niveaux payés, objets améliorés,
  coffres ouverts, étoiles, invocations. Bonus du jour : un coffre de bronze.
- 20 succès permanents (premières victoires, maîtrise, palier III, objets, héros, étoiles,
  niveaux), récompense unique avec coffre de bronze, d'argent ou d'or.
- Récompenses relatives au donjon le plus avancé terminé (`balance.quests`) ; effet sur les
  jalons mesuré par `pnpm --filter @outlaw/sim economy` (au plus 13,7 %, borné à 15 % en CI).
- Profil : compteurs à vie (`stats`) et état des quêtes (`quests`), absents des anciennes
  sauvegardes (valeurs par défaut, succès déjà mérités aussitôt réclamables).

## [Non publié] — 2026-10-28 — tour à étages

### Ajouté

- **La Tour** (entrée au camp) : 50 étages, un combat chacun, générés par formule
  (`balance.tower`) et composés par règle (`content/tower.json`) : rotation feu → eau → nature,
  groupes de 2 puis 3 puis 4 ennemis existants, niveau 1 → 30, PV et ATK en % sur une courbe qui
  ne baisse jamais, un boss existant tous les 10 étages avec le modificateur d'un donjon ; au-delà
  du niveau 30, la difficulté suit l'équipement visé (2 objets bruts à l'étage 31, au maximum au 46).
- Progression : plus haut étage battu dans le profil (`tower.cleared`, 0 pour une ancienne
  sauvegarde) ; on tente l'étage suivant ou on rejoue un étage battu. Première victoire : poussière
  du palier de l'étage, 1 fragment tiré comme dans un coffre de bronze, coffre aux étages de boss
  (bronze, argent, argent, or, or). Rejouer ne rapporte rien.
- Écran « Tour » : colonne des 50 étages qui défile dans son cadre, fiche de l'étage (ennemis
  annoncés, modificateur, équipement visé, récompense), bouton Combattre ; bilan d'étage avec
  « Étage suivant ». Option « Auto : monter à l'étage suivant » : en mode Auto, le décompte
  enchaîne sur l'étage suivant.
- Simulation : `tower_<étage>_expert` dans `pnpm sim` (32 équipes par étage) et règles en CI
  (`targets.tower`) ; `pnpm --filter @outlaw/sim tower` détaille la tour étage par étage.

### Modifié

- Camp : entrées un peu plus compactes pour loger la septième (Tour).

## [Non publié] — 2026-10-28 — confort de farm (MaJ 1/7)

### Ajouté

- Séries : sur l'écran d'équipe, 1, 3, 5, 10 ou ∞ passages joués d'affilée en Auto, « passage k
  sur N » en combat, arrêt sur défaite, manque d'énergie ou action du joueur.
- Bilan de série : passages gagnés et perdus, or, poussière par palier, coffres, objets (nouveaux,
  copies, dissous), niveaux prêts, maîtrise et paliers.
- Trois équipes enregistrées (nommées), chargées en un clic ; refus clair si un héros manque.
- Tri (rareté, niveau, élément, rôle, nom) et filtres (élément, rôle, rareté, possédés) de la
  galerie et du vivier, retenus sur l'appareil.
- Badges « à faire » au camp : niveaux payables, talents, étoiles, objets améliorables, coffres.

### Modifié

- À 1 passage, Auto ne relance plus le donjon après les récompenses : choisir ∞ pour farmer sans fin.

## [Non publié] — 2026-10-28 — barre d'XP de la fiche

### Corrigé

- Fiche d'un héros : avec plus d'XP en banque que le niveau suivant n'en demande, la barre d'XP
  débordait de son cadre. Elle s'arrête à 100 %, et la fiche dit quelle poussière manque quand
  l'XP suffit mais pas la poussière.

## [Non publié] — 2026-10-28 — coffres revus

### Modifié

- Héros ciblé : son poids dans le coffre est multiplié (× 12) au lieu de recevoir 50 % des
  fragments ; sa chance suit sa rareté (un légendaire ciblé : 0 % en bronze, 6 % en argent,
  26 % en or ; un commun : 30 à 50 %).
- Coffres distincts : poids de rareté propres (bronze sans légendaire, or riche en épiques et
  légendaires) et 4 / 7 / 14 fragments ; barre de raretés et nombre en réserve sur l'écran.
- Chance de coffre à chaque passage selon la difficulté du palier (or 0 % au premier donjon,
  15 % au palier III du dernier) ; premier passage d'un palier : coffre garanti. Chances
  affichées sur la carte, par palier.
- Jalons du joueur modèle conservés (équipe au niveau 30 : 110 → 114 passages ; voir
  `docs/ECONOMY.md`).

### Supprimé

- `chest` des donjons, `chestStepPerTier`, `focusRate`, `replayChestRate`, `tierWeights`.

## [Non publié] — 2026-10-28 — PvP : duel en ligne, à quatre héros, accessible depuis le camp

### Ajouté

- Duel en ligne entre amis (salon privé par code ou lien `#salon=CODE`), arbitré par un Durable
  Object : règles de l'hôte (niveau maximum, objets, budget de paliers, temps par action), combat
  en direct avec chrono serveur, émotes, revanche, reprise après coupure (`docs/PVP.md`).
- Entrée **PvP** au camp. En invité, l'écran explique que le duel exige un compte (gratuit, sans
  e-mail) et ouvre la connexion ou l'inscription sur place.
- `pnpm sim:pvp` : mesure de l'équilibrage du duel (priorité, durée, héros), sans rien appliquer.

### Modifié

- Le PvP suit la taille d'équipe du jeu : `teamSize` (4) héros par camp, sans nombre écrit dans le
  code ; le budget de paliers va de `teamSize` à `teamSize` × 4 (4 à 16) et le salon refuse un
  budget hors de ces bornes.
- Le bouton Auto n'apparaît pas en duel : chaque joueur joue lui-même.
- `pnpm sim:pvp` mesure un échantillon de compositions (`--teams`, 24 par défaut) : 25 héros font
  12 650 équipes de quatre.

## [Non publié] — 2026-10-28 — des héros qui ne se ressemblent plus

### Modifié

- Les 19 héros récents ne partagent plus les huit mêmes silhouettes : 18 d'entre eux portent une
  coiffe ou un accessoire dessiné à la main sur leur personnage du pack (sombrero de Yucca,
  cornes de Forge, crête en vague de Torrent, bois feuillus de Séquoia, bannière d'Étendard,
  capuche et lanterne de Lanterne, voile de Brume, couronne de fleurs d'Éden, capuche de houx de
  Houx, cornes de bélier de Soufre, cadran doré de Sablier, tricorne de Sillage, ailes de flammes
  de Phénix, bachi d'Écume, chapeau-champignon de Mousse, crête de flammes de Tison, suroît de
  Mousson, fleur de chardon de Chardon). Genêt et les six héros d'origine ne changent pas.
- Palettes franches pour Forge (fer sombre, heaume rougi), Séquoia (écorce), Houx, Tison,
  Chardon et Éden ; armes mieux réparties (machette, épée large, épée, épée à gemme, couperet).
- Légendaires et épiques les plus marquants : ailes, cadran, bannière, bois, vague, cornes.

### Technique

- `tools/art/looks.py` : surcouches pixel par pixel qui suivent la tête sur chaque image (repos,
  dégâts), sprite élargi symétriquement si besoin ; `export.py` refuse deux héros de même
  silhouette. La prise d'arme (`HeroSprite.tsx`) se compte depuis le milieu du sprite.

## [Non publié] — 2026-10-28 — arbre des talents lisible

### Corrigé

- Onglet Talents : la liste des effets d'un talent sélectionné recouvrait son titre, le compteur
  de points et ses prérequis ; le « ou » des choix exclusifs était caché sous les nœuds. Même
  défaut corrigé sur les listes d'effets de l'onglet Objets et de l'Atelier.
- Test e2e `talents.spec.ts` : 25 héros, chaque nœud des 3 pages, aucun texte qui en chevauche un
  autre, coupé ou caché.

## [Non publié] — 2026-10-28 — 19 héros de plus, rareté

### Ajouté

- 19 héros (25 au total) sur le modèle des six premiers : élément, rôle, 4 sorts, un passif,
  3 pages de 8 talents avec thèses et choix exclusifs. Tous les couples élément × rôle existent
  (feu, eau, nature × dégâts, soutien, contrôle) : Tison, Écume, Yucca, Houx (communs) ; Forge,
  Lanterne, Mousson, Brume, Sillage, Chardon, Mousse, Genêt (rares) ; Étendard, Soufre, Torrent,
  Séquoia, Éden (épiques) ; Phénix et Sablier (légendaires). Ils s'obtiennent par invocation.
- Rareté des héros (`tier`, I à IV : commun, rare, épique, légendaire) : pastille et liseré de
  couleur dans la galerie, sur la fiche, dans l'équipe et sur l'écran des coffres. Les six héros
  d'origine sont communs.
- Coffres pondérés par rareté (`chests.tierWeights` : 12 / 6 / 3 / 1) et coût d'invocation par
  rareté (`chests.summonCosts` : 10 / 20 / 40 / 80 fragments). Tirage toujours déterministe.
- Sprites des nouveaux héros : bases du pack 0x72 recolorées, armes distinctes.
- `pnpm --filter @outlaw/sim heroes` : force de chaque héros (donjons finis en retard, durée des
  boss, combats trop courts), en lecture seule.

### Modifié

- La galerie des héros passe à quatre colonnes et défile dans son cadre ; le vivier de l'équipe
  et la liste des fragments défilaient déjà.
- Simulation : les règles portent sur 50 équipes tirées (graine fixe, au plus deux héros du même
  rôle), R1 sur les 12 premières ; le rythme tire aussi des équipes jouables.
- Cibles de rythme : plancher du tout premier combat 7 actions (9), boss 21 à 32 (21 à 30),
  tolérance de la courbe 15 points (12) ; voir `docs/BALANCE.md`.
- Nœuds « Torrent » (Marée) et « Sillage » (Ressac) renommés « Flux » et « Remorque » : ce sont
  désormais des noms de héros.

## [Non publié] — 2026-10-28 — animations de combat

### Ajouté

- Attaque de base au corps à corps : le sprite court jusqu'à sa cible, frappe au contact (arme et
  arc de frappe à l'arrivée) et revient ; plus de projectile pour ce coup. Héros et ennemis.
- Un impact par élément : flammes qui montent puis braises et fumée (feu), gerbe, gouttes et
  ronds au sol (eau), épines puis feuilles qui tourbillonnent (nature) ; le choc sur la cible et
  les étincelles prennent la couleur et la physique de l'élément.
- Ultimes : bandes noires, décor assombri, zoom sur le lanceur qui s'éclaire, puis flash blanc
  et grosse secousse au premier effet (dégâts, soin, bouclier…).
- Soins et boucliers : lueur sur le corps, colonne de lumière verte au soin, bulle bleue autour
  de l'unité tant qu'elle a du bouclier, qui éclate quand un coup l'use entièrement.
- Altérations affichées tant qu'elles durent : flammes aux pieds (brûlure), viseur sur le corps
  (marque), étoiles cerclées de noir autour du crâne (étourdissement).
- Mort : après la chute, le corps se dissout en cendres de son élément ; la place reste vide.

### Modifié

- Les animations de combat suivent la vitesse (×1, ×2). Les effets d'une unité (impact,
  étincelles, chiffres) passent au-dessus des sprites. Mouvement réduit : rien ne bouge ni ne clignote ; la bulle de bouclier et les altérations restent affichées, immobiles.

## [Non publié] — 2026-10-28 — paliers de donjon et économie

### Ajouté

- Paliers de donjon (I, II, III) : terminer un palier ouvre le suivant du même donjon. Chaque
  palier monte le niveau des ennemis (+5) et leurs PV et ATK (+20 %), et le butin : or et
  poussière +25 %, rare plus fréquent, coffre d'un cran. Choix du palier sur la carte, titre de la
  salle et récompenses avec le palier, badge du palier atteint sur la carte. Les sauvegardes
  gardent tout : un donjon déjà terminé a son palier II ouvert.
- Simulation : lignes `tier_*` et règles « chaque palier reste gagnable par l'expert, jamais plus
  facile que le précédent » (`pnpm sim:check`) ; `pnpm --filter @outlaw/sim economy` : joueur
  modèle et jalons de l'économie (`docs/ECONOMY.md`), bornés en CI.

### Modifié

- Améliorer un objet coûte selon le palier de poussière de son donjon : 4 copies, 440 or et
  16 poussières brutes pour un objet des premiers donjons ; 8 copies, 22 000 or et 160 poussières
  pures pour un objet de fin de jeu (avant : 6 copies, 1 200 or, 25 poussières partout).
- Poussière brute des deux premiers donjons doublée (4 → 8). Premier objet au maximum en 8
  passages gagnants (avant : 29) ; collection complète en 244.

## [Non publié] — 2026-10-28 — enchaînement automatique

### Ajouté

- Mode Auto : une salle gagnée ouvre la suivante après un décompte de 5 secondes (chiffre qui
  descend, bouton « Continuer maintenant », annonce aux lecteurs d'écran), et l'écran de
  récompenses relance le même donjon avec la même équipe de la même façon. Tout clic ou toute
  touche interrompt le décompte sans décocher Auto ; une défaite arrête l'enchaînement ; pas de
  relance si le moteur refuse l'entrée (énergie).

### Supprimé

- La vitesse « Instantanée » des combats : il reste ×1 et ×2. Un réglage enregistré en
  « instantané » retombe sur ×2.

## [Non publié] — 2026-10-27 — grind : niveaux payants, rythme recalibré

### Modifié

- L'XP se met en banque ; chaque niveau se paie en XP et en poussière du palier (brute jusqu'au
  niveau 7, fine de 8 à 21, pure dès 22, quantité croissante). Boutons « Niveau suivant » et
  « Monter au maximum » sur la fiche, badge « Niveau prêt » dans la galerie et sur la carte de
  récompense. Les sauvegardes gardent leurs niveaux.
- XP et poussière des donjons recalibrées pour le farm automatique : 6 à 16 passages gagnants
  entre deux donjons, 7 à 8 par donjon final, 89 au total (avant : 4 à 5, puis moins d'un).
- `pnpm --filter @outlaw/sim farm` : calculateur de rythme ; bornes vérifiées en CI.

## [Non publié] — 2026-10-27 — grind : butin unique, copies, maîtrise

### Ajouté

- Chaque donjon a son butin exclusif : un objet commun et un rare qu'on ne trouve nulle part
  ailleurs (8 objets ajoutés, 20 au total). L'atelier devient une collection : objets trouvés ou
  à trouver, avec le donjon où les farmer.
- Copies : un objet déjà possédé donne une copie ; l'améliorer coûte des copies (1, 2, 3), de
  l'or et de la poussière du palier du donjon d'origine. Les copies en trop se dissolvent en
  poussière ; un objet au maximum dissout directement.
- Maîtrise de donjon (rangs à 5, 15, 40 et 100 victoires) : plus de chances de rare et de
  poussière ; rare garanti au premier passage et au plus tard au 10ᵉ passage sans rare.
- Bouton « Rejouer » sur l'écran de récompenses.
- Poussière affichée en trois paliers : brute, fine, pure.

### Modifié

- Les sauvegardes existantes restent valides : les exemplaires en double d'un même objet sont
  fusionnés en copies au chargement (le plus amélioré est gardé, un objet porté n'est jamais retiré).
- Coût d'amélioration d'un objet : copies + or + poussière (avant : or + matériaux).

## [lot-14] — 2026-10-27 — texte lisible et lexique

### Ajouté

- Lexique survolable : dans les descriptions de sorts, talents, objets, passifs et modificateurs
  de donjon, chaque terme de règle (Avance, Retarde, Délai, Coût, Brûlure, Marque, Étourdi,
  Bouclier, ATK, DEF, VIT, PV, durées, éléments) explique ce qu'il fait au survol, au clavier
  (Tab) et au toucher. Textes dans `glossary.*`, motifs dans `game/Glossed.tsx`.

### Modifié

- Texte courant en Atkinson Hyperlegible (OFL) : descriptions, aides, journal, cartes ; la
  police pixel reste pour les titres, les boutons et les chiffres. +42 Ko de polices.
- Barre d'initiative : à huit unités, portrait et délai seulement, le nom au survol et pour
  l'unité qui joue.

### Supprimé

- Le bouton « Passer l'animation » du combat ; Espace garde le raccourci.
- Le test de bout en bout des récompenses joue en Auto (le clic naïf perdait parfois à quatre).

## [lot-13] — 2026-10-27 — équipes de quatre

### Modifié

- Quatre héros par équipe (`balance.progression.teamSize`), quatre ennemis au plus par combat ;
  Cendre fait partie de l'équipe de départ. Scène en deux rangs en quinconce, quatre
  emplacements sur l'écran d'équipe, lien de partage à quatre builds.
- Donjons rééquilibrés pour quatre : salles de 3–4 ennemis, PV et ATK reconvergés par les outils ;
  courbe 100 / 75 / 71 / 65 / 63 / 54 / 58 / 42 / 38 / 31 %. `pacing.floor` 10 → 8.

### Corrigé

- `autotune` et `tunecurve` mesuraient sans les valeurs par défaut des schémas (modificateurs de
  donjon ignorés) ; `autotune` effaçait `atkPct` quand les PV retombaient à 100 % ; `tunecurve`
  ne durcit plus le premier donjon au-dessus de sa cible.

## [Non publié] — 2026-10-27 — combat automatique

### Ajouté

- Bouton « Auto » (touche A) dans le combat : le jeu joue les tours des héros avec une règle
  simple (sort le plus cher utile, cible la plus faible). Retenu d'un combat à l'autre, suspendu
  par la pause, à la vitesse choisie ; ne passe pas seul à l'écran suivant.
- `pnpm --filter @outlaw/sim auto` : taux de réussite d'Auto face à l'expert et au joueur moyen
  (`docs/BALANCE.md`).

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

## [lot-12] — 2026-10-27 — carte pilotée par les données, butin revu

### Ajouté

- Butin : rare garanti au premier passage d'un donjon ; au-delà de trois exemplaires d'un objet,
  le doublon est démonté en matériaux (annoncé sur l'écran de récompenses).
- Carte : chapitres (une image par chapitre, onglets si plusieurs), chemin complet en pointillés,
  étape suivante animée ; noms affichés pour l'étape en cours, la sélection et au survol.
- `docs/CONTENT.md` : liste de contrôle « Ajouter un donjon » en six points.

### Modifié

- Un donjon porte sa place sur la carte (`map` : `x`, `y`, `landmark`, `chapter`) et son butin
  comme simple liste d'objets ; les poids viennent de `balance.json` (`economy.loot.weights`,
  commun 75 / rare 25). L'image de la carte ne contient plus ni repères ni chemin.
- Repères de carte dans l'atlas (`landmark_<nom>`), peints par l'écran et non plus par l'image ;
  `tools/art/map_nodes.json` supprimé.
- `scene` facultatif par donjon pour emprunter un décor de combat.
- Le panneau du donjon affiche toute la table de butin, rares en doré.

## [lot-11] — 2026-10-27 — début plus facile, courbe de difficulté, trois donjons

### Ajouté

- Trois donjons de fin de progression : Salines blêmes (28), Col d'obsidienne (29), Trône creux
  (30), avec modificateurs, décors, repères sur la carte et butin.
- Levier `atkPct` par combat de donjon ; règle de courbe de difficulté vérifiée par
  `pnpm sim:check` ; outils `curve` et `tunecurve`.

### Modifié

- Début plus facile : joueur moyen 90 % au premier donjon (25 % avant), puis 75, 65, 54, 40 %…
  Détails et table dans `docs/BALANCE.md`.

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
