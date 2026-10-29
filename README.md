# Outlaw Thesis

RPG tactique au tour par tour dans le navigateur. Quatre héros contre un à quatre ennemis, une file
d'initiative visible, une réserve de points d'équipe partagée, aucun hasard en combat : seul le
butin est tiré au sort, hors combat. Les builds (talents, objets) changent la façon de jouer, pas
seulement les chiffres.

Pour reprendre le travail : lire ce fichier, puis [`PROGRESS.md`](PROGRESS.md) et
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Démarrer

Prérequis : Node 24 (voir `.node-version`) et pnpm 12 (`corepack enable` suffit, la version est
fixée par `packageManager`).

```sh
pnpm install
pnpm dev          # jeu en local (Vite)
pnpm verify       # tout ce que vérifie la CI : lint, format, types, tests, simulation, build, taille, e2e
pnpm verify:fast  # pareil sans les e2e (~1 min de moins)
```

| Commande            | Rôle                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm test`         | tests de tous les paquets (couverture ≥ 90 % exigée sur le moteur)      |
| `pnpm sim`          | simulation de combats, CSV dans `tools/sim/out/results.csv`             |
| `pnpm sim:check`    | test de régression : la simulation doit égaler `tools/sim/baseline.csv` |
| `pnpm sim --update` | met à jour la référence après un changement d'équilibrage voulu         |
| `pnpm build`        | build de production dans `apps/web/dist`                                |
| `pnpm size`         | vérifie le budget de 300 Kio gzip                                       |
| `pnpm fonts`        | vérifie qu'aucune police n'est intégrée en `data:` (CSP)                |

## Organisation

```
packages/engine   moteur de combat pur : (état, action) → (nouvel état, journal)
packages/data     schémas Zod, balance.json, contenu JSON (héros, ennemis, objets, donjons)
apps/web          interface React : rejoue le journal, ne calcule rien
tools/sim         simulation et règles d'équilibre
docs/             architecture, équilibrage, contenu, décisions, déploiement
```

Détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Équilibrage :
[`docs/BALANCE.md`](docs/BALANCE.md). Ajouter du contenu : [`docs/CONTENT.md`](docs/CONTENT.md).
Déploiement Cloudflare : [`docs/DEPLOY.md`](docs/DEPLOY.md).
