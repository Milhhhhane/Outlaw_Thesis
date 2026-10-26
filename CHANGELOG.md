# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Une entrée par sprint.

## [sprint-1] — 2026-10-26

### Ajouté

- Moteur : les 8 briques (bouclier, tempo, modification de stat, marque, brûlure,
  étourdissement avec immunité, déclencheurs), durées par tour du porteur, déclencheurs sans
  chaîne (passifs, objets, modificateurs de donjon), intention des ennemis (`enemyIntent`).
- Compilation héros + niveau + talents + objets → unité, validation des builds, ennemis par
  niveau, modificateurs de donjon.
- Contenu : 3 héros prototypes (Pyra feu/dégâts, Marée eau/soutien, Ronce nature/contrôle), chacun
  avec 4 sorts, un passif et 3 pages de 5 talents ; 6 types d'ennemis.
- Simulation : 1 000 combats aléatoires reproductibles, politique d'anticipation, rejeu vérifié.

## [sprint-0] — 2026-10-26 — commit `cf89710`

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
