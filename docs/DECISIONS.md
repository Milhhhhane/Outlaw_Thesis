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
