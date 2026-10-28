# PVP : salon personnalisé

Premier mode JcJ : un salon privé, deux joueurs, `teamSize` héros chacun (4, la même taille d'équipe
qu'en donjon, lue dans `balance.json`), arbitré par un serveur (un Durable Object Cloudflare) et joué
depuis l'entrée **PvP** du camp (écran « Duel en ligne »). Ce document décrit ce qui
est fait dans le dépôt (moteur, protocole, logique de salon, serveur, interface, mesure
d'équilibrage) et ce qui reste. Les choix et leurs raisons sont aussi dans `docs/DECISIONS.md`
(section « PVP »).

## Périmètre

| Fait                                                                   | Pas fait                            |
| ---------------------------------------------------------------------- | ----------------------------------- |
| Règles de combat optionnelles, action par défaut, empreinte d'état     | Classement, récompenses, chat libre |
| `packages/net` : protocole, règles, validation d'équipe, salon pur     | Spectateurs, plus de deux joueurs   |
| `apps/api` : Durable Object `PvpRoom`, routes de création et connexion | Preuve de propriété des héros       |
| `apps/web` : menu, salon, composition d'équipe, combat en direct       | Salon public ou appariement         |
| Reprise après coupure, émotes, revanche, forfait, chrono serveur       | Reprise après perte du stockage     |
| Tests : unitaires (serveur, client), deux navigateurs réels (e2e)      |                                     |
| `pnpm sim:pvp` : mesure de l'équilibrage, sans rien appliquer          |                                     |

Le moteur et `packages/net` restent des fonctions pures : ni Cloudflare, ni DOM, ni horloge, ni
hasard (le test `purity.test.ts` de `packages/net` balaie les sources).

## Décisions de conception

- **Deux joueurs pilotés.** Les deux camps ont `controller: 'policy'`. Le joueur 1 (l'hôte) est le
  camp `player`, le joueur 2 le camp `enemy`. Seule la priorité change d'un combat à l'autre.
- **Unités déterministes.** Identifiants `p1_<héros>` et `p2_<héros>`, emplacements 0 à
  `teamSize` − 1 (0 à 3).
- **Taille d'équipe lue dans les données.** Aucun nombre de héros n'est écrit dans le code du PvP :
  `teamSizeOf(balance)` (`balance.progression.teamSize`) pour l'équipe, `MAX_SIDE` de `@outlaw/data`
  pour les bornes des schémas (emplacements, unités par camp).
- **Pas de combat automatique en ligne.** Le bouton Auto (et la touche A) du solo n'apparaît pas
  dans un duel : chaque joueur joue lui-même ; s'il tarde, le chrono du serveur joue l'action par
  défaut.
- **Un combat par partie.** Une revanche est un nouveau combat : mêmes équipes, priorité échangée,
  acceptée par les deux joueurs.
- **Pas de récompense, pas de classement.** Rien n'est écrit dans les profils.
- **Émotes prédéfinies.** Six émotes (0 à 5), aucun texte libre, une toutes les 1,5 s au plus.
- **Le serveur est la seule source de vérité.** Il rejoue le combat à partir de la configuration et
  de la liste des actions ; un client ne dit jamais « qui » il est ni « quelle unité » joue.

## Règles du salon

Réglées par l'hôte avant le combat (`set_rules`), valeurs par défaut entre parenthèses :

| Règle         | Valeurs                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `maxLevel`    | 1 à 30 (30) : le niveau d'un héros est `min(niveau du profil, plafond)`        |
| `items`       | oui / non (oui)                                                                |
| `tierBudget`  | aucun (défaut), ou de `teamSize` à `teamSize` × 4 (4 à 16) : somme des paliers |
| `turnSeconds` | 20, 30, 45 ou 60 (30) : temps accordé à chaque action                          |

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

| `type`         | Contenu                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `room`         | Vue du salon pour ce joueur (l'équipe adverse reste cachée avant le combat), envoyée à chaque changement de vue   |
| `battle_start` | Configuration, règles, `firstSide`, `you`, actions déjà jouées, `stateHash`, `deadline`, `serverNow`              |
| `applied`      | Acteur, action, `auto: 'timeout'` si le serveur a joué, `stateHash`, `deadline`, `serverNow`                      |
| `result`       | `winner` (`null` = nul), `reason` : `annihilation`, `action_limit`, `forfeit`, `disconnect`                       |
| `emote`        | `id`                                                                                                              |
| `names`        | `you`, `opponent` (`null` tant que personne n'occupe l'autre place) : pseudos des comptes, fournis par le serveur |
| `error`        | `code` (voir `ERROR_CODES`), `detail?` (200 caractères au plus)                                                   |

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

Contrôles dans cet ordre, le premier refus l'emporte : `team_size` (`teamSize` héros), `bad_slots`
(emplacements 0 à `teamSize` − 1), `duplicate_hero`, `hero_not_owned`, `items_forbidden`, puis pour chaque
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

### Intégration (Durable Object)

Un salon = un objet. Pour chaque message reçu, `receive(room, player, texte, ctx)` ; pour une
fermeture de connexion, `reduceRoom(..., { type: 'disconnect', player }, ctx)` ; pour une alarme,
`{ type: 'tick' }`. Après chaque appel : écrire `serializeRoom(update.room)` dans le stockage, puis
expédier `update.send` (`to: 'all'` ou un joueur), programmer l'alarme à `nextWakeUp(update.room)`
(null : pas d'alarme), supprimer l'objet si `update.closed`. `deserializeRoom` valide tout ce qu'il
lit (`RoomFormatError` sinon) ; `ROOM_FORMAT` versionne la forme. Le serveur fournit `now`, `coin`
(tirage au sort fait côté serveur) et `profileOf`. Mesures à quatre contre quatre : environ 1,2 ms
par action une fois le code chaud (le réducteur rejoue le combat à chaque action ; 3 à 11 ms sur les
premiers combats d'un processus neuf) et 35 Ko de JSON pour un salon dont le combat est fini (70
actions ; 26 Ko à trois contre trois). Le détail du câblage est
dans la section « Serveur » ci-dessous.

## Empreinte d'état et rejeu

`hashState(state)` (moteur) est un cyrb53 (53 bits, 14 caractères hexadécimaux) de la forme canonique
des champs dynamiques : horloge, nombre d'actions, unité active, points d'équipe, et pour chaque unité
PV, vivant, instant du prochain tour, bouclier, altérations, modifications et déclencheurs. C'est un
détecteur de désynchronisation, pas une protection contre la triche (non cryptographique). Le client
qui rejoue les mêmes actions obtient la même empreinte sur toute plateforme (temps entier, pas de
hasard dans le moteur).

## Équilibrage mesuré (`pnpm sim:pvp`)

Rapport seulement : rien n'est appliqué, `baseline.csv` et `pnpm sim:check` ne changent pas.

- **Série miroir** : la même composition (15 possibles : quatre héros parmi six) des deux côtés, mêmes builds tirés au
  hasard, niveau 30, sans objet, politique « joueur moyen » de `tools/sim/src/policy.ts` pour
  chaque camp (graines distinctes). La seule différence est la priorité : taux de victoire du premier
  joueur, cible 50 % ± 3 points.
- **Série croisée** : deux compositions différentes, dans les deux sens (la priorité s'annule). Le
  taux d'un héros est celui des combats où il se trouve dans un seul camp. Bande indicative 50 % ± 10
  points (seuil propre à ce rapport, le cahier des charges n'en fixe pas).
- **Durée** : actions du moteur (tour de chaque unité, toutes unités confondues), cible 30 à 60.

Options : `--samples` (jeux de builds croisés, 4 par défaut), `--mirror-samples` (60 par
composition), `--seed` (1), `--level` (30). Durée : une dizaine de secondes par défaut.

Résultats après le passage à quatre héros et le grind (graine 1, 4 jeux de builds, 900 miroirs et
840 croisés ; entre parenthèses graine 2, 8 jeux, 120 miroirs par composition, 1 800 miroirs et
1 680 croisés). La première livraison, à trois héros, est rappelée en dernière colonne (graine 1).

| Mesure                                  | Quatre contre quatre                   | À trois (graine 1)       | Cible                 |
| --------------------------------------- | -------------------------------------- | ------------------------ | --------------------- |
| Victoires du premier joueur (miroir)    | 54,7 % (50,5 %)                        | 52,3 %                   | 50 % ± 3              |
| Durée moyenne (actions du moteur)       | 81,1 (81,0), soit 40,5 par joueur      | 77,2                     | 30 à 60               |
| Combats arrêtés par la limite d'actions | miroir 44 % (42 %), croisé 31 % (34 %) | miroir 38 %, croisé 29 % | -                     |
| pyra                                    | 42,5 % (43,9 %)                        | 39,8 %                   | 50 % ± 10 (indicatif) |
| maree                                   | 39,5 % (39,9 %)                        | 38,8 %                   | idem                  |
| ronce                                   | 43,3 % (41,8 %)                        | 45,6 %                   | idem                  |
| cendre                                  | 64,0 % (56,1 %)                        | 71,3 %                   | idem                  |
| ressac                                  | 60,5 % (55,1 %)                        | 54,7 %                   | idem                  |
| seve                                    | 50,2 % (63,2 %)                        | 49,9 %                   | idem                  |

Lecture et propositions (non appliquées) :

1. **Priorité** : 54,7 % à la graine 1 (hors de la bande de 3 points), 50,5 % à la graine 2 sur deux
   fois plus de combats. L'écart entre les deux exécutions est du même ordre que la bande : rien de
   sûr, à remesurer avec plus d'échantillons avant de compenser le second joueur.
2. **Durée** : 81 actions du moteur, hors cible si elle se compte en actions du moteur ; environ 40 par
   joueur, dans la cible si elle se compte par joueur (convention de `docs/BALANCE.md` pour le PvE :
   « actions de joueur »). À trancher. Quatre héros par camp allongent un peu les combats et plus de
   4 miroirs sur 10 finissent à la limite d'actions, donc au ratio de PV. Essai fait à trois héros
   (rien d'écrit) : `defenseScale` de 100 à 300 ne ramène pas sous 60 et toucherait le PvE. Pistes :
   une règle de combat PvP en plus dans `BattleRules` (par exemple un pourcentage de dégâts), ou
   raccourcir la limite d'actions en PvP ; les causes (soins, boucliers, PV de niveau 30) n'ont pas
   été isolées.
3. **Héros** : `pyra`, `maree` et `ronce` restent sous 45 %, `cendre`, `ressac` et `seve` au-dessus de
   55 % selon la graine. Avec quatre héros parmi six, deux équipes partagent toujours au moins deux
   héros, ce qui rend le taux par héros plus bruité qu'à trois. Les héros relèvent d'un autre chantier.

Précautions : politique « joueur moyen » (un humain fera mieux ou autrement), pas d'objet, niveau 30,
builds au hasard : c'est un thermomètre pour comparer avant et après un changement, pas une vérité.

## Serveur (`apps/api`)

Le Worker existant (comptes) route `/api/pvp/*` ; le salon vit dans le Durable Object `PvpRoom`
(`apps/api/src/pvp-room.ts`, binding `PVP`, classe SQLite déclarée par la migration `v1-pvp` de
`wrangler.jsonc`). Sans le binding (tests, `wrangler dev` sans DO), les routes répondent 503
`unavailable`.

| Route                         | Rôle                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/pvp/rooms`         | Crée un salon, renvoie `{ code }` (6 caractères, alphabet sans `0 O 1 I`)            |
| `GET /api/pvp/rooms/:code/ws` | Passe la connexion en WebSocket vers le salon, 404 `room_not_found`, 409 `room_full` |

- **Identité.** Le Worker lit le cookie de session, puis transmet au salon l'identifiant et le pseudo
  du compte dans des en-têtes internes (`X-Outlaw-Account`, `X-Outlaw-Pseudo`) qu'il réécrit toujours :
  une valeur envoyée par le client est écrasée. Le cookie ne quitte jamais le Worker.
- **Contrôles du Worker (avant tout réveil du salon).** Compte obligatoire (401), en-tête `Origin`
  identique à celui du site pour la création **et** pour le WebSocket, qui n'est pas couvert par les
  règles CORS (403 `bad_origin`, protection contre le détournement de WebSocket), requête `Upgrade:
websocket` (400), code bien formé (404 sinon). Limites : 20 salons par heure et par compte, 30
  connexions par minute et par compte (429 `too_many`).
- **Salon.** `RoomService` est la logique (testée sans Cloudflare : horloge, tirage, stockage et
  sockets sont injectés) ; `PvpRoom` n'est que la colle. Un mutex sérialise les événements ; le salon
  est enregistré **avant** d'envoyer les messages, pour qu'aucun client ne voie un état que le stockage
  ne retrouverait pas après une éviction. Le profil de chaque joueur est lu dans la table `saves` (D1)
  à chaque `set_team` : le salon valide l'équipe contre cette sauvegarde, pas contre ce que dit le
  client.
- **WebSocket Hibernation.** `acceptWebSocket(ws, [joueur])` : le joueur est une étiquette de la
  connexion, l'objet peut dormir entre deux messages. `ping` reçoit `pong` sans réveiller l'objet.
  Une seule connexion par joueur : une nouvelle remplace l'ancienne (fermée avec le code 4000).
- **Codes de fermeture.** 4000 remplacée par une autre connexion, 4004 salon fermé, 4008 débit
  dépassé (plus de 60 messages en 5 s sur une même connexion).
- **Alarme.** Une seule alarme, à la plus proche des échéances : chrono de tour, grâce après
  déconnexion, inactivité. Un salon sans activité pendant 30 minutes est fermé et son stockage vidé.
- **Données.** Rien n'est écrit dans les profils ni dans D1 ; seul le stockage du Durable Object
  contient le salon sérialisé (`serializeRoom`).

## Interface (`apps/web/src/pvp`)

| Fichier                         | Rôle                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `PvpMenu.tsx`                   | Écran « Duel en ligne » : créer un salon, en rejoindre un, ou se connecter      |
| `Lobby.tsx`, `PvpRoom.tsx`      | Salle d'attente : code et lien, règles (hôte), équipe, joueurs, bouton « Prêt » |
| `team.ts`                       | Choix des héros, ramenés au plafond de niveau du salon, talents retirés au-delà |
| `socket.ts`, `session.ts`       | WebSocket, `hello`, reprise avec attente croissante (jusqu'à 75 s), `ping`      |
| `PvpBattle.tsx`, `overlays.tsx` | Combat en direct : chrono, émotes, résultat, revanche                           |
| `combat/useBattle.ts`           | Le combat solo réutilisé : `apply` et `restore` rejouent les actions annoncées  |

- **Le client n'invente rien.** Il joue une action seulement quand le serveur l'annonce (`applied`),
  vérifie l'empreinte avec son état local et demande `resync` (deux fois au plus) en cas d'écart.
  Un clic envoie `action` ; le bouton reste en attente jusqu'à la réponse.
- **Talents.** Si le plafond du salon est inférieur au niveau du héros, `trimTalents` retire les
  derniers talents choisis jusqu'à respecter points et pages (validé contre `validateTeam`).
- **Lien d'invitation.** `#salon=CODE` ouvre directement le salon (une fois : le lien est consommé,
  un rechargement ne le rouvre pas). Sans compte connecté, l'écran propose de se connecter d'abord.
- **Synchronisation du compte.** Avant de créer un salon, le client pousse son profil local si le
  compte n'a pas encore de sauvegarde en ligne : sans elle, le serveur répondrait `no_profile`.
- **Style.** Même cadre fixe que le reste du jeu (canevas virtuel 1280 x 720), textes dans
  `i18n/pvp.fr.json`.

## Jouer à deux

1. Les deux joueurs se connectent à leur compte. Le duel en ligne exige un compte : en invité,
   l'entrée **PvP** du camp l'explique et ouvre directement « Se connecter » ou « Créer un compte »
   (gratuit, sans e-mail ; la partie d'invité peut être envoyée sur le compte à la première connexion).
2. Le premier ouvre **PvP** depuis le camp, puis **Créer un salon**. Il envoie le code (ou le
   lien) à son ami.
3. L'ami ouvre **PvP**, saisit le code (ou ouvre le lien) et rejoint.
4. Chacun choisit quatre héros (`teamSize`). L'hôte règle niveau maximum, objets, budget de paliers et temps par
   action, puis chacun appuie sur **Prêt**.
5. Le serveur tire au sort qui commence. Le combat se joue comme en solo, au tour par tour ; si le
   chrono expire, le serveur joue l'action par défaut, et deux dépassements d'affilée valent forfait.
6. Pendant le combat : six émotes prédéfinies. À la fin : **Revanche** (les deux doivent accepter,
   la priorité est échangée) ou **Quitter**.
7. Coupure de réseau ou rechargement de la page : revenir dans le même salon avec le même code
   reprend le combat là où il en était, dans la limite de 60 s de grâce.

## Tests

- `packages/net` (136 tests) : protocole, règles, validation, salon pur, pureté des sources.
- `apps/api/test/pvp-room.test.ts` : le service de salon avec des sockets factices (rejeu complet d'un
  combat, reprise, chrono, forfait, débit, remplacement de connexion, redémarrage entre deux
  messages). `pvp-routes.test.ts` : identité, origine, limites, codes.
- `apps/web/test/pvp.test.ts` : session, reprise, équipe et talents, empreinte, action en attente.
- `apps/web/e2e/pvp.spec.ts` : deux navigateurs réels contre un vrai Worker et un vrai Durable Object
  (`wrangler dev`) : un salon, un combat entier, des émotes, une revanche puis un abandon ; la reprise
  après rechargement de la page ; un code inconnu ou un salon complet ; en invité, à 1280 x 720 et à
  844 x 390, l'entrée **PvP** du camp visible sans défilement, l'explication du compte et
  l'inscription sur place. Joué avec `pnpm e2e` (projet `comptes`). `game.spec.ts` vérifie aussi
  l'entrée PvP dans toutes les résolutions du jeu seul (sans serveur : message « comptes non
  disponibles »).
- Un test de fumée manuel contre `wrangler dev` a joué un combat de bout en bout avec deux sockets
  (hors dépôt) et a révélé la limite de débit trop basse, relevée depuis de 30 à 60 messages.

## Limites connues

- **Propriété des héros non prouvée.** Les sauvegardes sont écrites par le client (voir
  `docs/DECISIONS.md`, « Pas de validation des résultats ») : `validateTeam` vérifie l'équipe contre le
  profil que le serveur lui donne, pas que ce profil a été gagné. Acceptable entre amis ; à refaire
  (rejeu serveur des progressions, ou profil de salon fourni par le serveur) avant tout classement.
- **`talents_over_budget` côté serveur.** Le serveur ne tronque rien : c'est l'interface qui retire les
  derniers talents choisis (`trimTalents`) avant d'envoyer l'équipe. Un client modifié qui enverrait
  plus se fait refuser.
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
- **Navigateurs.** La connexion WebSocket au salon n'est vérifiée (e2e) que sous Chromium ; Safari
  n'a pas été essayé.

- **Camp non inversé pour le joueur 2.** Chaque joueur voit son équipe à droite ou à gauche selon
  son camp (`player` à gauche, `enemy` à droite) : le joueur 2 voit sa propre équipe à droite. Pas
  de miroir, pour ne pas toucher au moteur de rendu solo.
- **Salon inconnu ou plein : un seul message.** Le navigateur ne distingue pas les deux cas (le
  WebSocket refusé n'expose pas le code HTTP) : « Impossible de rejoindre ce salon ».
- **Pas de reprise automatique de l'écran.** Un rechargement de la page ramène au hub : il faut
  rouvrir **PvP** et ressaisir le code. Le serveur, lui, retient la place.
- **Durée de partie.** La cible de « 30 à 60 actions » est ambiguë : une partie compte environ 77
  actions du moteur, soit environ 39 par joueur (voir `pnpm sim:pvp`).

## Après cette livraison

1. Décisions d'équilibrage ci-dessus (durée, héros), puis éventuellement classement (avec preuve de
   propriété des héros, donc rejeu serveur des progressions).
2. Persistance de l'écran de salon au rechargement, salon public ou appariement, spectateurs.
3. Miroir du camp pour le joueur 2.
