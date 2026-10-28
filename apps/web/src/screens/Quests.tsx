import {
  achievementReward,
  achievementStatus,
  bonusReady,
  bonusReward,
  claimAchievement,
  claimBonus,
  claimQuest,
  questReward,
  questStatus,
  resetIn,
  rollQuests,
  type QuestKind,
  type RewardValue,
} from '@outlaw/engine';
import { useEffect, useState } from 'react';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen, Tabs } from '../game/ui';
import { dustName, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import './quests.css';

type Tab = QuestKind | 'achievements';

const HOUR = 3_600_000;

/** « 8 h 12 min » sous la journée, « 4 j 6 h » au-delà. */
function duration(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  if (hours >= 24) return t('quests.time.days', { d: Math.floor(hours / 24), h: hours % 24 });
  return t('quests.time.hours', { h: hours, m: Math.floor((ms % HOUR) / 60_000) });
}

/** Objectif en clair, d'après la mesure et la cible (ajouter une quête n'ajoute aucun texte). */
function goal(metric: string, target: number): string {
  return target === 1
    ? tk(`quests.metric.${metric}.one`)
    : tk(`quests.metric.${metric}`, { n: target });
}

function rewardText(reward: RewardValue): string {
  const parts: string[] = [];
  if (reward.gold > 0) parts.push(t('quests.reward.gold', { n: reward.gold }));
  if (reward.dust.amount > 0)
    parts.push(t('quests.reward.dust', { n: reward.dust.amount, dust: dustName(reward.dust.tier) }));
  if (reward.chest !== null) parts.push(tk(`chest.tier.${reward.chest}`));
  return t('quests.reward', { list: parts.join(', ') });
}

function Row({
  title,
  detail,
  progress,
  target,
  reward,
  claimed,
  onClaim,
}: {
  readonly title: string;
  readonly detail?: string;
  readonly progress: number;
  readonly target: number;
  readonly reward: RewardValue;
  readonly claimed: boolean;
  readonly onClaim: () => void;
}) {
  const done = progress >= target;
  return (
    <li
      className={[
        'quest-row',
        done && !claimed ? 'quest-row--ready' : '',
        claimed ? 'quest-row--claimed' : '',
      ].join(' ')}
    >
      <span className="quest-row__text">
        <span className="quest-row__title">{title}</span>
        {detail !== undefined && <span className="hint quest-row__detail">{detail}</span>}
        <span className="hint quest-row__reward">{rewardText(reward)}</span>
      </span>
      <span className="quest-row__meter">
        <span
          className={['bar', done ? 'bar--full' : ''].join(' ')}
          role="img"
          aria-label={t('quests.progress', { n: progress, target })}
        >
          <span style={{ width: `${Math.round((progress / target) * 100)}%` }} />
        </span>
        <span className="quest-row__count">{t('quests.progress', { n: progress, target })}</span>
      </span>
      {claimed ? (
        <span className="quest-row__done">
          <Icon name="check" /> {t('quests.claimed')}
        </span>
      ) : (
        <Button size="small" disabled={!done} onClick={onClaim}>
          {t('quests.claim')}
        </Button>
      )}
    </li>
  );
}

/** Quêtes du jour, de la semaine et succès : tout vient du moteur, l'écran ne fait qu'afficher. */
export function Quests() {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const [tab, setTab] = useState<Tab>('daily');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // Affichage de la période courante, même si le profil n'est pas encore passé au nouveau jour.
  const current = rollQuests(content, profile, now);
  const daily = questStatus(content, current, 'daily');
  const weekly = questStatus(content, current, 'weekly');
  const achievements = achievementStatus(content, current);
  const ready = (list: readonly { done: boolean; claimed: boolean }[]): number =>
    list.filter((s) => s.done && !s.claimed).length;
  const badge = (n: number): string | undefined => (n > 0 ? String(n) : undefined);
  const bonus = bonusReady(current);

  const quests = (kind: QuestKind) => {
    const list = kind === 'daily' ? daily : weekly;
    const reward = questReward(content, current, kind);
    return list.map((status) => (
      <Row
        key={status.quest.id}
        title={goal(status.quest.metric, status.quest.target)}
        progress={status.progress}
        target={status.quest.target}
        reward={reward}
        claimed={status.claimed}
        onClaim={() => {
          apply(claimQuest(content, profile, kind, status.quest.id, Date.now()));
        }}
      />
    ));
  };

  return (
    <Screen
      title={t('quests.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="quests"
    >
      <div className="quests__layout">
        <div className="quests__head">
          <Tabs<Tab>
            label={t('quests.tabs')}
            current={tab}
            onChange={setTab}
            tabs={[
              {
                key: 'daily',
                label: t('quests.tab.daily'),
                badge: badge(ready(daily) + Number(bonus)),
              },
              { key: 'weekly', label: t('quests.tab.weekly'), badge: badge(ready(weekly)) },
              {
                key: 'achievements',
                label: t('quests.tab.achievements'),
                badge: badge(ready(achievements)),
              },
            ]}
          />
          <p className="hint quests__reset">
            {tab === 'achievements'
              ? t('quests.achievements.summary', {
                  n: achievements.filter((s) => s.claimed).length,
                  total: achievements.length,
                })
              : t('quests.reset', { time: duration(resetIn(tab, now)) })}
          </p>
        </div>
        <Panel className="quests__panel" label={tk(`quests.tab.${tab}`)}>
          <ul className="quest-list">
            {tab === 'achievements'
              ? achievements.map((status) => (
                  <Row
                    key={status.achievement.id}
                    title={tk(`quests.ach.${status.achievement.id}`)}
                    detail={goal(status.achievement.metric, status.achievement.target)}
                    progress={status.progress}
                    target={status.achievement.target}
                    reward={achievementReward(content, current, status.achievement)}
                    claimed={status.claimed}
                    onClaim={() => {
                      apply(claimAchievement(content, profile, status.achievement.id));
                    }}
                  />
                ))
              : quests(tab)}
            {tab === 'daily' && (
              <Row
                title={t('quests.bonus.title')}
                detail={t('quests.bonus.hint', { n: daily.length })}
                progress={daily.filter((s) => s.claimed).length}
                target={Math.max(1, daily.length)}
                reward={bonusReward(content, current)}
                claimed={current.quests.daily.bonus}
                onClaim={() => {
                  apply(claimBonus(content, profile, Date.now()));
                }}
              />
            )}
          </ul>
        </Panel>
        <p className="hint quests__rules">{t('quests.rules')}</p>
      </div>
    </Screen>
  );
}
