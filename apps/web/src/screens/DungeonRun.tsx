import {
  compileEncounter,
  compileTeam,
  completeDungeon,
  heroBuild,
  type DungeonReport,
} from '@outlaw/engine';
import { useMemo, useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { content } from '../combat/session';
import { names, t } from '../i18n';
import { useProfile } from '../state/profile';
import { Rewards, RunEnd } from './Rewards';

type Phase =
  | { readonly kind: 'fight'; readonly room: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'tested' }
  | { readonly kind: 'done'; readonly report: DungeonReport };

/**
 * Un donjon : 3 combats d'affilée (PV et réserve remis à zéro à chaque combat), modificateur
 * appliqué aux deux camps, récompenses à la fin. Une défaite renvoie au camp sans pénalité.
 */
export function DungeonRun({
  dungeonId,
  onExit,
}: {
  readonly dungeonId: string;
  readonly onExit: () => void;
}) {
  const { profile, replace } = useProfile();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight', room: 0 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- figée à l'entrée du donjon
    [dungeonId],
  );
  if (dungeon === undefined) return null;
  const name = names.dungeon(dungeonId);

  if (phase.kind === 'done') return <Rewards report={phase.report} onContinue={onExit} />;
  if (phase.kind === 'failed' || phase.kind === 'tested') {
    const failed = phase.kind === 'failed';
    return (
      <RunEnd
        scene={dungeonId}
        title={failed ? t('run.failed', { dungeon: name }) : t('test.done', { dungeon: name })}
        text={failed ? t('run.failed.text') : t('test.done.text')}
        onRetry={() => {
          setPhase({ kind: 'fight', room: 0 });
        }}
        onBack={onExit}
      />
    );
  }

  const encounter = dungeon.encounters[phase.room];
  if (encounter === undefined) return null;
  const setup = {
    units: [
      ...heroes,
      ...compileEncounter(content, encounter.enemies, dungeon.recommendedLevel, dungeon.modifier),
    ],
  };
  const last = phase.room === dungeon.encounters.length - 1;

  return (
    <CombatScreen
      key={phase.room}
      setup={setup}
      title={t('run.room', { dungeon: name, n: phase.room + 1 })}
      scene={dungeonId}
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
          const outcome = completeDungeon(content, profile, dungeonId);
          if (!outcome.ok) {
            onExit();
            return;
          }
          replace(outcome.value.profile);
          setPhase({ kind: 'done', report: outcome.value.report });
        },
      }}
    />
  );
}
