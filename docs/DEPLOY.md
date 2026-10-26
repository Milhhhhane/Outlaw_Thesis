# Déploiement (Cloudflare Workers, assets statiques)

Le jeu est un site 100 % statique servi par Cloudflare Workers (assets statiques, sans script
Worker ni binding : pas de D1, KV ni R2). Chaque push sur `main` est construit et déployé par
**Workers Builds** (intégration Git de Cloudflare).

## Valeurs exactes

| Réglage                   | Valeur                                          |
| ------------------------- | ----------------------------------------------- |
| Dépôt                     | `Milhhhhane/outlaw_thesis` (GitHub)             |
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
2. S'authentifier et autoriser l'application GitHub de Cloudflare sur le dépôt `outlaw_thesis`.
3. Choisir le dépôt ; nom du projet `outlaw-thesis` ; vérifier les valeurs du tableau ci-dessus ;
   **Save and Deploy**.
4. L'URL `https://outlaw-thesis.<sous-domaine>.workers.dev` s'affiche à la fin du premier build.

`wrangler.jsonc` existant : Cloudflare ne lance pas sa configuration automatique et utilise ce
fichier tel quel.

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
