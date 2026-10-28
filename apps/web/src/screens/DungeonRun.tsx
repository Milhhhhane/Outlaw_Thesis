import {
  compileEncounter,
  compileTeam,
  completeDungeon,
  farmTarget,
  heroBuild,
  seriesNext,
  summarizeSeries,
  tierEncounterPct,
  tierLevel,
  type DungeonReport,
  type FarmRuns,
  type SeriesStop,
} from '@outlaw/engine';
import { useMemo, useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { content } from '../combat/session';
import { useOptions } from '../game/options';
import { dungeonTitle, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { Recap } from './Recap';
import { Rewards, RunEnd } from './Rewards';

/** Pourquoi une série s'arrête : d'elle-même (moteur), sur défaite, ou par le joueur. */
export type SeriesEnd = SeriesStop | 'defeat' | 'player';

/** Phrase d'arrêt d'une série (une raison sans texte dédié dit « entrée refusée »). */
export function stopText(stop: SeriesEnd): string {
  const key = `farm.stop.${stop}`;
  const text = tk(key);
  return text === key ? t('farm.stop.refused') : text;
}

type Phase =
  | { readonly kind: 'fight'; readonly room: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'tested' }
  | {
      readonly kind: 'done';
      readonly report: DungeonReport;
      /** Série : raison de s'arrêter après ce passage, ou null pour continuer. */
      readonly stop: SeriesStop | null;
    }
  | { readonly kind: 'recap'; readonly stop: SeriesEnd };

/**
 * Un donjon à un palier : 3 combats d'affilée (PV et réserve remis à zéro à chaque combat),
 * ennemis au niveau et à l'échelle du palier, modificateur appliqué aux deux camps, récompenses
 * à la fin. Une défaite renvoie au camp sans pénalité. En mode Auto, chaque salle gagnée ouvre la
 * suivante après un décompte : l'enchaînement n'est qu'une navigation.
 *
 * Série (`runs` > 1) : les récompenses relancent le même donjon (même palier, même équipe) jusqu'au
 * nombre de passages choisi, à une défaite, quand le moteur refuse l'entrée (énergie) ou quand le
 * joueur s'arrête ; un bilan additionne alors les rapports du moteur.
 */
export function DungeonRun({
  dungeonId,
  tier,
  runs = 1,
  onExit,
}: {
  readonly dungeonId: string;
  readonly tier: number;
  readonly runs?: FarmRuns;
  readonly onExit: () => void;
}) {
  const { profile, replace } = useProfile();
  const { options } = useOptions();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight', room: 0 });
  // Passages visés, fixés à l'entrée (null : jusqu'à l'arrêt) ; rapports des passages gagnés.
  const [target] = useState(() =>
    profile.testMode ? 1 : farmTarget(content, profile, runs, Date.now()),
  );
  const series = target === null || target > 1;
  const [reports, setReports] = useState<readonly DungeonReport[]>([]);
  const [losses, setLosses] = useState(0);
  // Chaque passage recompile l'équipe : après des récompenses, les héros ont pu monter de niveau.
  const [run, setRun] = useState(0);
  const restart = (): void => {
    setRun((n) => n + 1);
    setPhase({ kind: 'fight', room: 0 });
  };
  const restartSeries = (): void => {
    setReports([]);
    setLosses(0);
    restart();
  };
  const toRecap = (stop: SeriesEnd): void => {
    setPhase({ kind: 'recap', stop });
  };
  const pass = (k: number): string =>
    target === null ? t('farm.pass.open', { k }) : t('farm.pass', { k, n: target });
  // Quitter en cours de série (pause) : le bilan de ce qui a été gagné, sinon le camp.
  const leave = (): void => {
    if (series && reports.length > 0) toRecap('player');
    else onExit();
  };
  const dungeon = content.dungeonById.get(dungeonId);
  // L'équipe est figée à l'entrée : la compiler une fois suffit.
  const heroes = useMemo(
    () =>
      compileTeam(
        content,
        profile.team.map((id) => heroBuild(profile, id)),
        'player',
        dungeon?.modifier,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- figée à l'entrée de chaque passage
    [dungeonId, run],
  );
  if (dungeon === undefined) return null;
  const name = dungeonTitle(dungeonId, tier);

  if (phase.kind === 'recap') {
    return (
      <Recap
        dungeonId={dungeonId}
        tier={tier}
        summary={summarizeSeries(reports, losses)}
        stop={stopText(phase.stop)}
        onBack={onExit}
        onAgain={restartSeries}
      />
    );
  }
  if (phase.kind === 'done') {
    const { stop } = phase;
    return (
      <Rewards
        report={phase.report}
        onContinue={
          series
            ? () => {
                toRecap(stop ?? 'player');
              }
            : onExit
        }
        onReplay={restart}
        series={
          series
            ? {
                progress: t('farm.progress', { pass: pass(reports.length) }),
                next: stop === null ? restart : null,
                nextPass: reports.length + 1,
                stop: stop === null ? null : stopText(stop),
                auto: options.auto,
              }
            : undefined
        }
      />
    );
  }
  if (phase.kind === 'failed' || phase.kind === 'tested') {
    const failed = phase.kind === 'failed';
    return (
      <RunEnd
        scene={dungeon.scene ?? dungeonId}
        title={failed ? t('run.failed', { dungeon: name }) : t('test.done', { dungeon: name })}
        text={failed ? t('run.failed.text') : t('test.done.text')}
        onRetry={restart}
        onBack={onExit}
      />
    );
  }

  const encounter = dungeon.encounters[phase.room];
  if (encounter === undefined) return null;
  const pct = tierEncounterPct(content, tier, encounter.hpPct, encounter.atkPct);
  const setup = {
    units: [
      ...heroes,
      ...compileEncounter(
        content,
        encounter.enemies,
        tierLevel(content, dungeon, tier),
        dungeon.modifier,
        pct.hpPct,
        pct.atkPct,
      ),
    ],
  };
  const last = phase.room === dungeon.encounters.length - 1;
  const room = t('run.room', { dungeon: name, n: phase.room + 1 });

  return (
    <CombatScreen
      key={`${run}-${phase.room}`}
      setup={setup}
      title={room}
      pass={series ? pass(reports.length + 1) : undefined}
      scene={dungeon.scene ?? dungeonId}
      onExit={leave}
      finish={{
        label: (won) => (!won ? t('run.back') : last ? t('run.claim') : t('run.next')),
        onClick: (won) => {
          if (!won) {
            if (series) {
              setLosses((n) => n + 1);
              toRecap('defeat');
            } else {
              setPhase({ kind: 'failed' });
            }
            return;
          }
          if (!last) {
            setPhase({ kind: 'fight', room: phase.room + 1 });
            return;
          }
          // Mode test : rien n'est gagné, on propose de recommencer.
          if (profile.testMode) {
            setPhase({ kind: 'tested' });
            return;
          }
          const outcome = completeDungeon(content, profile, dungeonId, tier);
          if (!outcome.ok) {
            onExit();
            return;
          }
          replace(outcome.value.profile);
          const played = [...reports, outcome.value.report];
          setReports(played);
          setPhase({
            kind: 'done',
            report: outcome.value.report,
            stop: series
              ? seriesNext(
                  content,
                  outcome.value.profile,
                  dungeonId,
                  tier,
                  Date.now(),
                  played.length,
                  target,
                )
              : null,
          });
        },
        last,
      }}
    />
  );
}
