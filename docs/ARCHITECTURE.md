# Architecture

## Principe

```
packages/data ──(contenu validé)──▶ packages/engine ──(état + journal)──▶ apps/web
      ▲                                    ▲
      └──────────── tools/sim ─────────────┘   (joue des milliers de combats, mesure R1/R2)
```

- **Le moteur est une fonction pure** : `(état, action) → (nouvel état, journal d'événements)`.
  Pas de DOM, pas d'horloge, pas de hasard ; ESLint interdit `Math.random`, `Date`, `window`,
  `localStorage`… dans `packages/engine/src`. Un pas ne modifie jamais l'état reçu (testé sur un
  état gelé).
- **L'interface ne calcule rien** : elle affiche l'état et rejoue le journal pour animer.
- **Le contenu est du JSON validé par Zod** au chargement (`loadContent()`), y compris les
  références croisées. Aucun appel réseau à l'exécution : tout est embarqué dans le build.
- **Tous les paramètres d'équilibrage** sont dans `packages/data/balance.json`.

## Moteur de combat (`packages/engine`)

| Fichier       | Rôle                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `types.ts`    | `UnitDef` (unité compilée, immuable), `BattleState`, `Action`, `BattleEvent` |
| `battle.ts`   | `createBattle`, `step`, `legalActions`, `replay`, validation de la config    |
| `effects.ts`  | les 8 briques d'effet, bouclier et altérations                               |
| `triggers.ts` | déclencheurs : signaux de l'action, filtres, limites, pas de chaîne          |
| `compile.ts`  | héros + niveau + talents + objets → unité ; ennemis ; modificateurs          |
| `targets.ts`  | résolution des cibles des briques et des règles de cible des scripts         |
| `queue.ts`    | ordre des tours et file d'initiative projetée                                |
| `stats.ts`    | stats par niveau, délais, triangle des éléments, VIT plafonnée               |
| `draft.ts`    | copie de travail d'un pas, réserve de points, fin de combat                  |

### Déroulement

1. `createBattle(setup, balance)` valide la configuration, place chaque unité à
   `délai initial × 100 ÷ VIT`, puis joue les tours scriptés jusqu'au premier tour d'une unité
   pilotée, qui devient `state.active`.
2. `step(state, action)` vérifie l'action (tour, sort connu, points suffisants, cible valide),
   la résout, puis fait de même jusqu'au tour piloté suivant ou à la fin du combat.
3. `legalActions(state)` liste les actions possibles ; `projectQueue(state)` donne les 8
   prochains tours (actions futures supposées être l'attaque de base).
4. `replay(setup, balance, actions)` reconstruit exactement le même journal.

### Règles de temps

Le temps est entier, en centièmes d'unité (`TIME_SCALE = 100`) : prochain tour = maintenant +
délai × 100 ÷ VIT. À instant égal : héros avant ennemis, puis emplacement croissant.

### Points d'équipe

Une réserve par camp (départ 3, plafond 6). Seules les unités pilotées l'utilisent ; un ennemi
scripté suit son script affiché sans dépenser ni gagner. La réserve ennemie sert aux duels miroirs
de la simulation (règle R1).

### Journal

`battle_start`, `turn_start`, `turn_skipped`, `cast`, `trigger_fired`, `damage`, `heal`,
`shield`, `tempo`, `stat_mod`, `status`, `trigger_added`, `points`, `expired`, `unit_down`,
`turn_end`, `battle_end`. Un événement `points` n'est émis que si la réserve change réellement ;
un soin nul n'est pas émis. `enemyIntent(state, id)` donne l'action annoncée d'un ennemi.

### Tour d'une unité

1. Début : brûlure, déclencheurs `turn_start` ; une unité étourdie saute son tour.
2. Action : coût et gain de points, délai, briques dans l'ordre, puis déclencheurs.
3. Fin : les durées du porteur s'usent, déclencheurs `turn_end`.

## Données (`packages/data`)

`src/schemas/` contient un fichier par type ; `src/content.ts` assemble et contrôle les références
(identifiants uniques, ennemis et objets cités existants, boss uniquement au dernier combat…).
Voir [`CONTENT.md`](CONTENT.md).

## Simulation (`tools/sim`)

Politique gloutonne déterministe ; sortie CSV stable. `pnpm sim:check` compare à
`tools/sim/baseline.csv` en CI : tout changement de règle ou d'équilibrage doit être assumé en
mettant la référence à jour dans le même commit.
`pnpm sim:pvp` mesure l'équilibrage du PvP (priorité, durée, héros) sans rien appliquer.

## PVP (`packages/net`)

Protocole et logique de salon du mode PvP, en fonctions pures (aucun Cloudflare, aucun DOM) : le
futur Durable Object n'aura qu'à expédier les messages, stocker le salon et programmer l'alarme.
Voir [`PVP.md`](PVP.md).

## Interface (`apps/web`)

| Fichier               | Rôle                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `combat/session.ts`   | contenu chargé au démarrage, rencontre d'essai                           |
| `combat/useBattle.ts` | état du moteur + vue rejouée événement par événement                     |
| `combat/view.ts`      | vue d'un état, application d'un événement (valeurs déjà dans le journal) |
| `combat/log.ts`       | phrase française par événement                                           |
| `combat/*.tsx`        | ligne de temps, cartes d'unité, barre d'action, résultat                 |
| `i18n/fr.json`        | textes de l'interface ; `content.fr.json` : noms et thèses du contenu    |
| `i18n/describe.ts`    | descriptions des sorts et passifs générées depuis leurs briques          |

Après chaque action, l'interface reçoit le nouvel état et le journal. Elle rejoue le journal pour
animer (chaque événement porte ses valeurs finales : PV restants, total de bouclier, réserve), puis
se recale sur l'état du moteur. Un test vérifie que le rejeu complet tombe exactement sur l'état.
Mouvement réduit : le journal est appliqué d'un coup. File, actions possibles et intentions viennent
du moteur (`projectQueue`, `legalActions`, `enemyIntent`).

## Progression

Le profil (`packages/data/src/schemas/profile.ts`) est une donnée validée par Zod. Toute
modification passe par une fonction pure du moteur (`takeTalent`, `respec`, `equip`,
`upgradeItem`, `setTeam`, `completeDungeon`…) qui renvoie le nouveau profil ou un refus motivé
(`not_enough_gold`, `talent_invalid`…), affiché tel quel par l'interface. Le profil est sauvegardé
après chaque changement.
