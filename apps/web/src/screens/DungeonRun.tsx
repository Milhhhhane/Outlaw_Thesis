import {
  compileEncounter,
  compileTeam,
  completeDungeon,
  enterDungeon,
  heroBuild,
  tierEncounterPct,
  tierLevel,
  type DungeonReport,
} from '@outlaw/engine';
import { useMemo, useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { content } from '../combat/session';
import { useOptions } from '../game/options';
import { dungeonTitle, t } from '../i18n';
import { useProfile } from '../state/profile';
import { Rewards, RunEnd } from './Rewards';

type Phase =
  | { readonly kind: 'fight'; readonly room: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'tested' }
  | {
      readonly kind: 'done';
      readonly report: DungeonReport;
      /** Le moteur accepte une nouvelle entrée (énergie) : Auto peut relancer. */
      readonly canReplay: boolean;
    };

/**
 * Un donjon à un palier : 3 combats d'affilée (PV et réserve remis à zéro à chaque combat),
 * ennemis au niveau et à l'échelle du palier, modificateur appliqué aux deux camps, récompenses
 * à la fin. Une défaite renvoie au camp sans pénalité. En mode Auto, chaque salle gagnée ouvre la
 * suivante après un décompte, et les récompenses relancent le même donjon (même palier, même
 * équipe) : l'enchaînement n'est qu'une navigation.
 */
export function DungeonRun({
  dungeonId,
  tier,
  onExit,
}: {
  readonly dungeonId: string;
  readonly tier: number;
  readonly onExit: () => void;
}) {
  const { profile, replace } = useProfile();
  const { options } = useOptions();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight', room: 0 });
  // Chaque passage recompile l'équipe : après des récompenses, les héros ont pu monter de niveau.
  const [run, setRun] = useState(0);
  const restart = (): void => {
    setRun((n) => n + 1);
    setPhase({ kind: 'fight', room: 0 });
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

  if (phase.kind === 'done') {
    return (
      <Rewards
        report={phase.report}
        onContinue={onExit}
        onReplay={restart}
        autoReplay={options.auto && phase.canReplay}
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

  return (
    <CombatScreen
      key={`${run}-${phase.room}`}
      setup={setup}
      title={t('run.room', { dungeon: name, n: phase.room + 1 })}
      scene={dungeon.scene ?? dungeonId}
      onExit={onExit}
      finish={{
        label: (won) => (!won ? t('run.back') : last ? t('run.claim') : t('run.next')),
        onClick: (won) => {
          if (!won) {
            setPhase({ kind: 'failed' });
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
          setPhase({
            kind: 'done',
            report: outcome.value.report,
            canReplay: enterDungeon(content, outcome.value.profile, dungeonId, Date.now(), tier).ok,
          });
        },
        last,
      }}
    />
  );
}
