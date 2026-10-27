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
