# Comptes et sauvegarde en ligne

Lot 8B. La monnaie du jeu est gratuite : aucun paiement, aucune donnée de paiement.

## Ce que le serveur stocke (base D1 `outlaw-thesis`)

| Table         | Contenu                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`       | pseudo, clé d'unicité (pseudo en minuscules), hash scrypt, drapeau `must_change`, dates de création et de dernière connexion                                |
| `sessions`    | empreinte SHA-256 du jeton de session (le jeton lui-même n'est jamais stocké), compte, dates                                                                |
| `saves`       | sauvegarde du jeu (JSON validé, 200 Ko au plus), révision `rev`, date                                                                                       |
| `friendships` | une ligne par paire de comptes (plus petit identifiant en `user_a`) : état `pending` ou `accepted`, auteur de la demande, dates de demande et d'acceptation |
| `throttle`    | compteurs de tentatives : par pseudo, ou par empreinte d'adresse IP salée du jour ; effacés après 24 h                                                      |
| `meta`        | sel du jour pour les empreintes d'adresse IP (remplacé chaque jour, l'ancien est perdu)                                                                     |

Pas d'e-mail, pas de nom réel, pas de journal persistant (`observability` désactivé dans
`wrangler.jsonc`, le Worker n'écrit que le type d'une erreur interne). La page « Confidentialité
et conditions » du jeu décrit la même chose ; elle est un **brouillon à faire valider**.

L'administrateur du jeu peut voir, pour chaque compte, le pseudo, les dates de création, de
dernière connexion et de dernière sauvegarde, la date de dernière activité (déduite du dernier
usage de la session, à un jour près), le nombre de sessions ouvertes et l'avancement (voir
« Administration » plus bas). La page de confidentialité le dit aussi.

Un **ami** (demande acceptée) voit le pseudo, la date depuis laquelle vous êtes amis, le **jour**
de la dernière activité (minuit UTC, jamais l'heure) et un résumé d'avancement court (niveaux
extrêmes de l'équipe, donjons terminés / total). Une demande en attente ne montre que le pseudo et
sa date. La page de confidentialité le dit aussi (voir « Amis » plus bas).

## Administration (lecture seule)

Les administrateurs sont les pseudos du secret Cloudflare `ADMIN_PSEUDOS` (séparés par des
virgules, comparés sans distinction de casse, comme à l'inscription). Il n'est **pas** dans le
dépôt ; secret absent ou vide : personne n'est administrateur. Le créer : `docs/DEPLOY.md`.

| Route                       | Réponse                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/me`               | en plus de `pseudo` et `mustChangePassword` : `admin` (booléen), aussi renvoyé à l'inscription et à la connexion                                   |
| `GET /api/admin/users`      | `limit` (1 à 100, 20 par défaut), `offset` ; totaux (comptes, actifs sur 24 h et sur 7 jours) et une page de comptes, la dernière activité d'abord |
| `GET /api/admin/users/<id>` | le même compte, plus chaque héros débloqué (niveau, étoiles) et chaque donjon (victoires, palier ouvert)                                           |

- Session obligatoire (sinon 401). Un compte qui n'est pas administrateur reçoit **404
  `not_found`**, exactement comme une route inconnue : l'administration ne se révèle pas.
- Lecture seule : toute autre méthode répond 404. Réponses `Cache-Control: no-store`.
- Par compte : identifiant, pseudo, création, dernière connexion, dernière sauvegarde, dernière
  activité, sessions non expirées, résumé d'avancement. Jamais de hash, de jeton ni de clé de pseudo.
- **Dernière activité** : la plus récente de la création, de la connexion, de la sauvegarde et du
  dernier usage d'une session. Ce dernier se déduit de l'expiration glissante (repoussée au plus une
  fois par jour), donc à un jour près, sans écriture supplémentaire.
- **Résumé d'avancement**, calculé par le Worker depuis la sauvegarde validée par le schéma du jeu
  (`null` si absente ou invalide) : héros débloqués / total, niveaux extrêmes de l'équipe,
  donjons terminés / total et plus haut palier ouvert, or, objets différents, succès réclamés (si
  la sauvegarde connaît les quêtes).
- Coût processeur (mesuré sous Node 22) : relire et valider une sauvegarde courante prend
  0,26 à 0,46 ms, soit 2,6 à 4,6 ms pour les 10 comptes d'une page de l'écran du jeu, et jusqu'à
  23 ms pour 10 sauvegardes de 171 Kio. Surtout, le premier `loadContent()` d'une instance du
  Worker coûte environ 92 ms à froid (22 ms à chaud) : la première requête d'administration
  dépasse les 10 ms du plan gratuit, comme le scrypt de la connexion, déjà toléré (voir
  `docs/DEPLOY.md`). Pas de limite de débit : la route n'est ouverte qu'aux administrateurs.
- Écran du jeu : bouton « Administration » en pied du camp, présent seulement si `/api/me` répond
  `admin: true` (`apps/web/src/screens/Admin.tsx`, textes `i18n/admin.fr.json`).

## Amis

Base sociale : demandes par pseudo, acceptation, retrait. Ni chat, ni blocage, ni notification
(hors périmètre). Code : `apps/api/src/friends.ts` (routage dans `index.ts`), types partagés dans
`packages/accounts` (`FriendList`…), écran `apps/web/src/screens/Friends.tsx`, textes
`i18n/friends.fr.json`. Migration D1 n° 2 (`db.ts`) : table `friendships`, clé primaire
`(user_a, user_b)` avec `user_a < user_b` (une seule ligne par paire, quel que soit le sens de la
demande), index sur `user_b` et sur `(requested_by, status)`.

| Route                            | Rôle                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/friends`               | `{ friends, received, sent }` : amis (`id`, `pseudo`, `since`, `lastActiveDay`, `progress`) et demandes (`id`, `pseudo`, `at`)   |
| `GET /api/friends/pending`       | `{ received }` : nombre de demandes reçues (badge du camp ; aucune sauvegarde lue)                                               |
| `POST /api/friends/requests`     | `{ pseudo }` : demande ; 201 `{ outcome: 'sent', list }`, ou 200 `{ outcome: 'accepted', list }` si l'autre m'avait déjà demandé |
| `POST /api/friends/<id>/accept`  | accepter la demande reçue de `<id>` (le destinataire seulement) ; renvoie la liste                                               |
| `POST /api/friends/<id>/decline` | refuser la demande reçue de `<id>` : la ligne est effacée ; renvoie la liste                                                     |
| `DELETE /api/friends/<id>`       | retirer un ami, ou annuler une demande (l'un ou l'autre des deux comptes) ; renvoie la liste                                     |

- `<id>` est l'identifiant de l'**autre** compte. Seuls les deux comptes d'une paire peuvent agir
  sur elle : pour un tiers, la paire n'existe pas (404 `not_found`).
- Session obligatoire (401), changement de mot de passe exigé respecté (403
  `must_change_password`), vérification d'`Origin` pour les modifications (403 `bad_origin`),
  réponses `Cache-Control: no-store`. Jamais de hash, de jeton ni de clé de pseudo.
- Le pseudo demandé est comparé comme à l'inscription (`pseudo_key`, sans distinction de casse,
  espaces autour ignorés). Refus : `friend_self` (400), `friend_unknown` (404), `already_friends`,
  `already_requested` (409).
- **Plafonds** (`packages/accounts`) : 100 amis par compte (`friends_full` pour le mien,
  `friend_full` pour celui de l'autre, vérifiés à la demande et à l'acceptation), 50 demandes
  envoyées en attente (`requests_full`). Les plafonds sont aussi dans la condition de l'écriture
  SQL : deux requêtes simultanées ne les dépassent pas (la perdante reçoit 409 `conflict`).
- **Limite de débit** : 20 demandes par compte et par heure, réussies ou non (clé
  `friend-request:<id>` de `throttle`) : on ne peut pas tester l'existence de pseudos sans limite.
  Au-delà : 429 `too_many`, `Retry-After: 3600`.
- **Dernière activité** : la même que pour l'administration (création, connexion, sauvegarde,
  usage de session), **arrondie au jour UTC** (`lastActiveDay`, minuit en ms). Le tri des amis
  (jour décroissant, puis pseudo) n'en dit pas plus que le jour. L'écran écrit « aujourd'hui »,
  « hier », « il y a 3 j ».
- **Résumé** (`progress`) : calculé par le Worker depuis la sauvegarde validée par le schéma du jeu,
  avec le même code que l'administration (`saveProgress`, `progressOf`), réduit à
  `{ team: { min, max } | null, dungeons: { cleared, total } }` ; `null` sans sauvegarde valide.
- **Suppression du compte** (`DELETE /api/account`) : ses amitiés, ses demandes (envoyées et
  reçues) et son compteur de demandes sont effacés dans la même transaction. SQLite peut redonner
  l'identifiant d'un compte supprimé : un nouveau compte n'hérite de rien (testé).
- **Coût** : `GET /api/friends` relit et valide la sauvegarde de chaque ami (0,26 à 0,46 ms
  chacune, voir « Administration ») : jusqu'à environ 50 ms de processeur pour 100 amis, plus le
  premier `loadContent()` d'une instance. C'est pourquoi le badge du camp passe par
  `GET /api/friends/pending` (un simple `COUNT`) et que l'écran ne charge la liste qu'à l'ouverture.
- Pas d'expiration des demandes en attente ni de plafond des demandes **reçues** : un compte ne
  peut en envoyer que 50 en attente, et l'inscription est limitée par adresse IP.

### Brancher l'invitation PvP (pas codé)

Le salon PvP se rejoint par code (`docs/PVP.md`). Une invitation directe se brancherait ainsi, sans
changer le salon :

1. `POST /api/friends/<id>/invite` (ami accepté seulement, sinon 404) : le Worker crée le salon
   comme `POST /api/pvp/rooms` (même limite de débit) et enregistre `{ from, to, code, expires }`
   (nouvelle table `pvp_invites`, migration suivante, expiration courte : 10 min).
2. `GET /api/friends` (ou `/pending`) renverrait les invitations reçues non expirées ; l'écran
   Amis afficherait « Rejoindre » à côté de l'ami, qui mène à `{ name: 'pvp_room', code }`,
   exactement comme le lien `#salon=CODE`.
3. Retirer l'ami ou supprimer un compte efface ses invitations (même règle que `forgetFriends`).

## Limites de débit

| Action                    | Règle                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Création de compte        | 5 par adresse IP et par heure                                                                                                                  |
| Connexion                 | 30 tentatives par adresse IP sur 10 min                                                                                                        |
| Échecs de connexion       | par pseudo : 5 gratuits par heure, puis attente doublée à chaque échec (2 s, 4 s… 15 min max) ; par adresse IP : 10 gratuits, même progression |
| Mot de passe, suppression | 5 échecs gratuits par compte, puis même progression                                                                                            |
| Demande d'ami             | 20 par compte et par heure, réussies ou non                                                                                                    |

Un pseudo inconnu et un mauvais mot de passe reçoivent la même réponse, dans le même temps (une
vérification factice est faite pour un pseudo inconnu).

## Mot de passe perdu : réinitialisation par le propriétaire

Il n'y a **pas** de récupération automatique (pas d'e-mail). Le joueur contacte le créateur
(champ `contact` de `apps/web/public/config.json`, vide au départ : à renseigner).

**Cette procédure est faible** : sans e-mail ni autre preuve, rien ne garantit que la personne
qui écrit est bien le propriétaire du compte. Elle convient tant que rien ne s'achète ; elle doit
être remplacée (e-mail vérifié, ou mieux) **avant toute vente**.

1. Ne jamais réinitialiser sur simple demande, même pressante.
2. Lancer, sur sa machine, connecté à Cloudflare (`npx wrangler login` une fois) :

   ```sh
   pnpm admin:reset-password <pseudo>
   ```

   Le script affiche un résumé : date de création, dernière connexion, date de la sauvegarde,
   héros et niveaux, or, matériaux, donjons terminés.

3. **Avant de confirmer**, poser au joueur des questions dont seul le vrai propriétaire connaît
   la réponse, d'après ce résumé : à peu près quand il a créé le compte, ses héros et leurs
   niveaux, son or, combien de donjons il a finis. Ne pas lui montrer le résumé, ne pas lui
   souffler les réponses. Plusieurs réponses floues ou fausses : refuser.
4. Confirmer en retapant le pseudo. Le script écrit un mot de passe temporaire aléatoire
   (haché avec le même module que le Worker, `@outlaw/accounts/hash`), lève `mustChangePassword`
   et révoque toutes les sessions. Le mot de passe temporaire s'affiche **une seule fois**.
5. Le transmettre au joueur par le canal qui a servi à la demande. À sa connexion suivante, le
   jeu exige un nouveau mot de passe ; tant qu'il ne l'a pas changé, seule cette route répond.

Essai sur une base locale (`wrangler dev --persist-to <dossier>`) :
`pnpm admin:reset-password <pseudo> --persist-to <dossier absolu>`.

## Limite connue : la sauvegarde n'est pas vérifiée

Le serveur valide la **forme** du profil (Zod) et sa taille, pas son **contenu** : les combats
sont calculés par le navigateur, et un joueur peut fabriquer une sauvegarde (or, niveaux) à la
main. C'est acceptable tant que rien ne s'achète et qu'il n'y a pas de classement. Avant toute
vente, il faudra rejouer côté serveur les journaux de combat avec le moteur déterministe
(`@outlaw/engine`) et n'accepter que les gains qui en découlent (lot ultérieur, pas fait ici).

## Synchronisation (côté jeu)

- La partie reste locale d'abord : le jeu se joue hors ligne.
- Connecté, chaque changement de profil (fin de donjon, étoile, talent, objet, équipe) part au
  serveur après 2 s de calme ; échec réseau : nouvel essai toutes les 30 s et au retour en ligne.
- Indicateur au camp et sur l'écran-titre : Synchronisé, En attente, Hors ligne.
- Écriture refusée (le cloud a changé entre-temps, 409) : écran « Version du cloud / Version de
  cet appareil » (date, héros et niveaux, ressources, donjons) ; rien n'est écrasé sans choix.
- Première connexion avec une partie invitée qui a avancé : proposer de l'envoyer vers le compte
  (cloud vide) ou de choisir la version à garder (cloud non vide). Une partie jamais jouée
  (profil neuf) est ignorée.
- Déconnexion : envoi de ce qui attend, puis la partie locale est effacée de l'appareil (elle est
  sur le cloud). Suppression du compte : données serveur et partie locale effacées.
