import {
  compileEncounter,
  compileTeam,
  completeTower,
  enterTower,
  heroBuild,
  towerFloor,
  type TowerReport,
} from '@outlaw/engine';
import { useEffect, useRef, useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { Countdown } from '../game/Countdown';
import { useEscape } from '../game/keys';
import { useGame } from '../game/nav';
import { useOptions } from '../game/options';
import { Button, Icon } from '../game/ui';
import { dustName, names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { ChestArt } from './Chests';
import { Backdrop, Card, RunEnd } from './Rewards';

/** Décor d'un étage : celui d'un donjon de son élément ; le trône creux pour les boss. */
const SCENES = { fire: 'obsidian_pass', water: 'sunken_spire', nature: 'verdant_crown' } as const;

type Phase =
  | { readonly kind: 'fight' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'tested' }
  | {
      readonly kind: 'done';
      readonly report: TowerReport;
      /** Le moteur accepte l'entrée à l'étage suivant : bouton et enchaînement Auto. */
      readonly canClimb: boolean;
    };

/**
 * Un étage de la tour : un seul combat (ennemis, niveau et modificateur de l'étage), puis le
 * bilan. Une défaite renvoie à la tour sans pénalité. En mode Auto, si le joueur l'a choisi
 * (`towerClimb`), le bilan enchaîne sur l'étage suivant après un décompte : une navigation.
 */
export function TowerRun({ floor }: { readonly floor: number }) {
  const { go } = useGame();
  const { profile, replace } = useProfile();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight' });
  const [run, setRun] = useState(0);
  const f = towerFloor(content, floor);
  // L'équipe est figée à l'entrée de l'étage (l'écran est remonté à chaque étage).
  const [heroes] = useState(() =>
    compileTeam(
      content,
      profile.team.map((id) => heroBuild(profile, id)),
      'player',
      f?.modifier,
    ),
  );
  const back = (): void => {
    go({ name: 'tower', floor });
  };
  if (f === null) return null;
  const scene = f.boss ? 'hollow_throne' : SCENES[f.element];

  if (phase.kind === 'done')
    return <TowerEnd report={phase.report} canClimb={phase.canClimb} scene={scene} />;
  if (phase.kind === 'failed' || phase.kind === 'tested') {
    const failed = phase.kind === 'failed';
    return (
      <RunEnd
        scene={scene}
        title={failed ? t('tower.failed', { n: floor }) : t('tower.done', { n: floor })}
        text={failed ? t('tower.failed.text') : t('tower.tested.text')}
        retryLabel={t('tower.retry')}
        backLabel={t('tower.back')}
        onRetry={() => {
          setRun((n) => n + 1);
          setPhase({ kind: 'fight' });
        }}
        onBack={back}
      />
    );
  }

  const setup = {
    units: [
      ...heroes,
      ...compileEncounter(content, f.enemies, f.level, f.modifier, f.hpPct, f.atkPct),
    ],
  };
  return (
    <CombatScreen
      key={run}
      setup={setup}
      title={t('tower.run', { n: floor })}
      scene={scene}
      onExit={back}
      finish={{
        label: (won) => (won ? t('run.claim') : t('tower.back')),
        onClick: (won) => {
          if (!won) {
            setPhase({ kind: 'failed' });
            return;
          }
          if (profile.testMode) {
            setPhase({ kind: 'tested' });
            return;
          }
          const outcome = completeTower(content, profile, floor);
          if (!outcome.ok) {
            back();
            return;
          }
          const { profile: after, report } = outcome.value;
          replace(after);
          const next = report.next;
          setPhase({
            kind: 'done',
            report,
            canClimb: next !== null && enterTower(content, after, next, Date.now()).ok,
          });
        },
        last: true,
      }}
    />
  );
}

/** Bilan d'un étage gagné : poussière, fragments, coffre ; étage suivant ou retour à la tour. */
function TowerEnd({
  report,
  canClimb,
  scene,
}: {
  readonly report: TowerReport;
  readonly canClimb: boolean;
  readonly scene: string;
}) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const { options } = useOptions();
  const heading = useRef<HTMLHeadingElement>(null);
  const back = (): void => {
    go({ name: 'tower', floor: report.floor });
  };
  useEscape(back);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const next = report.next;
  const climb = (): void => {
    if (next !== null && apply(enterTower(content, profile, next, Date.now())))
      go({ name: 'tower_run', floor: next });
  };
  // Fragments regroupés par héros : « Pyra ×2 ».
  const counts = new Map<string, number>();
  for (const hero of report.fragments) counts.set(hero, (counts.get(hero) ?? 0) + 1);
  let index = 0;

  return (
    <main className="end end--rewards">
      <Backdrop scene={scene} />
      <h1 ref={heading} tabIndex={-1} className="end__title">
        {t('tower.done', { n: report.floor })}
      </h1>
      <p className="end__text">
        {report.firstClear ? t('tower.done.first') : t('tower.done.replay')}{' '}
        {next === null && report.firstClear && <strong>{t('tower.done.summit')}</strong>}
      </p>
      {report.firstClear && (
        <ul className="reward-cards" aria-label={t('reward.cards')}>
          <Card index={index++} title={t('reward.materialsCard')}>
            <Icon name="points" size={36} />
            <p className="reward-card__big">
              {t('reward.materials', {
                amount: report.materials.amount,
                dust: dustName(report.materials.tier),
              })}
            </p>
          </Card>
          {counts.size > 0 && (
            <Card index={index++} title={t('tower.done.fragments')}>
              <ul className="tower__fragments">
                {[...counts].map(([hero, n]) => (
                  <li key={hero}>
                    <Portrait kind={hero} size={32} />
                    {names.hero(hero)} ×{n}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {report.chest !== null && (
            <Card index={index++} className="reward-card--chest" title={t('reward.chestCard')}>
              <ChestArt tier={report.chest} />
              <h2 className="reward-card__name">
                {t('reward.chest', { tier: tk(`chest.tier.${report.chest}`) })}
              </h2>
            </Card>
          )}
        </ul>
      )}
      <div className="outcome__buttons end__go">
        <Button size="large" variant="quiet" onClick={back}>
          {t('tower.back')}
        </Button>
        {canClimb && (
          <Button size="large" onClick={climb}>
            {t('tower.next')} ▶
          </Button>
        )}
        <Countdown
          enabled={options.auto && options.towerClimb && canClimb}
          text={(s) => t('tower.auto.next', { s })}
          onDone={climb}
        />
      </div>
    </main>
  );
}
