# PVP : salon personnalisé

Premier mode JcJ : un salon privé, deux joueurs, trois héros chacun, arbitré plus tard par un
serveur (un Durable Object Cloudflare). Ce document décrit ce qui est fait dans le dépôt (moteur,
protocole, logique de salon, mesure d'équilibrage) et ce qui reste. Les choix et leurs raisons sont
aussi dans `docs/DECISIONS.md` (section « PVP »).

## Périmètre

| Fait (lot 11, sprint A1)                                           | Pas fait                             |
| ------------------------------------------------------------------ | ------------------------------------ |
| Règles de combat optionnelles, action par défaut, empreinte d'état | Worker et Durable Object             |
| `packages/net` : protocole, règles, validation d'équipe, salon pur | Interface (création, salle, combat)  |
| Sérialisation du salon pour le stockage du Durable Object          | Lecture du profil depuis les comptes |
| `pnpm sim:pvp` : mesure de l'équilibrage, sans rien appliquer      | Tests de bout en bout (e2e)          |
| Champ `tier` des héros (1 à 4, tous à 1 aujourd'hui)               | Classement, récompenses, chat libre  |

Le moteur et `packages/net` restent des fonctions pures : ni Cloudflare, ni DOM, ni horloge, ni
hasard (le test `purity.test.ts` de `packages/net` balaie les sources).

## Décisions de conception

- **Deux joueurs pilotés.** Les deux camps ont `controller: 'policy'`. Le joueur 1 (l'hôte) est le
  camp `player`, le joueur 2 le camp `enemy`. Seule la priorité change d'un combat à l'autre.
- **Unités déterministes.** Identifiants `p1_<héros>` et `p2_<héros>`, emplacements 0 à 2.
- **Un combat par partie.** Une revanche est un nouveau combat : mêmes équipes, priorité échangée,
  acceptée par les deux joueurs.
- **Pas de récompense, pas de classement.** Rien n'est écrit dans les profils.
- **Émotes prédéfinies.** Six émotes (0 à 5), aucun texte libre, une toutes les 1,5 s au plus.
- **Le serveur est la seule source de vérité.** Il rejoue le combat à partir de la configuration et
  de la liste des actions ; un client ne dit jamais « qui » il est ni « quelle unité » joue.

## Règles du salon

Réglées par l'hôte avant le combat (`set_rules`), valeurs par défaut entre parenthèses :

| Règle         | Valeurs                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `maxLevel`    | 1 à 30 (30) : le niveau d'un héros est `min(niveau du profil, plafond)` |
| `items`       | oui / non (oui)                                                         |
| `tierBudget`  | aucun (défaut), ou un entier de 3 à 12 : somme des paliers des 3 héros  |
| `turnSeconds` | 20, 30, 45 ou 60 (30) : temps accordé à chaque action                   |

Paliers : un héros a un `tier` de 1 à 4 (I à IV, champ ajouté à `heroSchema`, défaut 1). Les six
héros actuels sont tous de palier I, donc un budget de 3 (le minimum) les autorise tous.

Règles du moteur déduites (`toBattleRules`) : `firstSide` = le camp désigné par le tirage au sort
(premier combat) ou l'autre camp (revanche) ; `limit: 'hp_ratio'`.

- **Priorité.** `firstSide` départage deux unités au même instant (au lieu de « héros d'abord ») et
  trie aussi les unités du `BattleState` (les déclencheurs se résolvent dans cet ordre). Sans cela
  le miroir n'est pas symétrique. La vitesse décide toujours de qui joue en premier ; la priorité
  ne sert qu'à égalité.
- **Limite d'actions.** À la limite (100 actions, `balance.json`), le camp au plus grand ratio de PV
  gagne : somme des PV restants sur somme des PV maximaux, unités tombées comprises, comparée par
  produits en croix (entiers, aucun arrondi). Égalité exacte : nul (`winner: null`, raison
  `action_limit`). En PvE rien ne change (`enemy_wins`).
- **Anéantissement simultané** : nul.

## Protocole (`packages/net/src/protocol.ts`, version 1)

Messages JSON, une connexion par joueur. Un message client dépasse 4096 octets UTF-8, n'est pas du
JSON ou ne passe pas le schéma strict (Zod `strictObject`, aucun champ inconnu) : le serveur répond
`error` (`too_large`, `bad_json`, `bad_schema`) sans toucher au salon.

Client vers serveur :

| `type`          | Champs                     | Effet                                                                 |
| --------------- | -------------------------- | --------------------------------------------------------------------- |
| `hello`         | `v`, `contentHash`         | Prend sa place (ou la reprend) ; version et contenu vérifiés          |
| `set_rules`     | `rules`                    | Hôte seulement, salle seulement ; remet les deux « prêt » à zéro      |
| `set_team`      | `heroes` (talents, objets) | Valide l'équipe contre le profil et les règles                        |
| `ready`         | -                          | Les deux prêts : le combat commence                                   |
| `action`        | `spell`, `target?`         | Joue le sort de l'unité active (l'unité n'est jamais envoyée)         |
| `claim_timeout` | -                          | Acquitte un dépassement de chrono déjà constaté (voir ci-dessous)     |
| `emote`         | `id` de 0 à 5              | Transmise à l'adversaire                                              |
| `resync`        | -                          | Renvoie la vue et le combat complet (actions déjà jouées)             |
| `rematch`       | -                          | Demande une revanche (les deux doivent la demander)                   |
| `leave`         | -                          | Quitte : forfait en plein combat, salon fermé si l'hôte part en salle |

Serveur vers client :

| `type`         | Contenu                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `room`         | Vue du salon pour ce joueur (l'équipe adverse reste cachée avant le combat), envoyée à chaque changement de vue |
| `battle_start` | Configuration, règles, `firstSide`, `you`, actions déjà jouées, `stateHash`, `deadline`, `serverNow`            |
| `applied`      | Acteur, action, `auto: 'timeout'` si le serveur a joué, `stateHash`, `deadline`, `serverNow`                    |
| `result`       | `winner` (`null` = nul), `reason` : `annihilation`, `action_limit`, `forfeit`, `disconnect`                     |
| `emote`        | `id`                                                                                                            |
| `error`        | `code` (voir `ERROR_CODES`), `detail?` (200 caractères au plus)                                                 |

Codes d'erreur : `too_large`, `bad_json`, `bad_schema`, `version_mismatch`, `content_mismatch`,
`hello_required`, `not_host`, `wrong_phase`, `no_profile`, `team_required`, `team_rejected`,
`not_your_turn`, `illegal_action`, `not_expired`, `rate_limited`, `opponent_absent`, `room_closed`,
et les codes de validation d'équipe ci-dessous.

Un client fait confiance à `applied` : il rejoue l'action avec le moteur (`step`) et compare
`hashState` à `stateHash`. Une différence signifie une désynchronisation : il envoie `resync`.

Déroulé type : `hello` (x2) → `room` → `set_rules` (hôte) → `set_team` (x2) → `ready` (x2) →
`battle_start` (x2) → `action` / `applied` en boucle → `result` → `rematch` (x2) → `battle_start`.

### Version et contenu

`hello` porte `PROTOCOL_VERSION` et `contentHash` : une empreinte de `balance`, `heroes` et `items`.
Un client dont le jeu n'est pas à jour est refusé (`version_mismatch`, `content_mismatch`) avant le
combat, plutôt que de laisser deux rejeux diverger en plein combat. Contrepartie : toute
modification de contenu, même d'un texte de héros, invalide les clients anciens (voir « Limites »).

### Validation d'équipe (`validateTeam`)

Contrôles dans cet ordre, le premier refus l'emporte : `team_size` (3 héros), `bad_slots`
(emplacements 0, 1, 2), `duplicate_hero`, `hero_not_owned`, `items_forbidden`, puis pour chaque
héros dans l'ordre des emplacements : `bad_slots` (trop d'objets, ou deux fois le même),
`item_not_owned` (exemplaire absent du profil, déjà pris par un autre héros, amélioration hors
bornes), `unknown_talent`, `talent_invalid` (doublon, prérequis, choix exclusif),
`talents_over_budget` (page verrouillée au niveau plafonné, ou plus de talents que de points) ;
enfin `tier_budget_exceeded`.

Les talents sont libres dans la limite des points et des pages du niveau plafonné : ceux du profil
ne comptent pas, le client envoie l'allocation voulue pour le salon.

## Machine à états du salon (`packages/net/src/room.ts`)

`reduceRoom(room, event, ctx)` est pur : `(salon, événement, contexte) → { room, send, closed? }`.
Les événements sont `message`, `disconnect` et `tick`. L'identité vient de l'événement. Le contexte
fournit l'heure (`now`), le tirage au sort (`coin`), les profils (`profileOf`), le contenu et
l'équilibrage. Le temps est réglé avant tout message : un message qui arrive après une échéance est
jugé sur l'état d'après. Un refus ne change pas le salon (même objet rendu).

```
lobby ──(les deux prêts)──▶ battle ──(résultat)──▶ ended
                              ▲                      │
                              └──(rematch des deux)──┘
```

Dans `lobby` : `set_rules` (hôte), `set_team` et `ready`. `leave` y libère la place (l'hôte qui part
ferme le salon).

| Transition     | Condition                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------ |
| salle → combat | Les deux joueurs prêts ; équipes revalidées avec les profils du moment ; priorité = `coin`       |
| combat → fin   | Anéantissement, limite d'actions, forfait, déconnexion trop longue                               |
| fin → combat   | `rematch` des deux joueurs : mêmes équipes, `firstSide` échangé, `battle + 1`                    |
| fermeture      | L'hôte quitte la salle (`room_closed` au joueur 2), ou salon terminé et deux joueurs déconnectés |

Seuls les deux joueurs qui ont dit `hello` en salle ont une place : personne ne rejoint un combat
commencé ni un salon terminé (`wrong_phase`), mais un joueur déjà inscrit revient par un nouveau
`hello`.

### Chrono, forfait, déconnexion

- Chaque action a une échéance : `now + turnSeconds`. Le serveur la communique (`deadline`,
  `serverNow`) ; l'horloge du client n'est qu'indicative.
- À l'échéance, le serveur joue l'action par défaut du moteur (`defaultAction` : l'attaque de base
  sur le vivant aux PV les plus bas) et l'annonce avec `auto: 'timeout'`. Au deuxième dépassement
  consécutif d'un joueur, il perd par forfait (`reason: 'forfeit'`). Une action jouée à la main
  remet son compteur à zéro.
- `claim_timeout` n'a aucun pouvoir : l'échéance est réglée à chaque événement, y compris celui-ci.
  Le message répond `not_expired` si rien n'était dû.
- Déconnexion en salle : le joueur n'est plus prêt. En plein combat : période de grâce de 60 s
  (`graceUntil` dans la vue de l'adversaire) ; le chrono continue (le serveur joue à sa place). À
  l'expiration, il perd (`reason: 'disconnect'`) ; si les deux ont expiré, le plus ancien perd,
  à égalité de l'instant le combat est nul. Chrono et grâce coexistent : la plus ancienne échéance
  s'applique.
- Retour : un nouveau `hello` annule la grâce et renvoie `battle_start` avec toutes les actions
  (reprise complète), ainsi que le `result` si le combat est fini.

### Intégration prévue (Durable Object)

Un salon = un objet. Pour chaque message reçu, `receive(room, player, texte, ctx)` ; pour une
fermeture de connexion, `reduceRoom(..., { type: 'disconnect', player }, ctx)` ; pour une alarme,
`{ type: 'tick' }`. Après chaque appel : expédier `update.send` (`to: 'all'` ou un joueur), écrire
`serializeRoom(update.room)` dans le stockage, programmer l'alarme à `nextWakeUp(update.room)` (null :
pas d'alarme), supprimer l'objet si `update.closed`. `deserializeRoom` valide tout ce qu'il lit
(`RoomFormatError` sinon) ; `ROOM_FORMAT` versionne la forme. Le serveur fournit `now`, `coin` (tirage
au sort fait côté serveur) et `profileOf`. Mesures : environ 1,3 ms par action (le réducteur rejoue le
combat à chaque action) et 26 Ko de JSON pour un salon en cours.

## Empreinte d'état et rejeu

`hashState(state)` (moteur) est un cyrb53 (53 bits, 14 caractères hexadécimaux) de la forme canonique
des champs dynamiques : horloge, nombre d'actions, unité active, points d'équipe, et pour chaque unité
PV, vivant, instant du prochain tour, bouclier, altérations, modifications et déclencheurs. C'est un
détecteur de désynchronisation, pas une protection contre la triche (non cryptographique). Le client
qui rejoue les mêmes actions obtient la même empreinte sur toute plateforme (temps entier, pas de
hasard dans le moteur).

## Équilibrage mesuré (`pnpm sim:pvp`)

Rapport seulement : rien n'est appliqué, `baseline.csv` et `pnpm sim:check` ne changent pas.

- **Série miroir** : la même composition (20 possibles) des deux côtés, mêmes builds tirés au
  hasard, niveau 30, sans objet, politique « joueur moyen » de `tools/sim/src/policy.ts` pour
  chaque camp (graines distinctes). La seule différence est la priorité : taux de victoire du premier
  joueur, cible 50 % ± 3 points.
- **Série croisée** : deux compositions différentes, dans les deux sens (la priorité s'annule). Le
  taux d'un héros est celui des combats où il se trouve dans un seul camp. Bande indicative 50 % ± 10
  points (seuil propre à ce rapport, le cahier des charges n'en fixe pas).
- **Durée** : actions du moteur (tour de chaque unité, toutes unités confondues), cible 30 à 60.

Options : `--samples` (jeux de builds croisés, 4 par défaut), `--mirror-samples` (60 par
composition), `--seed` (1), `--level` (30). Durée : une dizaine de secondes par défaut.

Résultats à la livraison (graine 1, 4 jeux de builds, 1 200 miroirs et 1 520 croisés ; entre
parenthèses graine 2, 8 jeux, 2 400 miroirs et 3 040 croisés) :

| Mesure                                  | Valeur                                 | Cible                 |
| --------------------------------------- | -------------------------------------- | --------------------- |
| Victoires du premier joueur (miroir)    | 52,3 % (51,5 %)                        | 50 % ± 3              |
| Durée moyenne (actions du moteur)       | 77,2 (77,7), soit 38,6 par joueur      | 30 à 60               |
| Combats arrêtés par la limite d'actions | miroir 38 % (40 %), croisé 29 % (31 %) | -                     |
| pyra                                    | 39,8 % (36,3 %)                        | 50 % ± 10 (indicatif) |
| maree                                   | 38,8 % (43,3 %)                        | idem                  |
| ronce                                   | 45,6 % (48,9 %)                        | idem                  |
| cendre                                  | 71,3 % (65,7 %)                        | idem                  |
| ressac                                  | 54,7 % (56,1 %)                        | idem                  |
| seve                                    | 49,9 % (49,7 %)                        | idem                  |

Lecture et propositions (non appliquées) :

1. **Priorité** : dans la cible dans les deux exécutions. Rien à faire.
2. **Durée** : 77 actions du moteur, hors cible si elle se compte en actions du moteur ; environ 39 par
   joueur, dans la cible si elle se compte par joueur (convention de `docs/BALANCE.md` pour le PvE :
   « actions de joueur »). À trancher. Près de 4 miroirs sur 10 finissent à la limite d'actions, donc
   au ratio de PV. Essai en mémoire (rien d'écrit, 2 jeux de builds, 40 miroirs par composition,
   graine 1) : `defenseScale` de 100 à 150, 200, 300 donne 78,5, 74,0, 70,6, 67,5 actions. Ce seul levier
   ne ramène pas sous 60 et il est global (il toucherait le PvE et la baseline). Pistes : une règle de
   combat PvP en plus dans `BattleRules` (par exemple un pourcentage de dégâts), ou raccourcir la
   limite d'actions en PvP ; les causes (soins, boucliers, PV de niveau 30) n'ont pas été isolées.
3. **Héros** : `cendre` est nettement au-dessus (66 à 71 %), `pyra` et `maree` en dessous (36 à 43 %),
   sans objet et avec la politique moyenne. Les héros relèvent d'un autre chantier : à traiter avec
   les mêmes mesures sur `balance.json` et `content/heroes` quand ce chantier le permet.

Précautions : politique « joueur moyen » (un humain fera mieux ou autrement), pas d'objet, niveau 30,
builds au hasard : c'est un thermomètre pour comparer avant et après un changement, pas une vérité.

## Limites connues

- **Propriété des héros non prouvée.** Les sauvegardes sont écrites par le client (voir
  `docs/DECISIONS.md`, « Pas de validation des résultats ») : `validateTeam` vérifie l'équipe contre le
  profil que le serveur lui donne, pas que ce profil a été gagné. Acceptable entre amis ; à refaire
  (rejeu serveur des progressions, ou profil de salon fourni par le serveur) avant tout classement.
- **`talents_over_budget` quand le plafond de niveau du salon est inférieur au niveau du joueur.**
  Le serveur ne tronque rien : un joueur de niveau 30 dans un salon plafonné à 15 doit envoyer au plus
  les talents du niveau 15 (points et pages), sinon `talents_over_budget`. L'interface devra proposer
  de redistribuer les talents au moment de choisir l'équipe. Autre piste, à trancher plus tard : que le
  serveur retire lui-même les derniers talents choisis, au prix d'une équipe que le joueur n'a pas
  validée.
- **Empreinte de contenu stricte.** Un changement de contenu sans effet sur le combat (texte de
  héros) refuse quand même les clients anciens. À resserrer si cela gêne les déploiements.
- **Chrono porté par le serveur.** Il faut programmer l'alarme à `nextWakeUp` ; sans alarme, le
  chrono n'est réglé qu'au prochain événement.
- **Pas de reconstitution après perte du stockage.** Un salon n'existe que dans le Durable Object ;
  `ROOM_FORMAT` versionne la forme, aucune migration n'est écrite.
- **Revanche sans revalidation.** Les équipes ne sont pas revérifiées avec les profils entre deux
  combats d'une même partie.
- **`applied.auto: 'forfeit'` réservé.** En version 1, un forfait s'annonce par `result`.
- **Deux joueurs, pas de spectateur, pas de chat libre.**

## Ce qui reste après la livraison des comptes

1. Worker et Durable Object : connexion WebSocket par joueur, tirage au sort, alarme, stockage,
   lecture du profil du compte pour `profileOf`, limitation de débit par connexion.
2. Interface : création et invitation (code de salon), réglages de l'hôte, composition d'équipe avec
   redistribution des talents, écran de combat piloté par `battle_start` / `applied`, reprise après
   déconnexion, émotes, revanche.
3. Tests de bout en bout sur deux navigateurs.
4. Décisions d'équilibrage ci-dessus (durée, héros), puis éventuellement classement (avec preuve de
   propriété des héros).
