import { tierNumeral, type DungeonReport } from '@outlaw/engine';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { backgroundUrl } from '../art';
import { PixelSprite } from '../art/Pixel';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { Countdown } from '../game/Countdown';
import { useEscape } from '../game/keys';
import { useGame } from '../game/nav';
import { Button, Icon } from '../game/ui';
import { describeItem } from '../i18n/describe';
import { dungeonTitle, dustName, names, t, tk } from '../i18n';
import { ChestArt } from './Chests';
import { Glossed } from '../game/Glossed';

export function Card({
  index,
  className,
  title,
  children,
}: {
  readonly index: number;
  readonly className?: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <li
      className={['reward-card', className ?? ''].join(' ')}
      style={{ '--i': index } as CSSProperties}
    >
      <h3 className="reward-card__title">{title}</h3>
      {children}
    </li>
  );
}

/** Fond de fin de donjon : le décor, assombri. */
export function Backdrop({ scene }: { readonly scene: string }) {
  return (
    <div
      className="end__scene"
      aria-hidden="true"
      style={{ backgroundImage: `url(${backgroundUrl(scene)})` }}
    />
  );
}

/** Passage d'une série (plusieurs passages d'affilée en Auto). */
export interface SeriesStep {
  /** « Série : passage 2 sur 5. » */
  readonly progress: string;
  /** Lance le passage suivant ; null si la série s'arrête ici. */
  readonly next: (() => void) | null;
  /** Numéro du passage suivant (décompte). */
  readonly nextPass: number;
  /** Pourquoi la série s'arrête ici (« Série terminée. »), ou null. */
  readonly stop: string | null;
  /** Mode Auto : la suite (passage ou bilan) vient seule après un décompte. */
  readonly auto: boolean;
}

/**
 * Récompenses d'un donjon, sous forme de cartes. Dans une série, `onContinue` mène au bilan et le
 * décompte d'Auto lance le passage suivant (ou le bilan au dernier) ; tout clic ou touche
 * l'interrompt.
 */
export function Rewards({
  report,
  onContinue,
  onReplay,
  series,
}: {
  readonly report: DungeonReport;
  readonly onContinue: () => void;
  /** Relance le même donjon (farm). */
  readonly onReplay: () => void;
  readonly series?: SeriesStep;
}) {
  const { go } = useGame();
  const heading = useRef<HTMLHeadingElement>(null);
  const item = content.itemById.get(report.item.item);
  useEscape(onContinue);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  let index = 0;
  return (
    <main className="end end--rewards">
      <Backdrop scene={report.dungeon} />
      <h1 ref={heading} tabIndex={-1} className="end__title">
        {t('reward.title', { dungeon: dungeonTitle(report.dungeon, report.tier) })}
      </h1>
      <p className="end__text">
        {report.firstClear ? t('reward.firstClear') : t('reward.replay')}{' '}
        {report.tierUnlocked !== null && (
          <strong className="reward__tier">
            {t('reward.tierUnlocked', { tier: tierNumeral(report.tierUnlocked) })}{' '}
          </strong>
        )}
        {report.mastery.rankUp
          ? t('reward.mastery.up', { rank: report.mastery.rank })
          : report.mastery.next === null
            ? t('reward.mastery.max', { clears: report.mastery.clears })
            : t('reward.mastery.next', {
                next: report.mastery.next,
                clears: report.mastery.clears,
              })}
        {series !== undefined && (
          <strong className="reward__series">
            {' '}
            {series.progress}
            {series.stop !== null && ` ${series.stop}`}
          </strong>
        )}
      </p>
      <ul className="reward-cards" aria-label={t('reward.cards')}>
        {item !== undefined && (
          <Card
            index={index++}
            className={`reward-card--item reward-card--${item.rarity}`}
            title={t('reward.itemCard')}
          >
            <Icon name={`item_${item.id}`} size={36} />
            <h2 className="reward-card__name">{t('reward.item', { item: names.item(item.id) })}</h2>
            <p className="hint">{tk(`item.rarity.${item.rarity}`)}</p>
            <ul className="reward-card__lines">
              {describeItem(item).map((line, i) => (
                <li key={i}>
                  <Glossed text={line} />
                </li>
              ))}
            </ul>
            {report.item.isNew && <p className="reward-card__new">{t('reward.item.new')}</p>}
            {!report.item.isNew && report.item.salvaged === null && (
              <p className="hint">{t('reward.item.copy', { n: report.item.copies })}</p>
            )}
            {report.item.guaranteed && <p className="hint">{t('reward.guaranteed')}</p>}
            {report.item.salvaged !== null && (
              <p className="hint">
                {t('reward.salvaged', {
                  amount: report.item.salvaged.amount,
                  dust: dustName(report.item.salvaged.tier),
                })}
              </p>
            )}
          </Card>
        )}
        {report.chest !== null && (
          <Card index={index++} className="reward-card--chest" title={t('reward.chestCard')}>
            <ChestArt tier={report.chest} />
            <h2 className="reward-card__name">
              {t('reward.chest', { tier: tk(`chest.tier.${report.chest}`) })}
            </h2>
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                go({ name: 'chests' });
              }}
            >
              {t('reward.chest.open')}
            </Button>
          </Card>
        )}
        {report.unlockedHero !== null && (
          <Card index={index++} className="reward-card--unlock" title={t('heroes.title')}>
            <span className="reward-card__sprite">
              <PixelSprite name={report.unlockedHero} idle />
            </span>
            <p className="reward-card__big">
              {t('reward.unlocked', { hero: names.hero(report.unlockedHero) })}
            </p>
          </Card>
        )}
        {Object.entries(report.xp).map(([hero, gain]) => (
          <Card key={hero} index={index++} title={t('reward.xpCard')}>
            <Portrait kind={hero} size={48} />
            <p className="reward-card__name">{names.hero(hero)}</p>
            <p className="reward-card__big">{t('reward.xpShort', { xp: gain.gained })}</p>
            {gain.ready && <p className="reward-card__level">{t('reward.levelReady')}</p>}
            <span className="visually-hidden">
              {t('reward.xp', { hero: names.hero(hero), xp: gain.gained })}
            </span>
          </Card>
        ))}
        <Card index={index++} title={t('reward.goldCard')}>
          <Icon name="gold" size={36} />
          <p className="reward-card__big gold-text">{t('reward.gold', { gold: report.gold })}</p>
        </Card>
        {report.grimoires > 0 && (
          <Card index={index++} title={t('reward.grimoiresCard')}>
            <Icon name="trigger" size={36} />
            <p className="reward-card__big">{t('reward.grimoires', { n: report.grimoires })}</p>
          </Card>
        )}
        <Card index={index++} title={t('reward.materialsCard')}>
          <Icon name="points" size={36} />
          <p className="reward-card__big">
            {t('reward.materials', {
              amount: report.materials.amount,
              dust: dustName(report.materials.tier),
            })}
          </p>
        </Card>
      </ul>
      {series === undefined ? (
        <div className="outcome__buttons end__go">
          <Button size="large" variant={report.firstClear ? 'quiet' : 'primary'} onClick={onReplay}>
            {t('reward.replay.button')}
          </Button>
          <Button
            size="large"
            variant={report.firstClear ? 'primary' : 'quiet'}
            onClick={onContinue}
          >
            {t('reward.continue')}
          </Button>
        </div>
      ) : (
        <div className="outcome__buttons end__go">
          {series.next !== null && (
            <Button size="large" onClick={series.next}>
              {t('farm.next')}
            </Button>
          )}
          <Button
            size="large"
            variant={series.next === null ? 'primary' : 'quiet'}
            onClick={onContinue}
          >
            {t('farm.recap.button')}
          </Button>
          <Countdown
            enabled={series.auto}
            text={(s) =>
              series.next === null
                ? t('farm.recap.countdown', { s })
                : t('farm.next.countdown', { s, k: series.nextPass })
            }
            onDone={series.next ?? onContinue}
          />
        </div>
      )}
    </main>
  );
}

/** Fin d'un donjon sans récompense : échec, ou passage en mode test. */
export function RunEnd({
  scene,
  title,
  text,
  onRetry,
  onBack,
  retryLabel,
  backLabel,
}: {
  readonly scene: string;
  readonly title: string;
  readonly text: string;
  readonly onRetry: () => void;
  readonly onBack: () => void;
  readonly retryLabel?: string;
  readonly backLabel?: string;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEscape(onBack);
  useEffect(() => {
    first.current?.focus();
  }, []);
  return (
    <main className="end">
      <Backdrop scene={scene} />
      <h1 className="end__title">{title}</h1>
      <p className="end__text">{text}</p>
      <div className="outcome__buttons">
        <Button ref={first} size="large" onClick={onRetry}>
          {retryLabel ?? t('run.retry')}
        </Button>
        <Button variant="quiet" size="large" onClick={onBack}>
          {backLabel ?? t('run.back')}
        </Button>
      </div>
    </main>
  );
}
