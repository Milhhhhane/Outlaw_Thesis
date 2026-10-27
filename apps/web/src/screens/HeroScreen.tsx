import {
  compileHero,
  equip,
  heroBuild,
  respec,
  respecCost,
  setLevel,
  setUpgrade,
  takeTalent,
  talentPoints,
  unlockedPages,
  xpToNext,
} from '@outlaw/engine';
import { content } from '../combat/session';
import { describeItem, describeNode, describeSpell, describeTrigger } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { Refusal } from './Refusal';
import { range } from '../util/range';
import { PixelSprite } from '../art/Pixel';

/**
 * Fiche d'un héros : tout ce qui est affiché vient de l'unité compilée par le moteur
 * (talents et objets compris) ; l'écran ne fait que la décrire.
 */
export function HeroScreen({
  heroId,
  onBack,
}: {
  readonly heroId: string;
  readonly onBack: () => void;
}) {
  const { profile, apply } = useProfile();
  const hero = profile.heroes[heroId];
  const def = content.heroById.get(heroId);
  if (hero === undefined || def === undefined) return null;

  const { balance } = content;
  const unit = compileHero(content, heroBuild(profile, heroId), { side: 'player', slot: 0 });
  const total = talentPoints(hero.level, balance);
  const free = total - hero.talents.length;
  const pages = unlockedPages(hero.level, balance);
  const cost = respecCost(content, profile, heroId);
  const maxed = hero.level >= balance.progression.maxLevel;
  const next = xpToNext(hero.level, content);
  const nodeName = (id: string): string => names.node(id);
  const wornByOther = (uid: number): boolean =>
    Object.entries(profile.heroes).some(([id, h]) => id !== heroId && h.items.includes(uid));
  /** En mode test, un seul exemplaire libre de chaque objet est proposé. */
  const choices = (current: number | null) => {
    if (!profile.testMode) return profile.items;
    const seen = new Set<string>();
    return profile.items.filter((o) => {
      if (o.uid !== current && (seen.has(o.item) || wornByOther(o.uid))) return false;
      seen.add(o.item);
      return true;
    });
  };

  return (
    <main className={`hero-sheet element-${def.element}`}>
      <button type="button" className="link-button" onClick={onBack}>
        {t('nav.back')}
      </button>
      <header className="hero-sheet__header">
        <span className="hero-sheet__portrait">
          <PixelSprite name={heroId} idle />
        </span>
        <h1 className="hero-sheet__name">{names.hero(heroId)}</h1>
        <p className="hero-sheet__thesis">{names.heroThesis(heroId)}</p>
        <p className="hero-sheet__level">
          <strong>{t('hero.level', { level: hero.level })}</strong>
          <span>{maxed ? t('hero.xp.max') : t('hero.xp', { xp: hero.xp, next })}</span>
        </p>
        {profile.testMode && (
          <label className="roster__level-control">
            {t('test.level', { hero: names.hero(heroId) })}
            <select
              value={hero.level}
              onChange={(event) => {
                apply(setLevel(content, profile, heroId, Number(event.target.value)));
              }}
            >
              {range(1, balance.progression.maxLevel).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {!maxed && (
          <span
            className="hero-sheet__xp"
            role="img"
            aria-label={t('hero.xp', { xp: hero.xp, next })}
          >
            <span style={{ width: `${Math.round((hero.xp / next) * 100)}%` }} />
          </span>
        )}
      </header>
      <Refusal />

      <div className="hero-sheet__grid">
        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading">{t('hero.stats')}</h2>
          <dl className="stats">
            {(['hp', 'atk', 'def', 'vit'] as const).map((stat) => (
              <div key={stat}>
                <dt>{tk(`stat.${stat}`)}</dt>
                <dd>{unit.stats[stat]}</dd>
              </div>
            ))}
          </dl>

          <h2>{t('hero.spells')}</h2>
          <ul className="spell-list">
            {unit.spells.map((spell) => (
              <li key={spell.id}>
                <p className="spell-list__name">
                  {names.spell(spell.id)}{' '}
                  <span>
                    {spell.cost > 0
                      ? t('combat.spell.cost', { cost: spell.cost })
                      : t('combat.spell.gain', { gain: spell.gain })}
                    , {t('combat.spell.delay', { delay: spell.delay })},{' '}
                    {tk(`combat.target.${spell.targeting}`)}
                  </span>
                </p>
                <ul>
                  {describeSpell(spell).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <h2>{t('hero.passive')}</h2>
          <p className="spell-list__name">{names.passive(def.passive.id)}</p>
          <ul className="passive">
            {unit.triggers.map((resolved, i) => (
              <li key={i}>{describeTrigger(resolved.trigger)}</li>
            ))}
          </ul>

          <h2>{t('hero.items')}</h2>
          <ul className="slots">
            {hero.items.map((uid, slot) => {
              const owned = profile.items.find((i) => i.uid === uid);
              const item = owned ? content.itemById.get(owned.item) : undefined;
              const selectId = `slot-${heroId}-${slot}`;
              return (
                <li key={slot}>
                  <label htmlFor={selectId}>{t('hero.slot', { n: slot + 1 })}</label>
                  <select
                    id={selectId}
                    value={uid ?? ''}
                    onChange={(event) => {
                      const value = event.target.value === '' ? null : Number(event.target.value);
                      apply(equip(content, profile, heroId, slot, value));
                    }}
                  >
                    <option value="">
                      {uid === null ? t('hero.slot.empty') : t('hero.slot.none')}
                    </option>
                    {choices(uid).map((o) => (
                      <option key={o.uid} value={o.uid}>
                        {names.item(o.item)} ({o.upgrade}/
                        {balance.progression.items.maxUpgradeLevel})
                      </option>
                    ))}
                  </select>
                  {owned !== undefined && profile.testMode && (
                    <label className="roster__level-control">
                      {t('test.upgrade', { item: names.item(owned.item) })}
                      <select
                        value={owned.upgrade}
                        onChange={(event) => {
                          apply(
                            setUpgrade(content, profile, owned.uid, Number(event.target.value)),
                          );
                        }}
                      >
                        {range(0, balance.progression.items.maxUpgradeLevel).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {item !== undefined && (
                    <ul className="slots__effects">
                      {describeItem(item).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="camp__hint">{t('mod.upgrade')}</p>
        </section>

        <section aria-labelledby="talents-heading">
          <div className="talents__head">
            <h2 id="talents-heading">{t('hero.talents')}</h2>
            <p>{t('hero.points', { free, total })}</p>
          </div>
          <div className="pages">
            {def.pages.map((page, index) => {
              const locked = index >= pages;
              return (
                <article
                  key={page.id}
                  className={`page ${locked ? 'page--locked' : ''}`}
                  aria-label={names.page(page.id)}
                >
                  <h3>{names.page(page.id)}</h3>
                  <p className="page__thesis">{names.pageThesis(page.id)}</p>
                  {locked && (
                    <p className="page__lock">
                      {t('hero.page.locked', {
                        level: balance.progression.pageUnlockLevels[index] ?? '?',
                      })}
                    </p>
                  )}
                  <ol className="page__nodes">
                    {page.nodes.map((node) => {
                      const taken = hero.talents.includes(node.id);
                      const rival = node.group
                        ? page.nodes.find((n) => n.group === node.group && n.id !== node.id)
                        : undefined;
                      const blocked = rival !== undefined && hero.talents.includes(rival.id);
                      const ready =
                        !taken &&
                        !locked &&
                        !blocked &&
                        free > 0 &&
                        (node.requires === undefined || hero.talents.includes(node.requires));
                      return (
                        <li
                          key={node.id}
                          className={[
                            'node',
                            taken ? 'node--taken' : '',
                            ready ? 'node--ready' : '',
                            node.requires ? 'node--child' : '',
                            node.group ? 'node--choice' : '',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            className="node__button"
                            disabled={!ready}
                            aria-pressed={taken}
                            onClick={() => apply(takeTalent(content, profile, heroId, node.id))}
                          >
                            <span className="node__name">{names.node(node.id)}</span>
                            <span className="node__state">
                              {taken ? t('hero.node.taken') : ready ? t('hero.node.take') : ''}
                            </span>
                          </button>
                          <ul className="node__effects">
                            {describeNode(node, def).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                            {node.requires !== undefined && (
                              <li className="node__rule">
                                {t('hero.node.requires', { node: nodeName(node.requires) })}
                              </li>
                            )}
                            {rival !== undefined && (
                              <li className="node__rule">
                                {t('hero.node.excludes', { node: nodeName(rival.id) })}
                              </li>
                            )}
                          </ul>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="button button--quiet"
            disabled={hero.talents.length === 0}
            onClick={() => apply(respec(content, profile, heroId))}
          >
            {cost === 0 ? t('hero.respec.free') : t('hero.respec.cost', { cost })}
          </button>
        </section>
      </div>
    </main>
  );
}
