# Outlaw Thesis — repères pour Claude Code

RPG tactique au tour par tour dans le navigateur. Monorepo pnpm, Node ≥ 22.12, TypeScript strict.
Textes du jeu et de la doc en français.

## Carte

- `packages/engine` : moteur pur, `(état, action) → (nouvel état, journal)`. Aucune logique de jeu ailleurs.
- `packages/data` : schémas Zod, `balance.json`, contenu JSON (héros, ennemis, objets, donjons).
- `apps/web` : React + Vite, rejoue le journal du moteur, ne calcule rien. Budget 300 Kio gzip.
- `apps/api` : Worker Cloudflare (comptes, D1). `tools/sim` : simulation d'équilibrage. `tools/art` : pixel art (Python).
- Doc : `docs/ARCHITECTURE.md` (où est quoi), `docs/DECISIONS.md` (tranché, ne pas rouvrir),
  `docs/BALANCE.md` (cibles chiffrées), `docs/CONTENT.md` (ajouter du contenu), `PROGRESS.md`, `CHANGELOG.md`.

## Commandes

`pnpm verify` = la CI (lint, format, types, tests, sim:check, build, taille, e2e) ; `pnpm verify:fast` sans e2e.
Avant un e2e : `pnpm build` (il sert `dist/`). Sprites : `python3 tools/art/export.py` puis
`pnpm exec prettier --write apps/web/src/art`.

## Interdits

- `tools/sim/baseline.csv` et `pnpm sim --update` : seulement sur décision explicite du propriétaire.
- Pas de `skip`, `eslint-disable`, seuil de couverture baissé (moteur ≥ 90 % branches) pour faire passer la CI.
- Jamais de push sur `main`, jamais de force-push, jamais de fusion sans accord du propriétaire.
- Pas de nouvelle dépendance npm sans la justifier.

## Pièges connus

- ESLint refuse `setState` directement dans le corps d'un effet et les conditions inutiles.
- Le cache vitest (`node_modules/.vitest-cache`) peut être périmé : le supprimer.
- `useOptions()` hors `OptionsProvider` ne se rerend pas : envelopper les tests.
- Éditer les JSON de contenu textuellement (un re-dump change tout le fichier).
