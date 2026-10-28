import {
  compileEncounter,
  compileTeam,
  completeEssence,
  enterEssence,
  essenceDungeon,
  essenceEncounter,
  heroBuild,
  tierNumeral,
  type EssenceReport,
} from '@outlaw/engine';
import { useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { essenceAmount, essenceStock } from './Essences';
import { RunEnd } from './Rewards';

type Phase =
  | { readonly kind: 'fight'; readonly room: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'tested' }
  | { readonly kind: 'done'; readonly report: EssenceReport };

/**
 * Un sanctuaire d'essence à un palier : trois combats d'affilée comme un donjon, puis les essences
 * gagnées. Une défaite renvoie aux sanctuaires sans pénalité ; « Rejouer » relance le même palier.
 */
export function EssenceRun({ id, tier }: { readonly id: string; readonly tier: number }) {
  const { go } = useGame();
  const { profile, apply, replace } = useProfile();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight', room: 0 });
  const dungeon = essenceDungeon(content, id);
  // L'équipe est figée à l'entrée ; un nouveau passage la recompile (`run`).
  const [teams, setTeams] = useState(() => ({
    run: 0,
    heroes: compileTeam(
      content,
      profile.team.map((hero) => heroBuild(profile, hero)),
    ),
  }));
  const back = (): void => {
    go({ name: 'essences', dungeon: id });
  };
  if (dungeon === undefined) return null;
  const base = tk(`essence.name.${dungeon.element}`);
  const name = tier > 1 ? t('tier.short', { dungeon: base, tier: tierNumeral(tier) }) : base;
  const restart = (): void => {
    if (!apply(enterEssence(content, profile, id, tier, Date.now()))) return;
    setTeams((current) => ({
      run: current.run + 1,
      heroes: compileTeam(
        content,
        profile.team.map((hero) => heroBuild(profile, hero)),
      ),
    }));
    setPhase({ kind: 'fight', room: 0 });
  };

  if (phase.kind === 'done') {
    const { report } = phase;
    return (
      <RunEnd
        scene={dungeon.scene}
        title={t('essence.done')}
        text={`${t('essence.done.text', {
          amount: essenceAmount(report.element, report.quality, report.amount),
          stock: essenceStock(profile, report.element),
        })}${report.firstClear ? ` ${t('essence.done.first')}` : ''}`}
        retryLabel={t('essence.again')}
        backLabel={t('essence.back')}
        onRetry={restart}
        onBack={back}
      />
    );
  }
  if (phase.kind === 'failed' || phase.kind === 'tested') {
    const failed = phase.kind === 'failed';
    return (
      <RunEnd
        scene={dungeon.scene}
        title={failed ? t('essence.failed', { dungeon: name }) : t('test.done', { dungeon: name })}
        text={failed ? t('essence.failed.text') : t('essence.tested.text')}
        backLabel={t('essence.back')}
        onRetry={restart}
        onBack={back}
      />
    );
  }

  const encounter = essenceEncounter(content, dungeon, tier, phase.room);
  if (encounter === null) return null;
  const setup = {
    units: [
      ...teams.heroes,
      ...compileEncounter(
        content,
        encounter.enemies,
        encounter.level,
        undefined,
        encounter.hpPct,
        encounter.atkPct,
      ),
    ],
  };
  const last = phase.room === dungeon.encounters.length - 1;

  return (
    <CombatScreen
      key={`${String(teams.run)}-${String(phase.room)}`}
      setup={setup}
      title={t('essence.run', { dungeon: name, n: phase.room + 1 })}
      scene={dungeon.scene}
      onExit={back}
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
          if (profile.testMode) {
            setPhase({ kind: 'tested' });
            return;
          }
          const outcome = completeEssence(content, profile, id, tier);
          if (!outcome.ok) {
            back();
            return;
          }
          replace(outcome.value.profile);
          setPhase({ kind: 'done', report: outcome.value.report });
        },
        last,
      }}
    />
  );
}
