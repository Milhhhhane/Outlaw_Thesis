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
