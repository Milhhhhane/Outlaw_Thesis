# Décisions

Chaque décision non tranchée par le prompt ou le rapport : contexte, choix, raison.

## Outillage et hébergement

**Hébergement** — Contexte : site statique, Git, Cloudflare. Choix : Workers avec assets statiques
et Workers Builds (`wrangler.jsonc`, repli SPA). Raison : option recommandée par la doc Cloudflare
pour les nouveaux projets (oct. 2026), Pages ne reçoit plus les nouveautés.

**Node 24** — Contexte : Node 26 n'est pas encore LTS, Node 24 est LTS de maintenance. Choix :
`.node-version` = 24. Raison : version LTS, image de build Cloudflare par défaut en 24.

**TypeScript 6.0 et ESLint 9** — Contexte : typescript-eslint exige TS < 6.1, jsx-a11y ne gère
pas ESLint 10. Choix : TS 6.0.3, ESLint 9.39.5. Raison : chaîne complète compatible.

**pnpm 12 et scripts de build** — Contexte : pnpm 12 bloque les scripts d'installation. Choix :
`allowBuilds` limité à esbuild et workerd. Raison : nécessaires à Vite et Wrangler, rien d'autre.

**Polices** — Contexte : aucun appel réseau à l'exécution. Choix : polices système. Raison :
Google Fonts serait un appel réseau.

**Tags de sprint** — Contexte : la session peut pousser `main` mais pas créer de tag (refusé
par `git push`, par l'API `git/refs` et par l'API des releases : 3 approches). Choix : tags créés en
local, commit de chaque tag noté dans `CHANGELOG.md`. Raison : le propriétaire peut les publier en
une fois (Releases → nouveau tag sur le commit indiqué).

**Licence** — Contexte : dépôt sans licence, choix juridique du propriétaire. Choix : aucune
licence ajoutée. Raison : décision qui ne m'appartient pas ; signalée au propriétaire.

## Moteur

**Temps entier** — Contexte : délai × 100 ÷ VIT donne des fractions. Choix : centièmes d'unité,
arrondis à l'entier. Raison : aucune dérive de flottants, rejeu exact sur toute plateforme.

**Égalités** — Contexte : deux unités au même instant. Choix : héros avant ennemis, puis
emplacement croissant. Raison : ordre total, lisible, sans hasard.

**Premier tour** — Contexte : le rapport ne fixe pas l'ordre initial. Choix : chaque unité joue
d'abord à `initialDelay` × 100 ÷ VIT. Raison : la VIT décide aussi du premier tour.

**Réserves par camp** — Contexte : les duels miroirs de R1 opposent deux équipes pilotées.
Choix : une réserve par camp ; les unités scriptées ne dépensent ni ne gagnent. Raison : le script
ennemi reste fixe et affiché, et le même moteur sert aux duels miroirs.

**Limite d'actions** — Contexte : « 100 actions = défaite ». Choix : vainqueur `enemy`, raison
`action_limit` ; anéantissement simultané = pas de vainqueur, compté comme défaite. Raison : fidèle
au rapport, distinguable dans le journal.

**Dégâts** — Contexte : formule non chiffrée dans le rapport. Choix : ATK × puissance × K ÷ (K +
DEF) × élément, K = 100, minimum 1. Raison : la DEF ne rend jamais invulnérable, réglable dans
`balance.json`.

**Croissance** — Contexte : niveau max 30. Choix : croissance linéaire de PV, ATK, DEF ; VIT
fixe. Raison : la VIT est un levier d'options (plafonnée), pas une stat à monter par le farm.

**File projetée** — Contexte : les actions futures ne sont pas connues. Choix : projection avec
l'attaque de base de chaque unité. Raison : prévision honnête, exacte si personne ne change de
tempo.

**Durées** — Contexte : « durée en tours de la cible ». Choix : un effet s'use à la fin de chaque
tour de son porteur, sauf le tour où il a été posé. Raison : un buff de 2 tours couvre 2 actions,
qu'on se le donne ou qu'un allié le donne.

**Cumul** — Contexte : le rapport ne dit pas comment les effets se cumulent. Choix : une seule
altération de chaque sorte (on garde la plus longue durée et la plus forte puissance) ; boucliers
additifs plafonnés à 60 % des PV max ; modifications de stat additives entre origines, bornées
(−50 % / +100 %), une même origine remplace. Raison : pas de cumul multiplicatif (risque du rapport).

**Brûlure** — Contexte : « dégâts par tour ». Choix : dégâts fixés à la pose (ATK du lanceur ×
puissance × atténuation par la DEF), sans élément ni marque, au début du tour de la cible.
Raison : prévisible et lisible ; le lanceur peut tomber sans changer la brûlure.

**Étourdissement** — Contexte : risque d'enchaînement d'étourdissements. Choix : le tour est sauté
(l'action annoncée est conservée), puis immunité jusqu'à la fin du prochain tour joué. Raison :
le contrôle reste fort sans bloquer une unité tout le combat.

**Tempo** — Contexte : avancer une unité. Choix : en unités de temps, jamais avant l'instant
présent ; sur soi, il s'applique après le délai du sort. Raison : « avancer mon prochain tour »
garde un sens simple.

**Déclencheurs** — Contexte : « un passif n'en déclenche pas un autre ». Choix : les déclencheurs
réagissent après la résolution du sort, dans l'ordre des unités ; les effets d'un déclencheur
n'émettent aucun événement de déclenchement. Leurs calculs utilisent les stats du porteur.
Raison : aucune chaîne possible, ordre déterministe.

**Sujet « ally »** — Contexte : « les ennemis marqués subissent plus de dégâts de tous les
alliés ». Choix : « ally » inclut le porteur. Raison : le passif de Ronce vaut aussi pour ses coups.

**Passif de Marée** — Contexte : « sa première compétence coûte 1 point de moins » n'est pas une
des 8 briques. Choix : la première compétence du combat rembourse 1 point (déclencheur, limite 1
par combat). Raison : même effet avec les briques existantes ; seule nuance, il faut pouvoir payer
le coût plein au moment du lancer.

**Objets** — Contexte : « chaque amélioration augmente les valeurs ». Choix : facteur 1 + 15 % par
niveau sur les pourcentages, seuils et briques ajoutées ; la petite stat totale reste plafonnée à
8 %. Raison : l'amélioration compte sans casser le plafond.

**Identifiants d'unité** — Contexte : le même héros peut être dans les deux camps (duels miroirs).
Choix : `h0..h2` pour les héros, `e0..e2` pour l'autre camp ; `kind` porte l'identifiant de contenu.
Raison : unique, court, stable dans le journal.

**Journal minimal** — Contexte : bruit pour l'interface. Choix : pas d'événement pour un soin nul
ou une réserve inchangée. Raison : l'interface rejoue chaque événement, chacun doit compter.

## Interface

**Rejeu du journal** — Contexte : « l'interface rejoue le journal et ne calcule rien ». Choix :
la vue est mise à jour par les valeurs finales portées par chaque événement, puis recalée sur
l'état. Raison : animation fidèle sans dupliquer une seule règle.

**File d'initiative** — Contexte : rendre le tempo lisible. Choix : ligne de temps à l'échelle
(marqueurs numérotés à leur instant réel) et liste ordonnée des noms dessous. Raison : les écarts
se voient, et les noms ne se chevauchent jamais.

**Combat d'essai** — Contexte : critère du sprint 2. Choix : héros niveau 1 sans talent contre
Acolyte, Brute et Sorcière niveau 1 (bouclier, coup lourd, étourdissement). Raison : le joueur qui
anticipe gagne, le glouton perd.

**Clavier** — Contexte : accessibilité. Choix : touches 1 à 4 pour les sorts, Échap pour annuler la
cible, Espace pour passer l'animation ; cibles et sorts sont de vrais boutons. Raison : tout se
joue aussi sans souris.

## Progression

**Défaite en donjon** — Contexte : le rapport ne dit rien. Choix : retour au camp sans récompense
ni pénalité. Raison : on peut toujours rejouer un donjon terminé pour progresser (farm), et
l'échec invite à changer de build plutôt qu'à punir.

**Ouverture des donjons** — Contexte : 7 donjons en progression. Choix : un donjon s'ouvre quand
le précédent est terminé (tout est ouvert en mode test). Raison : une route lisible.

**Récompenses** — Contexte : farm et héros au repos. Choix : premier passage complet, rejeu ×
`replayRewardRate` (1 pour l'instant) ; XP à 50 % pour les héros débloqués hors équipe ; un objet
par donjon. Raison : le rapport ; réglable sans code.

**Héros débloqué** — Contexte : un héros 4 à 6 rejoint au milieu de la progression. Choix : il
arrive au niveau recommandé du donjon qui le débloque. Raison : utilisable tout de suite.

**Objets** — Contexte : un objet possédé, plusieurs héros. Choix : un exemplaire ne sert qu'à un
héros à la fois (l'équiper ailleurs le retire) ; deux exemplaires du même objet sur un héros sont
refusés. Raison : simple et sans combinaison dégénérée.

**Butin reproductible** — Contexte : le butin est le seul hasard. Choix : générateur à graine
stockée dans le profil, avancée à chaque tirage. Raison : même profil, même tirage ; testable.

**Sauvegarde** — Contexte : localStorage peut être corrompu, plein ou bloqué. Choix : enveloppe
`{ version, profile }`, migrations version par version, validation Zod et contrôle du contenu ;
sauvegarde illisible copiée sous `outlaw-thesis/save.bak` puis nouvelle partie, avec un message.
Raison : ne jamais bloquer le joueur, ne jamais effacer sans copie.

## Mode test et partage

**Mode test** — Contexte : « tout débloqué, rien dépensé ni gagné ». Choix : un profil à part,
jamais sauvegardé (tous les héros au niveau 30 réglable, 3 exemplaires de chaque objet améliorés
au maximum, respec gratuit, donjons tous ouverts, aucune récompense). Raison : on théorise sans
toucher à la vraie partie.

**Lien de build** — Contexte : planificateur partagé par URL, sans serveur. Choix : équipe
(héros, niveau, talents, objets et améliorations) en JSON compact encodé en base64url dans
`#build=…`, validé au chargement ; un lien abîmé ouvre le mode test par défaut avec un message.
Raison : le fragment ne part jamais au serveur ; format versionné (`v`).

**Premier donjon** — Contexte : un débutant (ultime ou attaque de base) perdait dès le 2e combat.
Choix : 1 ennemi, puis 2, puis le boss seul, modificateur adouci, 100 XP. Raison : le premier
donjon apprend ; le deuxième demande déjà d'utiliser les compétences.

**Joueur débutant en simulation** — Contexte : vérifier l'accessibilité. Choix : politique
`novice` et lignes `dungeon_<id>_novice`. Raison : suivre en régression que le premier donjon
reste faisable sans maîtrise.

**Croissance des ennemis provisoire** — Contexte : à 1,6/1,3, les donjons 4 à 7 étaient presque
infranchissables au niveau conseillé. Choix : 0,9/0,7/0,7 en attendant le sprint 5. Raison :
garder la progression jouable pour les tests.

**Défaite** — Contexte : « une défaite relance le donjon ». Choix : l'écran d'échec propose de
relancer le donjon ou de rentrer au camp. Raison : fidèle au rapport, sans forcer.

## Graphismes

**Pixel art fait main, ombré par script** — Contexte : le propriétaire veut un jeu « super
beau », en pixel art de qualité, ambiance western mystique au crépuscule. Choix : chaque sprite
est une pile de formes posées à la main (`tools/art/`), un petit moteur Python choisit les teintes
(rampes de 4 à 5 couleurs, lumière en haut à gauche, ombres portées, contours sélectifs, matières
lumineuses) ; l'atlas et les décors sont des PNG commités, régénérés par
`python3 tools/art/export.py`. Raison : rendu cohérent et retouchable en code, aucun outil ni
licence tierce, résultat déterministe ; la CI n'a pas besoin de Python.

**Champ de bataille natif 320 × 180** — Choix : le combat se joue sur une scène native de
320 × 180 pixels agrandie sans lissage à la largeur de l'écran ; héros à gauche, ennemis en
miroir ; animations en CSS pilotées par le journal (fente, éclair blanc à l'impact, projectile,
chiffres en police pixel). Les cartes d'unité restent sous la scène pour la lecture et le clavier.
Raison : aucune règle dans l'interface, accessible, poids faible (atlas 72 ko hors budget JS).

**Rythme du rejeu** — Constat : l'attente se faisait avant l'événement suivant, si bien qu'un
événement sans durée faisait passer le suivant sans pause. Choix : on attend la durée du dernier
événement affiché. Raison : chaque coup a le temps d'être vu.

## Combats plus courts et plus durs (lot 7)

**Durées en actions de joueur** — Choix : la simulation compte les actions des héros seuls
(`playerActions`) ; un tour d'équipe ≈ 3. Raison : c'est ce que le joueur ressent.

**Joueur moyen** — Choix : une décision sur quatre au hasard parmi les autres actions, les
autres moitié glouton (sans lire les menaces), moitié anticipation d'un coup. Raison : avec la
seule anticipation, expert et moyen restaient à moins de 15 points d'écart ; avec le seul
glouton, à plus de 50. Détails et chiffres dans BALANCE.md.

**Échelle des monstres et PV par combat** — Choix : `enemyScale` (PV, ATK) dans balance.json et
`hpPct` optionnel par combat dans dungeons.json, appliqués à la compilation des ennemis ; aucune
règle de combat changée. Raison : deux nombres globaux que le propriétaire retouche seul, plus un
réglage fin par combat, sans toucher aux héros. Après un changement : `pnpm sim --update`.

**Plafonds des donjons relevés (60 et 72 au lieu de 40 et 66)** — Constat : avec un plancher de
12 actions tenu par l'équipe la plus rapide, la moyenne d'un combat ne descend pas sous ~18 ; le
donjon 1 ne peut pas faire moins de 9 + 12 + 21 = 42. Choix : plafonds relevés dans balance.json,
à arbitrer par le propriétaire.

**« Aucun héros indispensable » non bloquant** — Constat : avec la nouvelle mesure, écart de
17 points (Ressac). La cause est dans les héros, hors du périmètre du lot. Choix : la mesure reste
affichée par `pnpm sim:check` mais ne fait plus échouer la CI ; à traiter côté héros.

## Habillage plein écran (sprint 6)

**Écran logique 960 × 540** — Choix : tout est dessiné à 960 × 540 puis mis à l'échelle de la
fenêtre (bandes noires si le ratio diffère). Raison : 3 × la scène pixel de 320 × 180, textes
encore lisibles à 0,72 sur un téléphone de 844 × 390, cibles tactiles de 44 px logiques.

**Plein écran sur iPhone** — Constat vérifié à la source (MDN : API Fullscreen « Only available on
iPad, not on iPhone ») : le bouton n'apparaît que si l'API existe ; sur iPhone, le jeu propose
l'installation sur l'écran d'accueil (affichage sans barre d'adresse). Pas de service worker :
le jeu ne promet pas de mode hors ligne. Détails dans DEPLOY.md.

**Pas d'audio** — Choix : aucun son ni musique dans ce lot. Raison : la consigne le rend
optionnel « seulement si la qualité reste au niveau » ; aucun fichier dont la licence est sûre
n'a été retenu. L'option « Son » l'annonce.

**Échap empilé** — Choix : chaque écran ou fenêtre déclare son retour ; seul le plus au premier
plan réagit (fenêtre, puis ciblage, puis pause, puis écran précédent).

**Tests de bout en bout** — `@playwright/test` épinglé sur la version du navigateur installé ;
lancés sur Linux en CI et dans `pnpm verify`. Une boucle complète par variante (souris à 1280,
clavier à 1920, les deux à 844) pour garder la CI courte.

## Planification

**Héros 4 à 6 et donjons 2, 4, 6** — Contexte : le déblocage arrive au sprint 4, ces héros au
sprint 5. Choix : le mécanisme de déblocage est codé et testé au sprint 4 ; les champs
`unlocksHero` sont remplis au sprint 5. Raison : le schéma refuse une référence vers un héros
absent.

**Politique de simulation** — Contexte : il faut jouer des milliers de combats sans humain.
Choix : anticipation d'un coup (chaque action jouée par le moteur pur, état évalué). Raison :
générique, sans indice dans le contenu ; on pourra l'approfondir pour R1.

**R1 jugée au duel** — Contexte : « meilleur build » non défini ; classés en donjon, les
builds ne prédisaient pas les duels (R1 instable autour de 70 %). Choix : meilleur et pire build
classés au duel contre un groupe de référence distinct, puis opposés. Raison : R1 parle de duels ;
pas de biais de sélection, résultat stable (83–86 %).

**R2 par composition** — Contexte : le jeu est déterministe, un build donné gagne ou perd. Choix :
pour chaque donjon, part des 20 équipes dont le meilleur build termine avec 3 niveaux de retard.
Raison : mesure un taux, sur toutes les compositions.

**Réglage du sprint 5** — Contexte : R2 à 35 %. Choix : croissance × 0,6, talents positifs
× 1,5, soutiens plus offensifs, modificateurs des donjons 2 et 3 adoucis ; aucune règle du moteur
touchée. Raison : leviers prévus par le rapport (croissance) et contenu ; détails dans BALANCE.md.

**R1 et R2 (définition initiale, remplacée)** — Contexte : « meilleur build », « pire build » non définis. Choix : R1 = duels
miroirs à niveau égal entre le build le mieux et le moins bien classé par la simulation ; R2 =
meilleur build avec 3 niveaux de retard sur le niveau recommandé du donjon (« donjon de niveau
recommandé +3 »), victoire = les 3 combats gagnés. Raison : si R2 échoue, le rapport baisse la
croissance des stats, ce qui n'aide que des héros en retard de niveau ; mesurable et déterministe.

## Lot 8B — comptes et sauvegarde en ligne

Points techniques vérifiés le 27/10/2026 dans la documentation Cloudflare et, quand elle se tait,
dans le runtime local (`workerd` 1.20261019, livré avec Wrangler 4.152).

**Serveur et base de données** — Contexte : le brief du MVP interdisait Worker applicatif et D1 ;
le lot 8B lève explicitement cette interdiction. Choix : un Worker TypeScript dans le même
déploiement que le site, base D1. Raison : demandé par le lot ; KV, R2 et Durable Objects restent
inutilisés.

**Routage** — Contexte : garder le repli SPA. Choix : `assets.run_worker_first: ["/api/*"]` avec
`not_found_handling: "single-page-application"`. Raison : forme documentée (Wrangler ≥ 4.20) ; le
Worker ne voit que l'API, les pages et fichiers restent servis sans lui (et sans coût).

**Provisionnement et migrations** — Contexte : éviter une interruption du propriétaire. Choix :
liaison D1 sans `database_id` (provisionnement automatique au `wrangler deploy`, bêta ouverte
depuis Wrangler 4.45) ; migrations versionnées appliquées par le Worker lui-même (table
`_schema`, instructions idempotentes). Raison : aucune commande manuelle au déploiement ; repli
documenté dans `DEPLOY.md` (une seule commande `wrangler d1 create`) si la bêta échoue.

**Hachage des mots de passe** — Contexte : « l'algorithme le plus fort disponible ». Faits :
`argon2` n'est pas pris en charge par `node:crypto` dans Workers (documentation) ; `scrypt` l'est
(`node:crypto` est actif par défaut depuis la date de compatibilité 2026-08-04) ; PBKDF2 existe
en WebCrypto mais le binaire `workerd` contient un plafond d'itérations (« iteration counts above
… are not supported ») que la documentation ne chiffre pas ; le plan gratuit accorde 10 ms de
processeur par requête (30 s par défaut en payant). Mesures locales : PBKDF2-SHA256 100 000
itérations 18 ms, scrypt N=2^14 r=8 p=1 50 ms, N=2^15 95 ms. Choix : scrypt N=2^14, r=8, p=1,
sel aléatoire de 16 octets, comparaison `timingSafeEqual`, paramètres stockés avec le hash
(`scrypt$N$r$p$sel$hash`), re-hachage automatique à la connexion si les paramètres stockés sont
plus faibles. Raison : scrypt résiste aux cartes graphiques grâce à sa mémoire (16 Mio), ce que
PBKDF2 ne fait pas ; WASM argon2id ajouterait une dépendance pour un coût processeur au moins
égal. Limite assumée : c'est **5 fois sous le minimum de l'OWASP** (N=2^17, ou N=2^14 avec p=5),
faute de budget processeur sur le plan gratuit. Sur le plan payant, passer `CURRENT.p` à 5 dans
`packages/accounts/src/hash.ts` : les comptes se re-hachent seuls à leur connexion suivante.

**Sessions** — Choix : jeton aléatoire de 256 bits, seule son empreinte SHA-256 est en base ;
cookie `__Host-session` HttpOnly, Secure, SameSite=Lax, Path=/ ; expiration glissante de 30 jours
(repoussée au plus une fois par jour) ; déconnexion = suppression de la ligne ; changement de mot
de passe = révocation des autres sessions. Contrôle de l'en-tête `Origin` sur toute requête autre
que GET. Raison : le cookie HttpOnly n'est pas lisible par un script injecté, rien n'est mis dans
le stockage local.

**Limitation de débit dans D1** — Contexte : la liaison « Rate Limiting » de Workers est
approximative, locale à chaque point de présence, avec des fenêtres de 10 ou 60 s seulement
(documentation). Choix : compteurs dans D1, délai qui double après 5 échecs par pseudo (10 par
adresse IP), plafond de créations par adresse. Raison : un délai croissant sur des minutes et un
compte par pseudo valable partout ; le trafic attendu reste faible pour D1.

**Adresses IP** — Choix : jamais en clair ; empreinte SHA-256 avec un sel aléatoire tiré chaque
jour (stocké dans `meta`, remplacé le lendemain), compteurs effacés après 24 h ; pas de journaux
persistants (`observability.enabled: false`). Raison : le lot demande des journaux minimaux sans
IP en clair ; le sel du jour empêche de retrouver une adresse par force brute une fois oublié.

**Turnstile : pas maintenant** — Faits : gratuit (20 widgets par compte, documentation « Plans »),
mais il faut un script et une connexion vers `challenges.cloudflare.com` à chaque inscription,
une clé secrète côté Worker et une validation serveur obligatoire. Choix : non activé ; limites
par adresse IP et par pseudo à la place. Raison : le jeu n'appelle aucun tiers (CSP « self »
seulement) et la page de confidentialité le dit ; ajouter Turnstile demanderait un secret et une
action du propriétaire pour un risque encore théorique. À activer si des inscriptions de robots
apparaissent (CSP : `script-src` et `frame-src` vers `challenges.cloudflare.com`).

**Mots de passe courants** — Contexte : « refus des 1000 plus courants ». Choix : les 1000 plus
fréquents parmi ceux de 10 caractères et plus (SecLists, licence MIT), vérifiés côté serveur
seulement. Raison : la liste brute des 1000 plus courants n'en contient que 12 de 10 caractères
ou plus, les autres sont déjà refusés par la longueur ; la liste n'alourdit pas le jeu.

**Synchronisation** — Choix : sauvegarde locale d'abord ; chaque changement de profil part après
2 s de calme (chaque changement correspond déjà à un événement important : donjon, étoile,
talent, objet, équipe) ; écriture conditionnelle sur la révision (`baseRev`, 409 sinon) ; écran de
choix en cas de conflit ; à la connexion, une partie invitée n'est proposée à la migration que si
elle a avancé (sinon chaque appareil demanderait de « migrer » un profil neuf). Déconnexion :
la partie locale est effacée de l'appareil (elle est sur le cloud), pour qu'un appareil partagé ne
mélange pas deux joueurs.

**Pas de validation des résultats** — Le serveur valide la forme de la sauvegarde, pas les gains :
falsifiable, acceptable sans achat ; à remplacer par un rejeu serveur des combats avant toute
vente (`docs/ACCOUNTS.md`).

**Textes des comptes à part** — `apps/web/src/i18n/account.fr.json`, fusionné au dictionnaire :
un autre chantier (nouveaux héros) modifie `fr.json` en parallèle.

## PVP : salon personnalisé (lot 11, sprint A1)

Détails du protocole, de la machine à états et des mesures : `docs/PVP.md`.

**Deux camps pilotés** — Contexte : le moteur ne connaît que des héros pilotés et des ennemis
scriptés. Choix : les deux camps en `controller: 'policy'`, le joueur 1 (l'hôte) est `player`, le
joueur 2 `enemy`, unités `p1_<héros>` / `p2_<héros>`. Raison : aucune nouvelle notion dans le
moteur ; ordre et identifiants déterministes.

**Règles de combat optionnelles** — Contexte : le PvE donne la priorité aux héros et fait perdre
les héros à la limite d'actions. Choix : `BattleSetup.rules` et `BattleState.rules` facultatifs
(`firstSide`, `limit`), `DEFAULT_RULES` quand ils manquent ; le PvE n'est pas touché
(`pnpm sim:check` identique à la baseline). Raison : un seul moteur pour les deux modes.

**Priorité = départage et ordre des unités** — Contexte : le brief demande un départage à égalité
d'instant. Choix : `firstSide` règle aussi le tri des unités de l'état. Raison : les déclencheurs se
résolvent dans l'ordre des unités ; sans ce tri, un combat miroir n'est pas symétrique (vérifié : le
retirer fait échouer 3 tests miroirs). Extension assumée du brief.

**Limite d'actions au ratio de PV** — Contexte : en PvP, « le camp ennemi gagne » n'a pas de sens.
Choix : `limit: 'hp_ratio'`, le plus grand ratio de PV restants sur PV maximaux du camp gagne,
comparé par produits en croix ; égalité exacte = nul. Raison : entiers seulement, aucun arrondi,
aucune égalité arbitraire.

**Action par défaut** — Choix : `defaultAction(state)` joue l'attaque de base de l'unité active sur
le vivant aux PV les plus bas (premier emplacement à égalité). Raison : toujours légale (l'attaque de
base d'une unité pilotée est gratuite), sert au chrono dépassé.

**Empreinte d'état** — Contexte : détecter qu'un client a divergé du serveur. Choix : cyrb53 (53 bits,
14 caractères hexadécimaux) de la forme canonique des champs dynamiques, en JSON de tableaux
imbriqués. Raison : sans dépendance, identique partout (entiers), assez fine pour un détecteur de
désynchronisation ; elle ne protège pas contre la triche. Un séparateur textuel avait été essayé
puis abandonné (une source d'altération contenant `;` rendait la forme ambiguë).

**Serveur arbitre par rejeu** — Choix : le salon ne stocke que la configuration et la liste des
actions ; l'état se reconstruit par `replay`. Le serveur ne lit jamais l'unité ni l'identité dans un
message client. Raison : une seule source de vérité, un salon sérialisable et petit (environ 26 Ko),
environ 1,3 ms par action (mesuré).

**Version, contenu, taille** — Choix : `hello` porte la version du protocole et l'empreinte du
contenu (équilibrage, héros, objets) ; messages limités à 4096 octets, schémas stricts. Raison :
refuser un client dont le jeu diffère avant le combat plutôt que de diverger en plein combat.

**Chrono, forfait, grâce** — Choix : chronos 20 / 30 / 45 / 60 s (30 par défaut) ; au dépassement,
action par défaut annoncée `auto: 'timeout'` ; deux dépassements consécutifs = forfait ; déconnexion
en plein combat = 60 s de grâce, le chrono continue, la plus ancienne échéance s'applique. Raison :
un joueur absent ne bloque pas l'autre, une coupure courte ne coûte pas la partie.
`claim_timeout` n'a aucun pouvoir propre (le serveur règle le temps à chaque événement).

**Revanche** — Choix : une partie = un combat ; la revanche est un nouveau combat, mêmes équipes,
priorité échangée, acceptée par les deux joueurs. Raison : équité de la priorité sur deux combats,
aucun état à reconstruire entre deux équipes.

**Émotes** — Choix : six émotes prédéfinies (0 à 5), une toutes les 1,5 s, aucun texte libre.
Raison : pas de modération à écrire pour un mode entre amis.

**Paliers de héros** — Choix : `tier` entier de 1 à 4 dans `heroSchema` (défaut 1, JSON de contenu
non modifié, donc les six héros sont de palier I) ; budget de salon : aucun, ou un entier de 3 à 12.
Raison : prépare l'équilibrage par palier sans toucher au contenu en cours de modification.

**Talents libres dans le salon** — Contexte : le niveau d'un héros est ramené au plafond du salon.
Choix : les talents du profil ne comptent pas, le client envoie l'allocation voulue, validée contre
les points et les pages du niveau plafonné. Raison : le talent d'un joueur de niveau 30 n'a pas de
sens à un niveau 10. Quand le plafond du salon est inférieur au niveau du joueur, le serveur ne
tronque rien (`talents_over_budget`) : l'interface retire elle-même les derniers talents choisis
(`trimTalents`, voir « Serveur et interface PvP » plus bas).

**Propriété des héros non prouvée** — Contexte : les sauvegardes sont écrites par le client. Choix :
`validateTeam` vérifie l'équipe contre le profil fourni par le serveur, sans prouver que ce profil a
été gagné. Raison : acceptable entre amis ; à refaire (rejeu serveur, profil de salon fourni par le
serveur) avant tout classement.

**`@outlaw/net` pur** — Choix : un paquet sans Cloudflare ni DOM (un test balaie les sources), le
réducteur reçoit l'heure, le tirage au sort et les profils dans son contexte. Raison : testable sans
réseau, le Durable Object n'aura qu'à expédier les messages, stocker et programmer l'alarme.

**Mesure d'équilibrage PvP** — Choix : `pnpm sim:pvp`, miroirs et combats croisés à graines fixes,
politique « joueur moyen », sans objet, niveau 30 ; rapport seulement, propositions non appliquées,
`baseline.csv` inchangé. Raison : le brief interdit de toucher au contenu ; mesurer sans corriger.
Constat à la livraison : priorité dans la cible (51,5 à 52,3 %), durée hors cible si elle se compte
en actions du moteur (77 ; 39 par joueur), `cendre` au-dessus et `pyra` / `maree` en dessous de la
bande indicative.

## PVP : serveur et interface (lot 11, sprint A2)

**Un Durable Object par salon, dans le Worker existant** — Contexte : il faut un arbitre qui garde
l'état entre deux messages et un chrono sans client. Choix : classe `PvpRoom` (SQLite, migration
`v1-pvp`) dans le Worker des comptes, un objet par code de salon ; `RoomService` porte la logique avec
horloge, tirage, stockage et sockets injectés. Raison : même déploiement, aucun service de plus ;
logique testable sans Cloudflare ; le réducteur pur de `packages/net` fait tout le travail de règles.

**Identité posée par le Worker, jamais par le client** — Choix : le Worker lit la session, réécrit
toujours les en-têtes internes (compte, pseudo) et retire le cookie avant d'appeler le salon ; il
compare `Origin` au site (les WebSocket échappent aux règles CORS) avant de réveiller quoi que ce
soit. Raison : un client ne peut ni usurper un compte ni détourner la session d'un autre site ;
refuser tôt évite de réveiller un salon pour rien.

**Enregistrer avant d'envoyer** — Choix : le salon écrit son état dans le stockage, puis expédie les
messages. Raison : après une éviction du Durable Object, aucun client n'a vu un état que le stockage
ne retrouve pas.

**WebSocket Hibernation et une alarme unique** — Choix : `acceptWebSocket` avec le joueur en étiquette,
`ping` / `pong` automatique, une seule alarme réglée sur la plus proche échéance (chrono, grâce,
inactivité de 30 min). Raison : un salon qui attend ne coûte rien ; le chrono vit côté serveur.

**Une connexion par joueur, débit borné** — Choix : une nouvelle connexion remplace l'ancienne (code 4000) ; au-delà de 60 messages en 5 s la connexion est fermée (4008) ; création limitée à 20 salons par
heure et 30 connexions par minute et par compte. Raison : un onglet oublié ne bloque pas le joueur ;
un client fou ne monopolise pas le salon. La limite de 30 messages envisagée d'abord a été relevée
après qu'un test de fumée l'a dépassée en rejouant un combat entier.

**Profil lu dans la sauvegarde en ligne** — Choix : à chaque `set_team`, le salon lit `saves` (D1) du
compte ; avant de créer un salon, le client pousse son profil local si le compte n'a pas encore de
sauvegarde. Raison : le serveur valide contre ce qu'il connaît, pas contre ce que dit le client ; sans
cette poussée, un compte neuf aurait répondu `no_profile`. Limite inchangée : propriété non prouvée.

**Client en lecture seule du combat** — Choix : le client n'applique une action que lorsque le
serveur l'annonce (`applied`), vérifie l'empreinte avec un état local rejoué, demande `resync`
(deux fois au plus) en cas d'écart. Raison : le serveur reste la seule source de vérité, un clic n'a
jamais d'effet local avant confirmation, une désynchronisation se rattrape sans recharger.

**Réutiliser l'écran de combat solo** — Choix : `CombatView` accepte une configuration `pvp`
(chrono, pseudos, émotes, attente), `useBattle` gagne `apply` / `restore` ; le combat solo n'est pas
modifié. Raison : une seule interface de combat à entretenir. Conséquence assumée : le camp n'est pas
inversé pour le joueur 2.

**Reprise par code, pas par écran** — Choix : la coupure de réseau est rattrapée par une reconnexion
avec attente croissante (jusqu'à 75 s) ; un rechargement de page ramène au hub et la reprise se fait en
ressaisissant le code ; le lien `#salon=CODE` est consommé une fois. Raison : pas de route persistée à
sécuriser pour une première version entre amis ; le serveur retient la place pendant la grâce.

**Pas de traduction des erreurs de connexion** — Choix : salon inconnu, plein ou serveur muet donnent le
même message (« Impossible de rejoindre ce salon »). Raison : un WebSocket refusé n'expose pas son
code HTTP au navigateur ; distinguer demanderait un appel de plus.

## PVP : remise à jour après les équipes de quatre et le grind

**La taille d'équipe du PvP est celle du jeu** — Contexte : les salons dataient d'avant le lot 13 et
fixaient trois héros à plusieurs endroits (validation, schémas, salle d'attente, simulation, tests).
Choix : `teamSizeOf(balance)` (`balance.progression.teamSize`, 4) pour l'équipe, `MAX_SIDE` de
`@outlaw/data` pour les bornes des schémas ; aucun nombre de héros dans le code du PvP. Raison :
même règle que le lot 13, changer la taille d'équipe redevient un nombre dans `balance.json`.

**Budget de paliers borné par la taille d'équipe** — Choix : la forme des règles ne change pas
(`tierBudget` : entier ou null) ; le schéma borne largement (1 à `MAX_SIDE` × 4) et le salon refuse
(`bad_schema`) un budget hors de `teamSize` à `teamSize` × 4 (4 à 16). Le champ `tier` des héros garde
exactement sa forme. Raison : un budget sous `teamSize` refuserait toute équipe ; les bornes suivent
la donnée sans figer 3 ni 4 dans un schéma.

**Pas de combat automatique en duel** — Contexte : le bouton Auto (solo) est un réglage de l'appareil,
retenu d'un combat à l'autre. Choix : en duel, ni bouton ni touche A ; le réglage est ignoré. Raison :
un duel entre amis se joue à la main ; le chrono du serveur joue déjà l'action par défaut d'un joueur
absent, et deux dépassements valent forfait.

**Entrée « PvP » au camp, compte exigé et expliqué** — Contexte : le propriétaire ne trouvait pas le
mode. Choix : l'entrée du camp s'appelle « PvP » (l'écran garde le titre « Duel en ligne ») ; en invité,
l'écran dit que le duel exige un compte et pourquoi (le salon lit la sauvegarde en ligne), puis ouvre
la connexion ou l'inscription sur place (l'ancien bouton ouvrait les options, sans formulaire de
connexion). Pas d'entrée sur l'écran-titre : `docs/PVP.md` place le mode au camp. Raison : le joueur
voit le mode, comprend ce qui manque et le règle sans quitter l'écran.

**`sim:pvp` mesure un échantillon de compositions** — Contexte : 25 héros font 12 650 équipes de
quatre, soit des centaines de milliers de combats pour mesurer toutes les paires. Choix : `--teams`
(24 par défaut) compositions tirées par `sampleTeams` (graine fixe, chaque héros dans à peu près
autant d'équipes), comme les règles de la simulation PvE. Raison : un rapport en moins d'une minute,
reproductible ; le taux par héros devient indicatif (350 à 760 combats chacun).

## Lot 9 — amélioration graphique

**Habillage par CSS et tuiles plutôt que par écrans peints** — Contexte : les menus étaient des
panneaux plats. Choix : un fond de nuit discret partagé, des cadres bois en 9 tranches, une
planche d'en-tête et un cuir tramé, tous générés par `tools/art/ui.py` et appliqués en CSS
(`border-image`, `background`). Raison : un seul jeu de tuiles habille tous les écrans et les
fenêtres, pour quelques kilo-octets ; des écrans peints un par un auraient coûté bien plus en
poids et en temps.

**Jus de combat sans nouvelles poses** — Contexte : dessiner des poses d'attaque et de dégâts pour
six héros et douze ennemis aurait doublé l'atlas. Choix : fente avec anticipation et
étirement, recul avec rotation, étincelles, arcs de frappe, secousses et flashs, le tout en CSS à
partir des sprites existants ; seuls trois petits effets sont ajoutés (arc, gros impact,
poussière). Raison : le ressenti vient surtout du timing, du recul et des effets d'écran ; la vue
marque les coups lourds (≥ 30 % des PV ou mortels) et les ultimes, l'interface ne calcule rien.

**Carte du monde par biomes bruités** — Contexte : les anciennes régions étaient des taches aux
bords nets. Choix : chaque pixel reçoit la contrée la plus proche selon une distance elliptique
bruitée, puis une texture par contrée et des repères dessinés aux positions des donjons
(`map_nodes.json` inchangé). Raison : contours organiques et lisibles, positions des boutons
conservées, tests de bout en bout intacts.

**Personnages : pack d'artiste plutôt que génération** — Contexte : les héros et monstres générés
par polygones restaient « des formes empilées », sans visage ni volume ; la méthode plafonne.
Choix : les personnages du « 16x16 DungeonTileset II » de 0x72, licence CC0 vérifiée sur la page
itch.io, copiés dans `tools/art/third_party/0x72/` avec leur note de licence, recolorés par
rotation de teinte (peau préservée) pour coller aux éléments, agrandis ×2 sans lissage, monstres
retournés ; quatre images de repos et l'image de dégâts du pack. Raison : le brief autorise les
assets libres crédités ; un rendu professionnel sûr contre un chantier de dessin pixel par pixel
coûteux et incertain. Limite assumée : les personnages sont au double des pixels du décor
(mélange de densités courant dans le genre) et le thème glisse du western vers le donjon
fantastique ; le titre et les textes de jeu restent inchangés.

## Lot 10 — talents

**Trois spécialisations ouvertes dès le départ** — Contexte : les pages 2 et 3 s'ouvraient aux
niveaux 10 et 20, le joueur n'avait pas de choix avant longtemps. Choix : `pageUnlockLevels`
à [1, 1, 1] ; le mécanisme reste (le schéma accepte des niveaux non décroissants) pour pouvoir
le réactiver. Raison : demande du propriétaire ; le choix de spécialisation devient le premier
acte du jeu.

**8 nœuds par page, 14 points** — Contexte : 5 nœuds et 10 points laissaient peu de choix. Choix :
pages de 5 à 9 nœuds (schéma), trois nœuds ajoutés par page par `tools/content/enrich_talents.py`
(core → quatre branches → deux approfondissements → un sommet), 14 points. Raison : un build
prend 14 nœuds sur 24, deux sommets au plus ; les nouveaux nœuds sont des compromis pour limiter
l'inflation de puissance. La règle « moins de points que de nœuds » est vérifiée par héros.

**Disposition des arbres par profondeur** — Choix : rangées calculées depuis les prérequis
(profondeur 0 à 3), nœuds centrés, 32 px. Raison : la mise en page précédente supposait
exactement cinq nœuds.

## Lot 11 — difficulté

**Deux leviers par combat : PV et ATK** — Contexte : `hpPct` règle la durée ; baisser les PV
pour faciliter raccourcit les combats sous le plancher. Choix : `atkPct` (dégâts des ennemis)
comme levier de difficulté, `hpPct` réservé au rythme. Raison : la difficulté ressentie, c'est
ce qu'on encaisse, pas combien de tours on tape.

**Courbe vérifiée, pas seulement une moyenne** — Contexte : la moyenne « joueur moyen 40–60 % »
était tenue alors que le premier donjon était le plus dur. Choix : règle de courbe par donjon
(premier ≥ 70 %, jamais plus de 12 points plus facile que le précédent, jamais sous 30 %) et
48 équipes par mesure en CI. Raison : une courbe se juge donjon par donjon ; à 16 équipes le
bruit dépassait la tolérance.

**Nouveaux donjons après le dernier** — Choix : trois donjons aux niveaux 28–30 en bout de
chaîne, ennemis existants, décors dérivés des existants par rotation de teinte. Raison : pas de
nouveau contenu moteur ni de nouveaux sprites, la progression actuelle reste intacte pour les
sauvegardes.

## Lot 12 — carte et butin

**La carte est une donnée, pas une image** — Contexte : ajouter un donjon demandait de modifier
`map_nodes.json`, de repeindre l'image de la carte et de reprendre l'écran. Choix : chaque donjon
porte `map` (`x`, `y`, `landmark`, `chapter`) ; l'image ne contient que le terrain ; l'écran
dessine repères, chemin et pions depuis `dungeons.json`, dans l'ordre du fichier. Raison : un
donjon de plus = une entrée JSON ; le chargeur refuse deux repères à moins de 24 px.

**Chapitres plutôt qu'une carte infinie** — Choix : `chapter` par donjon et une image par
chapitre, onglets seulement s'il y en a plusieurs. Raison : la carte native fait 320 × 180 ;
au-delà d'une douzaine de donjons les noms se chevauchent, un chapitre repart sur une carte vide.

**Butin : une liste, des poids par rareté** — Contexte : chaque donjon portait ses poids, à
réinventer à chaque ajout, et les tables restaient à deux ou trois objets. Choix : `loot` est une
liste d'identifiants ; `economy.loot.weights` donne un poids par rareté pour tout le jeu. Raison :
une seule décision d'équilibrage (commun 75 / rare 25) au lieu d'une par donjon ; une table se
lit en un coup d'œil.

**Premier passage rare, doublons démontés** — Choix : `firstClearRare` (le premier passage
récompense toujours d'un rare du donjon) et `duplicateLimit` + `salvage` (au-delà de trois
exemplaires, le doublon devient des matériaux). Raison : la première victoire doit marquer ; sans
limite, l'inventaire se remplit d'objets identiques que personne n'équipe. Le tirage reste
déterministe (graine du profil) : même profil, même butin.

## Coffres, fragments et étoiles

**Un coffre ne donne que des fragments de héros** — Contexte : le joueur voulait un système de
coffres sans achat où tout passe par les héros. Choix : trois paliers (bronze 3, argent 5, or 8
fragments), chaque fragment tombe sur un héros ; 10 fragments invoquent un héros, un héros déjà
possédé qui reçoit des fragments les garde pour ses étoiles. Raison : une seule monnaie de héros,
lisible, et aucune récompense qui contourne les donjons. Tout est dans `balance.json`
(`chests`) : paliers, coûts, taux.

**Plafond de niveau par étoile** — Contexte : « tous les 10 niveaux, il faut dépenser des
fragments pour l'étoile suivante ». Choix : plafond = (étoiles + 1) × `levelsPerStar` (10), niveau
maximum du jeu inchangé (30 pour l'instant, 100 prévu). Au plafond, l'XP gagnée est gardée jusqu'à
un niveau de réserve au plus ; l'étoile n'est payable qu'au plafond (dépenser avant n'avancerait à
rien). Coûts : 10 puis 20 fragments. Raison : un seuil net que le joueur voit venir, sans XP
perdue ni dépense inutile.

**Anciennes sauvegardes sans migration** — Contexte : le serveur valide les sauvegardes avec le
même schéma ; changer `PROFILE_VERSION` aurait cassé les clients déjà ouverts. Choix : champs
ajoutés avec valeur par défaut (`stars`, `fragments`, `chests`, `focus`), version 1 conservée ;
les étoiles sont `max(étoiles enregistrées, ceil(niveau / 10) − 1)` : un héros déjà niveau 25
garde ses niveaux, avec deux étoiles offertes. Raison : aucune partie perdue ni bloquée.

**Coffre garanti à la première victoire, une fois sur deux ensuite** — Contexte : le butin est le
seul hasard du jeu et doit rester reproductible. Choix : la première victoire d'un donjon donne
toujours le coffre du donjon ; un rejeu le donne avec `replayChestRate` (0,5), tiré avec la graine
du profil après le butin (le butin de première victoire ne change donc pas). Raison : farmer reste
utile sans fixer le rythme à zéro ou à « toujours ».

**Héros ciblé — ajout de l'assistant, à confirmer par le propriétaire** — Contexte : avec 6 héros
(30 prévus), des fragments purement aléatoires rendent un héros précis très long à monter : environ
60 fragments reçus pour 10 sur un héros donné. Choix : un héros ciblé reçoit `focusRate` (50 %) des
fragments de chaque coffre, le reste est tiré au hasard parmi tous les héros ; aucun héros ciblé =
pur hasard. Raison : garder la surprise du tirage sans punir le joueur qui veut finir son héros.
Réglable ou supprimable (`focusRate: 0`) sans code.

**Les donjons débloquent toujours leurs héros** — Contexte : le brief décrit l'invocation par
fragments, le jeu avait déjà des héros offerts par donjon. Choix : conservés ; l'invocation par
fragments est une seconde voie, pas la seule. À revoir quand les 30 héros arriveront (le champ
`tier` des héros, absent de cette branche, pourra pondérer les tirages par rareté).

**Tirage identique pour le même profil** — Choix : deux nombres tirés par fragment, toujours (visée
du héros ciblé, puis héros au hasard), pour que cibler ou non ne change pas la suite de la graine.
Pas de « pitié » (garantie après n coffres) pour l'instant : à ajouter si le test humain montre
des séries trop longues.

## Combat automatique

**Règle simple, pas une anticipation** — Contexte : le joueur veut un bouton qui fait le combat à
sa place (rejeu, farm). Choix : `autoAction` (`packages/engine/src/auto.ts`) applique une règle
lisible : le sort le plus cher que la réserve permet, l'attaque de base sinon ; un soin seulement
si un allié est à 70 % de PV ou moins, un bouclier seulement si une cible n'en a pas, une
amélioration seulement si elle n'est pas déjà active ; cible : l'ennemi aux PV les plus bas, ou
l'allié le plus blessé. Pure et déterministe (même état, même action). Raison : une anticipation
d'un coup (comme l'expert de la simulation) réduirait à néant l'intérêt de jouer à la main ; la
règle reste volontairement en dessous (mesures dans `docs/BALANCE.md`).

**Le mode est un réglage de l'appareil, retenu d'un combat à l'autre** — Choix : `auto` dans les
options (`outlaw-thesis/options`, faux par défaut), bouton « Auto » dans l'en-tête du combat à côté
de la vitesse, touche A. Il reste actif sur les trois salles d'un donjon mais ne passe pas seul à
l'écran suivant : le joueur lit le résultat et clique. La pause (Échap) suspend Auto ; la vitesse
(×1, ×2, instantané) s'applique aussi aux décisions d'Auto (400 ms à vitesse normale). Pendant Auto
les sorts sont verrouillés et les touches 1 à 4 sans effet : pour reprendre la main, rappuyer sur
Auto.

**Aucune hypothèse sur la taille des équipes** — Choix : `autoAction` ne lit que les actions
légales et les unités vivantes ; un test l'exécute avec quatre héros contre trois ennemis. Les
équipes de 4 héros demandées pour la suite restent à faire côté moteur et interface (liste dans
`docs/ARCHITECTURE.md`, « Passer à quatre héros »).

## Lot 13 — équipes de quatre

**La taille d'équipe est une donnée d'équilibrage** — Choix : `balance.progression.teamSize`
(4) lu par le moteur, la simulation et l'écran d'équipe ; `MAX_SIDE` (4) borne les emplacements
de la scène et des rencontres. Raison : passer de trois à quatre a touché une constante en dur à
sept endroits ; la prochaine fois, c'est un nombre dans `balance.json`.

**Plus d'ennemis, pas des ennemis deux fois plus forts** — Contexte : à quatre, le réglage
automatique compensait d'abord en doublant l'ATK des ennemis (178 % au deuxième donjon), et une
équipe de niveau 30 pouvait perdre contre des ennemis de niveau 4 en jouant mal. Choix : des
salles de 3–4 ennemis, puis reconvergence. Raison : la difficulté par le nombre reste lisible et
la croissance plate des stats (+72 % PV, +54 % ATK sur 29 niveaux) ne doit pas être annulée par
des multiplicateurs.

**Le premier donjon ne se durcit jamais** — Choix : `tunecurve` laisse le premier donjon au-dessus
de sa cible (85 %) ; quatre attaques de base doivent suffire. Raison : la prise en main ne se
règle pas par un taux de réussite moyen.

## Lot 14 — lisibilité

**Deux polices, deux rôles** — Contexte : tout était en Pixelify Sans, illisible à 12–13 px une
fois mis à l'échelle. Choix : Atkinson Hyperlegible (OFL, dessinée pour la lisibilité) pour le
texte courant, la police pixel gardée pour les titres, boutons et chiffres. Raison : l'identité
pixel tient aux gros éléments ; une description se lit, elle ne se regarde pas. Écarté : les
polices système (métriques différentes selon l'appareil, donc mises en page non reproductibles
en test).

**Un lexique au survol plutôt que des descriptions plus longues** — Choix : les descriptions
restent générées et courtes ; les mots de règle deviennent des termes (boutons en ligne) dont
l'explication s'affiche dans une bulle unique posée dans l'écran logique. Raison : une phrase
complète par effet ne tiendrait pas dans les cartes ; le joueur qui connaît le terme n'est pas
ralenti, celui qui ne le connaît pas a la règle exacte (formules de `docs/BALANCE.md`), sans
« title » natif (lent, absent au toucher).

## Butin exclusif, copies et maîtrise

**Chaque donjon a son butin, et rien que le sien** — Contexte : le joueur veut du grind et que
chaque donjon ait son loot unique ; avec des listes partagées, farmer un objet n'avait pas de lieu.
Choix : un objet vient d'un seul donjon, et un donjon donne exactement un commun et un rare.
`packages/data/src/content.ts` le vérifie au chargement et construit `content.itemOrigin`
(objet → donjon) ; un objet sans donjon est refusé. 20 objets pour 10 donjons : 8 objets ajoutés
(`items.json`) pour que chaque donjon ait la paire. Raison : « où farmer ceci ? » a une seule
réponse, la carte et l'atelier l'affichent.

**Les doublons sont des copies, pas des exemplaires** — Choix : un objet déjà possédé donne une
copie (`copies` + 1 sur l'exemplaire) ; améliorer coûte des copies (1, 2, 3), de l'or et de la
poussière du palier du donjon d'origine. Un objet au niveau maximum dissout la copie en poussière
(`salvage`). `mergeItems` ramène à un exemplaire par objet les sauvegardes qui en avaient
plusieurs (le plus amélioré gagne, les autres deviennent des copies, un objet porté n'est jamais
retiré) ; il est idempotent et appliqué au chargement. Conséquence assumée : en partie normale, un
objet n'est porté que par un héros à la fois ; le mode test garde plusieurs exemplaires séparés
(liens de build).

**Rare garanti par donjon, pas par profil** — Choix : un compteur `dry` par donjon
(`profile.dungeons[id].dry`) ; le passage `rarePity` (10) sans rare en donne un. L'ancien
compteur global `sinceRare` n'est plus lu. Raison : avec un butin par donjon, une garantie globale
ne protège personne du donjon qu'il farme.

**Maîtrise du donjon** — Choix : un rang par palier de victoires (5, 15, 40, 100), chaque rang
ajoute 4 de poids au rare et 10 % de poussière. Raison : récompenser la répétition sans rien
débloquer d'indispensable ; chiffres dans `balance.json` → `economy.loot.mastery`, effets annoncés
sur la carte.

**Rejouer** — Choix : bouton sur l'écran de récompenses, qui relance le même donjon avec la même
équipe. C'est le complément d'Auto : un passage coûte deux clics.

**Rien de la poussière niveau héros dans cette PR** — La monnaie interne reste `materials`
(tuple de trois paliers), affichée « poussière brute / fine / pure ». Le coût en poussière des
niveaux de héros et le recalibrage de l'XP et de l'or sont la PR suivante.

## Monter de niveau se paie

**L'XP se met en banque, le niveau s'achète** — Contexte : avec Auto et Rejouer, l'XP tombait
sans effort et le joueur passait les donjons sans rien décider. Choix : `addXp` n'augmente plus le
niveau ; `levelUp` paie le niveau suivant avec l'XP du niveau **et** de la poussière du palier
(brute jusqu'au niveau 7, fine de 8 à 21, pure dès 22 ; `progression.levelUp`), la quantité
croissant dans le palier (+1 par niveau en fine, +2 en pure). « Monter au maximum » enchaîne.
Raison : un seul compteur partagé (la poussière) relie niveaux et objets, donc un vrai choix de
dépense ; les paliers forcent à farmer le bon chapitre. Les sauvegardes gardent leurs niveaux ;
l'étoile ne monte plus le niveau toute seule, elle débloque seulement la montée.

**Récompenses recalibrées sur un calculateur, pas à l'œil** — Choix : `pnpm --filter @outlaw/sim
farm` calcule, par paire de donjons, les passages gagnants qu'exigent l'XP (par héros) et la
poussière (pour l'équipe de quatre), et le test de la simulation borne chaque pas entre 5 et 18 et
le total entre 70 et 110. Cibles retenues : 6, 8, 10, 12, 14, 16 passages jusqu'au donjon 7, puis
7 à 8 par donjon final (chiffres dans `docs/BALANCE.md`). Raison : les cibles sont dans le dépôt
et vérifiées en CI ; retoucher une récompense sans casser le rythme se voit tout de suite.

## Paliers de donjon et économie

**Une formule, pas des valeurs par donjon** — Contexte : les paliers (I, II, III) montent le
niveau des ennemis et le butin. Choix : tout est dans `balance.tiers` (niveaux par palier,
pourcentage de PV et d'ATK, pourcentage de récompenses, poids de rare, cran de coffre) ; rien
dans `dungeons.json`. Raison : dix donjons × trois paliers à la main divergeraient ; un nombre
global se règle et se mesure en une fois.

**Les niveaux seuls ne durcissent pas : un pourcentage par palier** — Constat : la croissance
des monstres est plate (+54 % de PV sur 29 niveaux) et le moteur borne leur niveau à 30 ; mesuré,
+5 niveaux par palier laissait les paliers II et III des derniers donjons identiques au I, et
ceux du début plus faciles (les héros gagnent plus par niveau). Choix : `enemyPctPerTier`
(+20 % de PV et d'ATK par palier) en plus des niveaux. Raison : sans lui, un palier n'est qu'un
multiplicateur de butin.

**Le niveau visé d'un palier inclut l'équipement** — Contexte : la simulation joue sans objet,
et deux objets bruts rendent un palier II à +20 % plus facile qu'un palier I nu. Choix : le
palier I se mesure sans objet (comme le reste de la simulation), le II avec deux objets bruts, le
dernier avec deux objets au maximum (`tierGear`) ; règles : expert ≥ 50 % à chaque palier et
jamais plus de 12 points plus facile que le palier précédent (`targets.tiers`). Raison : les
paliers sont la raison de crafter ; les mesurer nus aurait forcé des multiplicateurs trop doux.
Retenu : +20 %/+20 % (écarté : +25 % : Trône creux III à 44 % ; +15 % : palier II plus facile
que le I sur quatre donjons). Mesures dans `docs/BALANCE.md`.

**`dungeons[id].tier` : le palier atteint, I par défaut** — Choix : le profil garde le plus
haut palier ouvert ; terminer le palier k pour la première fois passe à k + 1, y compris au-delà
du dernier (tous terminés), ce qui permet de savoir exactement quels premiers passages restent.
Une ancienne sauvegarde (champ absent) dont le donjon est terminé compte comme palier I terminé :
le palier II s'ouvre sans migration. Raison : un seul champ, pas de version de sauvegarde.

**XP inchangée par le palier** — Choix : `rewardPctPerTier.xp` à 0 ; or et poussière +25 % par
palier, rare +5 de poids, coffre d'un cran. Raison : le brief demande or, poussière, rares et
coffre ; l'XP qui monte avec le palier ferait farmer le premier donjon au niveau 11 plutôt
qu'avancer. Réglable sans code.

**Le palier le plus haut ouvert est choisi d'office sur la carte** — Raison : c'est celui qu'on
vient d'ouvrir ; le I reste à un clic pour farmer tranquille. Le mode test ouvre tous les paliers.

**Auto relance le même palier** — Choix : la relance automatique de l'écran de récompenses
(`enterDungeon` avec le palier) rejoue le palier qui vient d'être joué, jamais celui qu'il vient
d'ouvrir. Raison : le joueur a choisi ce palier pour farmer ; monter d'un cran est une décision.

**Ports des tests de bout en bout surchargeables** — Contexte : plusieurs copies du dépôt
tournent en parallèle sur la même machine. Choix : `E2E_PORT` et `E2E_API_PORT` (4174 et 8788
par défaut). Raison : rien ne change en CI.

**Le coût d'un objet dépend du palier de poussière de son donjon** — Contexte : les trois paliers
d'amélioration (1/2/3 copies, 100/300/800 or, 5/8/12 poussière) coûtaient la même chose pour un
objet du premier donjon et du dernier ; le premier objet au maximum arrivait au 29ᵉ passage et
l'or ne servait presque pas (4,6 %). Choix : `tierCostPct` (copies, or, poussière, en % par
palier de poussière) multiplie `upgradeCosts` ; un objet du palier 1 coûte 4 copies, du palier 3
8 copies, 22 000 or et 160 pures. Raison : une seule table d'étapes, une seule courbe par palier,
le début rapide et la fin longue se règlent séparément. Chiffres dans `docs/BALANCE.md`.

**Le réglage de l'économie est borné en CI** — Choix : `tools/sim/test/economy.test.ts` borne les
six jalons du joueur modèle et exige que l'or et la poussière pure soient dépensés aux trois
quarts. Raison : comme le test `farm`, une récompense retouchée qui casse le rythme se voit tout
de suite. Le joueur modèle est un ordre de grandeur, pas un joueur : il dépense tout dès qu'il
peut, sans arbitrer.

**Cibles du réglage interprétées** — Contexte : le brief demande « premier objet amélioré en
quelques donjons » et « du vrai grind » sans chiffre. Choix : premier objet au maximum en moins
de 15 passages gagnants (8 mesurés), collection complète entre 200 et 300 (244). Raison : choix de
l'assistant, à confirmer au test humain ; les bornes du test se déplacent avec un chiffre.

## Enchaînement automatique

**Plus de vitesse « instantanée »** — Contexte : trois vitesses (×1, ×2, instantané) pour un
seul bouton en combat, et l'instantané rendait le résultat illisible (le combat se jouait d'un
coup). Choix : ×1 et ×2 seulement, un réglage enregistré « instant » retombe sur ×2. Raison : avec
Auto et l'enchaînement, le rythme vient du mode, pas d'une vitesse qui saute l'affichage. Les
tests de l'interface ne s'appuient plus dessus : ils neutralisent la durée des événements
(`eventDuration`, dans `apps/web/test/setup.ts`) et gardent les autres délais à ×2.

**Le décompte est une navigation, pas une règle** — Contexte : Auto s'arrêtait à chaque écran de
résultat ; farmer coûtait deux clics par salle. Choix : en mode Auto, une victoire affiche un
décompte de 5 secondes (`apps/web/src/game/Countdown.tsx`) puis déclenche le bouton de fin
existant ; l'écran de récompenses fait de même avec son bouton « Rejouer » (`onReplay`). Le moteur
n'est pas touché : `completeDungeon`, `replayRewardRate` et `replayChestRate` gardent leurs règles.
Raison : l'enchaînement n'est qu'un clic différé ; aucune logique de jeu dans React.

**Tout clic ou toute touche rend la main** — Choix : les événements `pointerdown` et `keydown`
sont écoutés en capture sur la fenêtre ; sauf sur « Continuer maintenant », ils arrêtent le
décompte pour de bon (il ne repart pas sur cet écran) et Auto reste coché. Raison : le joueur qui
touche à quelque chose veut lire ou décider ; le mode reste réglé pour la salle suivante. La pause
(Échap ou l'engrenage) interrompt donc aussi, et le décompte ne court pas tant qu'elle est ouverte.
Mouvement réduit : l'animation du chiffre suit la règle globale `[data-motion='off']`.

**Défaite et énergie** — Choix : aucun décompte après une défaite (l'écran de fin de donjon
attend le joueur) ; sur l'écran de récompenses, pas de relance si `enterDungeon` refuse l'entrée
(énergie insuffisante, coût 0 pour l'instant). L'entrée elle-même n'est pas consommée par la
relance, comme pour le bouton « Rejouer » et l'entrée par la carte : à brancher ensemble le jour
où `costPerDungeon` devient positif. Raison : une relance qui consomme ce que l'entrée manuelle
ne consomme pas serait incohérente. Le mode test (rien à gagner) ne relance pas non plus.

## 25 héros et rareté

**Rareté : le champ `tier` des salons PvP** — Contexte : le propriétaire veut une rareté ; la
branche PvP a déjà écrit `tier` (1 à 4, défaut 1) sur le héros. Choix : exactement la même forme
(`MAX_HERO_TIER`, même place dans le schéma), lue comme rareté : commun (I), rare (II), épique
(III), légendaire (IV). Raison : une seule notion de palier, aucune fusion conflictuelle ; une
sauvegarde ne contient pas la rareté (c'est du contenu), rien à migrer.

**Répartition 10 / 8 / 5 / 2** — Choix : les six héros d'origine sont communs (ils servent de
référence de puissance et deux d'entre eux sont offerts par des donjons) ; parmi les 19 nouveaux,
4 communs, 8 rares, 5 épiques, 2 légendaires, de sorte que chaque couple élément × rôle existe au
moins deux fois (les trois manquants — feu/soutien, eau/contrôle, nature/dégâts — en ont trois).
Le chargement refuse un héros de départ ou de donjon au-dessus de rare. Concepts, noms et thèses
repris du premier jet de roster du propriétaire (30 fiches en 4 tiers), dans la limite des
19 places ; Rosée, Étoupe, Verglas, Mirage, Sauge, Solstice, Havre, Orée, Abysse et Canopée
restent pour plus tard.

**Ce que la rareté change** — Contexte : plus rare doit vouloir dire plus désirable, sans écraser.
Choix : (1) poids du héros dans le tirage d'un fragment (`chests.tierWeights` 12 / 6 / 3 / 1),
toujours deux nombres par fragment et la même suite de graine ; le héros ciblé garde sa part fixe ;
(2) coût d'invocation (`chests.summonCosts` 10 / 20 / 40 / 80), étoiles au même prix pour tous ;
(3) kits plus riches (passif à deux déclencheurs dès rare, une règle pliée pour les légendaires :
Sablier retarde tout le camp adverse à l'entrée, Phénix se nourrit des chutes) et un budget de
stats borné à 2 % d'indice par palier (`TIER_STAT_BUDGET_PCT`, vérifié au chargement). Raison : le
ciblage reste la voie vers un héros précis, la rareté en fixe le prix ; la simulation vérifie
qu'aucun héros, même légendaire, ne devient indispensable.

**Héros de départ explicites** — Contexte : les héros de départ étaient « ceux qu'aucun donjon ne
débloque » ; les 19 nouveaux l'auraient tous été. Choix : `starter: true` sur les quatre héros de
départ (défaut faux, champ placé hors de la zone touchée par le PvP). Raison : trois voies
d'obtention lisibles dans le contenu — départ, donjon (`unlocksHero`), invocation.

**Talents et passif** — Contexte : le fantasme du propriétaire veut des talents qui modifient les
sorts et le passif. Les objets ont le passif pour terrain, les talents les sorts (tranché, ne pas
rouvrir). Choix : aucun nouveau mécanisme ; les talents agissent sur le passif à travers ses
déclencheurs (une brûlure ou une marque ajoutée nourrit Forge, Soufre, Chardon ; un
étourdissement nourrit Sablier ; la Couronne d'épines de Houx pose un déclencheur). Raison : même
sensation de build qui transforme le passif, sans ouvrir une combinatoire talents × objets.

**Simulation sur un échantillon** — Contexte : 12 650 équipes de quatre. Choix : 50 équipes tirées
par tours de mélange (chaque héros dans 8), R1 sur les 12 premières ; équipes « jouables » (au plus
deux héros du même rôle) pour les règles, le rythme et les paliers de donjon. Raison : `pnpm sim:check` reste autour de
70 s de calcul ; avec six héros, toute équipe respectait déjà cette limite, la mesure garde son sens.

**Cibles de rythme ajustées, donjons intacts** — Contexte : les donjons sont retouchés en parallèle
par le chantier des paliers. Choix : plancher du premier combat 9 → 7, boss 21–30 → 21–32,
tolérance de la courbe 12 → 15 points, chiffres dans `docs/BALANCE.md`. Raison : les écarts
venaient de la mesure (Pyra et Ressac descendent eux aussi à 7 actions au premier combat dès
qu'ils ont d'autres coéquipiers) et se règlent par les donjons ; à arbitrer par le propriétaire et
à refaire avec `autotune` et `tunecurve` après la fusion des paliers.

**Galerie à quatre colonnes qui défile** — Choix : cartes plus compactes (sprite ×1,5, thèse sur
trois lignes), grille qui défile dans son cadre ; le vivier de l'équipe et la liste des fragments
défilaient déjà. Raison : 25 cartes lisibles à 844 × 390 sans pagination à inventer.

## Silhouettes des héros

**Coiffes dessinées sur les bases héros plutôt que bases de monstres** — Contexte : les 19 héros
récents partageaient huit personnages du pack, distingués par la teinte et l'arme ; le
propriétaire : « ils ont tous la même image ». Choix : chaque héros récent sauf Genêt reçoit une
surcouche dessinée pixel par pixel à la résolution de la planche (`tools/art/looks.py` :
chapeau, capuche, cornes, couronne, ailes, bannière, cadran…), qui efface au besoin la coiffe
d'origine, suit la tête sur chaque image par recherche du motif du visage, et une palette
remplacée couleur par couleur quand la rotation de teinte ne suffit pas. Raison : les bases
encore libres lisent « monstre » et se confondent avec les ennemis (chort et imp, orc_warrior et
les orcs, muddy et swampy, zombie et big_zombie) ; elles n'ont pas d'image de dégâts. Les
surcouches gardent le style du pack et ne coûtent que 3 Ko d'atlas.

**Qui garde son image** — Choix : les six héros d'origine et Genêt (seul lézard à houppe nue)
restent tels quels. Phénix, Torrent et Étendard étaient les plus réussis mais partageaient la
silhouette de Ronce ou de Marée (chevalier et chevalière sont le même dessin) : ils gardent
palette et arme et reçoivent leur accessoire (ailes, vague, bannière). Raison : la règle « deux
héros, deux silhouettes » prime ; `export.py` la vérifie (masque de la première image de repos).

**Plus marquants en haut de la rareté** — Choix : les légendaires et les épiques portent les
accessoires les plus grands (ailes de flammes, cadran doré, bannière, bois, vague, cornes de
bélier), les communs et rares une coiffe simple. Marge latérale au plus 4 pixels de planche de
chaque côté : la carte de la galerie (72 px, sprite ×1,5) reste lisible.

**Prise d'arme depuis le milieu du sprite** — Contexte : un sprite élargi (cornes, ailes) déplaçait
la main. Choix : `GRIP.x` se compte depuis le milieu du sprite (élargi symétriquement : la scène
le centre). Raison : une seule table de prises, juste quelle que soit la coiffe.

**Limite assumée** — Le portrait de la file d'initiative est cadré sur le haut du sprite : pour
Étendard, Séquoia ou Sablier il montre surtout la coiffe, qui est justement le signe distinctif.
Le jeu n'utilise pas les images de course du pack ; les surcouches y ont été vérifiées quand même.

## Animations de combat

**Tout part de la vue rejouée** — Contexte : rendre le combat plus vivant sans logique de jeu
dans l'interface. Choix : chaque effet se déduit d'un événement du journal déjà appliqué à la vue
(`cast.slot`, `cast.targets`, `damage.absorbed`/`shieldAfter`, `shield.total`, `status`,
`expired`, `unit_down`) ; la vue garde seulement des repères d'animation (`cast.seq`,
`cast.dash`, `ultHit`). Raison : aucune règle recalculée ; l'état affiché reste recalé sur le
moteur à la fin du rejeu.

**Course seulement pour l'attaque de base sur un ennemi** — Choix : emplacement `basic` et une
seule cible de l'autre camp ; les compétences gardent projectile et arc. Raison : la course
signale le coup simple et lisible ; un sort à plusieurs cibles ou sur un allié n'a pas de point
de contact unique.

**Rejouer sans remonter, durées liées à la vitesse** — Choix : deux noms de keyframes (a/b)
alternés par le rang du sort (`cast.seq`, et non la position de l'événement, dont la parité peut
se répéter d'un sort au suivant) ; durées en `calc(… * var(--pace))` avec le facteur de vitesse
du rejeu. Raison : jamais de `key` React sur un conteneur (la chute rejouerait), et à ×2 chaque
effet finit avant l'événement suivant.

**Ultime : flash à l'impact, assombrissement par un voile** — Choix : un flash bref au lancer,
un flash franc au premier effet de l'ultime ; le décor s'assombrit par un calque unique
au-dessus des figurants et sous le lanceur, plutôt qu'un filtre par acteur. Raison : un filtre
sur chaque acteur entrait en conflit avec les animations de choc et de chute (même propriété
`filter`) ; un calque n'en touche aucune. La scène prend `z-index: 0` : flashs et bandes restent
sous l'en-tête et la barre d'actions, qui restent lisibles.

**Altérations persistantes plutôt qu'un effet à la pose** — Choix : brûlure, marque et
étourdissement restent dessinés tant que la vue les porte. Raison : un effet de 0,4 s à la pose
ne disait pas, trois tours plus tard, qui brûle ou qui est étourdi ; les étiquettes du repère
restent, l'image le dit d'un coup d'œil.

**Mort : l'unité disparaît** — Contexte : le corps grisé restait couché sur sa place. Choix :
après la chute, dissolution en cendres de son élément, puis plus rien ; le repère « Hors
combat » reste. Raison : la dissolution lit la mort sans ambiguïté et libère la scène à quatre
contre quatre ; qui est tombé reste écrit.

## Classes CSS du combat

**Préfixer les couches de la scène** — Contexte : la couche d'effets du combat (animations) avait
reçu la classe `.effects`, déjà utilisée par les listes d'effets des fiches ; tout le CSS étant
chargé ensemble, ces listes devenaient flottantes et recouvraient l'onglet Talents. Choix : les
couches de la scène de combat portent le préfixe `stage__` (`.stage__effects`). Raison : un nom
générique partagé entre deux écrans casse l'autre sans erreur ; le préfixe de bloc l'évite.

## Coffres : ciblage proportionnel, coffres distincts, chance selon la difficulté

**Le héros ciblé multiplie son poids, il ne prend plus une part fixe** — Contexte : `focusRate`
donnait 50 % des fragments au héros ciblé quelle que soit sa rareté ; un légendaire (80 fragments
à invoquer) se ciblait comme un commun, et la rareté ne pesait plus que sur le prix. Choix : le
ciblé pèse `focusMultiplier` (× 12) fois son poids dans le coffre. Raison : sa chance monte en
proportion de sa rareté (commun 30 à 50 %, légendaire 0 à 26 % selon le coffre) ; un seul nombre
à régler ; le tirage et l'affichage partagent le calcul. Écarté : une part fixe par rareté
(quatre nombres sans lien avec les poids, à recaler à chaque héros ajouté).

**Trois coffres qui diffèrent par leur contenu, pas seulement leur taille** — Choix : chaque coffre
a ses poids de rareté (`weights`) ; un bronze ne donne jamais de légendaire, l'or en donne cinq
fois plus que l'argent, et plus de fragments (4 / 7 / 14). Raison : un coffre d'or doit être un
événement ; l'écran l'affiche par une barre aux couleurs des raretés.

**La chance de coffre suit la difficulté, pas le donjon** — Contexte : chaque donjon avait son
coffre (champ `chest`), donné au premier passage puis une fois sur deux, et chaque palier montait
d'un cran : l'or tombait une fois sur deux dès le palier III des Landes. Choix : une chance par
coffre et par passage, en ligne droite selon le niveau des ennemis du palier
(`chests.dropLevels` 1 → 40, `drop` de chaque coffre) ; le premier passage d'un palier garantit
au moins un bronze. Raison : plus le passage est dur, plus le coffre est riche, avec une seule
règle pour tous les donjons et paliers (un donjon ajouté n'a rien à déclarer). Le champ `chest`
des donjons et `chestStepPerTier` disparaissent ; les sauvegardes ne stockent ni l'un ni l'autre.
Tailles 4 / 7 / 14 choisies pour garder les jalons du joueur modèle (`docs/ECONOMY.md`).

## Montée des sorts

**Une formule, pas des valeurs par héros** — Contexte : 25 héros × 4 sorts × 4 niveaux à la main
divergeraient et casseraient l'équilibre héros par héros. Choix : `balance.spellLevels` —
`powerPctPerLevel` (2,5 %) par niveau au-delà du premier sur la puissance des briques de dégâts,
de soin et de bouclier, et un bonus du dernier niveau par emplacement (`capstone`). Le moteur
l'applique après les talents (une brique ajoutée par un talent monte aussi). Raison : un seul
nombre à régler et à mesurer, et une description générée qui ne peut pas mentir.

**Le bonus du dernier niveau ne touche que l'ultime (−10 de délai)** — Mesuré (25 équipes,
`spellGap`) : coût de l'ultime −1 seul = +10 points de donjons en retard, délais −10 de A et B
seuls = +11, puissance +16 % seule = +25 ; tout cumulé (premier jet) +36 points. Choix : un
seul emplacement, par règle (l'ultime, le sort qu'on attend), et un délai plutôt qu'un coût
(4 → 3 points d'équipe change le rythme de la réserve partagée pour toute l'équipe). Raison :
rester sous la cible de +20 points avec un gain visible à chaque niveau.

**Grimoires génériques, pas par élément** — Contexte : le brief laisse le choix. Choix : une
seule ressource pour tous les héros ; ce qui rend l'investissement propre au héros, ce sont ses
fragments. Raison : le profil a déjà six monnaies (or, trois poussières, fragments, copies) ;
trois grimoires d'élément forceraient à farmer un donjon pour un héros sans lien avec son
élément (les donjons mélangent les éléments), et une équipe mixte se bloquerait sur le plus
rare. Le grimoire décide « quel héros », les fragments disent « celui-là, pas un autre ».

**Sources : paliers II/III et coffres d'argent et d'or** — Choix : 0/1/2 grimoires par passage
selon le palier (`grimoires.tiers`), 0/1/3 par coffre bronze/argent/or (`grimoires.chests`),
fixes (aucun tirage : la graine du butin ne bouge pas). Raison : les paliers et les coffres
riches récompensent déjà la difficulté ; le palier I des premiers donjons ne donne rien, la
montée des sorts reste un objectif de milieu et fin de partie. Les quêtes (autre chantier)
pourront s'y ajouter sans code moteur.

**Pas de migration** — Choix : `spells` (tous au niveau 1) et `grimoires` (0) ont une valeur par
défaut ; `PROFILE_VERSION` reste 1. Raison : même règle que les étoiles et les fragments.

**Le PvP garde les sorts au niveau 1** — Contexte : `packages/net` compose ses builds lui-même,
sans `spells`. Choix : inchangé. Raison : le duel en salon compare des équipes et des talents ;
y laisser entrer le grind (sorts au maximum : 62 % de victoires en duel miroir contre la même
équipe au niveau 1) serait une décision de design à part. À trancher par le propriétaire.

**Lien de build : niveaux de sort en option** — Choix : champ `s` (quatre niveaux) écrit
seulement si un sort dépasse 1 ; un ancien lien reste valide, un lien sans montée reste
identique. Raison : simple, aucune version de format.

**Écart mesuré en points de donjons terminés** — Contexte : « ≤ ~20 % de victoires en plus à
niveau égal ». Choix : points de pourcentage de donjons terminés avec 3 niveaux de retard par le
joueur moyen (la mesure de « aucun héros indispensable », non saturée), borné par
`targets.spellLevelsMaxGapPoints` (20) et vérifié en CI sur un échantillon. Raison : un taux
relatif sur une base de 33 % amplifie le bruit ; au niveau conseillé l'écart relatif est de
+14 % (63 % → 72 %), en retard +42 % (33 % → 47 %). Si le propriétaire voulait 20 % relatifs en
retard, il faudrait ≈ +1 % par niveau : à arbitrer.

## Quêtes du jour, de la semaine et succès

**La progression vient de compteurs à vie tenus par le moteur** — Contexte : les quêtes doivent
compter des actions qui existent déjà (donjons gagnés, palier II, niveaux, améliorations,
coffres, invocations, étoiles) sans que l'interface calcule rien et sans passer l'heure à chaque
fonction. Choix : chaque fonction de progression avance un compteur de `profile.stats`
(`countAction`) ; une période de quêtes garde les compteurs à son début (`base`) et la
progression est la différence. Raison : une seule ligne par action, aucune signature changée,
le moteur reste pur ; les succès lisent les mêmes compteurs ou le profil. Écarté : un journal
d'événements dans le profil (taille non bornée), ou `now` dans chaque fonction (toutes les
signatures et tous les appels changent).

**Le passage au nouveau jour se fait hors des actions** — `rollQuests(profil, now, avant)` tire les
quêtes de la nouvelle période ; l'interface l'appelle au chargement, toutes les 30 s et après
chaque action avec le profil d'avant l'action comme départ (une victoire juste après minuit compte
pour le nouveau jour). `claimQuest` et `claimBonus` le font aussi. Les quêtes non réclamées d'une
période passée sont perdues, comme dans les jeux de référence.

**Tirage : date UTC et graine du profil, mémorisé** — `drawQuests` mélange les quêtes possibles
avec `cyrb53(type:période:graine)` ; le résultat est stocké dans le profil (`quests.daily.ids`)
puisque la graine du profil avance avec le butin. `minWins` écarte les quêtes impossibles au début
(palier III, invocation) ; le chargement refuse un contenu qui ne remplit pas le tirage dès la
première partie.

**Les succès se mesurent sur le profil quand c'est possible** — donjons terminés, victoires,
paliers III, maîtrise, objets, héros, étoiles, niveau : lus dans le profil, pas dans les
compteurs, pour qu'une ancienne sauvegarde voie aussitôt ses succès mérités (à réclamer une fois).

**Récompense relative au meilleur donjon terminé** — Contexte : une somme fixe pèse lourd au début
(100 or = plus d'un passage des Landes) et rien à la fin (1 500 or par passage du Trône). Choix :
`passagePct` % de l'or et de la poussière d'un passage du donjon le plus avancé terminé, plus un
coffre. Raison : même poids relatif tout au long de la partie, donc un seul réglage vérifiable
(effet sur les jalons ≤ 15 %, mesuré et testé en CI). Pas de fragments directs : ils viennent des
coffres (le joueur garde son ciblage) ; pas d'XP : les niveaux restent le fruit des donjons.

**Pas de quête de duel PvP** — Le duel se joue entre amis dans un salon privé et rien ne remonte
au profil ; une quête « gagner un duel » se farmerait à deux (l'un perd exprès). À reprendre
seulement avec un classement ou un adversaire non choisi.

**Mode test : pas de quêtes** — rien n'y est gagné ; l'entrée du camp est masquée comme celle des
coffres.

**Entrée dans la barre du haut du camp** — Le menu de droite est plein à 844 × 390 (une entrée
de plus poussait « PvP » hors de l'écran, e2e rouge ; la Tour y a pris la septième place) ; le
bouton « Quêtes » et son badge vont donc juste après le titre du camp, toujours visibles.

**Textes générés depuis la mesure** — « Gagner {n} donjons » vient de `quests.metric.<mesure>` :
ajouter une quête ou un succès d'une mesure existante est une ligne de JSON (plus le nom du
succès dans `quests.fr.json`, vérifié par un test).

## Tour à étages

**Une formule et des règles, pas 50 combats** — Contexte : un défi vertical de 50 étages (inspiré
de la Tour de l'Ascension et de la Doom Tower). Choix : `balance.tower` porte les chiffres (niveau
par étage, courbe de PV et d'ATK par points d'appui, taille des groupes, équipement visé,
récompenses), `content/tower.json` la composition (groupe d'ennemis par élément avec sa correction
en %, cinq étages de boss avec le modificateur d'un donjon existant). Raison : comme les paliers de
donjon, un nombre global se règle et se mesure en une fois ; un étage écrit à la main divergerait.

**Un seul combat par étage, PV et réserve neufs** — Raison : le brief ; l'étage est un essai
court, rejouable, et la difficulté vient de l'étage lui-même, pas de l'usure d'un enchaînement.

**Correction par élément** — Constat (simulation, 48 équipes) : à chiffres égaux, les étages
d'eau passaient à 94 %, ceux de feu à 75 %, ceux de nature à 70 % (molosses et sorcières frappent
plus fort que crabes et appelantes). Choix : `atkPct` par groupe (eau 125, feu 100, nature 90) et
par boss. Raison : la rotation des éléments doit changer l'équipe à amener, pas faire alterner
étages faciles et durs.

**Au-delà du niveau 30, l'équipement fait la marche** — Choix : niveau visé = étage jusqu'à 30,
puis niveau 30 et `gear` (2 objets bruts à 31, +1 amélioration aux étages 36, 41, 46), mesurés
comme les paliers de donjon. Raison : la croissance des monstres est plate et leur niveau borné
à 30 ; la courbe d'ATK seule aurait fait un mur ou une pente nulle.

**Courbe monotone au bruit près** — Choix (règle `targets.tower`, en CI) : chaque étage ≥ 50 %
pour l'expert ; trois étages ordinaires consécutifs (une rotation complète) jamais plus faciles
que les trois d'avant de plus de 15 points ; un boss jamais plus facile que les étages qui le
précèdent ni que le boss précédent. La courbe des données (niveau, PV, ATK, équipement) ne
baisse jamais (schéma et test du moteur). Raison : comparer étage à étage mesurait surtout la
composition (un même élément varie de 20 points selon l'alternance des ennemis) ; un boss est un
pic voulu, l'étage qui le suit redescend.

**Rejouer ne rapporte rien** — Choix : seule la première victoire d'un étage paie ; rejouer sert à
essayer un build ou une équipe. Raison : la tour est une échelle, pas un farm ; le farm reste les
donjons (butin exclusif, maîtrise, paliers) et les bornes `farm` / `economy` ne bougent pas. Un taux
de rejeu même faible ferait de l'étage 1 le farm de poussière le plus rapide du jeu (combat
de 13 actions).

**Récompenses de première victoire** — Choix : poussière du palier qu'exige le niveau de l'étage
(4 brutes, 5 fines, 4 pures ; × 3 aux boss), 1 fragment tiré comme dans un coffre de bronze (héros
ciblé compris, même fonction que les coffres), un coffre aux étages de boss. Raison : sur les 50
étages, 28 brutes, 90 fines, 140 pures et 96 fragments, soit 6 à 10 % de ce que le joueur modèle
gagne sur toute sa progression (`docs/ECONOMY.md`) : un vrai bonus, pas une seconde économie.

**Pas de remise à zéro** — Choix : `tower.cleared` ne fait que monter ; pas de saison ni de remise
à zéro pour l'instant. Raison : le brief ; à rouvrir si une tour périodique est voulue (il faudra
alors des récompenses de rejeu).

**L'enchaînement monte d'un étage seulement sur demande** — Choix : option `towerClimb`
(« Auto : monter à l'étage suivant », retenue sur l'appareil) ; en mode Auto et après une victoire,
le décompte du bilan entre à l'étage suivant ; sans l'option, le bilan attend le joueur (rejouer un
étage ne rapportant rien, le relancer seul n'aurait pas de sens). Raison : même règle que
l'enchaînement des donjons, une navigation différée ; monter est une décision.

## Confort de farm (MaJ 1/7)

**Le nombre de passages remplace la relance automatique** — Contexte : l'enchaînement relançait le
même donjon sans fin dès qu'Auto était coché ; les séries rendent le nombre de passages explicite.
Choix : un passage = pas de relance ; 3, 5, 10 ou ∞ = série jouée en Auto, close par un bilan ; une
défaite termine la série et mène au bilan. Raison : le joueur décide de combien il farme et voit
ce qu'il a gagné, comme les multi-combats des jeux du genre.

**Badges et tri calculés par le moteur** — Choix : `campTodo` et les équipes enregistrées sont des
fonctions pures du moteur ; seul le tri par nom (dépendant de la langue) vit dans l'interface.
Raison : une seule source de vérité, testable sans écran.

## Éveil des héros et sanctuaires d'essence

**Sanctuaires hors du contenu des donjons** — Contexte : trois donjons d'essence, hors du chemin.
Choix : un fichier à part (`content/essences.json`, `content.essenceDungeons`) plutôt que des
entrées de `dungeons.json`. Raison : la carte, la courbe, les règles R2, le joueur modèle, les
succès et le butin exclusif parcourent `content.dungeons` ; y glisser des donjons sans butin ni
place sur le chemin aurait demandé une exception dans chacun. Les paliers réutilisent
`balance.tiers` (niveau, PV et ATK) : `tierLevel` accepte tout ce qui a un niveau conseillé.

**Accès par un bouton sous la carte, pas une 8ᵉ entrée du camp** — Raison : le brief ; le bouton
tient dans la légende de la carte à 844 × 390 (vérifié en e2e), le menu du camp reste à 7 entrées.

**Une qualité d'essence par palier, rien d'autre** — Choix : palier I → faibles, II → moyennes,
III → supérieures (`drops` 3 / 3 / 2) ; ni XP, ni or, ni objet, ni coffre ; la première victoire
d'un palier ouvre le suivant. Raison : un farm dédié qui ne concurrence pas les donjons ; le coût
qui demande les trois qualités force à monter les paliers.

**Coût : essences de l'élément et or, pas de poussière** — Contexte : « un peu de magie/poussière,
à trancher ». Choix : 5 000 or. Raison : la poussière est déjà la monnaie d'arbitrage (niveaux et
objets) ; l'or manque de puits (`docs/ECONOMY.md`). Condition : niveau 20 (pas d'étoile exigée :
le niveau 20 demande déjà la première).

**Effet : une formule commune, sur le terrain des objets** — Choix : `balance.awakening` porte
`statPct` (PV, ATK, DEF, hors plafond des objets, borné à 10 par le schéma) et `mods`, des
modifications de passif identiques à celles des objets (`scale` de `power`, `amount` et `percent`
à +20 %), appliquées par la même fonction (`applyItems`) comme un objet de plus. Raison : aucune
règle de moteur nouvelle, texte généré par `describeItem`, même effet lisible pour les 25 héros ;
la règle « les objets ont le passif pour terrain » est respectée. Écarté : +1 utilisation par
combat (`limit`) : rien pour la moitié des héros, énorme pour Phénix et Étendard.

**Visible sans sprite neuf** — Choix : badge « Éveillé » sur la fiche, liseré et halo de la
couleur de l'élément en CSS (`drop-shadow`) autour du sprite, sur la fiche et en combat, sans
animation (rien à couper avec `[data-motion='off']`). Raison : le brief (pas de sprites lourds).

**Règle de CI sur le pire héros, avec passe de confirmation** — Contexte : à 64 donjons par héros,
le bruit du pire des 25 héros dépasse 10 points même pour un effet moyen de 3 points. Choix : un
héros au-dessus de la cible est remesuré sur trois fois plus d'équipes et l'écart pris sur le tout
(256 donjons). Raison : garder une règle « par héros » sans tripler le temps de `sim:check`.

**Règles « tous éveillés » en CI, R1 sur 4 équipes** — Raison : R1 coûte surtout en duels ; sur
les 12 équipes la mesure donnait 82 %, sur 4 elle donne 79 % (cible 70 %). R2 et « aucun héros
indispensable » portent sur les 50 équipes.
