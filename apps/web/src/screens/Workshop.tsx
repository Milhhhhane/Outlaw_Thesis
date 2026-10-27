import { setUpgrade, upgradeCost, upgradeItem } from '@outlaw/engine';
import { useState } from 'react';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen, Stepper } from '../game/ui';
import { describeItem } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { Glossed } from '../game/Glossed';

/** Pastilles d'amélioration : pleines jusqu'au niveau atteint. */
export function UpgradePips({ level, max }: { readonly level: number; readonly max: number }) {
  return (
    <span className="pips" role="img" aria-label={t('item.upgrade', { n: level, max })}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < level ? 'pip pip--full' : 'pip'} />
      ))}
    </span>
  );
}

/** Atelier : les objets possédés et leurs améliorations. */
export function Workshop() {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const [selected, setSelected] = useState<number | null>(profile.items[0]?.uid ?? null);
  const max = content.balance.progression.items.maxUpgradeLevel;
  const owned = profile.items.find((o) => o.uid === selected);
  const item = owned !== undefined ? content.itemById.get(owned.item) : undefined;
  const wearer =
    owned === undefined
      ? null
      : (Object.entries(profile.heroes).find(([, h]) => h.items.includes(owned.uid))?.[0] ?? null);
  const cost = owned !== undefined ? upgradeCost(content, owned.upgrade) : null;

  return (
    <Screen
      title={t('workshop.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="workshop"
    >
      {profile.items.length === 0 ? (
        <Panel className="workshop__empty">
          <p>{t('workshop.empty')}</p>
        </Panel>
      ) : (
        <div className="split">
          <Panel className="split__list" label={t('hub.inventory')}>
            <ul className="item-grid">
              {profile.items.map((o) => {
                const it = content.itemById.get(o.item);
                return (
                  <li key={o.uid}>
                    <button
                      type="button"
                      className={[
                        'item-card',
                        `item-card--${it?.rarity ?? 'common'}`,
                        o.uid === selected ? 'item-card--on' : '',
                      ].join(' ')}
                      aria-pressed={o.uid === selected}
                      onClick={() => {
                        setSelected(o.uid);
                      }}
                    >
                      <Icon name={`item_${o.item}`} size={24} />
                      <span className="item-card__name">{names.item(o.item)}</span>
                      <UpgradePips level={o.upgrade} max={max} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel className="split__detail">
            {owned === undefined || item === undefined ? (
              <p className="hint">{t('workshop.pick')}</p>
            ) : (
              <>
                <h2 className={`detail__title item-card--${item.rarity}`}>{names.item(item.id)}</h2>
                <p className="hint">
                  {tk(`item.rarity.${item.rarity}`)} ·{' '}
                  {wearer !== null
                    ? t('item.wornBy', { hero: names.hero(wearer) })
                    : t('workshop.free')}
                </p>
                <ul className="effects">
                  {describeItem(item).map((line, i) => (
                    <li key={i}>
                      <Glossed text={line} />
                    </li>
                  ))}
                </ul>
                <div className="detail__row">
                  <span>{t('workshop.level')}</span>
                  {profile.testMode ? (
                    <Stepper
                      label={t('test.upgrade', { item: names.item(item.id) })}
                      value={owned.upgrade}
                      min={0}
                      max={max}
                      onChange={(n) => {
                        apply(setUpgrade(content, profile, owned.uid, n));
                      }}
                    />
                  ) : (
                    <UpgradePips level={owned.upgrade} max={max} />
                  )}
                </div>
                <p className="hint">{t('mod.upgrade')}</p>
                {!profile.testMode &&
                  (cost === null ? (
                    <p className="gold-text">{t('hero.upgrade.max')}</p>
                  ) : (
                    <Button onClick={() => apply(upgradeItem(content, profile, owned.uid))}>
                      {t('hero.upgrade', {
                        gold: cost.gold,
                        amount: cost.materials.amount,
                        tier: cost.materials.tier,
                      })}
                    </Button>
                  ))}
              </>
            )}
          </Panel>
        </div>
      )}
    </Screen>
  );
}
