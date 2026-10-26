import {
  dungeonOpen,
  heroBuild,
  lootRates,
  setLevel,
  setTeam,
  upgradeCost,
  upgradeItem,
} from '@outlaw/engine';
import { useState } from 'react';
import { content } from '../combat/session';
import { describeTrigger } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { shareUrl } from '../save/share';
import { useProfile } from '../state/profile';
import { Intro } from './Intro';
import { Refusal } from './Refusal';
import { range } from '../util/range';

interface Props {
  readonly version: string;
  readonly onHero: (id: string) => void;
  readonly onDungeon: (id: string) => void;
  readonly onDemo: () => void;
  /** Ouvre le mode test (partie normale) ou le quitte (mode test). */
  readonly onTestMode: () => void;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Le camp : l'équipe, les donjons et les objets. Tout part d'ici et y revient. */
export function Camp({ version, onHero, onDungeon, onDemo, onTestMode }: Props) {
  const { profile, apply, recovered, reset } = useProfile();
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const test = profile.testMode;
  const link = test
    ? shareUrl(
        profile.team.map((id) => heroBuild(profile, id)),
        `${window.location.origin}${window.location.pathname}`,
      )
    : '';
  const owner = (uid: number): string | null =>
    Object.entries(profile.heroes).find(([, h]) => h.items.includes(uid))?.[0] ?? null;

  const toggleTeam = (id: string): void => {
    const team = profile.team.includes(id)
      ? profile.team.filter((h) => h !== id)
      : [...profile.team, id];
    apply(setTeam(profile, team));
  };

  return (
    <main className="camp">
      <header className="camp__header">
        <h1 className="camp__title">{t('app.title')}</h1>
        {test ? (
          <button type="button" className="button button--quiet" onClick={onTestMode}>
            {t('test.exit')}
          </button>
        ) : (
          <p className="camp__resources" aria-label={t('hub.resources')}>
            <span className="camp__gold">{t('hub.gold', { gold: profile.gold })}</span>
            <span
              className="camp__materials"
              aria-label={t('hub.materials.label', {
                t1: profile.materials[0],
                t2: profile.materials[1],
                t3: profile.materials[2],
              })}
            >
              {profile.materials.map((amount, tier) => (
                <span key={tier} className={`material material--${tier + 1}`} aria-hidden="true">
                  {amount}
                </span>
              ))}
            </span>
          </p>
        )}
      </header>

      {test && <p className="notice notice--test">{t('test.banner')}</p>}
      {recovered && <p className="notice">{t('hub.saveRecovered')}</p>}
      {!test && <Intro />}
      <Refusal />

      <section className="camp__section" aria-labelledby="team-heading">
        <h2 id="team-heading">{t('hub.team')}</h2>
        <p className="camp__hint">{t('hub.team.hint')}</p>
        <ul className="roster">
          {profile.unlocked.map((id) => {
            const hero = profile.heroes[id];
            const def = content.heroById.get(id);
            if (hero === undefined || def === undefined) return null;
            const inTeam = profile.team.includes(id);
            return (
              <li
                key={id}
                className={`roster__hero element-${def.element} ${inTeam ? 'roster__hero--in' : ''}`}
              >
                <button
                  type="button"
                  className="roster__open"
                  onClick={() => {
                    onHero(id);
                  }}
                >
                  <span className="roster__name">{names.hero(id)}</span>
                  <span className="roster__level">{t('hub.level', { level: hero.level })}</span>
                  <span className="roster__thesis">{names.heroThesis(id)}</span>
                </button>
                {test && (
                  <label className="roster__level-control">
                    {t('test.level', { hero: names.hero(id) })}
                    <select
                      value={hero.level}
                      onChange={(event) => {
                        apply(setLevel(content, profile, id, Number(event.target.value)));
                      }}
                    >
                      {range(1, content.balance.progression.maxLevel).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="link-button"
                  aria-pressed={inTeam}
                  onClick={() => {
                    toggleTeam(id);
                  }}
                >
                  {inTeam ? t('hub.team.remove') : t('hub.team.add')}
                </button>
              </li>
            );
          })}
        </ul>
        {test && (
          <div className="share">
            <label htmlFor="share-link">{t('test.share.label')}</label>
            <p className="camp__hint">{t('test.share.hint')}</p>
            <div className="share__row">
              <input
                id="share-link"
                readOnly
                value={link}
                onFocus={(e) => {
                  e.target.select();
                }}
              />
              <button
                type="button"
                className="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => {
                      setCopied(true);
                    })
                    .catch(() => {
                      setCopied(false);
                    });
                }}
              >
                {t('test.share.copy')}
              </button>
            </div>
            {copied && (
              <p className="camp__hint" role="status">
                {t('test.share.copied')}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="camp__section" aria-labelledby="dungeons-heading">
        <h2 id="dungeons-heading">{t('hub.dungeons')}</h2>
        <ol className="dungeons">
          {content.dungeons.map((dungeon) => {
            const open = dungeonOpen(content, profile, dungeon.id);
            const clears = profile.dungeons[dungeon.id]?.clears ?? 0;

            return (
              <li
                key={dungeon.id}
                className={`dungeon element-${dungeon.element === 'mixed' ? 'mixed' : dungeon.element} ${open ? '' : 'dungeon--locked'}`}
              >
                <div className="dungeon__head">
                  <h3 className="dungeon__name">{names.dungeon(dungeon.id)}</h3>
                  <span className="dungeon__level">
                    {t('hub.dungeon.recommended', { level: dungeon.recommendedLevel })}
                  </span>
                </div>
                <p className="dungeon__text">{names.dungeonText(dungeon.id)}</p>
                <p className="dungeon__modifier">
                  <strong>{names.passive(dungeon.modifier.id)}</strong>{' '}
                  {dungeon.modifier.rules
                    .map((rule) =>
                      t('hub.dungeon.modifier', {
                        side: tk(`hub.dungeon.side.${rule.appliesTo}`),
                        text: lowerFirst(describeTrigger(rule.trigger)),
                      }),
                    )
                    .join(' ')}
                </p>
                <details className="dungeon__loot">
                  <summary>{t('hub.dungeon.loot')}</summary>
                  <ul>
                    {lootRates(dungeon).map((rate) => (
                      <li key={rate.item}>
                        {names.item(rate.item)} : {Math.round(rate.pct * 10) / 10} %
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="dungeon__foot">
                  <span className="dungeon__clears">
                    {clears > 0 ? t('hub.dungeon.clears', { count: clears }) : t('hub.dungeon.new')}
                  </span>
                  {open ? (
                    <button
                      type="button"
                      className="button"
                      disabled={profile.team.length === 0}
                      onClick={() => {
                        onDungeon(dungeon.id);
                      }}
                    >
                      {t('hub.dungeon.enter')}
                    </button>
                  ) : (
                    <span className="dungeon__locked">{t('hub.dungeon.locked')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {!test && (
        <section className="camp__section" aria-labelledby="items-heading">
          <h2 id="items-heading">{t('hub.inventory')}</h2>
          {profile.items.length === 0 ? (
            <p className="camp__hint">{t('hub.inventory.empty')}</p>
          ) : (
            <ul className="inventory">
              {profile.items.map((owned) => {
                const item = content.itemById.get(owned.item);
                const cost = upgradeCost(content, owned.upgrade);
                const wearer = owner(owned.uid);
                return (
                  <li
                    key={owned.uid}
                    className={`inventory__item inventory__item--${item?.rarity ?? 'common'}`}
                  >
                    <span className="inventory__name">{names.item(owned.item)}</span>
                    <span className="inventory__meta">
                      {tk(`item.rarity.${item?.rarity ?? 'common'}`)},{' '}
                      {t('item.upgrade', {
                        n: owned.upgrade,
                        max: content.balance.progression.items.maxUpgradeLevel,
                      })}
                      {wearer !== null ? `, ${t('item.wornBy', { hero: names.hero(wearer) })}` : ''}
                    </span>
                    {cost === null ? (
                      <span className="inventory__max">{t('hero.upgrade.max')}</span>
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => apply(upgradeItem(content, profile, owned.uid))}
                      >
                        {t('hero.upgrade', {
                          gold: cost.gold,
                          amount: cost.materials.amount,
                          tier: cost.materials.tier,
                        })}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!test && (
        <footer className="camp__footer">
          <button type="button" className="button button--quiet" onClick={onTestMode}>
            {t('test.enter')}
          </button>
          <span className="camp__hint">{t('test.enter.hint')}</span>
          <button type="button" className="link-button" onClick={onDemo}>
            {t('hub.demo')}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              if (confirmReset) {
                reset();
                setConfirmReset(false);
              } else setConfirmReset(true);
            }}
          >
            {confirmReset ? t('hub.reset.confirm') : t('hub.reset')}
          </button>
          <span>{t('home.version', { version })}</span>
        </footer>
      )}
    </main>
  );
}
