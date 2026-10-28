import {
  copiesToMax,
  dissolveCopies,
  salvageOf,
  setUpgrade,
  upgradeCost,
  upgradeItem,
} from '@outlaw/engine';
import type { OwnedItem } from '@outlaw/data';
import { useState } from 'react';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen, Stepper } from '../game/ui';
import { describeItem } from '../i18n/describe';
import { dustName, names, t, tk } from '../i18n';
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

/** Rang d'un objet dans la collection : l'ordre des donjons qui le donnent. */
const ORDER = new Map(content.dungeons.flatMap((d) => d.loot).map((id, i) => [id, i]));
const byOrder = (a: string, b: string): number => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0);

interface Entry {
  readonly key: string;
  readonly item: string;
  /** Absent : l'objet n'a pas encore été trouvé. */
  readonly owned: OwnedItem | undefined;
}

/** Atelier : la collection d'objets, leurs copies et leurs améliorations. */
export function Workshop() {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  // Un objet possédé se choisit par son exemplaire ; un objet à trouver, par son identifiant.
  const [selected, setSelected] = useState<{ uid?: number; item?: string } | null>(
    profile.items[0] !== undefined ? { uid: profile.items[0].uid } : null,
  );
  const max = content.balance.progression.items.maxUpgradeLevel;
  const owned = profile.items.find((o) => o.uid === selected?.uid);
  const itemId = owned?.item ?? selected?.item;
  const item = itemId !== undefined ? content.itemById.get(itemId) : undefined;
  const wearer =
    owned === undefined
      ? null
      : (Object.entries(profile.heroes).find(([, h]) => h.items.includes(owned.uid))?.[0] ?? null);
  const cost = owned !== undefined ? upgradeCost(content, owned.item, owned.upgrade) : null;
  const origin = itemId !== undefined ? content.itemOrigin.get(itemId) : undefined;

  const have = new Set(profile.items.map((o) => o.item));
  const entries: Entry[] = [
    ...profile.items.map((o): Entry => ({ key: `u${o.uid}`, item: o.item, owned: o })),
    ...content.items
      .filter((i) => !have.has(i.id))
      .map((i): Entry => ({ key: i.id, item: i.id, owned: undefined })),
  ].sort((a, b) => byOrder(a.item, b.item));

  return (
    <Screen
      title={t('workshop.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="workshop"
    >
      <div className="split">
        <Panel className="split__list" label={t('hub.inventory')}>
          <p className="hint">
            {t('workshop.collection', { found: have.size, total: content.items.length })}
          </p>
          <ul className="item-grid">
            {entries.map((entry) => {
              const it = content.itemById.get(entry.item);
              const o = entry.owned;
              const on = o !== undefined ? o.uid === selected?.uid : entry.item === selected?.item;
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={[
                      'item-card',
                      `item-card--${it?.rarity ?? 'common'}`,
                      on ? 'item-card--on' : '',
                      o === undefined ? 'item-card--unknown' : '',
                    ].join(' ')}
                    aria-pressed={on}
                    onClick={() => {
                      setSelected(o !== undefined ? { uid: o.uid } : { item: entry.item });
                    }}
                  >
                    <Icon name={o === undefined ? 'lock' : `item_${entry.item}`} size={24} />
                    <span className="item-card__name">{names.item(entry.item)}</span>
                    {o !== undefined ? (
                      <span className="item-card__meta">
                        <UpgradePips level={o.upgrade} max={max} />
                        {o.copies > 0 && (
                          <span className="item-card__copies">
                            {t('item.copies.badge', { n: o.copies })}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="hint">{t('item.undiscovered')}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel className="split__detail">
          {item === undefined ? (
            <p className="hint">{t('workshop.pick')}</p>
          ) : (
            <>
              <h2 className={`detail__title item-card--${item.rarity}`}>{names.item(item.id)}</h2>
              <p className="hint">
                {tk(`item.rarity.${item.rarity}`)} ·{' '}
                {owned === undefined
                  ? t('item.undiscovered')
                  : wearer !== null
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
              {origin !== undefined && (
                <p className="hint">{t('item.origin', { dungeon: names.dungeon(origin) })}</p>
              )}
              {owned !== undefined && (
                <>
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
                  {!profile.testMode && (
                    <>
                      <p>
                        {t('item.copies', { n: owned.copies })}
                        {cost !== null && (
                          <span className="hint">
                            {' '}
                            · {t('workshop.toMax', { n: copiesToMax(content, owned) })}
                          </span>
                        )}
                      </p>
                      {cost === null ? (
                        <p className="gold-text">{t('hero.upgrade.max')}</p>
                      ) : (
                        <>
                          <p className="hint">
                            {t('workshop.cost', {
                              copies: cost.copies,
                              gold: cost.gold,
                              dust: t('dust.amount', {
                                amount: cost.materials.amount,
                                dust: dustName(cost.materials.tier),
                              }),
                            })}
                          </p>
                          <Button onClick={() => apply(upgradeItem(content, profile, owned.uid))}>
                            {t('hero.upgrade')}
                          </Button>
                        </>
                      )}
                      {owned.copies > 0 && (
                        <>
                          <Button
                            variant="quiet"
                            size="small"
                            onClick={() => apply(dissolveCopies(content, profile, owned.uid))}
                          >
                            {t('workshop.dissolve', {
                              dust: t('dust.amount', {
                                amount: salvageOf(content, owned.item).amount,
                                dust: dustName(salvageOf(content, owned.item).tier),
                              }),
                            })}
                          </Button>
                          <p className="hint">{t('workshop.dissolve.hint')}</p>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Panel>
      </div>
    </Screen>
  );
}
