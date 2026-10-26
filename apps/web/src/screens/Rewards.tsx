import type { DungeonReport } from '@outlaw/engine';
import { useEffect, useRef } from 'react';
import { content } from '../combat/session';
import { describeItem } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';

export function Rewards({
  report,
  onContinue,
}: {
  readonly report: DungeonReport;
  readonly onContinue: () => void;
}) {
  const { profile } = useProfile();
  const heading = useRef<HTMLHeadingElement>(null);
  const item = content.itemById.get(report.item.item);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main className="rewards">
      <h1 ref={heading} tabIndex={-1}>
        {t('reward.title', { dungeon: names.dungeon(report.dungeon) })}
      </h1>
      <p className="camp__hint">
        {report.firstClear ? t('reward.firstClear') : t('reward.replay')}
      </p>

      {report.unlockedHero !== null && (
        <p className="rewards__unlock">
          {t('reward.unlocked', { hero: names.hero(report.unlockedHero) })}
        </p>
      )}

      {item !== undefined && (
        <section
          className={`rewards__item rewards__item--${item.rarity}`}
          aria-labelledby="loot-heading"
        >
          <h2 id="loot-heading">{t('reward.item', { item: names.item(item.id) })}</h2>
          <p className="camp__hint">{tk(`item.rarity.${item.rarity}`)}</p>
          <ul>
            {describeItem(item).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {report.item.guaranteed && <p className="camp__hint">{t('reward.guaranteed')}</p>}
        </section>
      )}

      <ul className="rewards__list">
        {Object.entries(report.xp).map(([hero, gain]) => (
          <li key={hero}>
            {t('reward.xp', { hero: names.hero(hero), xp: gain.gained })}
            {gain.levels > 0 && (
              <strong className="rewards__level">
                {' '}
                {t('reward.levelUp', {
                  hero: names.hero(hero),
                  level: profile.heroes[hero]?.level ?? '?',
                })}
              </strong>
            )}
          </li>
        ))}
        <li>{t('reward.gold', { gold: report.gold })}</li>
        <li>
          {t('reward.materials', { amount: report.materials.amount, tier: report.materials.tier })}
        </li>
      </ul>

      <button type="button" className="button" onClick={onContinue}>
        {t('reward.continue')}
      </button>
    </main>
  );
}
