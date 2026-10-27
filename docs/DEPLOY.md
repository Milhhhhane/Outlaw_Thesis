# Déploiement (Cloudflare Workers : site statique + Worker des comptes)

Le jeu est servi par Cloudflare Workers : les fichiers statiques (`apps/web/dist`) et, depuis le
lot 8B, un Worker (`apps/api/src/index.ts`) qui ne répond qu'aux routes `/api/*`
(`run_worker_first`), avec une base D1 `outlaw-thesis`. Chaque push sur `main` est construit et
déployé par **Workers Builds** (intégration Git de Cloudflare).

## Valeurs exactes

| Réglage                   | Valeur                                          |
| ------------------------- | ----------------------------------------------- |
| Dépôt                     | `Milhhhhane/Outlaw_Thesis` (GitHub)             |
| Branche de production     | `main`                                          |
| Nom du Worker             | `outlaw-thesis` (identique à `wrangler.jsonc`)  |
| Répertoire racine (root)  | `/` (racine du dépôt)                           |
| Commande de build         | `pnpm run build`                                |
| Commande de déploiement   | `npx wrangler deploy` (valeur par défaut)       |
| Dossier publié            | `apps/web/dist` (déclaré dans `wrangler.jsonc`) |
| Variables d'environnement | aucune (aucun secret)                           |
| Base D1                   | `outlaw-thesis`, liaison `DB` (voir plus bas)   |
| Version de Node           | lue dans `.node-version` (24)                   |
| Version de pnpm           | lue dans `packageManager` de `package.json`     |

Cloudflare installe les dépendances lui-même (pnpm détecté par `pnpm-lock.yaml`).

## Première mise en place (propriétaire du compte)

1. Tableau de bord Cloudflare → **Workers & Pages** → **Create application** → **GitHub**.
2. S'authentifier et autoriser l'application GitHub de Cloudflare sur le dépôt `Outlaw_Thesis`.
3. Choisir le dépôt ; nom du projet `outlaw-thesis` ; vérifier les valeurs du tableau ci-dessus ;
   **Save and Deploy**.
4. L'URL `https://outlaw-thesis.<sous-domaine>.workers.dev` s'affiche à la fin du premier build.

`wrangler.jsonc` existant : Cloudflare ne lance pas sa configuration automatique et utilise ce
fichier tel quel.

`wrangler.jsonc` déclare aussi `build.command` (`pnpm run build`) : `wrangler deploy` construit
le site lui-même avant de publier. Le déploiement marche donc même si la commande de build du
tableau de bord est vide ; sans cela, il échoue avec « The directory specified by the
"assets.directory" field … does not exist ».

## Comptes (lot 8B) : base D1 — une seule action éventuelle du propriétaire

`wrangler.jsonc` déclare la base **sans identifiant** : au premier `wrangler deploy`, Wrangler la
crée lui-même et la relie au Worker (provisionnement automatique, en bêta ouverte depuis
Wrangler 4.45 ; le dépôt utilise 4.152). Le schéma n'a pas besoin de commande : le Worker applique
ses migrations versionnées (`apps/api/src/db.ts`) au premier appel. **Normalement, rien à faire.**

Si le premier build échoue sur la base (droits du jeton de Workers Builds, bêta), faire en une
fois, sur sa machine, à la racine du dépôt :

```sh
npx wrangler login                    # une fois, ouvre le navigateur
npx wrangler d1 create outlaw-thesis  # affiche un database_id
```

puis copier ce `database_id` dans `wrangler.jsonc` (`"d1_databases": [{ "binding": "DB",
"database_name": "outlaw-thesis", "database_id": "…" }]`), committer et pousser. Cet identifiant
n'est pas un secret.

À renseigner aussi : le moyen de contact du créateur, champ `contact` de
`apps/web/public/config.json` (vide : le jeu affiche « Contacte le créateur du jeu »).

**Temps processeur.** Le hachage scrypt coûte environ 50 ms de processeur par connexion ou
création de compte (mesuré en local). Le plan Workers gratuit accorde 10 ms par requête, avec une
tolérance pour des dépassements occasionnels ; les connexions sont rares (sessions de 30 jours).
Si des erreurs 1102 (« Worker exceeded resource limits ») apparaissent à la connexion, il faut le
plan Workers Paid (30 s par défaut). Voir `docs/DECISIONS.md`.

Réinitialiser un mot de passe : `docs/ACCOUNTS.md`.

## Vérifier en local

```sh
pnpm install
pnpm run build
npx wrangler deploy --dry-run   # lit apps/web/dist, ne publie rien
npx wrangler dev                # site + Worker + base D1 locale sur http://localhost:8787
```

`apps/web/public/_headers` fixe les en-têtes de sécurité (CSP stricte : aucune ressource externe)
et le cache long des fichiers fingerprintés de `/assets/`.

Sources : [Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[run_worker_first](https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first),
[provisionnement automatique](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/),
[limites](https://developers.cloudflare.com/workers/platform/limits/),
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
[Headers](https://developers.cloudflare.com/workers/static-assets/headers/).

## Plein écran et installation

- **Ordinateur, Android, iPad** : bouton « Plein écran » sur l'écran-titre et dans les options,
  ou touche F11. L'API Fullscreen exige un geste de l'utilisateur (clic, touche), d'où le bouton.
- **iPhone** : Safari n'offre pas l'API Fullscreen sur iPhone (seulement sur iPad, avec un bouton
  de sortie imposé). Le jeu se joue sans barre d'adresse une fois installé : Partager, puis
  « Sur l'écran d'accueil ». Le manifeste (`apps/web/public/manifest.webmanifest`) demande
  `display: fullscreen`, que iOS ramène à `standalone` ; il ignore `orientation`, d'où l'écran
  « Tournez votre appareil » en portrait.
- **Installable sur Chrome** : manifeste avec `name`, `start_url`, `display`, icônes 192 et 512 px,
  servi en HTTPS ; aucun service worker (le jeu ne promet pas de mode hors ligne).

Sources : [MDN, compatibilité de requestFullscreen](https://github.com/mdn/browser-compat-data)
(« Only available on iPad, not on iPhone »), [web.dev, critères d'installation](https://web.dev/articles/install-criteria),
[firt.dev, PWA sur iOS](https://firt.dev/notes/pwa-ios/) (consultés le 27 octobre 2026).
