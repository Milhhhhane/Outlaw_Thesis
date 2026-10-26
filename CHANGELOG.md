# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Une entrée par sprint.

## [sprint-0] — 2026-10-26

### Ajouté

- Monorepo pnpm (Node 24, TypeScript strict), ESLint, Prettier, CI GitHub Actions sur Linux et
  Windows : lint, format, types, tests, régression de simulation, build, budget de taille.
- `@outlaw/data` : schémas Zod des héros, sorts, passifs, talents, objets, ennemis, donjons et de
  `balance.json` ; contrôles croisés du contenu.
- `@outlaw/engine` : combat déterministe et pur — stats par niveau, file d'initiative en temps
  entier, réserve de points par camp, dégâts avec triangle des éléments, soins, points d'équipe,
  ennemis scriptés, limite de 100 actions, rejeu à partir des actions.
- `@outlaw/web` : coquille React en français, en-têtes de sécurité pour Cloudflare.
- `@outlaw/sim` : scénarios synthétiques, CSV, test de régression contre `baseline.csv`.
- Configuration Cloudflare Workers (assets statiques, repli SPA) et `docs/DEPLOY.md`.
