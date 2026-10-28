import { tierNumeral, type SeriesSummary } from '@outlaw/engine';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { backgroundUrl } from '../art';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useEscape } from '../game/keys';
import { Button, Icon } from '../game/ui';
import { dungeonTitle, dustName, names, t, tk } from '../i18n';
import './farm.css';

function Card({
  index,
  title,
  className,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <li
      className={['reward-card', 'recap-card', className ?? ''].join(' ')}
      style={{ '--i': index } as CSSProperties}
      aria-label={title}
    >
      <h2 className="reward-card__title">{title}</h2>
      {children}
    </li>
  );
}

function None() {
  return <p className="hint">{t('farm.recap.none')}</p>;
}

/**
 * Bilan d'une série de passages : la somme des rapports du moteur (`summarizeSeries`), rien de
 * recalculé. Il tient en un écran, comme les récompenses d'un passage.
 */
export function Recap({
  dungeonId,
  tier,
  summary,
  stop,
  onBack,
  onAgain,
}: {
  readonly dungeonId: string;
  readonly tier: number;
  readonly summary: SeriesSummary;
  /** Phrase d'arrêt (« Série terminée. »). */
  readonly stop: string;
  readonly onBack: () => void;
  readonly onAgain: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEscape(onBack);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const dust = summary.materials
    .map((amount, i) => ({ tier: i + 1, amount }))
    .filter((d) => d.amount > 0);
  const chests = content.balance.chests.tiers
    .map((c) => ({ id: c.id, n: summary.chests[c.id] ?? 0 }))
    .filter((c) => c.n > 0);
  const scene = content.dungeonById.get(dungeonId)?.scene ?? dungeonId;
  const events = [
    ...summary.mastery.map((m) => t('farm.recap.mastery.rank', { rank: m.rank })),
    ...summary.tiersUnlocked.map((u) => t('reward.tierUnlocked', { tier: tierNumeral(u.tier) })),
    ...summary.heroes.map((hero) => t('reward.unlocked', { hero: names.hero(hero) })),
  ];
  let index = 0;
  return (
    <main className="end end--rewards recap">
      <div
        className="end__scene"
        aria-hidden="true"
        style={{ backgroundImage: `url(${backgroundUrl(scene)})` }}
      />
      <h1 className="end__title">
        {t('farm.recap.title', { dungeon: dungeonTitle(dungeonId, tier) })}
      </h1>
      <p className="end__text">{stop}</p>
      <ul className="reward-cards recap-cards" aria-label={t('farm.recap.cards')}>
        <Card index={index++} title={t('farm.recap.passes')}>
          <Icon name="check" size={24} />
          <p className="reward-card__big">{t('farm.recap.wins', { n: summary.wins })}</p>
          <p className="reward-card__name">{t('farm.recap.losses', { n: summary.losses })}</p>
        </Card>
        <Card index={index++} title={t('farm.recap.gold')}>
          <Icon name="gold" size={24} />
          <p className="reward-card__big gold-text">{t('reward.gold', { gold: summary.gold })}</p>
        </Card>
        <Card index={index++} title={t('farm.recap.dust')}>
          <Icon name="points" size={24} />
          {dust.length === 0 ? (
            <None />
          ) : (
            dust.map((d) => (
              <p key={d.tier} className={`reward-card__name resources__mat--${d.tier}`}>
                {t('reward.materials', { amount: d.amount, dust: dustName(d.tier) })}
              </p>
            ))
          )}
        </Card>
        <Card index={index++} title={t('farm.recap.chests')} className="reward-card--chest">
          <Icon name="chest" size={24} />
          {chests.length === 0 ? (
            <None />
          ) : (
            chests.map((c) => (
              <p key={c.id} className="reward-card__name">
                {t('farm.recap.chest', { tier: tk(`chest.tier.${c.id}`), n: c.n })}
              </p>
            ))
          )}
        </Card>
        <Card index={index++} title={t('farm.recap.items')} className="recap-card--wide">
          <p className="recap__counts">
            {t('farm.recap.items.new', { n: summary.newItems })} ·{' '}
            {t('farm.recap.items.copies', { n: summary.copies })} ·{' '}
            {t('farm.recap.items.salvaged', { n: summary.salvaged })}
          </p>
          {summary.items.length === 0 ? (
            <None />
          ) : (
            <ul className="recap__items">
              {summary.items.map((item) => (
                <li
                  key={item.item}
                  className={`recap__item recap__item--${content.itemById.get(item.item)?.rarity ?? 'common'}`}
                >
                  <Icon name={`item_${item.item}`} size={24} />
                  {t('farm.recap.item', { item: names.item(item.item), n: item.count })}
                  {item.isNew && <span className="reward-card__new">{t('reward.item.new')}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card index={index++} title={t('farm.recap.ready')}>
          {summary.levelReady.length === 0 ? (
            <None />
          ) : (
            <p className="recap__heroes">
              {summary.levelReady.map((hero) => (
                <span key={hero} title={names.hero(hero)}>
                  <Portrait kind={hero} size={32} />
                  <span className="visually-hidden">
                    {t('farm.recap.ready.hero', { hero: names.hero(hero) })}
                  </span>
                </span>
              ))}
            </p>
          )}
        </Card>
        <Card index={index++} title={t('farm.recap.mastery')}>
          <Icon name="star" size={24} />
          {events.length === 0 ? (
            <None />
          ) : (
            events.map((line, i) => (
              <p key={i} className="reward-card__name">
                {line}
              </p>
            ))
          )}
        </Card>
      </ul>
      <div className="outcome__buttons end__go">
        <Button ref={first} size="large" onClick={onBack}>
          {t('reward.continue')}
        </Button>
        <Button size="large" variant="quiet" onClick={onAgain}>
          {t('farm.recap.again')}
        </Button>
      </div>
    </main>
  );
}
