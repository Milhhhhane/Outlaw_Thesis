# Déploiement (Cloudflare Workers, assets statiques)

Le jeu est un site 100 % statique servi par Cloudflare Workers (assets statiques, sans script
Worker ni binding : pas de D1, KV ni R2). Chaque push sur `main` est construit et déployé par
**Workers Builds** (intégration Git de Cloudflare).

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
| Variables d'environnement | aucune                                          |
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

## Vérifier en local

```sh
pnpm install
pnpm run build
npx wrangler deploy --dry-run   # lit apps/web/dist, ne publie rien
```

`apps/web/public/_headers` fixe les en-têtes de sécurité (CSP stricte : aucune ressource externe)
et le cache long des fichiers fingerprintés de `/assets/`.

Sources : [Static Assets](https://developers.cloudflare.com/workers/static-assets/),
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
