import type { Content } from '@outlaw/data';
import type { BattleSetup, HeroBuild, Side } from '@outlaw/engine';
import { compilePlayerTeam, toBattleRules } from '@outlaw/net';
import { randomBuild } from './builds';
import { average, type Policy } from './policy';
import { createRng } from './rng';
import { sampleTeams } from './rules';
import { runBattle } from './run';

/**
 * Mesure d'équilibrage du PVP (pnpm sim:pvp). Rien n'est appliqué : le rapport mesure et propose.
 *
 * Deux séries de combats, toutes à graines fixes (deux exécutions donnent le même rapport) :
 *  - miroir : la même composition de `teamSize` héros, avec les mêmes builds, des deux côtés. La seule
 *    différence est la priorité : l'écart du premier joueur (cible 50 % ± 3) est le gain de jouer
 *    en premier ;
 *  - croisée : deux compositions différentes, dans les deux sens, pour que la priorité s'annule.
 *    Le taux de victoire d'un héros est celui des combats où il se trouve dans un seul camp.
 *
 * Les deux camps sont joués par la politique « joueur moyen » de policy.ts, chacun avec sa propre
 * graine. Les règles du salon sont celles de @outlaw/net : limite d'actions départagée au ratio de PV.
 * Les héros n'ont pas d'objet : la mesure porte sur les héros et leurs talents.
 */

/** Premier joueur : cible de taux de victoire et tolérance (en part, soit 3 points). */
export const FIRST_PLAYER_TARGET = 0.5;
export const FIRST_PLAYER_TOLERANCE = 0.03;
/** Durée visée d'un combat, en actions du moteur (tours de toutes les unités). */
export const DURATION_TARGET = { min: 30, max: 60 } as const;
/** Bande indicative du taux de victoire d'un héros (50 % ± 10 points) : au-delà, à surveiller. */
export const HERO_BAND = 0.1;

export interface PvpOptions {
  /** Jeux de builds de la série croisée : chacun joue toutes les paires ordonnées de compositions. */
  readonly samples: number;
  /** Builds tirés au hasard par composition dans la série miroir. */
  readonly mirrorSamples: number;
  /**
   * Compositions mesurées : toutes s'il y en a au plus autant, sinon un échantillon à graine fixe
   * (`sampleTeams` de rules.ts : chaque héros dans à peu près autant d'équipes). 25 héros font
   * 12 650 équipes de quatre, trop pour un rapport de quelques dizaines de secondes.
   */
  readonly teams: number;
  readonly seed: number;
  /** Niveau de tous les héros ; celui du plafond par défaut d'un salon. */
  readonly level: number;
}

export interface HeroPvpRow {
  readonly hero: string;
  /** Combats croisés où le héros est dans un seul camp. */
  readonly battles: number;
  /** Parts de victoire (égalité = ½) dans ces combats. */
  readonly winRate: number;
  /** Combats miroirs où le héros est dans la composition. */
  readonly mirrorBattles: number;
  /** Taux de victoire du premier joueur dans ces combats miroirs. */
  readonly firstPlayerRate: number;
}

export interface PvpReport {
  readonly options: PvpOptions;
  readonly mirror: {
    readonly battles: number;
    /** Parts de victoire du premier joueur (égalité = ½). */
    readonly firstPlayerRate: number;
    readonly draws: number;
    readonly avgActions: number;
    readonly minActions: number;
    readonly maxActions: number;
    /** Part des combats arrêtés par la limite d'actions. */
    readonly limitRate: number;
  };
  readonly cross: {
    readonly battles: number;
    readonly avgActions: number;
    readonly limitRate: number;
  };
  readonly heroes: readonly HeroPvpRow[];
  /** Durée moyenne sur tous les combats mesurés. */
  readonly avgActions: number;
}

/** Résultat d'un combat vu du premier joueur : 1 victoire, 0,5 égalité, 0 défaite. */
function firstPlayerShare(winner: Side | null): number {
  if (winner === null) return 0.5;
  return winner === 'player' ? 1 : 0;
}

/** Combat entre deux équipes de builds : P1 est le camp « player » et joue en premier à égalité. */
function playMatch(
  content: Content,
  p1: readonly HeroBuild[],
  p2: readonly HeroBuild[],
  seed: number,
) {
  const setup: BattleSetup = {
    units: [...compilePlayerTeam(content, p1, 'p1'), ...compilePlayerTeam(content, p2, 'p2')],
    rules: toBattleRules('player'),
  };
  const first = average(seed * 2 + 1);
  const second = average(seed * 2 + 2);
  // Chaque camp a sa politique et sa graine : le miroir reste équitable en moyenne.
  const policy: Policy = (state) =>
    state.units.find((unit) => unit.def.id === state.active)?.def.side === 'player'
      ? first(state)
      : second(state);
  return runBattle(setup, content.balance, policy);
}

interface Tally {
  battles: number;
  share: number;
  mirrorBattles: number;
  mirrorShare: number;
}

export function evaluatePvp(content: Content, options: PvpOptions): PvpReport {
  const compositions = sampleTeams(content, options.teams, options.seed);
  const tally = new Map<string, Tally>(
    content.heroes.map((hero) => [
      hero.id,
      { battles: 0, share: 0, mirrorBattles: 0, mirrorShare: 0 },
    ]),
  );
  const at = (hero: string): Tally => {
    const entry = tally.get(hero);
    if (entry === undefined) throw new Error(`héros inconnu : ${hero}`);
    return entry;
  };

  let fight = 0;
  const mirror = { battles: 0, share: 0, draws: 0, actions: 0, min: Infinity, max: 0, limit: 0 };
  const cross = { battles: 0, actions: 0, limit: 0 };

  // Série miroir : chaque composition affronte son double, builds tirés au hasard à chaque échantillon.
  const mirrorRng = createRng(options.seed);
  for (const composition of compositions) {
    for (let sample = 0; sample < options.mirrorSamples; sample++) {
      const builds = composition.map((hero) =>
        randomBuild(content, hero, options.level, mirrorRng),
      );
      const outcome = playMatch(content, builds, builds, options.seed * 100_003 + fight++);
      const share = firstPlayerShare(outcome.result.winner);
      mirror.battles++;
      mirror.share += share;
      mirror.actions += outcome.actions;
      mirror.min = Math.min(mirror.min, outcome.actions);
      mirror.max = Math.max(mirror.max, outcome.actions);
      if (outcome.result.winner === null) mirror.draws++;
      if (outcome.result.reason === 'action_limit') mirror.limit++;
      for (const hero of composition) {
        const entry = at(hero);
        entry.mirrorBattles++;
        entry.mirrorShare += share;
      }
    }
  }

  // Série croisée : un jeu de builds par échantillon, partagé par toutes les compositions, joué dans
  // les deux sens pour chaque paire (le premier camp change, la priorité s'annule).
  const crossRng = createRng(options.seed + 7919);
  for (let sample = 0; sample < options.samples; sample++) {
    const builds = new Map(
      content.heroes.map((hero) => [
        hero.id,
        randomBuild(content, hero.id, options.level, crossRng),
      ]),
    );
    const buildsOf = (composition: readonly string[]): HeroBuild[] =>
      composition.map((hero) => {
        const build = builds.get(hero);
        if (build === undefined) throw new Error(`build manquant : ${hero}`);
        return build;
      });
    for (const x of compositions) {
      for (const y of compositions) {
        if (x === y) continue;
        const onlyX = x.filter((hero) => !y.includes(hero));
        const onlyY = y.filter((hero) => !x.includes(hero));
        const outcome = playMatch(
          content,
          buildsOf(x),
          buildsOf(y),
          options.seed * 100_003 + fight++,
        );
        const share = firstPlayerShare(outcome.result.winner);
        cross.battles++;
        cross.actions += outcome.actions;
        if (outcome.result.reason === 'action_limit') cross.limit++;
        for (const hero of onlyX) {
          const entry = at(hero);
          entry.battles++;
          entry.share += share;
        }
        for (const hero of onlyY) {
          const entry = at(hero);
          entry.battles++;
          entry.share += 1 - share;
        }
      }
    }
  }

  const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);
  const all = mirror.battles + cross.battles;
  return {
    options,
    mirror: {
      battles: mirror.battles,
      firstPlayerRate: ratio(mirror.share, mirror.battles),
      draws: mirror.draws,
      avgActions: ratio(mirror.actions, mirror.battles),
      minActions: mirror.battles === 0 ? 0 : mirror.min,
      maxActions: mirror.max,
      limitRate: ratio(mirror.limit, mirror.battles),
    },
    cross: {
      battles: cross.battles,
      avgActions: ratio(cross.actions, cross.battles),
      limitRate: ratio(cross.limit, cross.battles),
    },
    heroes: content.heroes.map((hero) => {
      const entry = at(hero.id);
      return {
        hero: hero.id,
        battles: entry.battles,
        winRate: ratio(entry.share, entry.battles),
        mirrorBattles: entry.mirrorBattles,
        firstPlayerRate: ratio(entry.mirrorShare, entry.mirrorBattles),
      };
    }),
    avgActions: ratio(mirror.actions + cross.actions, all),
  };
}

const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;

/** Les mesures hors cible, chacune avec une piste d'ajustement. Propositions seulement : rien n'est appliqué. */
export function proposals(report: PvpReport): string[] {
  const result: string[] = [];
  const { firstPlayerRate } = report.mirror;
  if (Math.abs(firstPlayerRate - FIRST_PLAYER_TARGET) > FIRST_PLAYER_TOLERANCE) {
    const firstAhead = firstPlayerRate > FIRST_PLAYER_TARGET;
    result.push(
      `Priorité : le premier joueur gagne ${percent(firstPlayerRate)} des miroirs (cible ${percent(FIRST_PLAYER_TARGET)} ± ${FIRST_PLAYER_TOLERANCE * 100} points), le ${firstAhead ? 'premier' : 'second'} est avantagé. ` +
        (firstAhead
          ? 'Piste : compenser le second joueur (un point d’équipe de départ, ou un premier tour légèrement avancé).'
          : 'Piste : l’avantage du second vient de la réponse au premier coup ; départager autrement les égalités ou donner un point d’équipe au premier.'),
    );
  }
  if (report.avgActions < DURATION_TARGET.min || report.avgActions > DURATION_TARGET.max) {
    result.push(
      `Durée : ${report.avgActions.toFixed(1)} actions en moyenne (cible ${DURATION_TARGET.min} à ${DURATION_TARGET.max}). ` +
        (report.avgActions > DURATION_TARGET.max
          ? 'Piste : plus de dégâts (ou moins de PV et de boucliers) en PVP, ou une limite d’actions plus basse.'
          : 'Piste : moins de dégâts (ou plus de PV) en PVP, ou une limite d’actions plus haute.'),
    );
  }
  for (const row of report.heroes) {
    if (Math.abs(row.winRate - 0.5) > HERO_BAND) {
      result.push(
        `${row.hero} : ${percent(row.winRate)} de victoires en croisé (bande indicative 50 % ± ${HERO_BAND * 100} points). ` +
          (row.winRate > 0.5
            ? 'Piste : réduire un de ses coefficients de dégâts ou de soin, ou allonger un de ses délais.'
            : 'Piste : augmenter un de ses coefficients, ou raccourcir un de ses délais.'),
      );
    }
  }
  return result;
}

/** Rapport lisible, une ligne par mesure. */
export function formatReport(report: PvpReport): string {
  const { mirror, cross } = report;
  const lines = [
    `PVP : ${mirror.battles} combats miroirs (${report.options.mirrorSamples} par composition) sur ${String(report.options.teams)} compositions au plus, et ${cross.battles} croisés (${report.options.samples} jeu(x) de builds), niveau ${report.options.level}, graine ${report.options.seed}`,
    '',
    `Miroir : premier joueur ${percent(mirror.firstPlayerRate)} (cible ${percent(FIRST_PLAYER_TARGET)} ± ${FIRST_PLAYER_TOLERANCE * 100} points), ${mirror.draws} égalité(s)`,
    `Durée (actions du moteur) : miroir ${mirror.avgActions.toFixed(1)} [${mirror.minActions} à ${mirror.maxActions}], croisé ${cross.avgActions.toFixed(1)}, ensemble ${report.avgActions.toFixed(1)}, soit environ ${(report.avgActions / 2).toFixed(1)} par joueur (cible ${DURATION_TARGET.min} à ${DURATION_TARGET.max})`,
    `Limite d’actions atteinte : miroir ${percent(mirror.limitRate)}, croisé ${percent(cross.limitRate)}`,
    '',
    'Héros          victoires (croisé)   premier joueur (miroir)',
    ...report.heroes.map(
      (row) =>
        `${row.hero.padEnd(14)} ${percent(row.winRate).padStart(9)}  (${String(row.battles).padStart(5)})   ${percent(row.firstPlayerRate).padStart(9)}  (${String(row.mirrorBattles).padStart(5)})`,
    ),
  ];
  const out = proposals(report);
  lines.push('');
  if (out.length === 0) lines.push('Toutes les mesures sont dans la cible.');
  else {
    lines.push('Hors cible, propositions (rien n’est appliqué) :');
    for (const line of out) lines.push(`  - ${line}`);
  }
  return lines.join('\n') + '\n';
}
