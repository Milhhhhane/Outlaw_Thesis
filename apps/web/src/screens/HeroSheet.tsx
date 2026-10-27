import type { Hero, TalentNode } from '@outlaw/data';
import {
  atStarGate,
  compileHero,
  equip,
  heroBuild,
  heroStars,
  respec,
  respecCost,
  setLevel,
  setUpgrade,
  starCost,
  starUp,
  takeTalent,
  talentPoints,
  unlockedPages,
  xpToNext,
  type HeroBuild,
  type UnitDef,
} from '@outlaw/engine';
import { useState } from 'react';
import { HeroSprite } from '../art/HeroSprite';
import { PixelSprite } from '../art/Pixel';
import { content } from '../combat/session';
import { Button, Icon, Panel, Screen, Stepper, Tabs, Window } from '../game/ui';
import { describeItem, describeNode, describeSpell, describeTrigger } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { UpgradePips } from './Workshop';

type Tab = 'stats' | 'talents' | 'items';

const STAT_ICON = { hp: 'hp', atk: 'damage', def: 'shield', vit: 'spd' } as const;

/** Icône d'un nœud selon ce qu'il touche (une douzaine d'icônes, teintées par l'élément). */
export function nodeIcon(node: TalentNode): string {
  const mod = node.mods[0];
  if (mod === undefined) return 'trigger';
  const byKind = (kind: string, status?: string): string => {
    switch (kind) {
      case 'damage':
      case 'heal':
      case 'shield':
      case 'tempo':
        return kind;
      case 'statMod':
        return 'stat';
      case 'status':
        return status === 'stun' ? 'stun' : status === 'mark' ? 'mark' : 'burn';
      case 'teamPoints':
        return 'points';
      default:
        return 'trigger';
    }
  };
  switch (mod.type) {
    case 'scaleEffect':
      return byKind(mod.kind);
    case 'addEffect':
      return byKind(mod.effect.kind, 'status' in mod.effect ? mod.effect.status : undefined);
    case 'cost':
    case 'gain':
      return 'points';
    case 'delay':
      return 'tempo';
    case 'retarget':
      return 'mark';
  }
}

/** Lignes qui diffèrent entre deux versions compilées d'un héros, sort par sort. */
export function previewDiff(before: UnitDef, after: UnitDef): { spell: string; lines: string[] }[] {
  const out: { spell: string; lines: string[] }[] = [];
  for (const spell of after.spells) {
    const old = before.spells.find((s) => s.slot === spell.slot);
    if (old === undefined) continue;
    const lines: string[] = [];
    const num = (what: string, a: number, b: number): void => {
      if (a !== b) lines.push(t('sheet.cost.change', { what, before: a, after: b }));
    };
    num(t('sheet.cost'), old.cost, spell.cost);
    num(t('sheet.gain'), old.gain, spell.gain);
    num(t('sheet.delay'), old.delay, spell.delay);
    if (old.targeting !== spell.targeting) {
      lines.push(
        `${tk(`combat.target.${old.targeting}`)} → ${tk(`combat.target.${spell.targeting}`)}`,
      );
    }
    const a = describeSpell(old);
    const b = describeSpell(spell);
    for (const line of a) if (!b.includes(line)) lines.push(`− ${line}`);
    for (const line of b) if (!a.includes(line)) lines.push(`+ ${line}`);
    if (lines.length > 0) out.push({ spell: names.spell(spell.id), lines });
  }
  return out;
}

/** Talents d'un nœud et de toute sa chaîne de prérequis. */
function withChain(def: Hero, talents: readonly string[], nodeId: string): string[] {
  const all = def.pages.flatMap((p) => p.nodes);
  const result = new Set(talents);
  for (let id: string | undefined = nodeId; id !== undefined;) {
    const node = all.find((n) => n.id === id);
    if (node === undefined) break;
    // Un nœud exclusif chasse son rival.
    if (node.group !== undefined) {
      for (const rival of all.filter((n) => n.group === node.group && n.id !== node.id)) {
        result.delete(rival.id);
      }
    }
    result.add(node.id);
    id = node.requires;
  }
  return [...result];
}

function compileSafe(build: HeroBuild): UnitDef | null {
  try {
    return compileHero(content, build, { side: 'player', slot: 0 });
  } catch {
    return null;
  }
}

function TalentTree({ def, heroId }: { readonly def: Hero; readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const hero = profile.heroes[heroId];
  const [picked, setPicked] = useState<string | null>(null);
  if (hero === undefined) return null;
  const { balance } = content;
  const total = talentPoints(hero.level, balance);
  const free = total - hero.talents.length;
  const pages = unlockedPages(hero.level, balance);
  const cost = respecCost(content, profile, heroId);
  const allNodes = def.pages.flatMap((p) => p.nodes);

  const stateOf = (node: TalentNode, pageIndex: number): 'taken' | 'ready' | 'locked' => {
    if (hero.talents.includes(node.id)) return 'taken';
    const rival = node.group
      ? allNodes.find((n) => n.group === node.group && n.id !== node.id)
      : undefined;
    const blocked = rival !== undefined && hero.talents.includes(rival.id);
    const ok =
      pageIndex < pages &&
      !blocked &&
      free > 0 &&
      (node.requires === undefined || hero.talents.includes(node.requires));
    return ok ? 'ready' : 'locked';
  };

  const node = allNodes.find((n) => n.id === picked);
  const pageIndex = def.pages.findIndex((p) => p.nodes.some((n) => n.id === picked));
  let diff: { spell: string; lines: string[] }[] = [];
  if (node !== undefined) {
    const base = heroBuild(profile, heroId);
    const max = balance.progression.maxLevel;
    const without = base.talents.filter((id) => id !== node.id);
    const before = compileSafe({ ...base, level: max, talents: without });
    const after = compileSafe({ ...base, level: max, talents: withChain(def, without, node.id) });
    if (before !== null && after !== null) diff = previewDiff(before, after);
  }
  const rival = node?.group
    ? allNodes.find((n) => n.group === node.group && n.id !== node.id)
    : undefined;

  return (
    <div className="talents">
      <div className="talents__pages">
        {def.pages.map((page, index) => {
          const locked = index >= pages;
          // Rangées : racine, ses enfants, puis les petits-enfants sous leur parent.
          const root = page.nodes.find((n) => n.requires === undefined);
          const children = page.nodes.filter((n) => n.requires === root?.id);
          const grand = page.nodes.filter(
            (n) => n.requires !== undefined && n.requires !== root?.id,
          );
          const column = (id: string): number => {
            const i = children.findIndex((c) => c.id === id);
            return i < 0 ? 1 : i;
          };
          const pos = new Map<string, { col: number; row: number }>();
          if (root) pos.set(root.id, { col: 1, row: 0 });
          children.forEach((c, i) => pos.set(c.id, { col: i, row: 1 }));
          grand.forEach((g) => pos.set(g.id, { col: column(g.requires ?? ''), row: 2 }));
          const at = (id: string): { x: number; y: number } => {
            const p = pos.get(id) ?? { col: 1, row: 0 };
            return { x: 22 + p.col * 50, y: 26 + p.row * 76 };
          };
          return (
            <section
              key={page.id}
              className={['tree', locked ? 'tree--locked' : ''].join(' ')}
              aria-label={names.page(page.id)}
            >
              <h3 className="tree__name">{names.page(page.id)}</h3>
              {locked && (
                <p className="tree__lock">
                  <Icon name="lock" />{' '}
                  {t('hero.page.locked', {
                    level: balance.progression.pageUnlockLevels[index] ?? '?',
                  })}
                </p>
              )}
              <div className="tree__board">
                <svg className="tree__links" width="144" height="200" aria-hidden="true">
                  {page.nodes
                    .filter((n) => n.requires !== undefined)
                    .map((n) => {
                      const a = at(n.requires ?? '');
                      const b = at(n.id);
                      const lit = hero.talents.includes(n.id);
                      return (
                        <path
                          key={n.id}
                          d={`M${a.x} ${a.y} V${(a.y + b.y) / 2} H${b.x} V${b.y}`}
                          className={lit ? 'tree__link tree__link--on' : 'tree__link'}
                        />
                      );
                    })}
                </svg>
                {(() => {
                  const pair = children.filter((c) => c.group !== undefined);
                  if (pair.length !== 2) return null;
                  const a = at(pair[0]?.id ?? '');
                  const b = at(pair[1]?.id ?? '');
                  return (
                    <span className="tree__or" style={{ left: (a.x + b.x) / 2, top: a.y }}>
                      {t('sheet.or')}
                    </span>
                  );
                })()}
                {page.nodes.map((n) => {
                  const { x, y } = at(n.id);
                  const state = stateOf(n, index);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={[
                        'node',
                        `node--${state}`,
                        n.group !== undefined ? 'node--choice' : '',
                        picked === n.id ? 'node--picked' : '',
                      ].join(' ')}
                      style={{ left: x, top: y }}
                      aria-label={t('sheet.node.label', {
                        node: names.node(n.id),
                        state: tk(`sheet.node.state.${state}`),
                      })}
                      aria-current={picked === n.id}
                      onClick={() => {
                        setPicked(n.id);
                      }}
                    >
                      <Icon name={nodeIcon(n)} size={24} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Panel className="talents__side" label={t('sheet.preview')}>
        <p className="talents__points">{t('hero.points', { free, total })}</p>
        {node === undefined ? (
          <p className="hint">{t('sheet.pick')}</p>
        ) : (
          <>
            <h3 className="talents__node">
              <Icon name={nodeIcon(node)} size={24} />
              {names.node(node.id)}
            </h3>
            <ul className="effects">
              {describeNode(node, def).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {node.requires !== undefined && (
              <p className="hint">{t('hero.node.requires', { node: names.node(node.requires) })}</p>
            )}
            {rival !== undefined && (
              <p className="hint">{t('hero.node.excludes', { node: names.node(rival.id) })}</p>
            )}
            <h4 className="talents__preview-title">{t('sheet.preview')}</h4>
            {diff.length === 0 ? (
              <p className="hint">{t('sheet.preview.none')}</p>
            ) : (
              <ul className="preview">
                {diff.map((d) => (
                  <li key={d.spell}>
                    <span className="preview__spell">{d.spell}</span>
                    <ul>
                      {d.lines.map((line, i) => (
                        <li
                          key={i}
                          className={
                            line.startsWith('+')
                              ? 'preview__add'
                              : line.startsWith('−')
                                ? 'preview__del'
                                : 'preview__num'
                          }
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {stateOf(node, pageIndex) === 'ready' && (
              <Button onClick={() => apply(takeTalent(content, profile, heroId, node.id))}>
                {t('sheet.take')}
              </Button>
            )}
            {stateOf(node, pageIndex) === 'taken' && (
              <p className="gold-text">
                <Icon name="check" /> {t('hero.node.taken')}
              </p>
            )}
          </>
        )}
        <Button
          variant="quiet"
          size="small"
          className="talents__respec"
          disabled={hero.talents.length === 0}
          onClick={() => apply(respec(content, profile, heroId))}
        >
          {cost === 0 ? t('hero.respec.free') : t('hero.respec.cost', { cost })}
        </Button>
      </Panel>
    </div>
  );
}

function ItemSlots({ heroId }: { readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const [choosing, setChoosing] = useState<number | null>(null);
  const hero = profile.heroes[heroId];
  if (hero === undefined) return null;
  const max = content.balance.progression.items.maxUpgradeLevel;
  const ownerOf = (uid: number): string | null =>
    Object.entries(profile.heroes).find(([, h]) => h.items.includes(uid))?.[0] ?? null;
  /** En mode test, un seul exemplaire libre de chaque objet est proposé. */
  const choices = (current: number | null) => {
    if (!profile.testMode) return profile.items;
    const seen = new Set<string>();
    return profile.items.filter((o) => {
      const owner = ownerOf(o.uid);
      if (o.uid !== current && (seen.has(o.item) || (owner !== null && owner !== heroId))) {
        return false;
      }
      seen.add(o.item);
      return true;
    });
  };

  return (
    <div className="slots">
      {hero.items.map((uid, slot) => {
        const owned = profile.items.find((i) => i.uid === uid);
        const item = owned ? content.itemById.get(owned.item) : undefined;
        return (
          <Panel key={slot} className="slot" label={t('sheet.slot.title', { n: slot + 1 })}>
            <button
              type="button"
              className={['slot__box', item ? `slot__box--${item.rarity}` : ''].join(' ')}
              aria-label={t('sheet.slot.choose', { n: slot + 1 })}
              onClick={() => {
                setChoosing(slot);
              }}
            >
              <Icon name={owned !== undefined ? `item_${owned.item}` : 'item'} size={36} />
              <span className="slot__name">
                {owned !== undefined ? names.item(owned.item) : t('hero.slot.empty')}
              </span>
              {owned !== undefined && <UpgradePips level={owned.upgrade} max={max} />}
            </button>
            {item !== undefined && (
              <ul className="effects">
                {describeItem(item).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
            {owned !== undefined && profile.testMode && (
              <Stepper
                label={t('test.upgrade', { item: names.item(owned.item) })}
                value={owned.upgrade}
                min={0}
                max={max}
                onChange={(n) => {
                  apply(setUpgrade(content, profile, owned.uid, n));
                }}
              />
            )}
          </Panel>
        );
      })}
      <p className="hint slots__hint">{t('mod.upgrade')}</p>
      {choosing !== null && (
        <Window
          title={t('sheet.slot.title', { n: choosing + 1 })}
          onClose={() => {
            setChoosing(null);
          }}
          className="picker"
        >
          {choices(hero.items[choosing] ?? null).length === 0 ? (
            <p className="hint">{t('sheet.slot.none')}</p>
          ) : (
            <ul className="picker__list">
              {choices(hero.items[choosing] ?? null).map((o) => {
                const it = content.itemById.get(o.item);
                const owner = ownerOf(o.uid);
                return (
                  <li key={o.uid}>
                    <button
                      type="button"
                      className={[
                        'item-card',
                        `item-card--${it?.rarity ?? 'common'}`,
                        hero.items[choosing] === o.uid ? 'item-card--on' : '',
                      ].join(' ')}
                      onClick={() => {
                        if (apply(equip(content, profile, heroId, choosing, o.uid))) {
                          setChoosing(null);
                        }
                      }}
                    >
                      <Icon name={`item_${o.item}`} size={24} />
                      <span className="item-card__name">{names.item(o.item)}</span>
                      <UpgradePips
                        level={o.upgrade}
                        max={content.balance.progression.items.maxUpgradeLevel}
                      />
                      {owner !== null && owner !== heroId && (
                        <span className="hint">
                          {t('sheet.slot.wornBy', { hero: names.hero(owner) })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hero.items[choosing] !== null && hero.items[choosing] !== undefined && (
            <Button
              variant="danger"
              size="small"
              onClick={() => {
                if (apply(equip(content, profile, heroId, choosing, null))) setChoosing(null);
              }}
            >
              {t('sheet.slot.remove')}
            </Button>
          )}
        </Window>
      )}
    </div>
  );
}

/**
 * Fiche d'un héros en un écran : portrait à gauche, onglets à droite. Tout ce qui est affiché
 * vient de l'unité compilée par le moteur (talents et objets compris).
 */
export function HeroSheet({
  heroId,
  onBack,
}: {
  readonly heroId: string;
  readonly onBack: () => void;
}) {
  const { profile, apply } = useProfile();
  const [tab, setTab] = useState<Tab>('stats');
  const hero = profile.heroes[heroId];
  const def = content.heroById.get(heroId);
  if (hero === undefined || def === undefined) return null;
  const { balance } = content;
  const unit = compileHero(content, heroBuild(profile, heroId), { side: 'player', slot: 0 });
  const free = talentPoints(hero.level, balance) - hero.talents.length;
  const maxed = hero.level >= balance.progression.maxLevel;
  const next = xpToNext(hero.level, content);
  const gate = atStarGate(hero, content);
  const gateCost = starCost(content, hero);
  const fragments = profile.fragments[heroId] ?? 0;

  return (
    <Screen title={names.hero(heroId)} onBack={onBack} className={`sheet element-${def.element}`}>
      <div className="sheet__layout">
        <aside className="sheet__id">
          <PixelSprite name="pedestal" className="pedestal" />
          <span className="sheet__sprite">
            <HeroSprite name={heroId} idle />
          </span>
          <p className="sheet__level">
            {t('hero.level', { level: hero.level })}
            <span className="hint">
              {' '}
              · {t('sheet.element', { element: tk(`element.${def.element}`) })}
            </span>
          </p>
          {!maxed ? (
            <span className="sheet__xp" role="img" aria-label={t('hero.xp', { xp: hero.xp, next })}>
              <span style={{ width: `${Math.round((hero.xp / next) * 100)}%` }} />
            </span>
          ) : (
            <span className="hint">{t('hero.xp.max')}</span>
          )}
          <p className="hint">
            {t('hero.stars', {
              n: heroStars(hero, content),
              max: balance.chests.starCosts.length,
            })}
          </p>
          {gate && gateCost !== null && !profile.testMode && (
            <div className="sheet__gate">
              <p>{t('hero.gate', { level: hero.level })}</p>
              <Button
                size="small"
                disabled={fragments < gateCost}
                onClick={() => {
                  apply(starUp(content, profile, heroId));
                }}
              >
                {t('hero.gate.buy')}
              </Button>
              <p className="hint">{t('hero.gate.count', { have: fragments, cost: gateCost })}</p>
            </div>
          )}
          <p className="sheet__thesis">{names.heroThesis(heroId)}</p>
          {profile.testMode && (
            <Stepper
              label={t('test.level', { hero: names.hero(heroId) })}
              value={hero.level}
              min={1}
              max={balance.progression.maxLevel}
              onChange={(level) => {
                apply(setLevel(content, profile, heroId, level));
              }}
            />
          )}
        </aside>
        <div className="sheet__main">
          <Tabs<Tab>
            label={t('sheet.tabs', { hero: names.hero(heroId) })}
            current={tab}
            onChange={setTab}
            tabs={[
              { key: 'stats', label: t('sheet.tab.stats') },
              {
                key: 'talents',
                label: t('sheet.tab.talents'),
                badge: free > 0 ? String(free) : undefined,
              },
              { key: 'items', label: t('sheet.tab.items') },
            ]}
          />
          <div className="sheet__panel" role="tabpanel">
            {tab === 'stats' && (
              <div className="stats-tab">
                <dl className="stats">
                  {(['hp', 'atk', 'def', 'vit'] as const).map((stat) => (
                    <div key={stat}>
                      <dt>
                        <Icon name={STAT_ICON[stat]} size={12} />
                        {tk(`stat.${stat}`)}
                      </dt>
                      <dd>{unit.stats[stat]}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="spell-cards">
                  {unit.spells.map((spell, i) => (
                    <li key={spell.id} className={`spell-card spell-card--${spell.slot}`}>
                      <p className="spell-card__name">
                        <span className="spell-card__key">{i + 1}</span>
                        {names.spell(spell.id)}
                      </p>
                      <p className="spell-card__meta">
                        {spell.cost > 0
                          ? t('combat.spell.cost', { cost: spell.cost })
                          : t('combat.spell.gain', { gain: spell.gain })}{' '}
                        · {t('combat.spell.delay', { delay: spell.delay })} ·{' '}
                        {tk(`combat.target.${spell.targeting}`)}
                      </p>
                      <ul>
                        {describeSpell(spell).map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <div className="passive-card">
                  <p className="spell-card__name">
                    <Icon name="trigger" /> {t('hero.passive')} : {names.passive(def.passive.id)}
                  </p>
                  <ul>
                    {unit.triggers.map((resolved, i) => (
                      <li key={i}>{describeTrigger(resolved.trigger)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {tab === 'talents' && <TalentTree def={def} heroId={heroId} />}
            {tab === 'items' && <ItemSlots heroId={heroId} />}
          </div>
        </div>
      </div>
    </Screen>
  );
}
