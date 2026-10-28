import {
  bossDifficulties,
  bossFight,
  bossProgress,
  bossReward,
  bossUnlockDungeon,
  bossUnlocked,
  compileEncounter,
  enterBoss,
  resetIn,
} from '@outlaw/engine';
import { useState } from 'react';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen } from '../game/ui';
import { describeSpell, describeTrigger } from '../i18n/describe';
import { dustName, names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { duration } from './Quests';
import './boss.css';

const number = new Intl.NumberFormat('fr-FR');

/** Dégâts lisibles : « 12 400 ». */
export function formatDamage(n: number): string {
  return number.format(n);
}

/**
 * Boss de la semaine (ouvert depuis la tour) : à gauche le boss et son script, à droite les
 * difficultés, la fiche de celle choisie (tentatives, meilleur score, paliers et récompenses) et
 * le bouton Combattre. Tout vient du moteur (`weeklyBoss`, `bossFight`, `bossProgress`,
 * `bossReward`) : l'écran ne calcule rien.
 */
export function Boss({ initial }: { readonly initial?: number }) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const [now] = useState(() => Date.now());
  const count = bossDifficulties(content);
  const highest =
    Array.from({ length: count }, (_, i) => i + 1).findLast((d) =>
      bossUnlocked(content, profile, d),
    ) ?? 1;
  const [selected, setSelected] = useState(initial ?? highest);
  const fight = bossFight(content, now, selected);
  const progress = bossProgress(content, profile, now);
  if (fight === null) return null;
  const [unit] = compileEncounter(content, [fight.enemy], fight.level);
  const open = bossUnlocked(content, profile, selected);
  const best = progress.best[selected - 1] ?? 0;
  const claimed = progress.claimed[selected - 1] ?? 0;
  const max = content.balance.boss.attemptsPerDay;
  const unlock = bossUnlockDungeon(content, selected);
  const passive = unit?.triggers[0];

  return (
    <Screen
      title={t('boss.title')}
      onBack={() => {
        go({ name: 'tower' });
      }}
      className="boss"
    >
      <div className="boss__layout">
        <Panel className={`boss__card element-${fight.element}`} label={t('boss.week')}>
          <header className="boss__head">
            <Portrait kind={fight.enemy} size={48} />
            <div>
              <h2 className="detail__title">{names.enemy(fight.enemy)}</h2>
              <p className="hint">{t('boss.ends', { time: duration(resetIn('weekly', now)) })}</p>
            </div>
          </header>
          <div className="boss__scroll">
            <p className="boss__rule">{t('boss.rule', { n: fight.rules.actionLimit ?? 0 })}</p>
            <h3 className="boss__sub">{t('boss.kit')}</h3>
            <ol className="boss__script">
              {unit?.script.map((s, i) => {
                const spell = unit.spells.find((x) => x.id === s.spell);
                return (
                  <li key={`${s.spell}-${String(i)}`}>
                    <strong>{names.spell(s.spell)}</strong>
                    {spell !== undefined && <> — {describeSpell(spell).join(' ')}</>}
                  </li>
                );
              })}
            </ol>
            {passive !== undefined && (
              <p className="hint">
                {t('boss.passive', { text: describeTrigger(passive.trigger) })}
              </p>
            )}
          </div>
        </Panel>

        <Panel className="boss__panel" label={t('boss.difficulties')}>
          <div className="boss__tabs" role="group" aria-label={t('boss.difficulties')}>
            {Array.from({ length: count }, (_, i) => i + 1).map((d) => {
              const unlocked = bossUnlocked(content, profile, d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`boss__tab${d === selected ? ' boss__tab--on' : ''}`}
                  aria-pressed={d === selected}
                  aria-label={t('boss.difficultyState', {
                    name: t('boss.difficulty', { n: d }),
                    state: tk(`boss.state.${unlocked ? 'open' : 'locked'}`),
                  })}
                  onClick={() => {
                    setSelected(d);
                  }}
                >
                  {!unlocked && <Icon name="lock" />} {d}
                </button>
              );
            })}
          </div>
          <div className="boss__scroll">
            <p>{t('boss.level', { level: fight.level, hp: fight.hpPct, atk: fight.atkPct })}</p>
            <p className="hint">
              {fight.gear.items === 0
                ? t('boss.gear.none')
                : t('boss.gear', { items: fight.gear.items, upgrade: fight.gear.upgrade })}
            </p>
            <p>
              {t('boss.attempts', { n: progress.attemptsLeft, max })} ·{' '}
              {t('boss.best', { n: formatDamage(best) })}
            </p>
            <h3 className="boss__sub">{t('boss.tiers')}</h3>
            <ol className="boss__tiers">
              {fight.thresholds.map((threshold, i) => {
                const reward = bossReward(content, selected, i + 1);
                const reached = i < claimed;
                return (
                  <li key={threshold} className={reached ? 'boss__tier--done' : ''}>
                    <span className="boss__tier-name">
                      {reached ? <Icon name="check" /> : <Icon name="mark" />}{' '}
                      {t('boss.tier', { n: i + 1 })}
                    </span>
                    <span>{t('boss.tier.damage', { n: formatDamage(threshold) })}</span>
                    <span className="boss__tier-reward">
                      {t('boss.reward.dust', {
                        amount: reward.materials.amount,
                        dust: dustName(reward.materials.tier),
                      })}
                      {reward.fragments > 0 &&
                        ` · ${t('boss.reward.fragments', { n: reward.fragments })}`}
                      {reward.chest !== null && ` · ${tk(`chest.tier.${reward.chest}`)}`}
                    </span>
                    {reached && <span className="visually-hidden">{t('boss.tier.reached')}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
          <footer className="boss__foot">
            <span className="boss__team">
              {profile.team.map((id) => (
                <Portrait key={id} kind={id} size={32} />
              ))}
            </span>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                go({ name: 'team' });
              }}
            >
              {t('boss.team')}
            </Button>
            {!open ? (
              <p className="boss__locked">
                <Icon name="lock" />{' '}
                {t('boss.unlock', { dungeon: unlock === null ? '?' : names.dungeon(unlock) })}
              </p>
            ) : progress.attemptsLeft === 0 && !profile.testMode ? (
              <p className="boss__locked">{t('boss.noAttempts')}</p>
            ) : (
              <Button
                size="large"
                onClick={() => {
                  if (apply(enterBoss(content, profile, selected, Date.now())))
                    go({ name: 'boss_run', difficulty: selected });
                }}
              >
                {t('boss.fight')} ▶
              </Button>
            )}
          </footer>
        </Panel>
      </div>
    </Screen>
  );
}
