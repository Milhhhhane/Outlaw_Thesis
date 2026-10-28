import {
  bossFight,
  compileEncounter,
  compileTeam,
  completeBoss,
  damageDealt,
  heroBuild,
  type BossReport,
} from '@outlaw/engine';
import { useEffect, useRef, useState } from 'react';
import { CombatScreen } from '../combat/CombatScreen';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useEscape } from '../game/keys';
import { useGame } from '../game/nav';
import { Button, Icon } from '../game/ui';
import { dustName, names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { formatDamage } from './Boss';
import { ChestArt } from './Chests';
import { Backdrop, Card } from './Rewards';

/** Décor du combat : un donjon de l'élément du boss. */
const SCENES = { fire: 'obsidian_pass', water: 'sunken_spire', nature: 'verdant_crown' } as const;

type Phase =
  | { readonly kind: 'fight' }
  | { readonly kind: 'done'; readonly damage: number; readonly report: BossReport | null };

/**
 * Un combat contre le boss de la semaine (la tentative est prise à l'entrée), puis le bilan :
 * dégâts, meilleur score, paliers atteints et récompenses payées. Les dégâts viennent du journal
 * du combat (`damageDealt`), le score et les paliers de `completeBoss`.
 */
export function BossRun({ difficulty }: { readonly difficulty: number }) {
  const { go } = useGame();
  const { profile, replace } = useProfile();
  const [phase, setPhase] = useState<Phase>({ kind: 'fight' });
  // La semaine et l'équipe sont figées à l'entrée.
  const [now] = useState(() => Date.now());
  const fight = bossFight(content, now, difficulty);
  const [setup] = useState(() =>
    fight === null
      ? null
      : {
          units: [
            ...compileTeam(
              content,
              profile.team.map((id) => heroBuild(profile, id)),
              'player',
            ),
            ...compileEncounter(
              content,
              [fight.enemy],
              fight.level,
              undefined,
              fight.hpPct,
              fight.atkPct,
            ),
          ],
          rules: fight.rules,
        },
  );
  const back = (): void => {
    go({ name: 'boss', difficulty });
  };
  if (fight === null || setup === null) return null;
  const scene = SCENES[fight.element];
  if (phase.kind === 'done')
    return (
      <BossEnd
        damage={phase.damage}
        report={phase.report}
        max={fight.thresholds.length}
        scene={scene}
        onBack={back}
      />
    );

  return (
    <CombatScreen
      setup={setup}
      title={t('boss.run', { n: difficulty })}
      scene={scene}
      onExit={back}
      finish={{
        label: () => t('boss.claim'),
        heading: (journal) => t('boss.result', { n: formatDamage(damageDealt(journal)) }),
        onClick: (_won, journal) => {
          const damage = damageDealt(journal);
          if (profile.testMode) {
            setPhase({ kind: 'done', damage, report: null });
            return;
          }
          const outcome = completeBoss(content, profile, difficulty, damage, Date.now());
          if (!outcome.ok) {
            back();
            return;
          }
          replace(outcome.value.profile);
          setPhase({ kind: 'done', damage, report: outcome.value.report });
        },
        last: true,
      }}
    />
  );
}

/** Bilan : dégâts, meilleur score, paliers atteints et récompenses payées par ce combat. */
function BossEnd({
  damage,
  report,
  max,
  scene,
  onBack,
}: {
  readonly damage: number;
  readonly report: BossReport | null;
  readonly max: number;
  readonly scene: string;
  readonly onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEscape(onBack);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const paid = report?.paid ?? [];
  // Récompenses regroupées : poussière par palier de poussière, fragments par héros, coffres.
  const dust = new Map<number, number>();
  const fragments = new Map<string, number>();
  for (const p of paid) {
    dust.set(p.materials.tier, (dust.get(p.materials.tier) ?? 0) + p.materials.amount);
    for (const hero of p.fragments) fragments.set(hero, (fragments.get(hero) ?? 0) + 1);
  }
  const chests = paid.flatMap((p) => (p.chest === null ? [] : [p.chest]));
  let index = 0;

  return (
    <main className="end end--rewards">
      <Backdrop scene={scene} />
      <h1 ref={heading} tabIndex={-1} className="end__title">
        {t('boss.done', { n: formatDamage(damage) })}
      </h1>
      <p className="end__text">
        {report === null
          ? t('boss.done.tested')
          : [
              report.newBest
                ? t('boss.done.best')
                : t('boss.done.notBest', { n: formatDamage(report.best) }),
              t('boss.done.reached', { n: report.reached, max }),
              paid.length === 0 ? t('boss.done.none') : '',
            ].join(' ')}
      </p>
      {paid.length > 0 && (
        <ul className="reward-cards" aria-label={t('reward.cards')}>
          {[...dust].map(([tier, amount]) => (
            <Card key={`dust-${String(tier)}`} index={index++} title={t('reward.materialsCard')}>
              <Icon name="points" size={36} />
              <p className="reward-card__big">
                {t('reward.materials', { amount, dust: dustName(tier) })}
              </p>
            </Card>
          ))}
          {fragments.size > 0 && (
            <Card index={index++} title={t('boss.done.fragments')}>
              <ul className="tower__fragments">
                {[...fragments].map(([hero, n]) => (
                  <li key={hero}>
                    <Portrait kind={hero} size={32} />
                    {names.hero(hero)} ×{n}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {chests.map((chest, i) => (
            <Card
              key={`chest-${String(i)}`}
              index={index++}
              className="reward-card--chest"
              title={t('reward.chestCard')}
            >
              <ChestArt tier={chest} />
              <h2 className="reward-card__name">
                {t('reward.chest', { tier: tk(`chest.tier.${chest}`) })}
              </h2>
            </Card>
          ))}
        </ul>
      )}
      <div className="outcome__buttons end__go">
        <Button size="large" onClick={onBack}>
          {t('boss.back')}
        </Button>
      </div>
    </main>
  );
}
