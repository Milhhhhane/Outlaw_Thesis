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

Protocole et logique de salon du mode PvP, en fonctions pures (aucun Cloudflare, aucun DOM). Le
Durable Object `PvpRoom` (`apps/api/src/pvp-room.ts`) n'expédie que les messages, stocke le salon et
programme l'alarme ; l'interface est dans `apps/web/src/pvp/`. Voir [`PVP.md`](PVP.md).

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
Mouvement réduit : le journal est appliqué d'un coup.

Animations (`combat/Stage.tsx`, `combat.css`) : la scène lit la vue rejouée et n'en tire que
des classes et des variables CSS (`--dx`/`--dy` de la course, `--ox`/`--oy` du zoom de l'ultime,
`--pace` = facteur de vitesse). Les effets d'une unité (impact, étincelles, chiffre) vivent dans
une couche `.stage__effects` au-dessus des acteurs ; bulle de bouclier et altérations dans l'acteur, pour
suivre sa course. Une animation se relance en alternant deux noms de keyframes (a/b), jamais par
une `key` React sur un conteneur. Sprites d'effets : `tools/art/fx.py`. File, actions possibles et intentions viennent
du moteur (`projectQueue`, `legalActions`, `enemyIntent`).

## Progression

Le profil (`packages/data/src/schemas/profile.ts`) est une donnée validée par Zod. Toute
modification passe par une fonction pure du moteur (`takeTalent`, `respec`, `equip`,
`upgradeItem`, `setTeam`, `completeDungeon`…) qui renvoie le nouveau profil ou un refus motivé
(`not_enough_gold`, `talent_invalid`…), affiché tel quel par l'interface. Le profil est sauvegardé
après chaque changement.

Les coffres sont dans `packages/engine/src/chests.ts` (`openChest`, `summonHero`, `starUp`,
`setFocus`, `summonCost`, `heroWeight`) : mêmes fonctions pures, tirage avec la graine du profil,
pondéré par la rareté des héros. Le plafond de niveau par étoile
est dans `progression.ts` (`levelCap`, `heroStars`, `atStarGate`) ; l'écran est
`apps/web/src/screens/Chests.tsx`.

La montée de niveau est manuelle (`levelUp`, `levelUpMax`, `levelUpCost`, `canLevelUp` dans
`progression.ts`) : `addXp` ne fait que créditer la banque d'XP. Le rythme qui en découle se lit
avec `pnpm --filter @outlaw/sim farm` (`tools/sim/src/farm.ts`).

Le butin est dans `packages/engine/src/loot.ts` (tables pondérées, rangs de maîtrise, paliers de
poussière) et `items.ts` (`upgradeCost`, `upgradeItem`, `dissolveCopies`, `mergeItems`) ; le tirage
lui-même est dans `completeDungeon` (`progression.ts`). Un objet vient d'un seul donjon
(`content.itemOrigin`) et le profil garde un exemplaire par objet avec ses `copies` ; l'atelier est
`apps/web/src/screens/Workshop.tsx` (collection) et la carte affiche taux, maîtrise et pitié.

Les paliers de donjon sont dans `packages/engine/src/tiers.ts` (`tierLevel`, `tierEncounterPct`,
`tierRewardFactor`, `chestOdds`, `rollChest`, `tierReached`, `tierOpen`) : `completeDungeon` et `enterDungeon`
prennent le palier, la carte le choisit et le passe à l'équipe puis à `DungeonRun`. La simulation
les mesure dans `tools/sim/src/tiers.ts` ; l'économie hors combat (jalons, bilan) dans
`tools/sim/src/economy.ts` (`pnpm --filter @outlaw/sim economy`, voir `docs/ECONOMY.md`).

Le combat automatique (`autoAction`, `packages/engine/src/auto.ts`) est une politique pure du
moteur, exportée comme `legalActions` ; l'écran de combat l'appelle quand l'option `auto` est
active (voir `docs/DECISIONS.md`). La simulation la mesure avec `pnpm --filter @outlaw/sim auto`.
L'enchaînement des salles et la relance du donjon en mode Auto sont une navigation différée de
l'interface (`apps/web/src/game/Countdown.tsx`, utilisé par `combat/CombatScreen.tsx` et
`screens/Rewards.tsx`) : le décompte déclenche le bouton de fin existant, rien de plus.

La tour à étages est dans `packages/engine/src/tower.ts` (`towerFloor`, `towerPct`, `towerGear`,
`towerReward`, `towerOpen`, `enterTower`, `completeTower`) : chaque étage est calculé depuis
`balance.tower` et `content.tower` (`packages/data/content/tower.json`, schéma
`schemas/tower.ts`, résolu dans `content.ts`) ; le profil garde `tower.cleared`. Les fragments
sont tirés par `drawFragments` (`chests.ts`, partagé avec `openChest`). Écrans :
`apps/web/src/screens/Tower.tsx` (colonne des étages et fiche) et `TowerRun.tsx` (combat et
bilan, enchaînement Auto par l'option `towerClimb`). Simulation : `tools/sim/src/tower.ts` (règles
en CI) et `pnpm --filter @outlaw/sim tower` (lecture).

### Passer à quatre héros

Le moteur de combat ne dépend plus de 3 pour Auto, mais ces endroits fixent encore la taille
d'équipe à 3 (relevé par recherche dans le code, à contrôler au moment du chantier) :

- Moteur : `battle.ts` (`MAX_UNITS_PER_SIDE`, emplacements 0 à 2, commentaire des emplacements) ;
  la constante vaut pour les deux camps, donc pour les ennemis aussi sauf à la séparer.
  `progression.ts` (`starters.slice(0, 3)`, `setTeam` refuse plus de 3 héros).
- Données : `schemas/profile.ts` (`team` limité à 3), `schemas/dungeons.ts` (3 ennemis par
  rencontre), `save/share.ts` du site (`b.length > 3`).
- Interface : `combat/Stage.tsx` (3 emplacements `SLOTS` ; un 4ᵉ unité retomberait sur le premier
  par le modulo et se superposerait), `screens/Team.tsx` (« trois emplacements »), textes de
  `fr.json` (`refusal.bad_team`, `help.reserve`, `hub.menu.team.hint`).
- Simulation : `pacing.ts`, `scenarios.ts`, `dungeons.ts` (`slice(0, 3)`), `auto.ts`
  (`TEAM_SIZE`), `rules.ts` (les 20 équipes possibles) et leurs tests.
- Équilibre : une quatrième unité change la réserve partagée, la puissance de l'équipe et la
  durée des combats ; `balance.json`, `baseline.csv` (`pnpm sim:check`) et les niveaux conseillés
  sont à recalibrer. La mise en page du combat (initiative, barre d'actions) est à revérifier à
  844 × 390 par l'e2e.
